import { describe, expect, test } from '@jest/globals';
import { isModelAllowedProviderAwareClient } from '@/lib/model-allow.client';

describe('isModelAllowedProviderAwareClient', () => {
  test('provider-membership wildcard allows model even when model namespace differs', () => {
    const openRouterProviders = [
      {
        slug: 'cerebras',
        models: [{ slug: 'z-ai/glm4.6', endpoint: {} }],
      },
    ];

    expect(
      isModelAllowedProviderAwareClient('z-ai/glm4.6', ['cerebras/*'], openRouterProviders)
    ).toBe(true);
    expect(
      isModelAllowedProviderAwareClient('openai/gpt-5.2', ['cerebras/*'], openRouterProviders)
    ).toBe(false);
  });

  test('keeps exact + namespace wildcard behavior (including :free normalization)', () => {
    const openRouterProviders = [
      {
        slug: 'openai',
        models: [{ slug: 'openai/gpt-4.1', endpoint: {} }],
      },
    ];

    expect(
      isModelAllowedProviderAwareClient('openai/gpt-4.1:free', ['openai/*'], openRouterProviders)
    ).toBe(true);
    expect(
      isModelAllowedProviderAwareClient(
        'openai/gpt-4.1:free',
        ['openai/gpt-4.1'],
        openRouterProviders
      )
    ).toBe(true);
  });
});
