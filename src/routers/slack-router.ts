import 'server-only';
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '@/lib/trpc/init';
import * as slackService from '@/lib/integrations/slack-service';
import { TRPCError } from '@trpc/server';

export const slackRouter = createTRPCRouter({
  // Get Slack installation status for the current user
  getInstallation: baseProcedure.query(async ({ ctx }) => {
    const integration = await slackService.getInstallation({
      type: 'user',
      id: ctx.user.id,
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

  // Get OAuth URL for initiating Slack OAuth flow
  getOAuthUrl: baseProcedure.query(({ ctx }) => {
    const state = `user_${ctx.user.id}`;
    return {
      url: slackService.getSlackOAuthUrl(state),
    };
  }),

  // Uninstall Slack integration for the current user
  uninstallApp: baseProcedure.mutation(async ({ ctx }) => {
    return slackService.uninstallApp({ type: 'user', id: ctx.user.id });
  }),

  // Test Slack connection
  testConnection: baseProcedure.mutation(async ({ ctx }) => {
    return slackService.testConnection({ type: 'user', id: ctx.user.id });
  }),

  // Send a test message to Slack
  sendTestMessage: baseProcedure.mutation(async ({ ctx }) => {
    return slackService.sendTestMessage({ type: 'user', id: ctx.user.id });
  }),

  // Update the model for Slack integration
  updateModel: baseProcedure
    .input(z.object({ modelSlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return slackService.updateModel({ type: 'user', id: ctx.user.id }, input.modelSlug);
    }),

  // Dev-only: Remove only the database row without revoking the Slack token
  devRemoveDbRowOnly: baseProcedure.mutation(async ({ ctx }) => {
    if (process.env.NODE_ENV !== 'development') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This endpoint is only available in development mode',
      });
    }
    return slackService.removeDbRowOnly({ type: 'user', id: ctx.user.id });
  }),
});
