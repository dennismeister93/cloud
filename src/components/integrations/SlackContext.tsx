'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

// Use the same error type pattern as GitHub integration
type SlackError = TRPCClientErrorLike<AnyRouter>;

type SlackInstallation = {
  teamId: string | null;
  teamName: string | null;
  scopes: string[] | null;
  installedAt: string;
  modelSlug: string | null;
};

type SlackInstallationResult = {
  installed: boolean;
  installation: SlackInstallation | null;
};

type SlackOAuthUrlResult = {
  url: string;
};

type SlackTestConnectionResult = {
  success: boolean;
  error?: string;
};

type SlackSendTestMessageResult = {
  success: boolean;
  error?: string;
  channel?: string;
};

type SlackUpdateModelResult = {
  success: boolean;
  error?: string;
};

export type SlackQueries = {
  getInstallation: () => UseQueryResult<SlackInstallationResult, SlackError>;
  getOAuthUrl: () => UseQueryResult<SlackOAuthUrlResult, SlackError>;
};

export type SlackMutations = {
  uninstallApp: UseMutationResult<{ success: boolean }, SlackError, void>;
  testConnection: UseMutationResult<SlackTestConnectionResult, SlackError, void>;
  sendTestMessage: UseMutationResult<SlackSendTestMessageResult, SlackError, void>;
  updateModel: UseMutationResult<SlackUpdateModelResult, SlackError, { modelSlug: string }>;
  devRemoveDbRowOnly: UseMutationResult<{ success: boolean }, SlackError, void>;
};

type SlackContextValue = {
  queries: SlackQueries;
  mutations: SlackMutations;
};

const SlackContext = createContext<SlackContextValue | null>(null);

/**
 * Hook to access Slack queries and mutations from context
 * Must be used within a SlackProvider
 */
export function useSlackQueries() {
  const context = useContext(SlackContext);
  if (!context) {
    throw new Error('useSlackQueries must be used within a SlackProvider');
  }
  return context;
}

/**
 * Base provider component that accepts queries and mutations
 */
export function SlackProvider({
  queries,
  mutations,
  children,
}: {
  queries: SlackQueries;
  mutations: SlackMutations;
  children: ReactNode;
}) {
  return <SlackContext.Provider value={{ queries, mutations }}>{children}</SlackContext.Provider>;
}
