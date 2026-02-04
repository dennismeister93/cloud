/**
 * Prepare Code Review Payload
 *
 * Extracts all preparation logic (DB lookups, token generation, prompt generation)
 * Returns complete payload ready for cloud agent
 */

import { captureException } from '@sentry/nextjs';
import { db } from '@/lib/drizzle';
import { kilocode_users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateApiToken } from '@/lib/tokens';
import {
  generateGitHubInstallationToken,
  findKiloReviewComment,
  fetchPRInlineComments,
  getPRHeadCommit,
} from '@/lib/integrations/platforms/github/adapter';
import type { GitHubAppType } from '@/lib/integrations/platforms/github/app-selector';
import type { ExistingReviewState, PreviousReviewStatus } from '../prompts/generate-prompt';
import { getIntegrationById } from '@/lib/integrations/db/platform-integrations';
import { getCodeReviewById } from '../db/code-reviews';
import { DEFAULT_CODE_REVIEW_MODEL, DEFAULT_CODE_REVIEW_MODE } from '../core/constants';
import type { Owner } from '../core';
import { generateReviewPrompt } from '../prompts/generate-prompt';
import type { CodeReviewAgentConfig } from '@/lib/agent-config/core/types';
import { logExceptInTest, errorExceptInTest } from '@/lib/utils.server';

export interface PreparePayloadParams {
  reviewId: string;
  owner: Owner;
  agentConfig: {
    config: CodeReviewAgentConfig | Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface SessionInput {
  githubRepo: string;
  kilocodeOrganizationId?: string;
  prompt: string;
  mode: 'code';
  model: string;
  upstreamBranch: string;
  githubToken?: string;
  // Note: envVars not needed - cloud-agent auto-sets GH_TOKEN from githubToken
}

export interface CodeReviewPayload {
  reviewId: string;
  authToken: string;
  sessionInput: SessionInput;
  owner: Owner;
  skipBalanceCheck?: boolean;
}

/**
 * Prepare complete payload for code review
 * Does all the heavy lifting: DB queries, token generation, prompt generation
 */
export async function prepareReviewPayload(
  params: PreparePayloadParams
): Promise<CodeReviewPayload> {
  const { reviewId, owner, agentConfig } = params;

  try {
    // 1. Get the review from DB
    const review = await getCodeReviewById(reviewId);
    if (!review) {
      throw new Error(`Review ${reviewId} not found`);
    }

    // 2. Get the user by userId
    const [user] = await db
      .select()
      .from(kilocode_users)
      .where(eq(kilocode_users.id, owner.userId))
      .limit(1);

    if (!user) {
      throw new Error(`User ${owner.userId} not found`);
    }

    // 3. Get GitHub token from integration (if available) and build review state
    let githubToken: string | undefined;
    let existingReviewState: ExistingReviewState | null = null;

    if (review.platform_integration_id) {
      try {
        const integration = await getIntegrationById(review.platform_integration_id);

        if (integration?.platform_installation_id) {
          // Use the stored app type (defaults to 'standard' for existing integrations)
          const appType: GitHubAppType = integration.github_app_type || 'standard';

          const tokenData = await generateGitHubInstallationToken(
            integration.platform_installation_id,
            appType
          );
          githubToken = tokenData.token;

          // Build complete review state for intelligent update/create decisions
          try {
            const [repoOwner, repoName] = review.repo_full_name.split('/');

            // Fetch all state in parallel for efficiency
            const [summaryComment, inlineComments, headCommitSha] = await Promise.all([
              findKiloReviewComment(
                integration.platform_installation_id,
                repoOwner,
                repoName,
                review.pr_number,
                appType
              ),
              fetchPRInlineComments(
                integration.platform_installation_id,
                repoOwner,
                repoName,
                review.pr_number,
                appType
              ),
              getPRHeadCommit(
                integration.platform_installation_id,
                repoOwner,
                repoName,
                review.pr_number,
                appType
              ),
            ]);

            // Determine previous status from summary body
            let previousStatus: PreviousReviewStatus = 'no-review';
            if (summaryComment) {
              if (
                summaryComment.body.includes('No Issues Found') ||
                summaryComment.body.includes('No New Issues')
              ) {
                previousStatus = 'no-issues';
              } else if (
                summaryComment.body.includes('Issues Found') ||
                summaryComment.body.includes('WARNING') ||
                summaryComment.body.includes('CRITICAL')
              ) {
                previousStatus = 'issues-found';
              }
            }

            existingReviewState = {
              summaryComment,
              inlineComments,
              previousStatus,
              headCommitSha,
            };

            logExceptInTest('[prepareReviewPayload] Built review state', {
              reviewId,
              hasSummary: !!summaryComment,
              inlineCount: inlineComments.length,
              previousStatus,
              headCommitSha: headCommitSha.substring(0, 8),
            });
          } catch (stateLookupError) {
            // Non-critical - continue without state info
            logExceptInTest('[prepareReviewPayload] Failed to build review state:', {
              reviewId,
              error: stateLookupError,
            });
          }
        }
      } catch (authError) {
        captureException(authError, {
          tags: { operation: 'prepareReviewPayload', step: 'get-github-token' },
          extra: { reviewId, platformIntegrationId: review.platform_integration_id },
        });
        // Continue without GitHub token - cloud agent may still work with public repos
      }
    }

    // 4. Generate auth token for cloud agent with bot identifier
    const authToken = generateApiToken(user, { botId: 'reviewer' });

    // 5. Generate dynamic review prompt (include reviewId for fix link and review state)
    const { prompt, version, source } = await generateReviewPrompt(
      agentConfig.config as CodeReviewAgentConfig,
      review.repo_full_name,
      review.pr_number,
      reviewId,
      existingReviewState
    );

    logExceptInTest('[prepareReviewPayload] Generated prompt:', {
      reviewId,
      version,
      source,
      promptLength: prompt.length,
    });

    // 6. Prepare session input (using gh CLI instead of MCP servers)
    // Note: cloud-agent automatically sets GH_TOKEN from githubToken parameter
    // See: cloud-agent/src/session-service.ts:321-323
    const config = agentConfig.config as CodeReviewAgentConfig;
    const sessionInput = {
      githubRepo: review.repo_full_name,
      kilocodeOrganizationId: owner.type === 'org' ? owner.id : undefined,
      prompt,
      mode: DEFAULT_CODE_REVIEW_MODE as 'code',
      model: config.model_slug || DEFAULT_CODE_REVIEW_MODEL,
      upstreamBranch: review.head_ref,
      githubToken,
    };

    // 7. Build complete payload
    const payload: CodeReviewPayload = {
      reviewId,
      authToken,
      sessionInput,
      owner,
    };

    logExceptInTest('[prepareReviewPayload] Prepared payload', {
      reviewId,
      owner,
      sessionInput: {
        ...sessionInput,
        githubToken: githubToken ? '***' : undefined, // Redact token
        prompt: sessionInput.prompt.substring(0, 200) + '...', // Show first 200 chars
      },
    });

    return payload;
  } catch (error) {
    errorExceptInTest('[prepareReviewPayload] Error preparing payload:', error);
    captureException(error, {
      tags: { operation: 'prepareReviewPayload' },
      extra: { reviewId, owner },
    });
    throw error;
  }
}
