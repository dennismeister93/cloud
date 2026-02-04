/**
 * Security Finding Extraction Service (Tier 3)
 *
 * Extracts structured analysis fields from raw markdown output of sandbox analysis.
 * Uses direct LLM call with function calling to parse the unstructured analysis
 * into the SecurityFindingSandboxAnalysis type.
 *
 * Following the same pattern as triage-service.ts for structured output via tools.
 */

import 'server-only';
import type OpenAI from 'openai';
import { sendProxiedChatCompletion } from '@/lib/llm-proxy-helpers';
import type { SecurityFinding } from '@/db/schema';
import type { SecurityFindingSandboxAnalysis, SandboxSuggestedAction } from '../core/types';
import { captureException } from '@sentry/nextjs';

const VALID_SUGGESTED_ACTIONS: SandboxSuggestedAction[] = [
  'dismiss',
  'open_pr',
  'manual_review',
  'monitor',
];

// Version string for API requests - must be >= 4.69.1 to pass LLM proxy version check
const EXTRACTION_SERVICE_VERSION = '5.0.0';
const EXTRACTION_SERVICE_USER_AGENT = `Kilo-Security-Extraction/${EXTRACTION_SERVICE_VERSION}`;

/**
 * System prompt for extraction analysis
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a security analyst extracting structured data from a vulnerability analysis report.

Given the raw analysis markdown and the original vulnerability details, extract the key findings into a structured format.

## Extraction Guidelines

### isExploitable
- Set to \`true\` if the analysis indicates the vulnerability CAN be exploited in this codebase
- Set to \`false\` if the analysis indicates the vulnerability CANNOT be exploited
- Set to \`"unknown"\` if the analysis was inconclusive or couldn't determine exploitability

### exploitabilityReasoning
- Summarize the key reasoning from the analysis about why the vulnerability is/isn't exploitable
- Include specific details about how the package is used
- Mention any mitigating factors or attack vectors

### usageLocations
- Extract all file paths mentioned where the vulnerable package is used
- Include line numbers if mentioned (e.g., "src/utils/helpers.ts:42")
- If no specific locations found, return an empty array

### suggestedFix
- Extract the recommended fix from the analysis
- If a patched version is mentioned, include the upgrade command
- Be specific and actionable

### suggestedAction
Choose the most appropriate next action based on the analysis:
- \`dismiss\`: The vulnerability is NOT exploitable in this codebase. Safe to dismiss.
- \`open_pr\`: The vulnerability IS exploitable AND has a clear fix. Should open a PR to fix it.
- \`manual_review\`: Complex situation - needs human review (unclear exploitability, complex fix, or multiple options).
- \`monitor\`: Exploitable but low risk - keep open but low priority (e.g., dev dependency, limited exposure).

### summary
- Create a brief 1-2 sentence summary suitable for dashboard display
- Focus on the key finding: is it exploitable and what's the recommended action`;

/**
 * Tool definition for submitting extraction results
 */
const SUBMIT_EXTRACTION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_analysis_extraction',
    description: 'Submit the extracted structured analysis from the raw markdown report',
    parameters: {
      type: 'object',
      properties: {
        isExploitable: {
          oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['unknown'] }],
          description:
            'Whether the vulnerability is exploitable in this codebase. Use true if exploitable, false if not, or "unknown" if inconclusive.',
        },
        exploitabilityReasoning: {
          type: 'string',
          description:
            'Detailed reasoning for the exploitability determination, summarized from the analysis.',
        },
        usageLocations: {
          type: 'array',
          items: { type: 'string' },
          description:
            'File paths where the vulnerable package is used. Include line numbers if available (e.g., "src/utils/helpers.ts:42").',
        },
        suggestedFix: {
          type: 'string',
          description: 'Specific fix recommendation extracted from the analysis.',
        },
        suggestedAction: {
          type: 'string',
          enum: ['dismiss', 'open_pr', 'manual_review', 'monitor'],
          description:
            'Recommended next action: dismiss (not exploitable), open_pr (exploitable with clear fix), manual_review (needs human review), monitor (low risk, keep open).',
        },
        summary: {
          type: 'string',
          description: 'Brief 1-2 sentence summary suitable for dashboard display.',
        },
      },
      required: [
        'isExploitable',
        'exploitabilityReasoning',
        'usageLocations',
        'suggestedFix',
        'suggestedAction',
        'summary',
      ],
    },
  },
};

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionResponse = OpenAI.Chat.Completions.ChatCompletion;

/**
 * Build the user prompt with finding details and raw analysis
 */
function buildExtractionPrompt(finding: SecurityFinding, rawMarkdown: string): string {
  return `## Original Vulnerability Details

**Package**: ${finding.package_name} (${finding.package_ecosystem})
**Severity**: ${finding.severity}
**Dependency Scope**: ${finding.dependency_scope || 'unknown'}
**CVE**: ${finding.cve_id || 'N/A'}
**GHSA**: ${finding.ghsa_id || 'N/A'}
**Title**: ${finding.title}
**Vulnerable Versions**: ${finding.vulnerable_version_range || 'Unknown'}
**Patched Version**: ${finding.patched_version || 'No patch available'}

## Raw Analysis Report

${rawMarkdown}

---

Please extract the structured analysis from the report above and call the submit_analysis_extraction tool with your findings.`;
}

/**
 * Parse extraction result from tool call arguments
 */
function parseExtractionResult(
  args: string,
  rawMarkdown: string
): SecurityFindingSandboxAnalysis | null {
  try {
    const parsed = JSON.parse(args);

    // Validate isExploitable
    if (typeof parsed.isExploitable !== 'boolean' && parsed.isExploitable !== 'unknown') {
      console.error('[Extraction] Invalid isExploitable:', parsed.isExploitable);
      return null;
    }

    // Validate exploitabilityReasoning
    if (typeof parsed.exploitabilityReasoning !== 'string') {
      console.error(
        '[Extraction] Invalid exploitabilityReasoning:',
        parsed.exploitabilityReasoning
      );
      return null;
    }

    // Validate usageLocations
    if (!Array.isArray(parsed.usageLocations)) {
      console.error('[Extraction] Invalid usageLocations:', parsed.usageLocations);
      return null;
    }

    // Validate suggestedFix
    if (typeof parsed.suggestedFix !== 'string') {
      console.error('[Extraction] Invalid suggestedFix:', parsed.suggestedFix);
      return null;
    }

    // Validate suggestedAction
    if (!VALID_SUGGESTED_ACTIONS.includes(parsed.suggestedAction)) {
      console.error('[Extraction] Invalid suggestedAction:', parsed.suggestedAction);
      return null;
    }

    // Validate summary
    if (typeof parsed.summary !== 'string') {
      console.error('[Extraction] Invalid summary:', parsed.summary);
      return null;
    }

    return {
      isExploitable: parsed.isExploitable,
      exploitabilityReasoning: parsed.exploitabilityReasoning,
      usageLocations: parsed.usageLocations.map(String),
      suggestedFix: parsed.suggestedFix,
      suggestedAction: parsed.suggestedAction,
      summary: parsed.summary,
      rawMarkdown,
      analysisAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Extraction] Failed to parse tool arguments:', error);
    return null;
  }
}

/**
 * Create a fallback extraction result when LLM call fails
 */
function createFallbackExtraction(
  rawMarkdown: string,
  reason: string
): SecurityFindingSandboxAnalysis {
  return {
    isExploitable: 'unknown',
    exploitabilityReasoning: `Extraction failed: ${reason}. Please review the raw analysis.`,
    usageLocations: [],
    suggestedFix: 'Review the raw analysis for fix recommendations.',
    suggestedAction: 'manual_review',
    summary: 'Analysis completed but structured extraction failed. Review raw output.',
    rawMarkdown,
    analysisAt: new Date().toISOString(),
  };
}

/**
 * Extract structured analysis fields from raw markdown output.
 * Uses direct LLM call with function calling to parse the unstructured analysis.
 *
 * @param finding - The security finding being analyzed
 * @param rawMarkdown - Raw markdown output from sandbox analysis
 * @param authToken - Auth token for the LLM proxy
 * @param model - Model to use for extraction (default: anthropic/claude-sonnet-4)
 * @param organizationId - Optional organization ID for usage tracking
 */
export async function extractSandboxAnalysis(
  finding: SecurityFinding,
  rawMarkdown: string,
  authToken: string,
  model: string = 'anthropic/claude-sonnet-4',
  organizationId?: string
): Promise<SecurityFindingSandboxAnalysis> {
  console.log('[Extraction] Starting extraction for finding:', finding.id);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: EXTRACTION_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildExtractionPrompt(finding, rawMarkdown),
    },
  ];

  try {
    const result = await sendProxiedChatCompletion<ChatCompletionResponse>({
      authToken,
      version: EXTRACTION_SERVICE_VERSION,
      userAgent: EXTRACTION_SERVICE_USER_AGENT,
      body: {
        model,
        messages,
        tools: [SUBMIT_EXTRACTION_TOOL],
        tool_choice: {
          type: 'function',
          function: { name: 'submit_analysis_extraction' },
        },
      },
      organizationId,
    });

    if (!result.ok) {
      console.error('[Extraction] API error:', result.status, result.error);
      captureException(new Error(`Extraction API error: ${result.status}`), {
        tags: { operation: 'extractSandboxAnalysis' },
        extra: { findingId: finding.id, status: result.status, error: result.error },
      });
      return createFallbackExtraction(rawMarkdown, `API error: ${result.status}`);
    }

    const choice = result.data.choices?.[0];
    if (!choice) {
      console.error('[Extraction] No choice in response');
      return createFallbackExtraction(rawMarkdown, 'No response from LLM');
    }

    const message = choice.message;
    const toolCall = message.tool_calls?.[0];

    if (!toolCall || toolCall.type !== 'function') {
      console.error('[Extraction] No tool call in response');
      return createFallbackExtraction(rawMarkdown, 'LLM did not call the extraction tool');
    }

    if (toolCall.function.name !== 'submit_analysis_extraction') {
      console.error('[Extraction] Unexpected tool call:', toolCall.function.name);
      return createFallbackExtraction(rawMarkdown, `Unexpected tool: ${toolCall.function.name}`);
    }

    const extractionResult = parseExtractionResult(toolCall.function.arguments, rawMarkdown);
    if (!extractionResult) {
      return createFallbackExtraction(rawMarkdown, 'Failed to parse extraction result');
    }

    console.log('[Extraction] Extraction complete:', {
      findingId: finding.id,
      isExploitable: extractionResult.isExploitable,
      usageLocationsCount: extractionResult.usageLocations.length,
      summaryLength: extractionResult.summary.length,
    });

    return extractionResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Extraction] Error during extraction:', errorMessage);
    captureException(error, {
      tags: { operation: 'extractSandboxAnalysis' },
      extra: { findingId: finding.id },
    });
    return createFallbackExtraction(rawMarkdown, errorMessage);
  }
}
