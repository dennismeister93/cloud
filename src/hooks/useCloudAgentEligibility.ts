import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';

type EligibilityData = {
  isEligible: boolean;
  balance: number;
  reason?: string;
};

type EligibilityResult = {
  isLoading: boolean;
  isError: boolean;
  hasInsufficientBalance: boolean;
  eligibilityData: EligibilityData | undefined;
  refetch: () => void;
};

/**
 * Hook for checking Cloud Agent eligibility across personal and organization contexts.
 * Automatically handles the conditional query based on whether an organizationId is provided.
 */
export function useCloudAgentEligibility(organizationId?: string): EligibilityResult {
  const trpc = useTRPC();

  const personalQuery = useQuery({
    ...trpc.cloudAgent.checkEligibility.queryOptions(),
    enabled: !organizationId,
  });

  const orgQuery = useQuery({
    ...trpc.organizations.cloudAgent.checkEligibility.queryOptions({
      organizationId: organizationId || '',
    }),
    enabled: !!organizationId,
  });

  const query = organizationId ? orgQuery : personalQuery;

  return {
    isLoading: query.isPending,
    isError: query.isError,
    hasInsufficientBalance: !query.isPending && query.data !== undefined && !query.data.isEligible,
    eligibilityData: query.data,
    refetch: query.refetch,
  };
}
