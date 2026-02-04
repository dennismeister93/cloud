'use client';

import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';
import { GitLabProvider, type GitLabMutations } from './GitLabContext';

type OrgGitLabProviderProps = {
  organizationId: string;
  children: ReactNode;
};

export function OrgGitLabProvider({ organizationId, children }: OrgGitLabProviderProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Note: Casting the queries to the expected types since the underlying
  // tRPC types are compatible but TypeScript cannot infer this automatically
  const queries = {
    getInstallation: () => {
      const query = useQuery(trpc.gitlab.getIntegration.queryOptions({ organizationId }));
      // The data transformation happens at runtime, the whole result is casted
      const transformedData = query.data
        ? {
            installed: query.data.connected,
            installation: query.data.integration
              ? {
                  id: query.data.integration.id,
                  accountId: query.data.integration.accountId,
                  accountLogin: query.data.integration.accountLogin,
                  instanceUrl: query.data.integration.instanceUrl,
                  repositories: query.data.integration.repositories,
                  repositoriesSyncedAt: query.data.integration.repositoriesSyncedAt,
                  installedAt: query.data.integration.installedAt,
                  tokenExpiresAt: query.data.integration.tokenExpiresAt ?? null,
                }
              : null,
          }
        : undefined;
      return {
        data: transformedData,
        status: query.status,
        isPending: query.isPending,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
      };
    },
  };

  const disconnectOrgMutation = useMutation(
    trpc.gitlab.disconnectOrg.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.gitlab.getIntegration.queryKey({ organizationId }),
        });
      },
    })
  );

  const refreshRepositoriesMutation = useMutation(
    trpc.gitlab.refreshRepositories.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.gitlab.getIntegration.queryKey({ organizationId }),
        });
      },
    })
  );

  const mutations: GitLabMutations = {
    disconnect: {
      ...disconnectOrgMutation,
      mutate: (_: void, options?: Parameters<typeof disconnectOrgMutation.mutate>[1]) => {
        disconnectOrgMutation.mutate({ organizationId }, options);
      },
      mutateAsync: async (
        _: void,
        options?: Parameters<typeof disconnectOrgMutation.mutateAsync>[1]
      ) => {
        return disconnectOrgMutation.mutateAsync({ organizationId }, options);
      },
    } as GitLabMutations['disconnect'],

    refreshRepositories: {
      ...refreshRepositoriesMutation,
      mutate: (
        input: { integrationId: string },
        options?: Parameters<typeof refreshRepositoriesMutation.mutate>[1]
      ) => {
        refreshRepositoriesMutation.mutate(
          { organizationId, integrationId: input.integrationId },
          options
        );
      },
      mutateAsync: async (
        input: { integrationId: string },
        options?: Parameters<typeof refreshRepositoriesMutation.mutateAsync>[1]
      ) => {
        return refreshRepositoriesMutation.mutateAsync(
          { organizationId, integrationId: input.integrationId },
          options
        );
      },
    } as GitLabMutations['refreshRepositories'],
  };

  return (
    <GitLabProvider queries={queries} mutations={mutations}>
      {children}
    </GitLabProvider>
  );
}
