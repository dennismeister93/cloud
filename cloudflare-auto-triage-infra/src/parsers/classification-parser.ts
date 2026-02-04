/**
 * ClassificationParser
 *
 * Extracts and validates classification results from Cloud Agent responses.
 * Tries multiple parsing strategies in order of reliability.
 */

import { classificationResultSchema, type ClassificationResult } from '../types';

/**
 * Parse classification from text using multiple strategies
 */
export const parseClassification = (text: string): ClassificationResult => {
  const strategies = [() => parseFromCodeBlock(text), () => parseFromJsonObject(text)];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && classificationResultSchema.safeParse(result).success) {
        return result;
      }
    } catch {
      continue;
    }
  }

  throw new Error('Failed to parse classification from Cloud Agent response');
};

/**
 * Extract classification from markdown code blocks
 * Tries blocks from last to first (most recent)
 */
const parseFromCodeBlock = (text: string): ClassificationResult | null => {
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  const codeBlocks: string[] = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push(match[1]);
  }

  // Try code blocks from last to first (most recent)
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(codeBlocks[i]);

      // Validate required fields
      if (parsed.classification && typeof parsed.confidence === 'number' && parsed.intentSummary) {
        return {
          classification: parsed.classification,
          confidence: parsed.confidence,
          intentSummary: parsed.intentSummary,
          relatedFiles: parsed.relatedFiles,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // Try next block
      continue;
    }
  }

  return null;
};

/**
 * Extract classification from plain JSON objects in text
 * Uses balanced brace matching to find JSON objects
 */
const parseFromJsonObject = (text: string): ClassificationResult | null => {
  const jsonObjects = extractJsonObjects(text);

  // Try JSON objects from last to first (most recent)
  for (let i = jsonObjects.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(jsonObjects[i]);

      // Validate required fields
      if (parsed.classification && typeof parsed.confidence === 'number' && parsed.intentSummary) {
        return {
          classification: parsed.classification,
          confidence: parsed.confidence,
          intentSummary: parsed.intentSummary,
          relatedFiles: parsed.relatedFiles,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // Try next match
      continue;
    }
  }

  return null;
};

/**
 * Extract JSON objects from text by finding balanced braces
 * This handles nested objects properly
 */
const extractJsonObjects = (text: string): string[] => {
  const objects: string[] = [];
  let depth = 0;
  let startIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '{') {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        const jsonStr = text.substring(startIndex, i + 1);
        // Only include if it looks like it might contain our required fields
        if (looksLikeClassification(jsonStr)) {
          objects.push(jsonStr);
        }
        startIndex = -1;
      }
    }
  }

  return objects;
};

/**
 * Quick check if a JSON string looks like a classification object
 */
const looksLikeClassification = (jsonStr: string): boolean => {
  return (
    jsonStr.includes('"classification"') &&
    jsonStr.includes('"confidence"') &&
    jsonStr.includes('"intentSummary"')
  );
};
