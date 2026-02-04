import type { OpenRouterChatCompletionRequest } from '@/lib/providers/openrouter/types';
import type { ProviderId } from '@/lib/providers/provider-id';
import { hasAttemptCompletionTool } from '@/lib/tool-calling';

export function isMoonshotModel(model: string) {
  return model.startsWith('moonshotai/');
}

export function applyMoonshotProviderSettings(
  provider: ProviderId,
  requestToMutate: OpenRouterChatCompletionRequest
) {
  // Moonshot models don't support the temperature parameter
  delete requestToMutate.temperature;

  // normalize reasoning setting; extension only allows setting reasoning effort
  const isReasoningEnabled =
    provider === 'vercel' || // seems vercel doesn't support disabling reasoning
    requestToMutate.reasoning?.enabled === true ||
    (requestToMutate.reasoning?.effort ?? 'none') !== 'none';

  requestToMutate.reasoning = { enabled: isReasoningEnabled };
  if (!isReasoningEnabled && hasAttemptCompletionTool(requestToMutate)) {
    requestToMutate.tool_choice = 'required';
  }
}
