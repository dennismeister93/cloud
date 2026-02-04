import { getTable } from '../../util/table.js';

/**
 * Table definition for agent_environment_profiles.
 * Only includes columns needed for profile resolution.
 */
export const agent_environment_profiles = getTable({
  name: 'agent_environment_profiles',
  columns: [
    'id',
    'owned_by_organization_id',
    'owned_by_user_id',
    'name',
    'description',
    'is_default',
    'created_at',
    'updated_at',
  ] as const,
});

export type AgentEnvironmentProfileRow = {
  id: string;
  owned_by_organization_id: string | null;
  owned_by_user_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Table definition for agent_environment_profile_vars.
 */
export const agent_environment_profile_vars = getTable({
  name: 'agent_environment_profile_vars',
  columns: ['id', 'profile_id', 'key', 'value', 'is_secret', 'created_at', 'updated_at'] as const,
});

export type AgentEnvironmentProfileVarRow = {
  id: string;
  profile_id: string;
  key: string;
  value: string;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Table definition for agent_environment_profile_commands.
 */
export const agent_environment_profile_commands = getTable({
  name: 'agent_environment_profile_commands',
  columns: ['id', 'profile_id', 'sequence', 'command', 'created_at'] as const,
});

export type AgentEnvironmentProfileCommandRow = {
  id: string;
  profile_id: string;
  sequence: number;
  command: string;
  created_at: string;
};
