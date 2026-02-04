import type { OpenRouterChatCompletionRequest } from '@/lib/providers/openrouter/types';
import { normalizeToolCallIds } from '@/lib/tool-calling';
import type OpenAI from 'openai';

const ENABLE_ANTHROPIC_STRICT_TOOL_USE = false;

export function isAnthropicModel(requestedModel: string) {
  return requestedModel.startsWith('anthropic/');
}

type ReadFileParametersSchema = {
  properties?: {
    files?: {
      items?: {
        properties?: { line_ranges?: { items?: { minItems?: number; maxItems?: number } } };
      };
    };
  };
};

function patchReadFileTool(func: OpenAI.FunctionDefinition) {
  try {
    const lineRangesItems = (func.parameters as ReadFileParametersSchema | undefined)?.properties
      ?.files?.items?.properties?.line_ranges?.items;
    if (lineRangesItems) {
      delete lineRangesItems.minItems;
      delete lineRangesItems.maxItems;
    }
    func.strict = true;
    return true;
  } catch (e) {
    console.error('[patchReadFileTool]', e);
    return false;
  }
}

function applyAnthropicStrictToolUse(
  requestToMutate: OpenRouterChatCompletionRequest,
  extraHeaders: Record<string, string>
) {
  let supportedToolFound = false;
  for (const tool of requestToMutate.tools ?? []) {
    if (tool.type === 'function') {
      if (tool.function.name === 'read_file' && patchReadFileTool(tool.function)) {
        supportedToolFound = true;
      } else {
        delete tool.function.strict;
      }
    }
  }
  if (supportedToolFound) {
    console.debug('[applyAnthropicStrictToolUse] setting structured-outputs beta header');
    extraHeaders['x-anthropic-beta'] = [
      extraHeaders['x-anthropic-beta'],
      'structured-outputs-2025-11-13',
    ]
      .filter(Boolean)
      .join(',');
  }
}

export function applyAnthropicModelSettings(
  requestToMutate: OpenRouterChatCompletionRequest,
  extraHeaders: Record<string, string>
) {
  if (ENABLE_ANTHROPIC_STRICT_TOOL_USE) {
    applyAnthropicStrictToolUse(requestToMutate, extraHeaders);
  }

  // anthropic doesn't allow '.' in tool call ids
  normalizeToolCallIds(requestToMutate, undefined);
}
