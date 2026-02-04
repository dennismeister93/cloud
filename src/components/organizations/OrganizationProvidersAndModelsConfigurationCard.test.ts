import { describe, test, expect } from '@jest/globals';
import { computeProviderSelectionsForSummaryCard } from './OrganizationProvidersAndModelsConfigurationCard';

describe('computeProviderSelectionsForSummaryCard', () => {
  test('expands provider wildcard entries (e.g., anthropic/*) when provider is allowed', () => {
    const openRouterProviders = [
      {
        slug: 'anthropic',
        models: [
          { slug: 'anthropic/claude-3-opus', endpoint: 'chat' },
          { slug: 'anthropic/claude-3-sonnet', endpoint: 'chat' },
          { slug: 'anthropic/disabled-model' },
        ],
      },
    ];

    const selections = computeProviderSelectionsForSummaryCard({
      openRouterProviders,
      providerAllowList: ['anthropic'],
      modelAllowList: ['anthropic/*'],
    });

    expect(selections).toEqual([
      {
        slug: 'anthropic',
        models: ['anthropic/claude-3-opus', 'anthropic/claude-3-sonnet'],
      },
    ]);
  });

  test('keeps existing exact-match behavior for model allow list entries', () => {
    const openRouterProviders = [
      {
        slug: 'anthropic',
        models: [
          { slug: 'anthropic/claude-3-opus', endpoint: 'chat' },
          { slug: 'anthropic/claude-3-sonnet', endpoint: 'chat' },
        ],
      },
    ];

    const selections = computeProviderSelectionsForSummaryCard({
      openRouterProviders,
      providerAllowList: ['anthropic'],
      modelAllowList: ['anthropic/claude-3-opus'],
    });

    expect(selections).toEqual([
      {
        slug: 'anthropic',
        models: ['anthropic/claude-3-opus'],
      },
    ]);
  });

  test('supports wildcard-only model allow lists even when provider allow list is empty', () => {
    const openRouterProviders = [
      {
        slug: 'openai',
        models: [{ slug: 'openai/gpt-4.1', endpoint: 'chat' }],
      },
      {
        slug: 'anthropic',
        models: [
          { slug: 'anthropic/claude-3-opus', endpoint: 'chat' },
          { slug: 'anthropic/claude-3-sonnet', endpoint: 'chat' },
        ],
      },
    ];

    const selections = computeProviderSelectionsForSummaryCard({
      openRouterProviders,
      providerAllowList: [],
      modelAllowList: ['anthropic/*'],
    });

    expect(selections).toEqual([
      {
        slug: 'anthropic',
        models: ['anthropic/claude-3-opus', 'anthropic/claude-3-sonnet'],
      },
    ]);
  });

  test('supports provider-membership wildcard when model namespace differs (e.g. cerebras/* allows z-ai/glm4.6)', () => {
    const openRouterProviders = [
      {
        slug: 'cerebras',
        models: [{ slug: 'z-ai/glm4.6', endpoint: 'chat' }],
      },
    ];

    const selections = computeProviderSelectionsForSummaryCard({
      openRouterProviders,
      providerAllowList: ['cerebras'],
      modelAllowList: ['cerebras/*'],
    });

    expect(selections).toEqual([
      {
        slug: 'cerebras',
        models: ['z-ai/glm4.6'],
      },
    ]);
  });
});
