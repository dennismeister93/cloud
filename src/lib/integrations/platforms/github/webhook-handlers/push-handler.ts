import { captureException } from '@sentry/nextjs';
import { db } from '@/lib/drizzle';
import { deployments, platform_integrations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { redeploy } from '@/lib/user-deployments/deployments-service';
import { PLATFORM } from '@/lib/integrations/core/constants';
import { logExceptInTest } from '@/lib/utils.server';
import type { PushEventPayload } from '@/lib/integrations/platforms/github/webhook-schemas';
import { extractBranchNameFromRef } from '@/lib/integrations/platforms/github/utils';

export async function handlePushEvent(event: PushEventPayload) {
  const branchName = extractBranchNameFromRef(event.ref);
  const repositoryFullName = event.repository.full_name;

  // Query database for GitHub deployments matching this repository and branch
  const githubDeployments = await db
    .select({
      deployment: deployments,
      integration: platform_integrations,
    })
    .from(deployments)
    .innerJoin(
      platform_integrations,
      eq(deployments.platform_integration_id, platform_integrations.id)
    )
    .where(
      and(
        eq(deployments.repository_source, repositoryFullName),
        eq(deployments.branch, branchName),
        eq(deployments.source_type, 'github'),
        eq(platform_integrations.platform, PLATFORM.GITHUB)
      )
    );

  if (githubDeployments.length === 0) {
    logExceptInTest('No matching deployments found for push event', {
      repository: repositoryFullName,
      branch: branchName,
    });
    return;
  }

  await Promise.allSettled(
    githubDeployments.map(async ({ deployment }) => {
      try {
        await redeploy(deployment);
      } catch (error) {
        logExceptInTest('Failed to trigger redeployment', {
          deploymentId: deployment.id,
          error: error instanceof Error ? error.message : String(error),
        });
        captureException(error, {
          tags: {
            source: 'github_webhook_handler',
            event: 'push',
            deploymentId: deployment.id,
          },
          extra: {
            repository: repositoryFullName,
            branch: branchName,
          },
        });
      }
    })
  );
}
