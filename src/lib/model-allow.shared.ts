/**
 * Shared allow-list logic that can be used on both client and server.
 *
 * IMPORTANT: Keep this file free of server-only dependencies.
 */

export type PreparedModelAllowList = {
  allowListSet: ReadonlySet<string>;
  /**
   * For each `provider/*` entry, contains the `provider` part.
   *
   * Note: A namespace wildcard like `openai/*` is also a provider wildcard in practice.
   */
  wildcardProviderSlugs: ReadonlySet<string>;
};

export function prepareModelAllowList(allowList: string[]): PreparedModelAllowList {
  const allowListSet = new Set(allowList);
  const wildcardProviderSlugs = new Set(
    allowList.filter(entry => entry.endsWith('/*')).map(entry => entry.slice(0, -2))
  );

  return {
    allowListSet,
    wildcardProviderSlugs,
  };
}

export function isAllowedByExactOrNamespaceWildcard(
  normalizedModelId: string,
  allowListSet: ReadonlySet<string>
): boolean {
  // 1) Exact match
  if (allowListSet.has(normalizedModelId)) {
    return true;
  }

  // 2) Namespace wildcard match (backwards compatible)
  const namespace = normalizedModelId.split('/')[0];
  const namespaceWildcardEntry = `${namespace}/*`;
  return allowListSet.has(namespaceWildcardEntry);
}

export function isAllowedByProviderMembershipWildcard(
  providersForModel: ReadonlySet<string>,
  wildcardProviderSlugs: ReadonlySet<string>
): boolean {
  for (const providerSlug of wildcardProviderSlugs) {
    if (providersForModel.has(providerSlug)) {
      return true;
    }
  }

  return false;
}
