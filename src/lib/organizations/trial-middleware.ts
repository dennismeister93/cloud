import { TRPCError } from '@trpc/server';
import { getOrganizationById } from './organizations';
import { getDaysRemainingInTrial, getOrgTrialStatusFromDays } from './trial-utils';
import { getMostRecentSeatPurchase } from './organization-seats';

/**
 * Ensures organization has either active subscription or active trial
 * Throws error if trial has expired and no subscription exists
 *
 * @throws TRPCError with code FORBIDDEN if trial expired without subscription
 * @returns Object with isReadOnly flag and days remaining
 */
export async function requireActiveSubscriptionOrTrial(
  organizationId: string
): Promise<{ isReadOnly: boolean; daysRemaining: number }> {
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
  }

  // Check for active subscription by looking at organization_seats_purchases table
  const latestPurchase = await getMostRecentSeatPurchase(organizationId);
  const hasActiveSubscription = latestPurchase?.subscription_status === 'active';

  // If there's an active subscription, organization is in good standing
  if (hasActiveSubscription || !organization.require_seats) {
    return { isReadOnly: false, daysRemaining: Infinity };
  }

  const daysRemaining = getDaysRemainingInTrial(
    organization.free_trial_end_at ?? null,
    organization.created_at
  );
  const state = getOrgTrialStatusFromDays(daysRemaining);

  // Hard lock block all mutations
  if (state === 'trial_expired_hard') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization trial has expired.' });
  }

  return { isReadOnly: false, daysRemaining };
}
