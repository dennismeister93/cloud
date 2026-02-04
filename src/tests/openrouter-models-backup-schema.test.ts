import { test, expect, describe } from '@jest/globals';
import { NormalizedOpenRouterResponse } from '@/lib/providers/openrouter/openrouter-types';
import backupData from '@/data/openrouter-models-by-provider-backup.json';

describe('openrouter-models-by-provider-backup.json', () => {
  test('follows NormalizedOpenRouterResponse schema', () => {
    const result = NormalizedOpenRouterResponse.safeParse(backupData);
    expect(result.success).toBe(true);
  });
});
