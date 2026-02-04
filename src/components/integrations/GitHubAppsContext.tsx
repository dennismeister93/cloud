'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { IntegrationQueries, IntegrationMutations } from '@/lib/integrations/router-types';

type GitHubAppsContextValue = {
  queries: IntegrationQueries;
  mutations: IntegrationMutations;
};

const GitHubAppsContext = createContext<GitHubAppsContextValue | null>(null);

/**
 * Hook to access GitHub Apps queries and mutations from context
 * Must be used within a GitHubAppsProvider
 */
export function useGitHubAppsQueries() {
  const context = useContext(GitHubAppsContext);
  if (!context) {
    throw new Error('useGitHubAppsQueries must be used within a GitHubAppsProvider');
  }
  return context;
}

/**
 * Base provider component that accepts queries and mutations
 * This is used by specific implementations (UserGitHubAppsProvider, OrgGitHubAppsProvider)
 */
export function GitHubAppsProvider({
  queries,
  mutations,
  children,
}: {
  queries: IntegrationQueries;
  mutations: IntegrationMutations;
  children: ReactNode;
}) {
  return (
    <GitHubAppsContext.Provider value={{ queries, mutations }}>
      {children}
    </GitHubAppsContext.Provider>
  );
}
