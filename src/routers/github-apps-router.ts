import 'server-only';
import { baseProcedure, createTRPCRouter } from '@/lib/trpc/init';
import * as z from 'zod';
import * as githubAppsService from '@/lib/integrations/github-apps-service';
import {
  getIntegrationForOwner,
  upsertPlatformIntegrationForOwner,
  updateRepositoriesForIntegration,
} from '@/lib/integrations/db/platform-integrations';
import {
  fetchGitHubInstallationDetails,
  fetchGitHubRepositories,
} from '@/lib/integrations/platforms/github/adapter';
import { TRPCError } from '@trpc/server';

export const githubAppsRouter = createTRPCRouter({
  // List all integrations for the current user
  listIntegrations: baseProcedure.query(async ({ ctx }) => {
    return githubAppsService.listIntegrations({
      type: 'user',
      id: ctx.user.id,
    });
  }),

  // Get GitHub App installation status for the current user
  getInstallation: baseProcedure.query(async ({ ctx }) => {
    const integration = await githubAppsService.getInstallation({
      type: 'user',
      id: ctx.user.id,
    });

    if (!integration) {
      return {
        installed: false,
        installation: null,
      };
    }

    // Extract metadata status
    const metadata = integration.metadata as Record<string, unknown> | null;
    const pendingApproval = metadata?.pending_approval as Record<string, unknown> | undefined;
    const status = (pendingApproval?.status as string) || null;

    // Only return installed: true if the integration status is 'active'
    const isInstalled = integration.integration_status === 'active';

    return {
      installed: isInstalled,
      installation: {
        installationId: integration.platform_installation_id,
        accountId: integration.platform_account_id,
        accountLogin: integration.platform_account_login,
        accountType: (integration.permissions as unknown as Record<string, unknown>)
          ?.account_type as string | undefined,
        targetType: (integration.permissions as unknown as Record<string, unknown>)?.target_type as
          | string
          | undefined,
        permissions: integration.permissions,
        events: integration.scopes,
        repositorySelection: integration.repository_access,
        repositories: integration.repositories,
        suspendedAt: integration.suspended_at,
        suspendedBy: integration.suspended_by,
        installedAt: integration.installed_at,
        status,
      },
    };
  }),

  // Check if current user has a pending installation
  checkUserPendingInstallation: baseProcedure.query(async ({ ctx }) => {
    const pendingInstallation = await githubAppsService.checkUserPendingInstallation(ctx.user.id);

    if (!pendingInstallation) {
      return {
        hasPending: false,
        pendingOrganizationId: null,
      };
    }

    return {
      hasPending: true,
      pendingOrganizationId: pendingInstallation.owned_by_organization_id,
    };
  }),

  // Uninstall GitHub App for the current user
  uninstallApp: baseProcedure.mutation(async ({ ctx }) => {
    return githubAppsService.uninstallApp(
      { type: 'user', id: ctx.user.id },
      ctx.user.id,
      ctx.user.google_user_email,
      ctx.user.google_user_name
    );
  }),

  // List repositories accessible by an integration
  listRepositories: baseProcedure
    .input(
      z.object({
        integrationId: z.string().uuid(),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return githubAppsService.listRepositories(
        { type: 'user', id: ctx.user.id },
        input.integrationId,
        input.forceRefresh
      );
    }),

  // List branches for a repository
  listBranches: baseProcedure
    .input(
      z.object({
        integrationId: z.string().uuid(),
        repositoryFullName: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return githubAppsService.listBranches(
        { type: 'user', id: ctx.user.id },
        input.integrationId,
        input.repositoryFullName
      );
    }),

  // Cancel pending installation
  cancelPendingInstallation: baseProcedure.mutation(async ({ ctx }) => {
    return githubAppsService.cancelPendingInstallation({ type: 'user', id: ctx.user.id });
  }),

  // Refresh installation details from GitHub (permissions, events, repositories)
  refreshInstallation: baseProcedure.mutation(async ({ ctx }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };

    // Get the existing integration
    const integration = await getIntegrationForOwner(owner, 'github');
    if (!integration || !integration.platform_installation_id) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No GitHub integration found',
      });
    }

    const installationId = integration.platform_installation_id;
    const appType = integration.github_app_type || 'standard';

    // Fetch updated installation details from GitHub
    const installationDetails = await fetchGitHubInstallationDetails(installationId, appType);

    // Update the integration with fresh data
    await upsertPlatformIntegrationForOwner(owner, {
      platform: 'github',
      integrationType: 'app',
      platformInstallationId: installationId,
      platformAccountId: installationDetails.account.id.toString(),
      platformAccountLogin: integration.platform_account_login ?? undefined,
      permissions: installationDetails.permissions,
      scopes: installationDetails.events,
      repositoryAccess: installationDetails.repository_selection,
      installedAt: installationDetails.created_at,
    });

    // Refresh repositories
    const repositories = await fetchGitHubRepositories(installationId, appType);
    await updateRepositoriesForIntegration(integration.id, repositories);

    return { success: true };
  }),

  // Dev-only: Add an existing GitHub installation manually
  devAddInstallation: baseProcedure
    .input(
      z.object({
        organizationId: z.string().uuid().optional(),
        installationId: z.string().min(1),
        accountLogin: z.string().min(1),
        appType: z.enum(['standard', 'lite']).optional().default('standard'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only allow in development mode

      if (process.env.NODE_ENV !== 'development') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This endpoint is only available in development mode',
        });
      }

      const appType = input.appType;

      // Fetch installation details from GitHub to get permissions
      const installationDetails = await fetchGitHubInstallationDetails(
        input.installationId,
        appType
      );

      const owner = input.organizationId
        ? { type: 'org' as const, id: input.organizationId }
        : { type: 'user' as const, id: ctx.user.id };

      await upsertPlatformIntegrationForOwner(owner, {
        platform: 'github',
        integrationType: 'app',
        platformInstallationId: input.installationId,
        platformAccountId: installationDetails.account.id.toString(),
        platformAccountLogin: input.accountLogin,
        permissions: installationDetails.permissions,
        scopes: installationDetails.events,
        repositoryAccess: installationDetails.repository_selection,
        installedAt: installationDetails.created_at,
        githubAppType: appType,
      });

      // Fetch and cache repositories immediately so features like Security Reviews work
      const integration = await getIntegrationForOwner(owner, 'github');
      if (integration) {
        const repositories = await fetchGitHubRepositories(input.installationId, appType);
        await updateRepositoriesForIntegration(integration.id, repositories);
      }

      return { success: true };
    }),
});
