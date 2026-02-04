import 'server-only';
import { db } from '@/lib/drizzle';
import type { Deployment } from '@/db/schema';
import {
  deployments,
  deployment_builds,
  deployment_events,
  platform_integrations,
  app_builder_projects,
} from '@/db/schema';
import { eq, and, desc, gt, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { CreateDeploymentResponse } from '@/lib/user-deployments/deployment-builder-client';
import { apiClient as deployApiClient } from '@/lib/user-deployments/deployment-builder-client';
import { generateGitHubInstallationToken } from '@/lib/integrations/platforms/github/adapter';
import { generateGitToken as generateAppBuilderGitToken } from '@/lib/app-builder/app-builder-client';
import { getCredentials as getAppBuilderDbCredentials } from '@/lib/app-builder/app-builder-db-proxy-client';
import * as z from 'zod';
import { eventSchema } from '@/lib/user-deployments/types';
import type {
  Provider,
  DeploymentSource,
  GitSource,
  AppBuilderSource,
  GitHubSource,
} from '@/lib/user-deployments/types';
import type { Owner } from '@/lib/integrations/core/types';
import type { PlaintextEnvVar } from '@/lib/user-deployments/env-vars-validation';
import { markAsPlaintext } from '@/lib/user-deployments/env-vars-validation';
import type { EncryptedEnvVar } from '@/lib/user-deployments/env-vars-validation';
import * as envVarsService from '@/lib/user-deployments/env-vars-service';
import { encryptEnvVars } from '@/lib/user-deployments/env-vars-service';
import { isHTTPsUrl, extractRepoNameFromUrl } from './git-url-utils';
import { encryptAuthToken, decryptAuthToken } from './auth-token-encryption';
import { hasUserEverPaid, hasOrganizationEverPaid } from '@/lib/creditTransactions';

type PaymentCheckResult = { hasPaid: true } | { hasPaid: false };

async function checkOwnerHasEverPaid(owner: Owner): Promise<PaymentCheckResult> {
  const hasPaid =
    owner.type === 'org'
      ? await hasOrganizationEverPaid(owner.id)
      : await hasUserEverPaid(owner.id);

  return { hasPaid };
}

export type CreateDeploymentResult =
  | { success: true; deploymentId: string; deploymentSlug: string; deploymentUrl: string }
  | { success: false; error: 'payment_required'; message: string };

// Resolved source details ready for deployment
type ResolvedSourceDetails = {
  repositorySource: string;
  repoName: string;
  authToken: string | undefined;
  encryptedToken: string | null;
  platformIntegrationId: string | null;
  sourceType: 'git' | 'app-builder' | 'github';
};

/**
 * List deployments with their latest builds
 */
export async function listDeployments(owner: Owner) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  const userDeployments = await db
    .select({
      deployment: deployments,
      latestBuild: deployment_builds,
    })
    .from(deployments)
    .leftJoin(deployment_builds, eq(deployments.last_build_id, deployment_builds.id))
    .where(ownershipCondition)
    .orderBy(desc(deployments.created_at))
    .limit(100);

  return {
    success: true,
    data: userDeployments.map(row => ({
      deployment: row.deployment,
      latestBuild: row.latestBuild,
    })),
  };
}

/**
 * Get a single deployment with its latest build
 */
export async function getDeployment(deploymentId: string, owner: Owner) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  const result = await db
    .select({
      deployment: deployments,
      latestBuild: deployment_builds,
    })
    .from(deployments)
    .leftJoin(deployment_builds, eq(deployments.last_build_id, deployment_builds.id))
    .where(and(eq(deployments.id, deploymentId), ownershipCondition))
    .limit(1);

  if (result.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Deployment not found',
    });
  }

  return {
    success: true,
    deployment: result[0].deployment,
    latestBuild: result[0].latestBuild,
  };
}

/**
 * Get events for a build
 */
export async function getBuildEvents(
  deploymentId: string,
  buildId: string,
  owner: Owner,
  limit: number,
  afterEventId?: number
) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  // Verify both deployment and build belong to owner
  const buildVerification = await db
    .select({ buildId: deployment_builds.id })
    .from(deployment_builds)
    .innerJoin(deployments, eq(deployment_builds.deployment_id, deployments.id))
    .where(
      and(eq(deployment_builds.id, buildId), eq(deployments.id, deploymentId), ownershipCondition)
    )
    .limit(1);

  if (buildVerification.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Build not found or does not belong to this deployment',
    });
  }

  const whereClause = afterEventId
    ? and(eq(deployment_events.build_id, buildId), gt(deployment_events.event_id, afterEventId))
    : eq(deployment_events.build_id, buildId);

  const events = await db
    .select({
      id: deployment_events.event_id,
      ts: deployment_events.timestamp,
      type: deployment_events.event_type,
      payload: deployment_events.payload,
    })
    .from(deployment_events)
    .where(whereClause)
    .orderBy(deployment_events.event_id)
    .limit(limit);

  return z.array(eventSchema).parse(events);
}

/**
 * Delete a deployment
 */
export async function deleteDeployment(deploymentId: string, owner: Owner) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  // Verify deployment belongs to owner
  const deployment = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, deploymentId), ownershipCondition))
    .limit(1);

  if (deployment.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Deployment not found',
    });
  }

  // Delete worker deployment from Cloudflare FIRST
  // If this fails, we don't proceed with database deletion to avoid orphan deployments
  await deployApiClient.deleteWorker(deployment[0].deployment_slug);

  // Unlink app builder projects that reference this deployment
  await db
    .update(app_builder_projects)
    .set({ deployment_id: null })
    .where(eq(app_builder_projects.deployment_id, deploymentId));

  // Delete the deployment from the database
  // Related records (builds, events, env_vars) will be cascade deleted
  await db.delete(deployments).where(eq(deployments.id, deploymentId));

  return {
    success: true,
  };
}

/**
 * Cancel a running build
 */
export async function cancelBuild(buildId: string, deploymentId: string, owner: Owner) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  // Verify build belongs to a deployment owned by the user/org
  const buildVerification = await db
    .select({ buildId: deployment_builds.id, status: deployment_builds.status })
    .from(deployment_builds)
    .innerJoin(deployments, eq(deployment_builds.deployment_id, deployments.id))
    .where(
      and(eq(deployment_builds.id, buildId), eq(deployments.id, deploymentId), ownershipCondition)
    )
    .limit(1);

  if (buildVerification.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Build not found or does not belong to this deployment',
    });
  }

  const currentStatus = buildVerification[0].status;

  if (currentStatus !== 'queued' && currentStatus !== 'building' && currentStatus !== 'deploying') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot cancel build with status: ${currentStatus}.`,
    });
  }

  // Call the builder API to cancel the build
  try {
    const result = await deployApiClient.cancelBuild(buildId);

    // Handle result from builder
    if (!result.cancelled) {
      // not_found or already_finished: Build gone or completed in builder, treat as success
      if (result.reason === 'not_found' || result.reason === 'already_finished') {
        // Update local status if not already in a finished state
        const finishedStatuses = ['deployed', 'failed', 'cancelled'];
        if (!finishedStatuses.includes(currentStatus)) {
          await db
            .update(deployment_builds)
            .set({ status: result.status ?? 'cancelled' })
            .where(eq(deployment_builds.id, buildId));
        }
        return {
          success: true,
        };
      }
    }

    // Successfully cancelled, update build status to cancelled
    await db
      .update(deployment_builds)
      .set({ status: 'cancelled' })
      .where(eq(deployment_builds.id, buildId));

    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to cancel build: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Trigger a redeployment
 */
export async function redeployByDeploymentId(deploymentId: string, owner: Owner) {
  const ownershipCondition =
    owner.type === 'user'
      ? eq(deployments.owned_by_user_id, owner.id)
      : eq(deployments.owned_by_organization_id, owner.id);

  // Verify deployment belongs to owner
  const deployment = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.id, deploymentId), ownershipCondition))
    .limit(1);

  if (deployment.length === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Deployment not found',
    });
  }

  await redeploy(deployment[0]);
}

async function getGithubTokenFromIntegrationId(
  platformIntegrationId: string
): Promise<string | undefined> {
  const integration = await db
    .select()
    .from(platform_integrations)
    .where(
      and(
        eq(platform_integrations.id, platformIntegrationId),
        eq(platform_integrations.integration_status, 'active')
      )
    )
    .limit(1);

  if (
    integration.length > 0 &&
    integration[0].platform === 'github' &&
    integration[0].platform_installation_id
  ) {
    const tokenData = await generateGitHubInstallationToken(
      integration[0].platform_installation_id
    );
    return tokenData.token;
  }

  return undefined;
}

export async function redeploy(deployment: Deployment) {
  let accessToken: string | undefined;
  let provider: Provider;

  if (deployment.source_type === 'app-builder') {
    // App Builder flow - generate token on the fly
    const appId = extractAppIdFromGitUrl(deployment.repository_source);
    const { token } = await generateAppBuilderGitToken(appId, 'ro');
    accessToken = token;
    provider = 'app-builder';
  } else if (deployment.source_type === 'git') {
    // Generic git flow - use stored encrypted token
    accessToken = deployment.git_auth_token
      ? decryptAuthToken(deployment.git_auth_token)
      : undefined;
    provider = 'git';
  } else {
    // GitHub flow (default/existing behavior)
    if (!deployment.platform_integration_id) {
      throw new Error('Platform integration ID is required for GitHub redeployment');
    }
    accessToken = await getGithubTokenFromIntegrationId(deployment.platform_integration_id);
    if (!accessToken) {
      throw new Error('GitHub token is required for redeployment');
    }
    provider = 'github';
  }

  // Find running builds for this deployment
  const cancelBuildIds = (
    await db
      .select({ id: deployment_builds.id })
      .from(deployment_builds)
      .where(
        and(
          eq(deployment_builds.deployment_id, deployment.id),
          inArray(deployment_builds.status, ['building', 'queued'])
        )
      )
  ).map(build => build.id);

  // Get stored env vars from database
  let envVars = await envVarsService.getEnvVarsForDeployment(deployment.id);

  // For app-builder deployments, fetch DB credentials dynamically and merge with stored env vars
  if (deployment.source_type === 'app-builder') {
    const appId = extractAppIdFromGitUrl(deployment.repository_source);
    const dbEnvVars = await getAppBuilderDbEnvVars(appId);
    envVars = [...envVars, ...dbEnvVars];
  }

  const builderResponse = await deployApiClient.createDeployment(
    provider,
    deployment.repository_source,
    deployment.deployment_slug,
    deployment.branch,
    accessToken,
    cancelBuildIds.length > 0 ? cancelBuildIds : undefined,
    envVars.length > 0 ? envVars : undefined
  );

  await db.transaction(async tx => {
    // Insert the new build
    await tx.insert(deployment_builds).values({
      id: builderResponse.buildId,
      deployment_id: deployment.id,
      status: builderResponse.status,
    });

    // Update deployment's last_build_id
    await tx
      .update(deployments)
      .set({ last_build_id: builderResponse.buildId })
      .where(eq(deployments.id, deployment.id));
  });

  return;
}

const DEFAULT_DEPLOYMENT_DOMAIN = 'd.kiloapps.io';

/**
 * Resolve GitHub source configuration - validates platform integration and generates token
 */
async function resolveGitHubSource(
  owner: Owner,
  source: GitHubSource
): Promise<ResolvedSourceDetails> {
  const { platformIntegrationId, repositoryFullName } = source;

  // Verify platform integration exists and belongs to the owner
  const ownershipCondition =
    owner.type === 'user'
      ? eq(platform_integrations.owned_by_user_id, owner.id)
      : eq(platform_integrations.owned_by_organization_id, owner.id);

  const [platformIntegration] = await db
    .select()
    .from(platform_integrations)
    .where(and(eq(platform_integrations.id, platformIntegrationId), ownershipCondition))
    .limit(1);

  if (!platformIntegration) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Platform integration not found',
    });
  }

  if (!platformIntegration.platform_installation_id) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Platform installation ID not found',
    });
  }

  // Verify repository access for selected repositories
  if (platformIntegration.repository_access === 'selected') {
    const repositories = platformIntegration.repositories || [];
    const hasAccess = repositories.some(repo => repo.full_name === repositoryFullName);

    if (!hasAccess) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Repository not accessible by this integration',
      });
    }
  }

  // Generate GitHub installation token
  const tokenData = await generateGitHubInstallationToken(
    platformIntegration.platform_installation_id
  );

  return {
    repositorySource: repositoryFullName,
    repoName: repositoryFullName.split('/')[1],
    authToken: tokenData.token,
    encryptedToken: null, // GitHub tokens are regenerated, not stored
    platformIntegrationId,
    sourceType: 'github',
  };
}

/**
 * Resolve generic git source configuration - validates URL and encrypts token
 */
function resolveGitSource(source: GitSource): ResolvedSourceDetails {
  const { gitUrl, authToken } = source;

  if (!isHTTPsUrl(gitUrl)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid git URL',
    });
  }

  return {
    repositorySource: gitUrl,
    repoName: extractRepoNameFromUrl(gitUrl),
    authToken,
    encryptedToken: authToken ? encryptAuthToken(authToken) : null,
    platformIntegrationId: null,
    sourceType: 'git',
  };
}

/**
 * Extract app/project ID from an App Builder git URL
 * Expected format: https://app-builder.example.com/apps/{projectId}.git
 */
function extractAppIdFromGitUrl(gitUrl: string): string {
  const match = gitUrl.match(/\/apps\/([a-f0-9-]+)\.git$/i);
  if (!match) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid App Builder git URL format',
    });
  }
  return match[1];
}

/**
 * Fetch database credentials for an App Builder project and return as encrypted env vars.
 * Returns empty array if the project has no database provisioned.
 */
async function getAppBuilderDbEnvVars(appId: string): Promise<EncryptedEnvVar[]> {
  const dbCredentials = await getAppBuilderDbCredentials(appId);
  if (!dbCredentials.provisioned) {
    return [];
  }

  return encryptEnvVars([
    markAsPlaintext({ key: 'DB_URL', value: dbCredentials.dbUrl, isSecret: false }),
    markAsPlaintext({ key: 'DB_TOKEN', value: dbCredentials.dbToken ?? '', isSecret: true }),
  ]);
}

/**
 * Resolve App Builder source configuration - validates URL and generates token on the fly
 */
async function resolveAppBuilderSource(source: AppBuilderSource): Promise<ResolvedSourceDetails> {
  const { gitUrl } = source;

  if (!isHTTPsUrl(gitUrl)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid git URL',
    });
  }

  // Extract project ID from git URL and generate a fresh read-only token
  const appId = extractAppIdFromGitUrl(gitUrl);
  const { token } = await generateAppBuilderGitToken(appId, 'ro');

  return {
    repositorySource: gitUrl,
    repoName: extractRepoNameFromUrl(gitUrl),
    authToken: token,
    encryptedToken: null, // App Builder tokens are regenerated, not stored
    platformIntegrationId: null,
    sourceType: 'app-builder',
  };
}

/**
 * Resolve deployment source based on type - dispatches to appropriate resolver
 */
async function resolveSource(
  owner: Owner,
  source: DeploymentSource
): Promise<ResolvedSourceDetails> {
  if (source.type === 'github') {
    return resolveGitHubSource(owner, source);
  }
  if (source.type === 'app-builder') {
    return resolveAppBuilderSource(source);
  }
  return resolveGitSource(source);
}

/**
 * Create a new deployment from any source (git URL, GitHub integration, or app-builder)
 */
export async function createDeployment(params: {
  owner: Owner;
  source: DeploymentSource;
  branch: string;
  createdByUserId: string;
  envVars?: PlaintextEnvVar[];
}): Promise<CreateDeploymentResult> {
  const { owner, source, branch, createdByUserId, envVars } = params;

  // Temporary: skip payment check for app builder sites
  if (source.type !== 'app-builder') {
    const paymentCheck = await checkOwnerHasEverPaid(owner);
    if (!paymentCheck.hasPaid) {
      return {
        success: false,
        error: 'payment_required',
        message: 'Payment required for deployments.',
      };
    }
  }

  const resolved = await resolveSource(owner, source);

  // Generate deployment slug from repository name + random suffix
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const deploymentSlug = `${resolved.repoName}-${randomSuffix}`.toLowerCase();

  // Encrypt user-provided env vars first
  const encryptedUserEnvVars = envVars && envVars.length > 0 ? encryptEnvVars(envVars) : [];

  // For app-builder deployments, fetch DB credentials dynamically (already encrypted)
  let encryptedDBEnvVars: EncryptedEnvVar[] = [];
  if (source.type === 'app-builder') {
    const appId = extractAppIdFromGitUrl(source.gitUrl);
    encryptedDBEnvVars = await getAppBuilderDbEnvVars(appId);
  }

  const allEncryptedEnvVars = [...encryptedUserEnvVars, ...encryptedDBEnvVars];

  // Call builder API
  let builderResponse: CreateDeploymentResponse;
  try {
    builderResponse = await deployApiClient.createDeployment(
      resolved.sourceType,
      resolved.repositorySource,
      deploymentSlug,
      branch,
      resolved.authToken,
      undefined,
      allEncryptedEnvVars.length > 0 ? allEncryptedEnvVars : undefined
    );
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to trigger deployment: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const deploymentUrl = `https://${deploymentSlug}.${DEFAULT_DEPLOYMENT_DOMAIN}`;

  const deploymentId = await db.transaction(async tx => {
    const [deployment] = await tx
      .insert(deployments)
      .values({
        created_by_user_id: createdByUserId,
        owned_by_organization_id: owner.type === 'org' ? owner.id : null,
        owned_by_user_id: owner.type === 'user' ? owner.id : null,
        deployment_slug: deploymentSlug,
        repository_source: resolved.repositorySource,
        branch: branch,
        deployment_url: deploymentUrl,
        platform_integration_id: resolved.platformIntegrationId,
        source_type: resolved.sourceType,
        git_auth_token: resolved.encryptedToken,
        last_build_id: builderResponse.buildId,
      })
      .returning();

    await tx.insert(deployment_builds).values({
      id: builderResponse.buildId,
      deployment_id: deployment.id,
      status: builderResponse.status,
    });

    // Store env vars (already encrypted)
    if (encryptedUserEnvVars.length > 0) {
      for (const envVar of encryptedUserEnvVars) {
        await envVarsService.setEnvVar(deployment, envVar, owner, tx);
      }
    }

    return deployment.id;
  });

  return { success: true, deploymentId, deploymentSlug, deploymentUrl };
}
