import { type KiloFreeModel } from '@/lib/providers/kilo-free-model';

export const kat_coder_pro_free_model = {
  public_id: 'kwaipilot/kat-coder-pro:free',
  display_name: 'Kwaipilot: KAT-Coder-Pro V1 (free)',
  description: `KAT-Coder-Pro V1 is KwaiKAT's most advanced agentic coding model in the KwaiKAT series. It excels in real-world software engineering scenarios and has been rigorously tested by thousands of engineers. It achieves a 73.4% solve rate on the SWE-Bench Verified benchmark, hits 64 on the Artificial Analysis Intelligence Index, and ranks 10th globally among all models, as well as 1st among non-reasoning models!
The model has been optimized for tool-use capability, multi-turn interaction, instruction following, generalization and comprehensive capabilities through a multi-stage training process, including mid-training, supervised fine-tuning, reinforcement fine-tuning, and scalable agentic RL.`,
  context_length: 256000,
  max_completion_tokens: 32768,
  is_enabled: false,
  flags: ['reasoning', 'prompt_cache'],
  gateway: 'streamlake',
  internal_id: 'ep-4makks-1765348062249697557',
  inference_providers: ['streamlake'],
} as KiloFreeModel;
