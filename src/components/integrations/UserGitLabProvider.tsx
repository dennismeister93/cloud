'use client';

import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';
import { GitLabProvider, type GitLabQueries } from './GitLabContext';

export function UserGitLabProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const queries: GitLabQueries = {
    getInstallation: () => {
      const query = useQuery(trpc.gitlab.getInstallation.queryOptions());
      return {
        data: query.data,
        status: query.status,
        isPending: query.isPending,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
      };
    },
  };

  const mutations = {
    disconnect: useMutation(
      trpc.gitlab.disconnect.mutationOptions({
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.gitlab.getInstallation.queryKey(),
          });
        },
      })
    ),

    refreshRepositories: useMutation(
      trpc.gitlab.refreshRepositories.mutationOptions({
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.gitlab.getInstallation.queryKey(),
          });
        },
      })
    ),
  };

  return (
    <GitLabProvider queries={queries} mutations={mutations}>
      {children}
    </GitLabProvider>
  );
}
