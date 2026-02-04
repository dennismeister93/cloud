'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { PlatformRepository } from '@/lib/integrations/core/types';

type GitLabError = TRPCClientErrorLike<AnyRouter>;

type GitLabInstallation = {
  id: string;
  accountId: string | null;
  accountLogin: string | null;
  instanceUrl: string;
  repositories: PlatformRepository[] | null;
  repositoriesSyncedAt: string | null;
  installedAt: string;
  tokenExpiresAt: string | null;
};

type GitLabInstallationResult = {
  installed: boolean;
  installation: GitLabInstallation | null;
};

type GitLabInstallationQueryResult_Full = UseQueryResult<GitLabInstallationResult, GitLabError>;
// Pick only the properties we actually use to avoid excessive re-renders from observing all query changes
type GitLabInstallationQueryResult = Pick<
  GitLabInstallationQueryResult_Full,
  'data' | 'status' | 'isPending' | 'isLoading' | 'isError' | 'error'
>;

export type GitLabQueries = {
  getInstallation: () => GitLabInstallationQueryResult;
};

export type GitLabMutations = {
  disconnect: UseMutationResult<{ success: boolean }, GitLabError, void>;
  refreshRepositories: UseMutationResult<
    { success: boolean; repositoryCount: number; syncedAt: string },
    GitLabError,
    { integrationId: string }
  >;
};

type GitLabContextValue = {
  queries: GitLabQueries;
  mutations: GitLabMutations;
};

const GitLabContext = createContext<GitLabContextValue | null>(null);

/**
 * Hook to access GitLab queries and mutations from context
 * Must be used within a GitLabProvider
 */
export function useGitLabQueries() {
  const context = useContext(GitLabContext);
  if (!context) {
    throw new Error('useGitLabQueries must be used within a GitLabProvider');
  }
  return context;
}

/**
 * Base provider component that accepts queries and mutations
 */
export function GitLabProvider({
  queries,
  mutations,
  children,
}: {
  queries: GitLabQueries;
  mutations: GitLabMutations;
  children: ReactNode;
}) {
  return <GitLabContext.Provider value={{ queries, mutations }}>{children}</GitLabContext.Provider>;
}
