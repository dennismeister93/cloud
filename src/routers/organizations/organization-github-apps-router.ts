import { createTRPCRouter } from '@/lib/trpc/init';
import { organizationMemberProcedure, organizationOwnerProcedure } from './utils';
import { createAuditLog } from '@/lib/organizations/organization-audit-logs';
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
import * as z from 'zod';

export const organizationGitHubAppsRouter = createTRPCRouter({
  listIntegrations: organizationMemberProcedure.query(async ({ input }) => {
    return githubAppsService.listIntegrations({ type: 'org', id: input.organizationId });
  }),

  /**
   * Gets the GitHub App installation status for an organization
   */
  getInstallation: organizationMemberProcedure.query(async ({ input }) => {
    const integration = await githubAppsService.getInstallation({
      type: 'org',
      id: input.organizationId,
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
    // Pending integrations (awaiting admin approval) should show as not installed
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

  /**
   * Checks if the current user has a pending GitHub installation in any organization
   */
  checkUserPendingInstallation: organizationMemberProcedure.query(async ({ ctx }) => {
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

  /**
   * Uninstalls the GitHub App
   */
  uninstallApp: organizationOwnerProcedure.mutation(async ({ input, ctx }) => {
    const result = await githubAppsService.uninstallApp(
      { type: 'org', id: input.organizationId },
      ctx.user.id,
      ctx.user.google_user_email,
      ctx.user.google_user_name
    );

    // Audit log
    await createAuditLog({
      organization_id: input.organizationId,
      action: 'organization.settings.change',
      actor_id: ctx.user.id,
      actor_email: ctx.user.google_user_email,
      actor_name: ctx.user.google_user_name,
      message: 'Uninstalled Kilo GitHub App',
    });

    return result;
  }),

  /**
   * Lists repositories accessible by the GitHub App installation
   */
  listRepositories: organizationMemberProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        integrationId: z.string().uuid(),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      return githubAppsService.listRepositories(
        { type: 'org', id: input.organizationId },
        input.integrationId,
        input.forceRefresh
      );
    }),

  /**
   * Lists branches for a repository accessible by the GitHub App installation
   */
  listBranches: organizationMemberProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        integrationId: z.string().uuid(),
        repositoryFullName: z.string(),
      })
    )
    .query(async ({ input }) => {
      return githubAppsService.listBranches(
        { type: 'org', id: input.organizationId },
        input.integrationId,
        input.repositoryFullName
      );
    }),

  /*
   * Cancels a pending installation request
   * Allows users to retry if admin rejects or request times out
   */
  cancelPendingInstallation: organizationMemberProcedure.mutation(async ({ input, ctx }) => {
    const result = await githubAppsService.cancelPendingInstallation({
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
      message: 'Cancelled pending GitHub App installation request',
    });

    return result;
  }),

  /**
   * Refreshes installation details from GitHub (permissions, events, repositories)
   * Use this after re-authorizing the GitHub App to update stored permissions
   */
  refreshInstallation: organizationMemberProcedure.mutation(async ({ input, ctx }) => {
    const owner = { type: 'org' as const, id: input.organizationId };

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

    // Audit log
    await createAuditLog({
      organization_id: input.organizationId,
      action: 'organization.settings.change',
      actor_id: ctx.user.id,
      actor_email: ctx.user.google_user_email,
      actor_name: ctx.user.google_user_name,
      message: 'Refreshed GitHub App installation details',
    });

    return { success: true };
  }),
});
