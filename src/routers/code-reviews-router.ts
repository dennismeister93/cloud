import { createTRPCRouter, baseProcedure } from '@/lib/trpc/init';
import { TRPCError } from '@trpc/server';
import * as z from 'zod';
import { getIntegrationForOwner } from '@/lib/integrations/db/platform-integrations';
import {
  getAgentConfigForOwner,
  upsertAgentConfigForOwner,
  setAgentEnabledForOwner,
} from '@/lib/agent-config/db/agent-configs';
import type { CodeReviewAgentConfig } from '@/lib/agent-config/core/types';
import { fetchGitHubRepositoriesForUser } from '@/lib/cloud-agent/github-integration-helpers';
import { PRIMARY_DEFAULT_MODEL } from '@/lib/models';

const SaveReviewConfigInputSchema = z.object({
  reviewStyle: z.enum(['strict', 'balanced', 'lenient']),
  focusAreas: z.array(z.string()),
  customInstructions: z.string().optional(),
  maxReviewTimeMinutes: z.number().min(5).max(30),
  modelSlug: z.string(),
  repositorySelectionMode: z.enum(['all', 'selected']).optional(),
  selectedRepositoryIds: z.array(z.number()).optional(),
});

export const personalReviewAgentRouter = createTRPCRouter({
  /**
   * Gets the GitHub App installation status for personal user
   */
  getGitHubStatus: baseProcedure.query(async ({ ctx }) => {
    const owner = { type: 'user' as const, id: ctx.user.id, userId: ctx.user.id };
    const integration = await getIntegrationForOwner(owner, 'github');

    if (!integration || integration.integration_status !== 'active') {
      return {
        connected: false,
        integration: null,
      };
    }

    return {
      connected: true,
      integration: {
        accountLogin: integration.platform_account_login,
        repositorySelection: integration.repository_access,
        installedAt: integration.installed_at,
        isValid: !integration.suspended_at,
      },
    };
  }),

  /**
   * List GitHub repositories accessible by the user's personal GitHub integration
   */
  listGitHubRepositories: baseProcedure
    .input(z.object({ forceRefresh: z.boolean().optional().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      return await fetchGitHubRepositoriesForUser(ctx.user.id, input?.forceRefresh ?? false);
    }),

  /**
   * Gets the review agent configuration for personal user
   */
  getReviewConfig: baseProcedure.query(async ({ ctx }) => {
    const owner = { type: 'user' as const, id: ctx.user.id, userId: ctx.user.id };
    const config = await getAgentConfigForOwner(owner, 'code_review', 'github');

    if (!config) {
      // Return default configuration
      return {
        isEnabled: false,
        reviewStyle: 'balanced' as const,
        focusAreas: [],
        customInstructions: null,
        maxReviewTimeMinutes: 10,
        modelSlug: PRIMARY_DEFAULT_MODEL,
        repositorySelectionMode: 'all' as const,
        selectedRepositoryIds: [],
      };
    }

    const cfg = config.config as CodeReviewAgentConfig;
    return {
      isEnabled: config.is_enabled,
      reviewStyle: cfg.review_style || 'balanced',
      focusAreas: cfg.focus_areas || [],
      customInstructions: cfg.custom_instructions || null,
      maxReviewTimeMinutes: cfg.max_review_time_minutes || 10,
      modelSlug: cfg.model_slug || PRIMARY_DEFAULT_MODEL,
      repositorySelectionMode: cfg.repository_selection_mode || 'all',
      selectedRepositoryIds: cfg.selected_repository_ids || [],
    };
  }),

  /**
   * Saves the review agent configuration for personal user
   */
  saveReviewConfig: baseProcedure
    .input(SaveReviewConfigInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const owner = { type: 'user' as const, id: ctx.user.id, userId: ctx.user.id };

        await upsertAgentConfigForOwner({
          owner,
          agentType: 'code_review',
          platform: 'github',
          config: {
            review_style: input.reviewStyle,
            focus_areas: input.focusAreas,
            custom_instructions: input.customInstructions || null,
            max_review_time_minutes: input.maxReviewTimeMinutes,
            model_slug: input.modelSlug,
            repository_selection_mode: input.repositorySelectionMode || 'all',
            selected_repository_ids: input.selectedRepositoryIds || [],
          },
          createdBy: ctx.user.id,
        });

        return { success: true };
      } catch (error) {
        console.error('Error saving review config:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save review configuration',
        });
      }
    }),

  /**
   * Toggles the review agent on/off for personal user
   */
  toggleReviewAgent: baseProcedure
    .input(
      z.object({
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const owner = { type: 'user' as const, id: ctx.user.id, userId: ctx.user.id };

        await setAgentEnabledForOwner(owner, 'code_review', 'github', input.isEnabled);

        return { success: true, isEnabled: input.isEnabled };
      } catch (error) {
        console.error('Error toggling review agent:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to toggle review agent',
        });
      }
    }),
});
