import { closeAllDrizzleConnections } from '@/lib/drizzle';
import { deleteUserFromExternalServices } from '@/lib/external-services';
import { shutdownPosthog } from '@/lib/posthog';
import { deleteUserDatabaseRecords, findUserById } from '@/lib/user';

async function run(kiloUserId: string): Promise<void> {
  if (!kiloUserId) {
    console.error('Usage: pnpm script src/scripts/gdpr-removal <kilo_user_id>');
    process.exit(1);
  }

  const user = await findUserById(kiloUserId);
  if (!user) {
    console.error(`User not found: ${kiloUserId}`);
    process.exit(1);
  }

  console.log(
    `Deleting account for user ID: ${user.id} (${user.google_user_email}, ${user.stripe_customer_id})`
  );

  await deleteUserFromExternalServices(user);
  await deleteUserDatabaseRecords(kiloUserId);

  console.log(`Account for user ID ${user.id} deleted successfully`);
}

run(process.argv[2])
  .catch(error => {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    // Ensure the database connection pool is closed to prevent process hanging
    await closeAllDrizzleConnections();
    await shutdownPosthog();
  });
