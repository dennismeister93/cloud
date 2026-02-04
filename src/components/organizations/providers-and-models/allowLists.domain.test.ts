import { describe, expect, test } from '@jest/globals';
import {
  buildModelProvidersIndex,
  canonicalizeModelAllowList,
  computeAllowedModelIds,
  computeEnabledProviderSlugs,
  toggleAllowFutureModelsForProvider,
  toggleModelAllowed,
  toggleProviderEnabled,
} from '@/components/organizations/providers-and-models/allowLists.domain';

describe('allowLists.domain', () => {
  test('`[]` provider_allow_list means all providers enabled', () => {
    const enabled = computeEnabledProviderSlugs([], ['a', 'b']);
    expect([...enabled].sort()).toEqual(['a', 'b']);
  });

  test('`[]` model_allow_list means all models allowed (normalized)', () => {
    const openRouterModels = [{ slug: 'openai/gpt-4.1:free' }, { slug: 'openai/gpt-4.1' }];
    const openRouterProviders = [
      {
        slug: 'openai',
        models: [{ slug: 'openai/gpt-4.1', endpoint: {} }],
      },
    ];

    const allowed = computeAllowedModelIds([], openRouterModels, openRouterProviders);
    expect([...allowed].sort()).toEqual(['openai/gpt-4.1']);
  });

  test('canonicalizeModelAllowList normalizes :free and dedupes', () => {
    expect(canonicalizeModelAllowList(['openai/gpt-4.1:free', 'openai/gpt-4.1'])).toEqual([
      'openai/gpt-4.1',
    ]);
  });

  test('toggleProviderEnabled(disable) removes provider wildcard from model allow list', () => {
    const { nextModelAllowList, nextProviderAllowList } = toggleProviderEnabled({
      providerSlug: 'cerebras',
      nextEnabled: false,
      draftProviderAllowList: [],
      draftModelAllowList: ['cerebras/*', 'openai/gpt-4.1'],
      allProviderSlugsWithEndpoints: ['cerebras', 'openai'],
      hadAllProvidersInitially: true,
    });

    expect(nextModelAllowList).toEqual(['openai/gpt-4.1']);
    expect(nextProviderAllowList.sort()).toEqual(['openai']);
  });

  test('toggleAllowFutureModelsForProvider enables provider and adds provider wildcard', () => {
    const { nextModelAllowList, nextProviderAllowList } = toggleAllowFutureModelsForProvider({
      providerSlug: 'cerebras',
      nextAllowed: true,
      draftModelAllowList: ['openai/gpt-4.1'],
      draftProviderAllowList: ['openai'],
      allProviderSlugsWithEndpoints: ['cerebras', 'openai'],
      hadAllProvidersInitially: false,
    });

    expect(nextModelAllowList.sort()).toEqual(['cerebras/*', 'openai/gpt-4.1']);
    expect(nextProviderAllowList.sort()).toEqual(['cerebras', 'openai']);
  });

  test('toggleModelAllowed(disable) removes provider wildcards for providers offering the model', () => {
    const providerIndex = buildModelProvidersIndex([
      {
        slug: 'cerebras',
        models: [{ slug: 'z-ai/glm4.6', endpoint: {} }],
      },
    ]);

    const next = toggleModelAllowed({
      modelId: 'z-ai/glm4.6',
      nextAllowed: false,
      draftModelAllowList: ['cerebras/*', 'z-ai/glm4.6'],
      allModelIds: ['z-ai/glm4.6'],
      providerSlugsForModelId: [...(providerIndex.get('z-ai/glm4.6') ?? [])],
      hadAllModelsInitially: false,
    });

    expect(next).toEqual([]);
  });
});
