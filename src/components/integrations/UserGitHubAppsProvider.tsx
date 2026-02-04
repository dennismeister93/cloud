'use client';

import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';
import { GitHubAppsProvider } from './GitHubAppsContext';
import type { IntegrationQueries, IntegrationMutations } from '@/lib/integrations/router-types';

export function UserGitHubAppsProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const queries: IntegrationQueries = {
    listIntegrations: () =>
      useQuery(
        trpc.githubApps.listIntegrations.queryOptions()
      ) as IntegrationQueries['listIntegrations'] extends () => infer R ? R : never,

    getInstallation: () => useQuery(trpc.githubApps.getInstallation.queryOptions()),

    checkUserPendingInstallation: () =>
      useQuery(trpc.githubApps.checkUserPendingInstallation.queryOptions()),

    listRepositories: (integrationId: string, forceRefresh?: boolean) =>
      useQuery({
        ...trpc.githubApps.listRepositories.queryOptions({
          integrationId,
          forceRefresh: forceRefresh ?? false,
        }),
        enabled: !!integrationId,
      }),

    listBranches: (integrationId: string, repositoryFullName: string) =>
      useQuery({
        ...trpc.githubApps.listBranches.queryOptions({
          integrationId,
          repositoryFullName,
        }),
        enabled: !!integrationId && !!repositoryFullName,
      }),
  };

  const mutations: IntegrationMutations = {
    uninstallApp: useMutation(
      trpc.githubApps.uninstallApp.mutationOptions({
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.getInstallation.queryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.listIntegrations.queryKey(),
          });
        },
      })
    ),

    cancelPendingInstallation: useMutation(
      trpc.githubApps.cancelPendingInstallation.mutationOptions({
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.getInstallation.queryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.checkUserPendingInstallation.queryKey(),
          });
        },
      })
    ),

    refreshInstallation: useMutation(
      trpc.githubApps.refreshInstallation.mutationOptions({
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.getInstallation.queryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: trpc.githubApps.listIntegrations.queryKey(),
          });
        },
      })
    ),
  };

  return (
    <GitHubAppsProvider queries={queries} mutations={mutations}>
      {children}
    </GitHubAppsProvider>
  );
}
