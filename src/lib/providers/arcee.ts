import { type KiloFreeModel } from '@/lib/providers/kilo-free-model';

export const arcee_trinity_large_preview_free_model = {
  public_id: 'arcee-ai/trinity-large-preview:free',
  display_name: 'Arcee AI: Trinity Large Preview (free)',
  description:
    'Trinity Large Preview is a state-of-the-art large language model from Arcee AI, optimized for coding and general-purpose assistance.',
  context_length: 128000,
  max_completion_tokens: 16384,
  is_enabled: true,
  flags: [],
  gateway: 'openrouter',
  internal_id: 'arcee-ai/trinity-large-preview:free',
  inference_providers: ['arcee-ai'],
} as KiloFreeModel;
