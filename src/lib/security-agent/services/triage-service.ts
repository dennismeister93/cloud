/**
 * Security Finding Triage Service (Tier 1)
 *
 * Quick triage of security findings using direct LLM call with function calling.
 * Analyzes alert metadata without repo access to filter noise before expensive sandbox analysis.
 *
 * Following the Slack bot pattern from src/lib/slack-bot.ts for structured output via tools.
 */

import 'server-only';
import type OpenAI from 'openai';
import { sendProxiedChatCompletion } from '@/lib/llm-proxy-helpers';
import type { SecurityFinding } from '@/db/schema';
import type { SecurityFindingTriage } from '../core/types';
import { captureException } from '@sentry/nextjs';

// Version string for API requests
const TRIAGE_SERVICE_VERSION = '5.0.0';
const TRIAGE_SERVICE_USER_AGENT = `Kilo-Security-Triage/${TRIAGE_SERVICE_VERSION}`;

/**
 * System prompt for triage analysis
 */
const TRIAGE_SYSTEM_PROMPT = `You are a security analyst performing quick triage of dependency vulnerability alerts.

Your task is to analyze the vulnerability metadata and determine if deeper codebase analysis is needed.

## Triage Guidelines

### Dismiss candidates (needsSandboxAnalysis: false, suggestedAction: 'dismiss'):
- Development dependencies with low/medium severity (test frameworks, linters, build tools)
- Vulnerabilities in packages that are clearly dev-only (jest, mocha, eslint, webpack, etc.)
- DoS vulnerabilities in CLI-only tools that don't affect production
- Low severity vulnerabilities with no known exploits

### Needs codebase analysis (needsSandboxAnalysis: true, suggestedAction: 'analyze_codebase'):
- Runtime dependencies with high/critical severity
- RCE (Remote Code Execution) vulnerabilities
- SQL injection, XSS, or authentication bypass vulnerabilities
- Vulnerabilities in core frameworks (express, react, etc.)
- Any vulnerability where exploitability depends on how the package is used

### Manual review (needsSandboxAnalysis: false, suggestedAction: 'manual_review'):
- Edge cases where you're uncertain
- Critical severity in dev dependencies
- Complex vulnerabilities that need human judgment

## Confidence Levels
- high: Clear-cut case based on metadata alone
- medium: Reasonable confidence but some uncertainty
- low: Uncertain, recommend manual review

Always err on the side of caution - if unsure, recommend codebase analysis or manual review.`;

/**
 * Tool definition for submitting triage results
 */
const SUBMIT_TRIAGE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_triage_result',
    description: 'Submit the triage analysis result for this security finding',
    parameters: {
      type: 'object',
      properties: {
        needsSandboxAnalysis: {
          type: 'boolean',
          description:
            'Whether deeper codebase analysis is needed to determine exploitability. Set to false for clear auto-dismiss cases.',
        },
        needsSandboxReasoning: {
          type: 'string',
          description:
            'Explanation of why sandbox analysis is or is not needed. Be specific about the factors considered.',
        },
        suggestedAction: {
          type: 'string',
          enum: ['dismiss', 'analyze_codebase', 'manual_review'],
          description:
            'Recommended action: dismiss for safe-to-ignore findings, analyze_codebase for deeper analysis, manual_review for uncertain cases.',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Confidence level in this triage decision.',
        },
      },
      required: ['needsSandboxAnalysis', 'needsSandboxReasoning', 'suggestedAction', 'confidence'],
    },
  },
};

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionResponse = OpenAI.Chat.Completions.ChatCompletion;

/**
 * Build the user prompt with finding details
 */
function buildTriagePrompt(finding: SecurityFinding): string {
  const rawData = finding.raw_data as Record<string, unknown> | null;
  const cwes = finding.cwe_ids?.join(', ') || 'N/A';

  return `## Vulnerability Alert to Triage

**Package**: ${finding.package_name} (${finding.package_ecosystem})
**Severity**: ${finding.severity}
**Dependency Scope**: ${finding.dependency_scope || 'unknown'}
**CVE**: ${finding.cve_id || 'N/A'}
**GHSA**: ${finding.ghsa_id || 'N/A'}
**CWE IDs**: ${cwes}
**CVSS Score**: ${finding.cvss_score ?? 'N/A'}

**Title**: ${finding.title}
**Description**: ${finding.description || 'No description available'}

**Vulnerable Versions**: ${finding.vulnerable_version_range || 'Unknown'}
**Patched Version**: ${finding.patched_version || 'No patch available'}
**Manifest Path**: ${finding.manifest_path || 'Unknown'}

${rawData ? `**Additional Context**: ${JSON.stringify(rawData, null, 2).slice(0, 1000)}` : ''}

Please analyze this vulnerability and call the submit_triage_result tool with your assessment.`;
}

/**
 * Parse triage result from tool call arguments
 */
function parseTriageResult(args: string): SecurityFindingTriage | null {
  try {
    const parsed = JSON.parse(args);

    // Validate required fields
    if (typeof parsed.needsSandboxAnalysis !== 'boolean') {
      console.error('[Triage] Invalid needsSandboxAnalysis:', parsed.needsSandboxAnalysis);
      return null;
    }

    if (typeof parsed.needsSandboxReasoning !== 'string') {
      console.error('[Triage] Invalid needsSandboxReasoning:', parsed.needsSandboxReasoning);
      return null;
    }

    const validActions = ['dismiss', 'analyze_codebase', 'manual_review'];
    if (!validActions.includes(parsed.suggestedAction)) {
      console.error('[Triage] Invalid suggestedAction:', parsed.suggestedAction);
      return null;
    }

    const validConfidences = ['high', 'medium', 'low'];
    if (!validConfidences.includes(parsed.confidence)) {
      console.error('[Triage] Invalid confidence:', parsed.confidence);
      return null;
    }

    return {
      needsSandboxAnalysis: parsed.needsSandboxAnalysis,
      needsSandboxReasoning: parsed.needsSandboxReasoning,
      suggestedAction: parsed.suggestedAction,
      confidence: parsed.confidence,
      triageAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Triage] Failed to parse tool arguments:', error);
    return null;
  }
}

/**
 * Create a fallback triage result when LLM call fails
 */
function createFallbackTriage(reason: string): SecurityFindingTriage {
  return {
    needsSandboxAnalysis: true,
    needsSandboxReasoning: `Triage failed: ${reason}. Defaulting to sandbox analysis.`,
    suggestedAction: 'analyze_codebase',
    confidence: 'low',
    triageAt: new Date().toISOString(),
  };
}

/**
 * Triage a security finding using direct LLM call with function calling.
 * Returns a triage result that can be stored in the analysis field.
 *
 * @param finding - The security finding to triage
 * @param authToken - Auth token for the LLM proxy
 * @param model - Model to use for triage (default: anthropic/claude-sonnet-4)
 * @param organizationId - Optional organization ID for usage tracking
 */
export async function triageSecurityFinding(
  finding: SecurityFinding,
  authToken: string,
  model: string = 'anthropic/claude-sonnet-4',
  organizationId?: string
): Promise<SecurityFindingTriage> {
  console.log('[Triage] Starting triage for finding:', finding.id);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: TRIAGE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildTriagePrompt(finding),
    },
  ];

  try {
    const result = await sendProxiedChatCompletion<ChatCompletionResponse>({
      authToken,
      version: TRIAGE_SERVICE_VERSION,
      userAgent: TRIAGE_SERVICE_USER_AGENT,
      body: {
        model,
        messages,
        tools: [SUBMIT_TRIAGE_TOOL],
        tool_choice: {
          type: 'function',
          function: { name: 'submit_triage_result' },
        },
      },
      organizationId,
    });

    if (!result.ok) {
      console.error('[Triage] API error:', result.status, result.error);
      captureException(new Error(`Triage API error: ${result.status}`), {
        tags: { operation: 'triageSecurityFinding' },
        extra: { findingId: finding.id, status: result.status, error: result.error },
      });
      return createFallbackTriage(`API error: ${result.status}`);
    }

    const choice = result.data.choices?.[0];
    if (!choice) {
      console.error('[Triage] No choice in response');
      return createFallbackTriage('No response from LLM');
    }

    const message = choice.message;
    const toolCall = message.tool_calls?.[0];

    if (!toolCall || toolCall.type !== 'function') {
      console.error('[Triage] No tool call in response');
      return createFallbackTriage('LLM did not call the triage tool');
    }

    if (toolCall.function.name !== 'submit_triage_result') {
      console.error('[Triage] Unexpected tool call:', toolCall.function.name);
      return createFallbackTriage(`Unexpected tool: ${toolCall.function.name}`);
    }

    const triageResult = parseTriageResult(toolCall.function.arguments);
    if (!triageResult) {
      return createFallbackTriage('Failed to parse triage result');
    }

    console.log('[Triage] Triage complete:', {
      findingId: finding.id,
      needsSandboxAnalysis: triageResult.needsSandboxAnalysis,
      needsSandboxReasoning: triageResult.needsSandboxReasoning,
      suggestedAction: triageResult.suggestedAction,
      confidence: triageResult.confidence,
    });

    return triageResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Triage] Error during triage:', errorMessage);
    captureException(error, {
      tags: { operation: 'triageSecurityFinding' },
      extra: { findingId: finding.id },
    });
    return createFallbackTriage(errorMessage);
  }
}
