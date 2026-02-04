import { z } from 'zod';
import { createTRPCRouter } from '@/lib/trpc/init';
import { organizationMemberProcedure, organizationOwnerProcedure } from './utils';
import { createAuditLog } from '@/lib/organizations/organization-audit-logs';
import * as slackService from '@/lib/integrations/slack-service';
import { TRPCError } from '@trpc/server';

export const organizationSlackRouter = createTRPCRouter({
  /**
   * Gets the Slack installation status for an organization
   */
  getInstallation: organizationMemberProcedure.query(async ({ input }) => {
    const integration = await slackService.getInstallation({
      type: 'org',
      id: input.organizationId,
    });

    if (!integration) {
      return {
        installed: false,
        installation: null,
      };
    }

    // Only return installed: true if the integration status is 'active'
    const isInstalled = integration.integration_status === 'active';

    // Extract model from metadata
    const metadata = integration.metadata as { model_slug?: string } | null;

    return {
      installed: isInstalled,
      installation: {
        teamId: integration.platform_account_id,
        teamName: integration.platform_account_login,
        scopes: integration.scopes,
        installedAt: integration.installed_at,
        modelSlug: metadata?.model_slug || null,
      },
    };
  }),

  /**
   * Get OAuth URL for initiating Slack OAuth flow
   */
  getOAuthUrl: organizationMemberProcedure.query(({ input }) => {
    const state = `org_${input.organizationId}`;
    return {
      url: slackService.getSlackOAuthUrl(state),
    };
  }),

  /**
   * Uninstalls the Slack integration for an organization
   */
  uninstallApp: organizationOwnerProcedure.mutation(async ({ input, ctx }) => {
    const result = await slackService.uninstallApp({
      type: 'org',
      id: input.organizationId,
    });

    // Audit log
    await createAuditLog({
      organization_id: input.organizationId,
      action: 'organization.settings.change',
      actor_id: ctx.user.id,
      actor_email: ctx.user.google_user_email,
      actor_name: ctx.user.google_user_name,
      message: 'Disconnected Slack integration',
    });

    return result;
  }),

  /**
   * Test Slack connection
   */
  testConnection: organizationMemberProcedure.mutation(async ({ input }) => {
    return slackService.testConnection({ type: 'org', id: input.organizationId });
  }),

  /**
   * Send a test message to Slack
   */
  sendTestMessage: organizationMemberProcedure.mutation(async ({ input }) => {
    return slackService.sendTestMessage({ type: 'org', id: input.organizationId });
  }),

  /**
   * Update the model for Slack integration
   */
  updateModel: organizationOwnerProcedure
    .input(z.object({ organizationId: z.string(), modelSlug: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await slackService.updateModel(
        { type: 'org', id: input.organizationId },
        input.modelSlug
      );

      // Audit log
      await createAuditLog({
        organization_id: input.organizationId,
        action: 'organization.settings.change',
        actor_id: ctx.user.id,
        actor_email: ctx.user.google_user_email,
        actor_name: ctx.user.google_user_name,
        message: `Updated Slack integration model to ${input.modelSlug}`,
      });

      return result;
    }),

  /**
   * Dev-only: Remove only the database row without revoking the Slack token
   */
  devRemoveDbRowOnly: organizationOwnerProcedure.mutation(async ({ input }) => {
    if (process.env.NODE_ENV !== 'development') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This endpoint is only available in development mode',
      });
    }
    return slackService.removeDbRowOnly({ type: 'org', id: input.organizationId });
  }),
});
