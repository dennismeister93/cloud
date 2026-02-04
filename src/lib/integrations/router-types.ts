import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { PlatformIntegration } from '@/db/schema';
import type { PlatformRepository } from '@/lib/integrations/core/types';

/**
 * TRPC error type for integration operations
 * Using AnyRouter to avoid circular dependency with root-router.ts
 */
export type IntegrationError = TRPCClientErrorLike<AnyRouter>;

/**
 * Response type for getInstallation query
 */
export type InstallationResponse = {
  installed: boolean;
  installation: {
    installationId: string | null;
    accountId: string | null;
    accountLogin: string | null;
    accountType?: string;
    targetType?: string;
    permissions: unknown;
    events: string[] | null;
    repositorySelection: string | null;
    repositories: PlatformRepository[] | null;
    suspendedAt: string | null;
    suspendedBy: string | null;
    installedAt: string;
    status: string | null;
  } | null;
};

/**
 * Response type for checkUserPendingInstallation query
 */
export type PendingCheckResponse = {
  hasPending: boolean;
  pendingOrganizationId: string | null;
};

/**
 * Input for listRepositories query
 */
export type ListRepositoriesInput = {
  integrationId: string;
  forceRefresh?: boolean;
};

/**
 * Response type for listRepositories query
 */
export type ListRepositoriesResponse = {
  repositories: PlatformRepository[];
  syncedAt: string | null;
};

/**
 * Response type for listBranches query
 */
export type ListBranchesResponse = {
  branches: Array<{ name: string; isDefault: boolean }>;
};

/**
 * Query interface that both user and org integration providers must implement
 */
export type IntegrationQueries = {
  /**
   * List all integrations
   */
  listIntegrations: () => UseQueryResult<PlatformIntegration[], IntegrationError>;

  /**
   * Get GitHub App installation status
   */
  getInstallation: () => UseQueryResult<InstallationResponse, IntegrationError>;

  /**
   * Check if user has a pending installation
   */
  checkUserPendingInstallation: () => UseQueryResult<PendingCheckResponse, IntegrationError>;

  /**
   * List repositories accessible by an integration
   */
  listRepositories: (
    integrationId: string,
    forceRefresh?: boolean
  ) => UseQueryResult<ListRepositoriesResponse, IntegrationError>;

  /**
   * List branches for a repository
   */
  listBranches: (
    integrationId: string,
    repositoryFullName: string
  ) => UseQueryResult<ListBranchesResponse, IntegrationError>;
};

/**
 * Mutation interface that both user and org integration providers must implement
 */
export type IntegrationMutations = {
  /**
   * Uninstall GitHub App
   */
  uninstallApp: UseMutationResult<{ success: boolean }, IntegrationError, void>;

  /**
   * Cancel pending installation
   */
  cancelPendingInstallation: UseMutationResult<{ success: boolean }, IntegrationError, void>;

  /**
   * Refresh installation details from GitHub (permissions, events, repositories)
   */
  refreshInstallation: UseMutationResult<{ success: boolean }, IntegrationError, void>;
};
