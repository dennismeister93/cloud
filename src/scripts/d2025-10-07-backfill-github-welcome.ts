import { db } from '@/lib/drizzle';
import { kilocode_users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { grantCreditForCategory } from '@/lib/promotionalCredits';
import * as fs from 'node:fs/promises';

const isDryRun = !process.argv.includes('--apply');

type ProcessingStats = {
  processed: number;
  successful: number;
  failed: number;
  failures: {
    user_not_found: number;
    credit_grant_failed: number;
  };
};

async function run() {
  console.log('Starting backfill of welcome credits...');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made to the database');
  }

  // Get the file path from command line arguments
  const filePathArg = process.argv.find(arg => arg.startsWith('--file='));
  if (!filePathArg) {
    console.error('Error: Please specify a file path using --file=<path>');
    console.error('Usage: node script.js --file=/path/to/userids.txt [--run-actually]');
    process.exit(1);
  }

  const filePath = filePathArg.split('=')[1];
  if (!filePath) {
    console.error('Error: File path cannot be empty');
    process.exit(1);
  }

  console.log(`Reading user IDs from: ${filePath}`);

  // Read user IDs from file
  let userIds: string[];
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    userIds = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    process.exit(1);
  }

  console.log(`Found ${userIds.length} user IDs in file`);

  const stats: ProcessingStats = {
    processed: 0,
    successful: 0,
    failed: 0,
    failures: {
      user_not_found: 0,
      credit_grant_failed: 0,
    },
  };

  // Process user IDs one by one
  for (const userId of userIds) {
    stats.processed++;

    try {
      // Find the user
      const user = await db.query.kilocode_users.findFirst({
        where: eq(kilocode_users.id, userId),
      });

      if (!user) {
        stats.failed++;
        stats.failures.user_not_found++;
        console.log(`❌ User not found: ${userId}`);
      } else if (isDryRun) {
        stats.successful++;
        console.log(`✅ [DRY RUN] skipped user: ${userId} (${user.google_user_email})`);
      } else {
        const result = await grantCreditForCategory(user, {
          credit_category: 'automatic-welcome-credits',
          counts_as_selfservice: false,
          description:
            'backfill: https://kilo-code.slack.com/archives/C08HFNY5457/p1758898243260759',
        });

        if (!result.success) {
          stats.failed++;
          stats.failures.credit_grant_failed++;
          console.log(`❌ Credit grant failed for user ${userId}: ${result.message}`);
        } else {
          stats.successful++;
          console.log(`✅ Granted welcome credits to user: ${userId} (${user.google_user_email})`);
        }
      }
    } catch (error) {
      stats.failed++;
      stats.failures.credit_grant_failed++;
      console.error(`❌ Unexpected error processing user ${userId}:`, error);
    }

    // Report progress every 50 users
    if (stats.processed % 50 === 0) {
      console.log(`\n📊 Progress: ${stats.processed}/${userIds.length} users processed`);
      console.log(`   ✅ Successful: ${stats.successful}`);
      console.log(
        `   ❌ Failed: ${stats.failed} (${stats.failures.user_not_found} not found, ${stats.failures.credit_grant_failed} credit failed)`
      );
    }
  }

  console.log('\n✅ Backfill completed!');
  console.log(`\n📊 Final Statistics:`);
  console.log(`   Total processed: ${stats.processed}`);
  console.log(`   Successful: ${stats.successful}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`     - User not found: ${stats.failures.user_not_found}`);
  console.log(`     - Credit grant failed: ${stats.failures.credit_grant_failed}`);

  if (isDryRun) {
    console.log('\n🔍 This was a DRY RUN. No actual changes were made.');
    console.log('To apply changes, run with --run-actually flag');
  }
}

// Run the script
run()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
