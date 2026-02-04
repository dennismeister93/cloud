import type { credit_transactions, CreditTransaction, User } from '@/db/schema';
import { credit_transactions as creditTransactionsTable, kilocode_users } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { sentryLogger } from '@/lib/utils.server';

export type ExpiringTransaction = Pick<
  CreditTransaction,
  | 'id'
  | 'amount_microdollars'
  | 'expiration_baseline_microdollars_used'
  | 'expiry_date'
  | 'description'
  | 'is_free'
>;

export type CreditTransactionForBlocks = ExpiringTransaction &
  Pick<CreditTransaction, 'credit_category' | 'original_transaction_id' | 'created_at'>;

export type UserForExpiration = Pick<User, 'id' | 'microdollars_used'>;
export type UserForLocalExpiration = Pick<
  User,
  | 'id'
  | 'microdollars_used'
  | 'next_credit_expiration_at'
  | 'updated_at'
  | 'total_microdollars_acquired'
>;

type ExpirationResult = {
  newTransactions: (typeof credit_transactions.$inferInsert)[];
  newBaselines: Map<CreditTransaction['id'], number>;
};
/**
 * Computes the expiration of credits for a user.
 *
 * **Core idea:** Each credit can only be claimed once. To keep the algorithm
 * simple and incrementally runnable, each transaction's state is a consecutive
 * range of usage (from baseline to baseline+amount). This means that transactions
 * can have mutually contradictory claims since they can overlap. This overlap is
 * resolved one by one at expiration time. When an earlier-expiring credit claims
 * some usage, we "swap" that usage out of later credits by raising their baselines.
 * When the later credits expire, the right amount expires.
 *
 * **How it works:** Process transactions in expiry order. Each claims usage from
 * its baseline up to min(baseline+amount, user's total usage). When a credit
 * expires and claims usage, raise the baselines of all later credits that overlap
 * with the claimed range. This prevents double-counting while keeping each
 * transaction's state as a simple consecutive range.
 *
 * **Incremental safety:** No lookahead, no local state between loop iterations
 * (newBaselines is exported). The final balance is the same whether run once in
 * bulk or incrementally over time.
 */

export function computeExpiration(
  transactions: ExpiringTransaction[],
  user: UserForExpiration,
  now: Date
): ExpirationResult {
  const newBaselines = new Map<CreditTransaction['id'], number>();
  const newTransactions: (typeof credit_transactions.$inferInsert)[] = [];
  const sortedByExpiry = transactions
    .filter((t): t is ExpiringTransaction & { expiry_date: string } => t.expiry_date != null)
    .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

  for (let currentIndex = 0; currentIndex < sortedByExpiry.length; currentIndex++) {
    const t = sortedByExpiry[currentIndex];
    const isExpired = new Date(t.expiry_date) <= now;
    if (!isExpired) continue;

    const baseline = newBaselines.get(t.id) ?? t.expiration_baseline_microdollars_used ?? 0;
    const transactionEnd = baseline + t.amount_microdollars;
    const usageEnd = Math.min(transactionEnd, user.microdollars_used);
    const usage = Math.max(0, usageEnd - baseline);
    const expiredAmount = t.amount_microdollars - usage;
    newTransactions.push({
      kilo_user_id: user.id,
      amount_microdollars: expiredAmount === 0 ? 0 : -expiredAmount,
      credit_category: 'credits_expired',
      original_transaction_id: t.id, // Link expiration to original transaction (post-Orb fallback)
      description: `Expired: ${t.description ?? ''}`,
      is_free: t.is_free,
      created_at: t.expiry_date,
      original_baseline_microdollars_used: user.microdollars_used,
    });
    for (let laterIndex = currentIndex + 1; laterIndex < sortedByExpiry.length; laterIndex++) {
      const otherT = sortedByExpiry[laterIndex];
      const otherBaseline =
        newBaselines.get(otherT.id) ?? otherT.expiration_baseline_microdollars_used ?? 0;
      const consumedOverlap = Math.min(usage, usageEnd - otherBaseline);
      if (consumedOverlap <= 0) continue;
      newBaselines.set(otherT.id, otherBaseline + consumedOverlap);
    }
  }
  return { newTransactions, newBaselines };
}

export async function fetchExpiringTransactions(userId: string, fromDb: typeof db = db) {
  const expiredCredits = alias(creditTransactionsTable, 'expired_credits');

  // Fetch ALL transactions with expiry dates (including future ones) for baseline adjustment
  // Use LEFT JOIN to exclude transactions that have already been processed (have a credits_expired entry)
  // Match on original_transaction_id (preferred) OR orb_credit_block_id (legacy)
  return await fromDb
    .select({
      id: creditTransactionsTable.id,
      amount_microdollars: creditTransactionsTable.amount_microdollars,
      expiration_baseline_microdollars_used:
        creditTransactionsTable.expiration_baseline_microdollars_used,
      expiry_date: creditTransactionsTable.expiry_date,
      description: creditTransactionsTable.description,
      is_free: creditTransactionsTable.is_free,
    })
    .from(creditTransactionsTable)
    .leftJoin(
      expiredCredits,
      and(
        eq(expiredCredits.kilo_user_id, userId),
        inArray(expiredCredits.credit_category, [
          'credits_expired',
          'orb_credit_expired',
          'orb_credit_voided',
        ]),
        eq(expiredCredits.original_transaction_id, creditTransactionsTable.id)
      )
    )
    .where(
      and(
        eq(creditTransactionsTable.kilo_user_id, userId),
        isNotNull(creditTransactionsTable.expiry_date),
        isNull(expiredCredits.id), // Not already processed
        isNull(creditTransactionsTable.organization_id)
      )
    );
}

/**
 * Process local expirations for a migrated user (not in legacy Orb system).
 * Uses idempotency checks to prevent double-processing by excluding transactions
 * that already have a credits_expired entry.
 *
 * Returns null if no expirations were due, otherwise returns the new balance fields.
 */
export async function processLocalExpirations(
  user: UserForLocalExpiration,
  now: Date
): Promise<null | {
  total_microdollars_acquired: number;
}> {
  const next_credit_expiration_at = user.next_credit_expiration_at;
  const all_expiring_transactions = await fetchExpiringTransactions(user.id);

  // Compute expiration results (pass ALL transactions so baselines can be adjusted)
  const expirationResult = computeExpiration(all_expiring_transactions, user, now);

  // Compute next expiration date from transactions that weren't just expired
  const expiredTransactionIds = new Set(
    expirationResult.newTransactions.map(t => t.original_transaction_id)
  );
  const new_next_expiration =
    all_expiring_transactions
      .filter(t => !expiredTransactionIds.has(t.id))
      .map(t => t.expiry_date)
      .filter(Boolean)
      .sort()[0] ?? null;

  // Compute new balance: sum of expired amounts (negative values)
  const total_expired = expirationResult.newTransactions.reduce(
    (sum, t) => sum + (t.amount_microdollars ?? 0),
    0
  );
  const new_total_microdollars_acquired = user.total_microdollars_acquired + total_expired;

  const somethingExpired = await db.transaction(async tx => {
    // Update user with optimistic concurrency check
    const updateResult = await tx
      .update(kilocode_users)
      .set({
        next_credit_expiration_at: new_next_expiration,
        total_microdollars_acquired: new_total_microdollars_acquired,
      })
      .where(
        and(
          eq(kilocode_users.id, user.id),
          eq(kilocode_users.total_microdollars_acquired, user.total_microdollars_acquired),
          next_credit_expiration_at
            ? eq(kilocode_users.next_credit_expiration_at, next_credit_expiration_at)
            : isNull(kilocode_users.next_credit_expiration_at)
        )
      );

    if (updateResult.rowCount === 0) {
      // Optimistic concurrency check failed - another process already handled it
      sentryLogger('processLocalExpirations', 'error')('optimistic concurrency check failed', {
        kilo_user_id: user.id,
      });
      return false;
    }

    if (!expirationResult.newTransactions.length && !expirationResult.newBaselines.size)
      return false;
    // Insert expiration transactions
    await tx.insert(creditTransactionsTable).values(expirationResult.newTransactions);

    // Update baselines for remaining transactions
    for (const [transactionId, newBaseline] of expirationResult.newBaselines) {
      await tx
        .update(creditTransactionsTable)
        .set({ expiration_baseline_microdollars_used: newBaseline })
        .where(eq(creditTransactionsTable.id, transactionId));
    }
    return true;
  });

  if (!somethingExpired) return null;

  return { total_microdollars_acquired: new_total_microdollars_acquired };
}
