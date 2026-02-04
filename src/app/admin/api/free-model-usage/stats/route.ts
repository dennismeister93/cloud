import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getUserFromAuth } from '@/lib/user.server';
import { db } from '@/lib/drizzle';
import { free_model_usage } from '@/db/schema';
import { sql } from 'drizzle-orm';
import {
  FREE_MODEL_RATE_LIMIT_WINDOW_HOURS,
  FREE_MODEL_MAX_REQUESTS_PER_WINDOW,
} from '@/lib/constants';

export type FreeModelUsageStatsResponse = {
  // Current window stats (last 3 hours)
  windowUniqueIps: number;
  windowTotalRequests: number;
  windowAvgRequestsPerIp: number;
  windowIpsAtRequestLimit: number;
  windowAnonymousRequests: number;
  windowAuthenticatedRequests: number;

  // Last 24 hours stats
  dailyUniqueIps: number;
  dailyTotalRequests: number;
  dailyAnonymousRequests: number;
  dailyAuthenticatedRequests: number;

  // Rate limit configuration
  rateLimitWindowHours: number;
  maxRequestsPerWindow: number;
};

export async function GET(
  _request: NextRequest
): Promise<NextResponse<{ error: string } | FreeModelUsageStatsResponse>> {
  const { authFailedResponse } = await getUserFromAuth({ adminOnly: true });
  if (authFailedResponse) {
    return authFailedResponse;
  }

  // Get stats for the current rate limit window
  const windowResult = await db
    .select({
      unique_ips: sql<number>`COUNT(DISTINCT ${free_model_usage.ip_address})`,
      total_requests: sql<number>`COUNT(*)`,
      anonymous_requests: sql<number>`COUNT(*) FILTER (WHERE ${free_model_usage.kilo_user_id} IS NULL)`,
      authenticated_requests: sql<number>`COUNT(*) FILTER (WHERE ${free_model_usage.kilo_user_id} IS NOT NULL)`,
    })
    .from(free_model_usage)
    .where(
      sql`${free_model_usage.created_at} >= NOW() - INTERVAL '${sql.raw(String(FREE_MODEL_RATE_LIMIT_WINDOW_HOURS))} hours'`
    );

  // Get per-IP stats to find IPs at limits
  const perIpStats = await db
    .select({
      ip_address: free_model_usage.ip_address,
      request_count: sql<number>`COUNT(*)`,
    })
    .from(free_model_usage)
    .where(
      sql`${free_model_usage.created_at} >= NOW() - INTERVAL '${sql.raw(String(FREE_MODEL_RATE_LIMIT_WINDOW_HOURS))} hours'`
    )
    .groupBy(free_model_usage.ip_address);

  // Get stats for the last 24 hours
  const dailyResult = await db
    .select({
      unique_ips: sql<number>`COUNT(DISTINCT ${free_model_usage.ip_address})`,
      total_requests: sql<number>`COUNT(*)`,
      anonymous_requests: sql<number>`COUNT(*) FILTER (WHERE ${free_model_usage.kilo_user_id} IS NULL)`,
      authenticated_requests: sql<number>`COUNT(*) FILTER (WHERE ${free_model_usage.kilo_user_id} IS NOT NULL)`,
    })
    .from(free_model_usage)
    .where(sql`${free_model_usage.created_at} >= NOW() - INTERVAL '24 hours'`);

  const bigIntToNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    return Number(value) || 0;
  };

  const windowStats = windowResult[0];
  const dailyStats = dailyResult[0];

  const windowUniqueIps = bigIntToNumber(windowStats.unique_ips);
  const windowTotalRequests = bigIntToNumber(windowStats.total_requests);

  // Count IPs at or near limits
  let ipsAtRequestLimit = 0;
  for (const ip of perIpStats) {
    const requestCount = bigIntToNumber(ip.request_count);
    if (requestCount >= FREE_MODEL_MAX_REQUESTS_PER_WINDOW) {
      ipsAtRequestLimit++;
    }
  }

  return NextResponse.json({
    // Current window stats
    windowUniqueIps,
    windowTotalRequests,
    windowAvgRequestsPerIp:
      windowUniqueIps > 0 ? Math.round(windowTotalRequests / windowUniqueIps) : 0,
    windowIpsAtRequestLimit: ipsAtRequestLimit,
    windowAnonymousRequests: bigIntToNumber(windowStats.anonymous_requests),
    windowAuthenticatedRequests: bigIntToNumber(windowStats.authenticated_requests),

    // Last 24 hours stats
    dailyUniqueIps: bigIntToNumber(dailyStats.unique_ips),
    dailyTotalRequests: bigIntToNumber(dailyStats.total_requests),
    dailyAnonymousRequests: bigIntToNumber(dailyStats.anonymous_requests),
    dailyAuthenticatedRequests: bigIntToNumber(dailyStats.authenticated_requests),

    // Rate limit configuration
    rateLimitWindowHours: FREE_MODEL_RATE_LIMIT_WINDOW_HOURS,
    maxRequestsPerWindow: FREE_MODEL_MAX_REQUESTS_PER_WINDOW,
  });
}
