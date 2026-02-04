import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { captureException } from '@sentry/nextjs';
import { CRON_SECRET } from '@/lib/config.server';
import { runFullSync } from '@/lib/security-agent/services/sync-service';

// TODO: Create BetterStack heartbeat for security alerts sync
// const BETTERSTACK_HEARTBEAT_URL = 'https://uptime.betterstack.com/api/v1/heartbeat/...';

/**
 * Vercel Cron Job: Sync Security Alerts
 *
 * This endpoint runs periodically to sync Dependabot alerts from GitHub
 * for all organizations/users with security reviews enabled.
 *
 * Schedule: Every 6 hours
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[sync-security-alerts] Starting security alerts sync...');
    const startTime = Date.now();

    const result = await runFullSync();

    const duration = Date.now() - startTime;
    const summary = {
      success: true,
      duration: `${duration}ms`,
      totalSynced: result.totalSynced,
      totalErrors: result.totalErrors,
      configsProcessed: result.configsProcessed,
      timestamp: new Date().toISOString(),
    };

    console.log('[sync-security-alerts] Sync completed:', summary);

    // TODO: Send heartbeat to BetterStack on success
    // await fetch(BETTERSTACK_HEARTBEAT_URL);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[sync-security-alerts] Error syncing security alerts:', error);
    captureException(error, {
      tags: { endpoint: 'cron/sync-security-alerts' },
      extra: {
        action: 'syncing_security_alerts',
      },
    });

    // TODO: Send failure heartbeat to BetterStack
    // await fetch(`${BETTERSTACK_HEARTBEAT_URL}/fail`);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync security alerts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
