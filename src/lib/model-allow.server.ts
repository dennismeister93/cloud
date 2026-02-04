import 'server-only';

import { normalizeModelId } from '@/lib/model-utils';
import { getProviderSlugsForModel } from '@/lib/providers/openrouter/models-by-provider-index.server';
import {
  isAllowedByExactOrNamespaceWildcard,
  isAllowedByProviderMembershipWildcard,
  prepareModelAllowList,
} from '@/lib/model-allow.shared';

export type GetProviderSlugsForModel = (modelId: string) => Promise<ReadonlySet<string>>;

type ProviderAwareAllowPredicateOptions = {
  getProviderSlugsForModel?: GetProviderSlugsForModel;
};

export type ProviderAwareAllowPredicate = (modelId: string) => Promise<boolean>;

export function createProviderAwareModelAllowPredicate(
  allowList: string[],
  options?: ProviderAwareAllowPredicateOptions
): ProviderAwareAllowPredicate {
  if (allowList.length === 0) {
    return async () => true;
  }

  const { allowListSet, wildcardProviderSlugs } = prepareModelAllowList(allowList);

  const getProvidersForModel = options?.getProviderSlugsForModel ?? getProviderSlugsForModel;

  return async (modelId: string): Promise<boolean> => {
    const normalizedModelId = normalizeModelId(modelId);

    if (isAllowedByExactOrNamespaceWildcard(normalizedModelId, allowListSet)) {
      return true;
    }

    // 3) Provider-membership wildcard match
    if (wildcardProviderSlugs.size === 0) {
      return false;
    }

    const providersForModel = await getProvidersForModel(normalizedModelId);
    return isAllowedByProviderMembershipWildcard(providersForModel, wildcardProviderSlugs);
  };
}
