import { db } from '@/lib/drizzle';
import { deployments, deployment_threat_detections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { CheckUrlResult, ThreatType } from './web-risk-client';

type Deployment = typeof deployments.$inferSelect;

/**
 * Handle a detected threat for a deployment.
 *
 * 1. Records detection in audit log (deployment_threat_detections table)
 * 2. Updates deployment status to 'flagged' (not disabled)
 * 3. Alerts admins for manual review
 */
export async function handleThreatDetected(
  deployment: Deployment,
  result: CheckUrlResult
): Promise<void> {
  // 1. Record detection in audit log
  await db.insert(deployment_threat_detections).values({
    deployment_id: deployment.id,
    build_id: deployment.last_build_id,
    threat_type: result.threatTypes.join(','),
  });

  // 2. Update deployment status to flagged (not disabled)
  await db
    .update(deployments)
    .set({ threat_status: 'flagged' })
    .where(eq(deployments.id, deployment.id));

  // 3. Alert admin (Slack) for manual review
  await alertAdmins({
    deployment,
    threatTypes: result.threatTypes,
  });
}

type AlertAdminsParams = {
  deployment: Deployment;
  threatTypes: ThreatType[];
};

/**
 * Alert admins about a detected threat.
 *
 * Currently logs to console. Future: integrate with Slack webhook.
 */
async function alertAdmins(params: AlertAdminsParams): Promise<void> {
  console.warn('[THREAT DETECTED]', {
    deploymentId: params.deployment.id,
    deploymentUrl: params.deployment.deployment_url,
    deploymentSlug: params.deployment.deployment_slug,
    threatTypes: params.threatTypes,
    buildId: params.deployment.last_build_id,
    timestamp: new Date().toISOString(),
  });

  // TODO: Integrate with Slack admin notification system when webhook is available
}
