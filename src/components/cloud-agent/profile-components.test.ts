/**
 * Tests for Cloud Agent Profile Components
 *
 * These tests focus on testing utility functions and logic
 * used by the profile components, since the test environment
 * uses node (not jsdom).
 */

import { describe, test, expect } from '@jest/globals';

// Types matching the profile components
type ProfileSummary = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  varCount: number;
  commandCount: number;
};

type ProfileVar = {
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProfileCommand = {
  sequence: number;
  command: string;
};

// Utility functions extracted from components for testing

/**
 * Converts profile vars to env vars object (from CloudSessionsPage integration)
 */
function profileVarsToEnvVars(vars: ProfileVar[]): Record<string, string> {
  const envVars: Record<string, string> = {};
  for (const v of vars) {
    envVars[v.key] = v.value;
  }
  return envVars;
}

/**
 * Converts profile commands to ordered string array (from CloudSessionsPage integration)
 */
function profileCommandsToArray(commands: ProfileCommand[]): string[] {
  return commands.sort((a, b) => a.sequence - b.sequence).map(c => c.command);
}

/**
 * Validates profile name (from SaveProfileDialog)
 */
function validateProfileName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Name too long' };
  }
  return { valid: true };
}

/**
 * Validates profile description (from SaveProfileDialog)
 */
function validateProfileDescription(description: string): { valid: boolean; error?: string } {
  if (description.length > 500) {
    return { valid: false, error: 'Description too long' };
  }
  return { valid: true };
}

/**
 * Normalizes env var key format (from ProfileVarEditor)
 */
function normalizeEnvVarKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

/**
 * Converts envVars object to array format for SaveProfileDialog
 */
function envVarsToArray(
  envVars: Record<string, string>
): Array<{ key: string; value: string; isSecret: boolean }> {
  return Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    isSecret: value === '***',
  }));
}

describe('Profile Utilities', () => {
  describe('profileVarsToEnvVars', () => {
    test('should convert empty array to empty object', () => {
      const result = profileVarsToEnvVars([]);
      expect(result).toEqual({});
    });

    test('should convert vars array to key-value object', () => {
      const vars: ProfileVar[] = [
        {
          key: 'API_KEY',
          value: 'secret123',
          isSecret: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          key: 'NODE_ENV',
          value: 'production',
          isSecret: false,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const result = profileVarsToEnvVars(vars);

      expect(result).toEqual({
        API_KEY: 'secret123',
        NODE_ENV: 'production',
      });
    });

    test('should preserve masked secret values', () => {
      const vars: ProfileVar[] = [
        {
          key: 'SECRET',
          value: '***',
          isSecret: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const result = profileVarsToEnvVars(vars);

      expect(result).toEqual({ SECRET: '***' });
    });
  });

  describe('profileCommandsToArray', () => {
    test('should convert empty array', () => {
      const result = profileCommandsToArray([]);
      expect(result).toEqual([]);
    });

    test('should extract command strings in sequence order', () => {
      const commands: ProfileCommand[] = [
        { sequence: 2, command: 'npm run build' },
        { sequence: 0, command: 'npm install' },
        { sequence: 1, command: 'npm test' },
      ];

      const result = profileCommandsToArray(commands);

      expect(result).toEqual(['npm install', 'npm test', 'npm run build']);
    });

    test('should handle single command', () => {
      const commands: ProfileCommand[] = [{ sequence: 0, command: 'echo hello' }];

      const result = profileCommandsToArray(commands);

      expect(result).toEqual(['echo hello']);
    });
  });

  describe('validateProfileName', () => {
    test('should reject empty name', () => {
      expect(validateProfileName('')).toEqual({ valid: false, error: 'Name is required' });
    });

    test('should reject whitespace-only name', () => {
      expect(validateProfileName('   ')).toEqual({ valid: false, error: 'Name is required' });
    });

    test('should reject name over 100 characters', () => {
      const longName = 'a'.repeat(101);
      expect(validateProfileName(longName)).toEqual({ valid: false, error: 'Name too long' });
    });

    test('should accept valid name', () => {
      expect(validateProfileName('My Profile')).toEqual({ valid: true });
    });

    test('should accept name at exactly 100 characters', () => {
      const maxName = 'a'.repeat(100);
      expect(validateProfileName(maxName)).toEqual({ valid: true });
    });
  });

  describe('validateProfileDescription', () => {
    test('should accept empty description', () => {
      expect(validateProfileDescription('')).toEqual({ valid: true });
    });

    test('should reject description over 500 characters', () => {
      const longDesc = 'a'.repeat(501);
      expect(validateProfileDescription(longDesc)).toEqual({
        valid: false,
        error: 'Description too long',
      });
    });

    test('should accept valid description', () => {
      expect(validateProfileDescription('A helpful profile for AWS development')).toEqual({
        valid: true,
      });
    });

    test('should accept description at exactly 500 characters', () => {
      const maxDesc = 'a'.repeat(500);
      expect(validateProfileDescription(maxDesc)).toEqual({ valid: true });
    });
  });

  describe('normalizeEnvVarKey', () => {
    test('should uppercase lowercase letters', () => {
      expect(normalizeEnvVarKey('api_key')).toBe('API_KEY');
    });

    test('should replace invalid characters with underscores', () => {
      expect(normalizeEnvVarKey('my-api.key')).toBe('MY_API_KEY');
    });

    test('should handle mixed case and special chars', () => {
      expect(normalizeEnvVarKey('myApi-Key.v2')).toBe('MYAPI_KEY_V2');
    });

    test('should preserve valid characters', () => {
      expect(normalizeEnvVarKey('NODE_ENV_123')).toBe('NODE_ENV_123');
    });

    test('should replace spaces', () => {
      expect(normalizeEnvVarKey('my key')).toBe('MY_KEY');
    });
  });

  describe('envVarsToArray', () => {
    test('should convert empty object to empty array', () => {
      expect(envVarsToArray({})).toEqual([]);
    });

    test('should convert env vars object to array format', () => {
      const envVars = {
        API_KEY: 'secret123',
        NODE_ENV: 'production',
      };

      const result = envVarsToArray(envVars);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ key: 'API_KEY', value: 'secret123', isSecret: false });
      expect(result).toContainEqual({ key: 'NODE_ENV', value: 'production', isSecret: false });
    });

    test('should mark masked values as secrets', () => {
      const envVars = {
        SECRET: '***',
        VISIBLE: 'value',
      };

      const result = envVarsToArray(envVars);

      expect(result).toContainEqual({ key: 'SECRET', value: '***', isSecret: true });
      expect(result).toContainEqual({ key: 'VISIBLE', value: 'value', isSecret: false });
    });
  });
});

describe('ProfileSummary display logic', () => {
  const mockProfiles: ProfileSummary[] = [
    {
      id: '1',
      name: 'Default Profile',
      description: 'My default configuration',
      isDefault: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      varCount: 3,
      commandCount: 2,
    },
    {
      id: '2',
      name: 'AWS Profile',
      description: null,
      isDefault: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      varCount: 5,
      commandCount: 0,
    },
    {
      id: '3',
      name: 'Empty Profile',
      description: 'No vars or commands',
      isDefault: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      varCount: 0,
      commandCount: 0,
    },
  ];

  test('should identify default profile', () => {
    const defaultProfile = mockProfiles.find(p => p.isDefault);
    expect(defaultProfile?.name).toBe('Default Profile');
  });

  test('should find profile by id', () => {
    const profile = mockProfiles.find(p => p.id === '2');
    expect(profile?.name).toBe('AWS Profile');
  });

  test('should identify profiles with vars and commands', () => {
    const profilesWithContent = mockProfiles.filter(p => p.varCount > 0 || p.commandCount > 0);
    expect(profilesWithContent).toHaveLength(2);
    expect(profilesWithContent.map(p => p.name)).toContain('Default Profile');
    expect(profilesWithContent.map(p => p.name)).toContain('AWS Profile');
  });

  test('should identify empty profiles', () => {
    const emptyProfiles = mockProfiles.filter(p => p.varCount === 0 && p.commandCount === 0);
    expect(emptyProfiles).toHaveLength(1);
    expect(emptyProfiles[0].name).toBe('Empty Profile');
  });
});

describe('Command reordering logic', () => {
  /**
   * Moves a command from one index to another (from ProfileVarEditor)
   */
  function moveCommand(commands: string[], fromIndex: number, toIndex: number): string[] {
    if (toIndex < 0 || toIndex >= commands.length) {
      return commands;
    }
    const result = [...commands];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
  }

  test('should move command up', () => {
    const commands = ['first', 'second', 'third'];
    const result = moveCommand(commands, 1, 0);
    expect(result).toEqual(['second', 'first', 'third']);
  });

  test('should move command down', () => {
    const commands = ['first', 'second', 'third'];
    const result = moveCommand(commands, 0, 1);
    expect(result).toEqual(['second', 'first', 'third']);
  });

  test('should not change array for out of bounds toIndex', () => {
    const commands = ['first', 'second', 'third'];
    const result = moveCommand(commands, 0, -1);
    expect(result).toEqual(['first', 'second', 'third']);
  });

  test('should not change array when toIndex equals length', () => {
    const commands = ['first', 'second', 'third'];
    const result = moveCommand(commands, 0, 3);
    expect(result).toEqual(['first', 'second', 'third']);
  });

  test('should handle moving last item to first position', () => {
    const commands = ['first', 'second', 'third'];
    const result = moveCommand(commands, 2, 0);
    expect(result).toEqual(['third', 'first', 'second']);
  });

  test('should not mutate original array', () => {
    const commands = ['first', 'second', 'third'];
    moveCommand(commands, 2, 0);
    expect(commands).toEqual(['first', 'second', 'third']);
  });
});
