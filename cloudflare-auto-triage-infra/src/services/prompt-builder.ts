/**
 * PromptBuilder
 *
 * Builds prompt templates for classification.
 */

type IssueInfo = {
  repoFullName: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string | null;
};

type ClassificationConfig = {
  custom_instructions?: string | null;
};

/**
 * Build classification prompt
 */
export const buildClassificationPrompt = (
  issueInfo: IssueInfo,
  config: ClassificationConfig
): string => {
  const { repoFullName, issueNumber, issueTitle, issueBody } = issueInfo;

  const basePrompt = `Analyze this GitHub issue and classify it:

Repository: ${repoFullName}
Issue #${issueNumber}: ${issueTitle}

${issueBody || 'No description provided'}

Classify as one of:
- **bug**: Clear bug report with reproduction steps or error description
- **feature**: Feature request or enhancement proposal
- **question**: User asking for help, clarification, or documentation
- **unclear**: Insufficient information to determine the intent

IMPORTANT: You MUST respond with ONLY a JSON object in a markdown code block. Do not include any other text before or after the JSON.

Provide your analysis in the following JSON format:

\`\`\`json
{
  "classification": "bug",
  "confidence": 0.85,
  "intentSummary": "1-2 sentence summary of what the user wants",
  "relatedFiles": ["optional/path/to/file.ts"],
  "reasoning": "Brief explanation of your classification",
  "suggestedAction": "What should be done with this issue"
}
\`\`\`

Guidelines:
- Be conservative with confidence scores
- Only classify as "bug" if there's clear evidence of incorrect behavior
- Only classify as "feature" if there's a clear enhancement request
- Use "question" for support requests or documentation needs
- Use "unclear" if the issue lacks sufficient detail
- The classification field must be exactly one of: "bug", "feature", "question", or "unclear"
- The confidence field must be a number between 0.0 and 1.0`;

  if (config.custom_instructions) {
    return `${basePrompt}\n\nCustom Instructions:\n${config.custom_instructions}`;
  }

  return basePrompt;
};
