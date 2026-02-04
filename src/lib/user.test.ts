import { db } from '@/lib/drizzle';
import {
  microdollar_usage,
  payment_methods,
  kilocode_users,
  user_auth_provider,
} from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import { deleteUserDatabaseRecords, findUserById, findUsersByIds } from './user';
import { createTestPaymentMethod } from '@/tests/helpers/payment-method.helper';
import { insertTestUser } from '@/tests/helpers/user.helper';
import { insertUsageWithOverrides } from '@/tests/helpers/microdollar-usage.helper';
import { forceImmediateExpirationRecomputation } from '@/lib/balanceCache';

describe('User', () => {
  // Shared cleanup for all tests in this suite to prevent data pollution
  afterEach(async () => {
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(user_auth_provider);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(microdollar_usage);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(payment_methods);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(kilocode_users);
  });

  describe('deleteUserDatabaseRecords', () => {
    it('should delete all records for a specific user', async () => {
      const user1 = await insertTestUser();
      const user2 = await insertTestUser();
      const user3 = await insertTestUser();

      // Create MicrodollarUsage records
      await insertUsageWithOverrides({ kilo_user_id: user1.id });
      await insertUsageWithOverrides({ kilo_user_id: user1.id });
      await insertUsageWithOverrides({ kilo_user_id: user2.id });
      await insertUsageWithOverrides({ kilo_user_id: user3.id });

      // Create PaymentMethod records
      const pm1a = createTestPaymentMethod(user1.id);
      const pm1b = createTestPaymentMethod(user1.id);
      const pm2a = createTestPaymentMethod(user2.id);
      const pm3a = createTestPaymentMethod(user3.id);

      await db.insert(payment_methods).values([pm1a, pm1b, pm2a, pm3a]);

      // Verify initial state
      expect((await db.select({ count: count() }).from(kilocode_users))[0].count).toBe(3);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then((r: { count: number }[]) => r[0].count)
      ).toBe(4);
      expect((await db.select({ count: count() }).from(payment_methods))[0].count).toBe(4);

      await deleteUserDatabaseRecords(user1.id);

      expect(await findUserById(user1.id)).toBe(undefined);
      expect(
        await db.query.microdollar_usage.findMany({
          where: eq(microdollar_usage.kilo_user_id, user1.id),
        })
      ).toHaveLength(0);

      expect(
        await db.query.payment_methods.findMany({
          where: eq(payment_methods.user_id, user1.id),
        })
      ).toHaveLength(0);

      // Verify other users' records remain
      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(2);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then(r => r[0].count)
      ).toBe(2);
      expect(await findUserById(user2.id)).not.toBeNull();
      expect(await findUserById(user3.id)).not.toBeNull();
      expect(
        await db
          .select()
          .from(microdollar_usage)
          .where(eq(microdollar_usage.kilo_user_id, user2.id))
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(microdollar_usage)
          .where(eq(microdollar_usage.kilo_user_id, user3.id))
      ).toHaveLength(1);

      expect(
        await db.select().from(payment_methods).where(eq(payment_methods.user_id, user2.id))
      ).toHaveLength(1);
      expect(
        await db.select().from(payment_methods).where(eq(payment_methods.user_id, user3.id))
      ).toHaveLength(1);
    });

    it('should handle deletion of non-existent user gracefully', async () => {
      const user1 = await insertTestUser();
      await insertUsageWithOverrides({ kilo_user_id: user1.id });

      // Verify initial state
      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(1);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then(r => r[0].count)
      ).toBe(1);

      // Try to delete non-existent user
      await expect(deleteUserDatabaseRecords('non-existent-user')).resolves.not.toThrow();

      // Verify existing data is unchanged
      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(1);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then(r => r[0].count)
      ).toBe(1);
      expect(await findUserById(user1.id)).not.toBeUndefined();
    });

    it('should delete user with no related records', async () => {
      const user1 = await insertTestUser();

      // Verify initial state
      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(1);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then((r: { count: number }[]) => r[0].count)
      ).toBe(0);
      expect((await db.select({ count: count() }).from(payment_methods))[0].count).toBe(0);

      // Delete the user
      await deleteUserDatabaseRecords(user1.id);

      // Verify user is deleted
      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(0);
      expect(await findUserById(user1.id)).toBe(undefined);
    });

    it('should delete user with only some types of related records', async () => {
      const user1 = await insertTestUser();
      const user2 = await insertTestUser();

      // User1 has only MicrodollarUsage and PaymentMethod records
      await insertUsageWithOverrides({ kilo_user_id: user1.id });
      const pm1 = createTestPaymentMethod(user1.id);
      await db.insert(payment_methods).values(pm1);

      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(2);
      expect(
        await db
          .select({ count: count() })
          .from(microdollar_usage)
          .then((r: { count: number }[]) => r[0].count)
      ).toBe(1);
      expect((await db.select({ count: count() }).from(payment_methods))[0].count).toBe(1);

      await deleteUserDatabaseRecords(user1.id);

      expect(await findUserById(user1.id)).toBe(undefined);
      expect(
        await db.query.microdollar_usage.findMany({
          where: eq(microdollar_usage.kilo_user_id, user1.id),
        })
      ).toHaveLength(0);
      expect(
        await db.query.payment_methods.findMany({
          where: eq(payment_methods.user_id, user1.id),
        })
      ).toHaveLength(0);

      expect(
        await db
          .select({ count: count() })
          .from(kilocode_users)
          .then(r => r[0].count)
      ).toBe(1);
      expect(await findUserById(user2.id)).not.toBeUndefined();
    });
  });

  describe('forceImmediateExpirationRecomputation', () => {
    afterEach(async () => {
      // eslint-disable-next-line drizzle/enforce-delete-with-where
      await db.delete(kilocode_users);
    });

    it('should set next_credit_expiration_at to now for existing user', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      const user = await insertTestUser({
        next_credit_expiration_at: futureDate,
      });

      const userBefore = await findUserById(user.id);
      expect(userBefore).toBeDefined();
      expect(new Date(userBefore!.next_credit_expiration_at!).toISOString()).toBe(futureDate);

      await forceImmediateExpirationRecomputation(user.id);

      const userAfter = await findUserById(user.id);
      expect(userAfter).toBeDefined();
      expect(new Date(userAfter!.next_credit_expiration_at!).toISOString()).not.toBe(futureDate);
      expect(userAfter!.next_credit_expiration_at).not.toBeNull();
      // Should be roughly now
      const diff = Math.abs(new Date(userAfter!.next_credit_expiration_at!).getTime() - Date.now());
      expect(diff).toBeLessThan(5000); // within 5 seconds
      expect(userAfter!.updated_at).not.toBe(userBefore!.updated_at);
    });

    it('should handle non-existent user gracefully', async () => {
      await expect(
        forceImmediateExpirationRecomputation('non-existent-user')
      ).resolves.not.toThrow();
    });

    it('should work when next_credit_expiration_at is already null', async () => {
      const user = await insertTestUser({
        next_credit_expiration_at: null,
      });

      const userBefore = await findUserById(user.id);
      expect(userBefore).toBeDefined();
      expect(userBefore!.next_credit_expiration_at).toBeNull();

      await forceImmediateExpirationRecomputation(user.id);

      const userAfter = await findUserById(user.id);
      expect(userAfter).toBeDefined();
      expect(userAfter!.next_credit_expiration_at).not.toBeNull();
      expect(userAfter!.updated_at).not.toBe(userBefore!.updated_at);
    });

    it('should only affect the specified user', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      const user1 = await insertTestUser({
        next_credit_expiration_at: futureDate,
      });
      const user2 = await insertTestUser({
        next_credit_expiration_at: futureDate,
      });

      const user1Before = await findUserById(user1.id);
      const user2Before = await findUserById(user2.id);
      expect(new Date(user1Before!.next_credit_expiration_at!).toISOString()).toBe(futureDate);
      expect(new Date(user2Before!.next_credit_expiration_at!).toISOString()).toBe(futureDate);

      await forceImmediateExpirationRecomputation(user1.id);

      const user1After = await findUserById(user1.id);
      const user2After = await findUserById(user2.id);

      expect(new Date(user1After!.next_credit_expiration_at!).toISOString()).not.toBe(futureDate);
      expect(new Date(user2After!.next_credit_expiration_at!).toISOString()).toBe(futureDate);
    });
  });

  describe('findUsersByIds', () => {
    test('should return empty Map for empty input', async () => {
      const result = await findUsersByIds([]);
      expect(result.size).toBe(0);
      expect(result).toEqual(new Map());
    });

    test('should return single user for single ID', async () => {
      const testUser = await insertTestUser({
        google_user_name: 'Single User',
        google_user_email: 'single@example.com',
      });

      const result = await findUsersByIds([testUser.id]);

      expect(result.size).toBe(1);
      const user = result.get(testUser.id);
      expect(user?.id).toBe(testUser.id);
      expect(user?.google_user_name).toBe('Single User');
      expect(user?.google_user_email).toBe('single@example.com');
    });

    test('should return multiple users for multiple IDs', async () => {
      const user1 = await insertTestUser({
        google_user_name: 'User One',
        google_user_email: 'user1@example.com',
      });

      const user2 = await insertTestUser({
        google_user_name: 'User Two',
        google_user_email: 'user2@example.com',
      });

      const user3 = await insertTestUser({
        google_user_name: 'User Three',
        google_user_email: 'user3@example.com',
      });

      const result = await findUsersByIds([user1.id, user2.id, user3.id]);

      expect(result.size).toBe(3);

      const resultIds = Array.from(result.keys()).sort();
      const expectedIds = [user1.id, user2.id, user3.id].sort();
      expect(resultIds).toEqual(expectedIds);

      // Verify each user is returned correctly
      expect(result.get(user1.id)?.google_user_name).toBe('User One');
      expect(result.get(user2.id)?.google_user_name).toBe('User Two');
      expect(result.get(user3.id)?.google_user_name).toBe('User Three');
    });

    test('should handle mix of existing and non-existent IDs', async () => {
      const existingUser = await insertTestUser({
        google_user_name: 'Existing User',
        google_user_email: 'existing@example.com',
      });

      const result = await findUsersByIds([
        existingUser.id,
        'non-existent-id-1',
        'non-existent-id-2',
      ]);

      expect(result.size).toBe(1);
      const user = result.get(existingUser.id);
      expect(user?.id).toBe(existingUser.id);
      expect(user?.google_user_name).toBe('Existing User');
    });

    test('should handle duplicate IDs', async () => {
      const testUser = await insertTestUser({
        google_user_name: 'Duplicate Test User',
        google_user_email: 'duplicate@example.com',
      });

      const result = await findUsersByIds([testUser.id, testUser.id, testUser.id]);

      expect(result.size).toBe(1);
      const user = result.get(testUser.id);
      expect(user?.id).toBe(testUser.id);
      expect(user?.google_user_name).toBe('Duplicate Test User');
    });

    test('should return empty Map for all non-existent IDs', async () => {
      const result = await findUsersByIds(['non-existent-1', 'non-existent-2', 'non-existent-3']);

      expect(result.size).toBe(0);
      expect(result).toEqual(new Map());
    });
  });
});
