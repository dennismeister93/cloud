import { describe, expect, test } from '@jest/globals';
import { createProviderAwareModelAllowPredicate } from '@/lib/model-allow.server';
import { createModelsByProviderIndexLoader } from '@/lib/providers/openrouter/models-by-provider-index.server';
import type {
  NormalizedOpenRouterResponse,
  OpenRouterModel,
} from '@/lib/providers/openrouter/openrouter-types';

function makeOpenRouterModel(slug: string): OpenRouterModel {
  return {
    slug,
    hf_slug: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    hf_updated_at: null,
    name: slug,
    short_name: slug,
    author: 'test',
    description: '',
    model_version_group_id: null,
    context_length: 1,
    input_modalities: [],
    output_modalities: [],
    has_text_output: true,
    group: 'test',
    instruct_type: null,
    default_system: null,
    default_stops: [],
    hidden: false,
    router: null,
    warning_message: null,
    permaslug: slug,
    reasoning_config: null,
    features: null,
    default_parameters: null,
    endpoint: null,
  };
}

describe('createProviderAwareModelAllowPredicate', () => {
  test('provider-membership wildcard allows model even when model namespace differs', async () => {
    const snapshot = {
      providers: [
        {
          name: 'Cerebras',
          displayName: 'Cerebras',
          slug: 'cerebras',
          dataPolicy: {
            training: true,
            retainsPrompts: true,
            canPublish: false,
          },
          models: [makeOpenRouterModel('z-ai/glm4.6')],
        },
      ],
      total_providers: 1,
      total_models: 1,
      generated_at: '2026-01-01T00:00:00.000Z',
    } satisfies NormalizedOpenRouterResponse;

    const loader = createModelsByProviderIndexLoader({
      fetchSnapshot: async () => snapshot,
      ttlMs: 60_000,
      nowMs: () => 0,
    });

    const isAllowed = createProviderAwareModelAllowPredicate(['cerebras/*'], {
      getProviderSlugsForModel: loader.getProviderSlugsForModel,
    });

    await expect(isAllowed('z-ai/glm4.6')).resolves.toBe(true);
    await expect(isAllowed('openai/gpt-5.2')).resolves.toBe(false);
  });
});
