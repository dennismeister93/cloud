import { NextResponse } from 'next/server';
import { cleanupStaleAnalyses } from '@/lib/security-agent/db/security-analysis';
import { sentryLogger } from '@/lib/utils.server';
import { CRON_SECRET } from '@/lib/config.server';

if (!CRON_SECRET) {
  throw new Error('CRON_SECRET is not configured in environment variables');
}

/**
 * Cron job endpoint to cleanup stale security analyses
 *
 * Analyses that have been "running" for more than 30 minutes are considered stale
 * and are marked as failed. This handles cases where:
 * - The serverless function timed out
 * - The cloud agent session was interrupted
 * - Network issues prevented completion
 *
 * Recommended schedule: Every 15 minutes
 */
export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');

  // Check if authorization header matches the secret
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  const expectedAuth = `Bearer ${CRON_SECRET}`;
  if (authHeader !== expectedAuth) {
    sentryLogger(
      'cron',
      'warning'
    )(
      'SECURITY: Invalid CRON job authorization attempt: ' +
        (authHeader ? 'Invalid authorization header' : 'Missing authorization header')
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Execute cleanup - mark analyses running for more than 30 minutes as failed
  const cleanedCount = await cleanupStaleAnalyses(30);

  if (cleanedCount > 0) {
    sentryLogger('cron', 'info')(`Cleaned up ${cleanedCount} stale security analyses`);
  }

  return NextResponse.json({
    success: true,
    cleanedCount,
    timestamp: new Date().toISOString(),
  });
}
