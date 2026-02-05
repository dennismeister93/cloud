import { after } from 'next/server';
import { O11Y_SERVICE_URL } from '@/lib/config.server';
import type OpenAI from 'openai';

export type ApiMetricsParams = {
  clientSecret: string;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  toolsAvailable: string[];
};

export function getToolsAvailable(
  tools: Array<OpenAI.Chat.Completions.ChatCompletionTool> | undefined
): string[] {
  if (!tools) return [];

  return tools.map((tool): string => {
    if (tool.type === 'function') {
      const toolName = tool.function.name.trim();
      return toolName ? `function:${toolName}` : 'function:unknown';
    }

    if (tool.type === 'custom') {
      const toolName = tool.custom.name.trim();
      return toolName ? `custom:${toolName}` : 'custom:unknown';
    }

    return 'unknown:unknown';
  });
}

const apiMetricsUrl = (() => {
  if (!O11Y_SERVICE_URL) return null;
  try {
    return new URL('/ingest/api-metrics', O11Y_SERVICE_URL);
  } catch {
    return null;
  }
})();

export function emitApiMetrics(params: ApiMetricsParams) {
  if (!apiMetricsUrl) return;

  after(async () => {
    await fetch(apiMetricsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(params),
    }).catch(() => {
      // Best-effort only; never fail the caller request.
    });
  });
}
