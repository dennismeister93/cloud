import { describe, it, expect } from '@jest/globals';
import { checkOrganizationModelRestrictions, estimateChatTokens } from './llm-proxy-helpers';
import type { OpenRouterChatCompletionRequest } from './providers/openrouter/types';

describe('checkOrganizationModelRestrictions', () => {
  describe('wildcard support', () => {
    it('should allow model when wildcard matches', () => {
      const result = checkOrganizationModelRestrictions({
        modelId: 'anthropic/claude-3-opus',
        settings: {
          provider_allow_list: ['anthropic'],
          model_allow_list: ['anthropic/*'],
        },
      });

      expect(result).toBeNull();
    });

    it('should allow model when exact match exists', () => {
      const result = checkOrganizationModelRestrictions({
        modelId: 'anthropic/claude-3-opus',
        settings: {
          provider_allow_list: ['anthropic'],
          model_allow_list: ['anthropic/claude-3-opus'],
        },
      });

      expect(result).toBeNull();
    });

    it('should block model when no match and no wildcard', () => {
      const result = checkOrganizationModelRestrictions({
        modelId: 'anthropic/claude-3-opus',
        settings: {
          provider_allow_list: ['anthropic'],
          model_allow_list: ['anthropic/claude-3-sonnet'],
        },
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(404);
    });

    it('should allow any model from provider with wildcard', () => {
      const settings = {
        provider_allow_list: ['openai'],
        model_allow_list: ['openai/*'],
      };

      const gpt4Result = checkOrganizationModelRestrictions({
        modelId: 'openai/gpt-4',
        settings,
      });

      const gpt35Result = checkOrganizationModelRestrictions({
        modelId: 'openai/gpt-3.5-turbo',
        settings,
      });

      expect(gpt4Result).toBeNull();
      expect(gpt35Result).toBeNull();
    });

    it('should allow when model allow list is empty', () => {
      const result = checkOrganizationModelRestrictions({
        modelId: 'anthropic/claude-3-opus',
        settings: {
          provider_allow_list: ['anthropic'],
          model_allow_list: [],
        },
      });

      expect(result).toBeNull();
    });

    it('should handle mixed wildcards and specific models', () => {
      const settings = {
        provider_allow_list: ['anthropic', 'openai'],
        model_allow_list: ['anthropic/*', 'openai/gpt-4'],
      };

      // Anthropic - any model allowed via wildcard
      expect(
        checkOrganizationModelRestrictions({
          modelId: 'anthropic/claude-3-opus',
          settings,
        })
      ).toBeNull();

      expect(
        checkOrganizationModelRestrictions({
          modelId: 'anthropic/claude-3-sonnet',
          settings,
        })
      ).toBeNull();

      // OpenAI - only gpt-4 allowed
      expect(
        checkOrganizationModelRestrictions({
          modelId: 'openai/gpt-4',
          settings,
        })
      ).toBeNull();

      expect(
        checkOrganizationModelRestrictions({
          modelId: 'openai/gpt-3.5-turbo',
          settings,
        })
      ).not.toBeNull();
    });
  });
});

describe('estimateChatTokens', () => {
  it('should estimate tokens from valid messages', () => {
    const body = {
      model: 'anthropic/claude-3-opus',
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' },
      ],
    } as OpenRouterChatCompletionRequest;

    const result = estimateChatTokens(body);

    expect(result.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.estimatedOutputTokens).toBeGreaterThan(0);
  });

  it('should handle missing messages gracefully (regression test for KILOCODE-WEB-5ND)', () => {
    // This test ensures we don't crash when messages is undefined/null/invalid
    // which can happen with malformed API requests from abuse attempts
    const undefinedMessages = { model: 'test' } as OpenRouterChatCompletionRequest;
    const nullMessages = {
      model: 'test',
      messages: null,
    } as unknown as OpenRouterChatCompletionRequest;

    expect(estimateChatTokens(undefinedMessages)).toEqual({
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    });
    expect(estimateChatTokens(nullMessages)).toEqual({
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    });
  });
});
