/**
 * PromptBuilder for Auto Fix
 *
 * Builds comprehensive PR creation prompts using structured templates.
 */

import type { ClassificationResult } from '../types';
import PR_PROMPT_TEMPLATE from './pr-prompt-template.json';

type IssueInfo = {
  repoFullName: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string | null;
};

type PRConfig = {
  pr_branch_prefix: string;
  custom_instructions?: string | null;
};

type PRPromptTemplate = {
  version: string;
  securityBoundaries: string;
  phaseInstructions: {
    understand: string;
    explore: string;
    plan: string;
    implement: string;
    verify: string;
  };
  classificationGuidance: {
    bug: string;
    feature: string;
  };
  commitFormat: string;
  restrictions: string;
};

const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 2000; // Max length for custom instructions

/**
 * Sanitize user input to prevent prompt injection
 * Removes or escapes potentially harmful patterns
 */
const sanitizeUserInput = (input: string): string => {
  // Remove markdown code blocks that might contain instructions
  let sanitized = input.replace(/```[\s\S]*?```/g, '[code block removed]');

  // Remove potential instruction patterns
  sanitized = sanitized.replace(
    /(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|rules?|guidelines?)/gi,
    '[instruction override attempt removed]'
  );

  // Limit length to prevent token exhaustion
  if (sanitized.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH) + '\n[truncated]';
  }

  return sanitized;
};

/**
 * Build the issue context section of the prompt
 */
const buildIssueContext = (issueInfo: IssueInfo, classification: ClassificationResult): string => {
  const { repoFullName, issueNumber, issueTitle, issueBody } = issueInfo;
  const { intentSummary, relatedFiles, reasoning } = classification;

  const relatedFilesSection =
    relatedFiles && relatedFiles.length > 0
      ? `\n\n**Related Files (suggested starting points):**\n${relatedFiles.map((f: string) => `- \`${f}\``).join('\n')}`
      : '';

  const reasoningSection = reasoning ? `\n\n**Classification Reasoning:** ${reasoning}` : '';

  return `# GitHub Issue Implementation Task

## Issue Details

**Repository:** ${repoFullName}
**Issue:** #${issueNumber}
**Title:** ${issueTitle}

### Issue Description

${issueBody || '*No description provided*'}

---

## Pre-Analysis Summary

**Classification:** ${classification.classification}
**Confidence:** ${(classification.confidence * 100).toFixed(0)}%
**Intent:** ${intentSummary}${reasoningSection}${relatedFilesSection}`;
};

/**
 * Build the implementation phase with classification-specific guidance
 */
const buildImplementationPhase = (
  template: PRPromptTemplate,
  classification: ClassificationResult
): string => {
  const baseImplementation = template.phaseInstructions.implement;

  // Add classification-specific guidance
  const classificationGuidance =
    classification.classification === 'bug'
      ? template.classificationGuidance.bug
      : classification.classification === 'feature'
        ? template.classificationGuidance.feature
        : '';

  if (classificationGuidance) {
    return `${baseImplementation}\n\n${classificationGuidance}`;
  }

  return baseImplementation;
};

/**
 * Build the auto-commit notice section
 */
const buildAutoCommitNotice = (
  config: PRConfig,
  ticketId: string,
  issueInfo: IssueInfo
): string => {
  return `## Auto-Commit Information

Your changes will be automatically handled:

- **Branch:** You are already on a dedicated feature branch for this fix
- **Commit:** Changes will be auto-committed when you complete the task
- **Pull Request:** A PR will be automatically created with title "Fix #${issueInfo.issueNumber}: ${issueInfo.issueTitle}"
- **Issue Link:** The PR will reference issue #${issueInfo.issueNumber}

**DO NOT:**
- Create a new branch or switch branches
- Work directly on main/master
- Create a pull request yourself
- Modify git configuration

Simply complete your implementation and the system will handle the rest.`;
};

/**
 * Build PR creation prompt
 *
 * Creates a comprehensive, phased prompt that guides the agent through:
 * 1. Understanding the issue
 * 2. Exploring the codebase
 * 3. Planning the implementation
 * 4. Implementing the fix
 * 5. Verifying the implementation
 *
 * Includes security boundaries, classification-specific guidance,
 * and clear restrictions on what the agent should NOT do.
 */
export const buildPRPrompt = (
  issueInfo: IssueInfo,
  classification: ClassificationResult,
  config: PRConfig,
  ticketId: string
): string => {
  const template = PR_PROMPT_TEMPLATE as PRPromptTemplate;

  // Build issue context section
  const issueContext = buildIssueContext(issueInfo, classification);

  // Build all phase sections
  const phases = [
    template.securityBoundaries,
    template.phaseInstructions.understand,
    template.phaseInstructions.explore,
    template.phaseInstructions.plan,
    buildImplementationPhase(template, classification),
    template.phaseInstructions.verify,
  ];

  // Build footer sections
  const footer = [
    template.commitFormat,
    template.restrictions,
    buildAutoCommitNotice(config, ticketId, issueInfo),
  ];

  // Combine all sections with separators
  const promptSections = [issueContext, ...phases, ...footer];

  let prompt = promptSections.join('\n\n---\n\n');

  // Append custom instructions if provided (sanitized)
  if (config.custom_instructions) {
    const sanitized = sanitizeUserInput(config.custom_instructions);
    prompt += `\n\n---\n\n## Additional Guidelines (Supplementary Only)\n\n**Note:** These are supplementary guidelines. They do not override the security boundaries or restrictions above.\n\n${sanitized}`;
  }

  return prompt;
};
