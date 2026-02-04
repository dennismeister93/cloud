import { createTRPCRouter } from '@/lib/trpc/init';
import { TRPCError } from '@trpc/server';
import * as z from 'zod';
import {
  organizationMemberProcedure,
  organizationOwnerProcedure,
  OrganizationIdInputSchema,
} from './utils';
import { createAuditLog } from '@/lib/organizations/organization-audit-logs';
import { getIntegrationForOrganization } from '@/lib/integrations/db/platform-integrations';
import {
  getAgentConfig,
  upsertAgentConfig,
  setAgentEnabled,
} from '@/lib/agent-config/db/agent-configs';

import type { CodeReviewAgentConfig } from '@/lib/agent-config/core/types';
import { fetchGitHubRepositoriesForOrganization } from '@/lib/cloud-agent/github-integration-helpers';
import { PRIMARY_DEFAULT_MODEL } from '@/lib/models';

const SaveReviewConfigInputSchema = OrganizationIdInputSchema.extend({
  reviewStyle: z.enum(['strict', 'balanced', 'lenient']),
  focusAreas: z.array(z.string()),
  customInstructions: z.string().optional(),
  maxReviewTimeMinutes: z.number().min(5).max(30),
  modelSlug: z.string(),
  repositorySelectionMode: z.enum(['all', 'selected']).optional(),
  selectedRepositoryIds: z.array(z.number()).optional(),
});

export const organizationReviewAgentRouter = createTRPCRouter({
  /**
   * Gets the GitHub App installation status
   * (Replaces getGitHubStatus - now checks for GitHub App instead of OAuth)
   */
  getGitHubStatus: organizationMemberProcedure.query(async ({ input }) => {
    const integration = await getIntegrationForOrganization(input.organizationId, 'github');

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
   * List GitHub repositories accessible by the organization's GitHub integration
   */
  listGitHubRepositories: organizationMemberProcedure
    .input(
      OrganizationIdInputSchema.extend({
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      return await fetchGitHubRepositoriesForOrganization(input.organizationId, input.forceRefresh);
    }),

  /**
   * Gets the review agent configuration
   */
  getReviewConfig: organizationMemberProcedure.query(async ({ input }) => {
    const config = await getAgentConfig(input.organizationId, 'code_review', 'github');

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
   * Saves the review agent configuration
   */
  saveReviewConfig: organizationOwnerProcedure
    .input(SaveReviewConfigInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await upsertAgentConfig({
          organizationId: input.organizationId,
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

        // Audit log
        await createAuditLog({
          organization_id: input.organizationId,
          action: 'organization.settings.change',
          actor_id: ctx.user.id,
          actor_email: ctx.user.google_user_email,
          actor_name: ctx.user.google_user_name,
          message: `Updated Review Agent configuration (style: ${input.reviewStyle})`,
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
   * Toggles the review agent on/off
   */
  toggleReviewAgent: organizationOwnerProcedure
    .input(
      OrganizationIdInputSchema.extend({
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await setAgentEnabled(input.organizationId, 'code_review', 'github', input.isEnabled);

        // Audit log
        await createAuditLog({
          organization_id: input.organizationId,
          action: 'organization.settings.change',
          actor_id: ctx.user.id,
          actor_email: ctx.user.google_user_email,
          actor_name: ctx.user.google_user_name,
          message: `${input.isEnabled ? 'Enabled' : 'Disabled'} AI Code Review Agent`,
        });

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
