/**
 * Code Review Prompt Generation (v5.4.0)
 *
 * Simplified prompt generation - most content lives in the JSON template.
 * This file only handles:
 * 1. Loading template from PostHog (remote) or falling back to local JSON
 * 2. Assembling template sections in order
 * 3. Replacing placeholders ({REPO}, {PR}, {COMMENT_ID}, {FIX_LINK})
 * 4. Adding dynamic context (existing comments table)
 * 5. Selecting CREATE vs UPDATE summary command
 */

import { z } from 'zod';
import type { CodeReviewAgentConfig } from '@/lib/agent-config/core/types';
import { getFeatureFlagPayload } from '@/lib/posthog-feature-flags';
import DEFAULT_PROMPT_TEMPLATE from '@/lib/code-reviews/prompts/default-prompt-template.json';
import { logExceptInTest } from '@/lib/utils.server';

/**
 * Inline comment info for duplicate detection
 */
export interface InlineComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
  isOutdated: boolean;
}

/**
 * Previous review status for state machine
 */
export type PreviousReviewStatus = 'no-review' | 'no-issues' | 'issues-found';

/**
 * Complete review state for intelligent update/create decisions
 */
export interface ExistingReviewState {
  summaryComment: { commentId: number; body: string } | null;
  inlineComments: InlineComment[];
  previousStatus: PreviousReviewStatus;
  headCommitSha: string;
}

/**
 * @deprecated Use ExistingReviewState instead
 */
export interface ExistingReviewComment {
  commentId: number;
  body: string;
}

// PostHog feature flag name for remote prompt template
const PROMPT_TEMPLATE_FLAG = 'code-review-prompt-template';

// Zod schema for validating prompt template structure
const PromptTemplateSchema = z.object({
  version: z.string(),
  systemRole: z.string(),
  hardConstraints: z.string(),
  workflow: z.string(),
  whatToReview: z.string(),
  commentFormat: z.string(),
  summaryFormatIssuesFound: z.string(),
  summaryFormatNoIssues: z.string(),
  summaryMarkerNote: z.string(),
  summaryCommandCreate: z.string(),
  summaryCommandUpdate: z.string(),
  inlineCommentsApi: z.string(),
  fixLinkTemplate: z.string(),
});

// Template type derived from schema
type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

/**
 * Load prompt template from PostHog or fall back to local
 * @returns Template and source indicator
 */
async function loadPromptTemplate(): Promise<{
  template: PromptTemplate;
  source: 'posthog' | 'local';
}> {
  // Try to load from PostHog first
  const remoteTemplate = await getFeatureFlagPayload(PromptTemplateSchema, PROMPT_TEMPLATE_FLAG);

  if (remoteTemplate) {
    logExceptInTest('[loadPromptTemplate] Loaded template from PostHog', {
      version: remoteTemplate.version,
    });
    return { template: remoteTemplate, source: 'posthog' };
  }

  // Fall back to local template
  logExceptInTest('[loadPromptTemplate] Using local template', {
    version: (DEFAULT_PROMPT_TEMPLATE as PromptTemplate).version,
  });
  return { template: DEFAULT_PROMPT_TEMPLATE as PromptTemplate, source: 'local' };
}

/**
 * Generates a code review prompt based on configuration
 * @param config Agent configuration with review settings
 * @param repository GitHub repository in format "owner/repo"
 * @param prNumber Pull request number (optional for GitHub Actions workflow)
 * @param reviewId Code review ID for generating fix link (optional)
 * @param existingReviewState Complete review state for intelligent decisions (optional)
 * @returns Generated prompt with version and source info
 */
export async function generateReviewPrompt(
  _config: CodeReviewAgentConfig, // Reserved for future: custom instructions, focus areas
  repository: string,
  prNumber?: number,
  reviewId?: string,
  existingReviewState?: ExistingReviewState | null
): Promise<{ prompt: string; version: string; source: 'posthog' | 'local' }> {
  // Load template from PostHog (remote) or local fallback
  const { template, source } = await loadPromptTemplate();
  const pr = prNumber || '{PR_NUMBER}';

  // Helper to replace common placeholders
  const replacePlaceholders = (text: string, commentId?: number): string => {
    return text
      .replace(/{PR_NUMBER}/g, String(pr))
      .replace(/{REPO}/g, repository)
      .replace(/{PR}/g, String(pr))
      .replace(/{COMMENT_ID}/g, commentId ? String(commentId) : '{COMMENT_ID}');
  };

  let prompt = '';

  // 1. System role
  prompt += template.systemRole + '\n\n';

  // 2. Hard constraints (MOST IMPORTANT - at top)
  prompt += template.hardConstraints + '\n\n';

  // 3. Workflow with placeholders replaced
  prompt += replacePlaceholders(template.workflow) + '\n\n';

  // 4. What to review
  prompt += template.whatToReview + '\n\n';

  // 5. Comment format
  prompt += template.commentFormat + '\n\n';

  // 6. Dynamic context section (separator)
  prompt += '---\n\n# CONTEXT FOR THIS PR\n\n';
  prompt += `**Repository:** ${repository}\n`;
  prompt += `**PR Number:** ${pr}\n\n`;

  // 7. Existing inline comments table (dynamic - built at runtime)
  if (existingReviewState?.inlineComments && existingReviewState.inlineComments.length > 0) {
    const active = existingReviewState.inlineComments.filter(c => !c.isOutdated);

    prompt += `## Existing Inline Comments (${active.length} active)\n\n`;
    prompt += `**DO NOT create duplicates for these issues.**\n\n`;
    prompt += '| File | Line | Issue |\n|------|------|-------|\n';

    for (const c of active.slice(0, 20)) {
      const firstLine = c.body.split('\n')[0].substring(0, 60).replace(/\|/g, '\\|');
      prompt += `| \`${c.path}\` | ${c.line ?? 'N/A'} | ${firstLine} |\n`;
    }

    if (active.length > 20) {
      prompt += `\n*...and ${active.length - 20} more comments*\n`;
    }
    prompt += '\n';
  }

  // 8. Summary format templates (from JSON)
  prompt += template.summaryFormatIssuesFound + '\n\n';
  prompt += template.summaryFormatNoIssues + '\n\n';

  // 9. Summary marker note and command (CREATE or UPDATE)
  prompt += template.summaryMarkerNote + '\n\n';
  if (existingReviewState?.summaryComment) {
    prompt +=
      replacePlaceholders(
        template.summaryCommandUpdate,
        existingReviewState.summaryComment.commentId
      ) + '\n\n';
  } else {
    prompt += replacePlaceholders(template.summaryCommandCreate) + '\n\n';
  }

  // 10. Fix link (dynamic - only if reviewId provided)
  if (reviewId) {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://kilo.ai';
    const fixLink = `${baseUrl}/cloud-agent-fork/review/${reviewId}`;
    prompt += template.fixLinkTemplate.replace(/{FIX_LINK}/g, fixLink) + '\n\n';
  }

  // 11. Inline comments API call template (from JSON)
  prompt += replacePlaceholders(template.inlineCommentsApi) + '\n';

  return {
    prompt,
    version: template.version,
    source,
  };
}
