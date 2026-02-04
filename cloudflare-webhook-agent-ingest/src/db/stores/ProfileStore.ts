import { SqlStore } from '../SqlStore.js';
import type { Database, Transaction } from '../database.js';
import {
  agent_environment_profiles,
  agent_environment_profile_vars,
  agent_environment_profile_commands,
  type AgentEnvironmentProfileRow,
  type AgentEnvironmentProfileVarRow,
  type AgentEnvironmentProfileCommandRow,
} from '../tables/agent-environment-profiles.table.js';

/**
 * Resolved profile configuration for use in webhook processing.
 */
export type ResolvedProfileConfig = {
  envVars: Record<string, string>;
  encryptedSecrets: Record<
    string,
    {
      encryptedData: string;
      encryptedDEK: string;
      algorithm: 'rsa-aes-256-gcm';
      version: 1;
    }
  >;
  setupCommands: string[];
};

/**
 * Store for resolving agent environment profiles via Hyperdrive.
 */
export class ProfileStore extends SqlStore {
  constructor(db: Database | Transaction) {
    super(db);
  }

  /**
   * Get a profile by ID.
   */
  async getProfileById(profileId: string): Promise<AgentEnvironmentProfileRow | null> {
    const rows = await this.query(
      /* sql */ `
      SELECT ${agent_environment_profiles.id},
             ${agent_environment_profiles.owned_by_organization_id},
             ${agent_environment_profiles.owned_by_user_id},
             ${agent_environment_profiles.name},
             ${agent_environment_profiles.description},
             ${agent_environment_profiles.is_default},
             ${agent_environment_profiles.created_at},
             ${agent_environment_profiles.updated_at}
      FROM ${agent_environment_profiles}
      WHERE ${agent_environment_profiles.id} = $1
      LIMIT 1
    `,
      { 1: profileId }
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as AgentEnvironmentProfileRow;
  }

  /**
   * Get all variables for a profile.
   */
  async getProfileVars(profileId: string): Promise<AgentEnvironmentProfileVarRow[]> {
    const rows = await this.query(
      /* sql */ `
      SELECT ${agent_environment_profile_vars.id},
             ${agent_environment_profile_vars.profile_id},
             ${agent_environment_profile_vars.key},
             ${agent_environment_profile_vars.value},
             ${agent_environment_profile_vars.is_secret},
             ${agent_environment_profile_vars.created_at},
             ${agent_environment_profile_vars.updated_at}
      FROM ${agent_environment_profile_vars}
      WHERE ${agent_environment_profile_vars.profile_id} = $1
    `,
      { 1: profileId }
    );

    return rows as AgentEnvironmentProfileVarRow[];
  }

  /**
   * Get all commands for a profile, ordered by sequence.
   */
  async getProfileCommands(profileId: string): Promise<AgentEnvironmentProfileCommandRow[]> {
    const rows = await this.query(
      /* sql */ `
      SELECT ${agent_environment_profile_commands.id},
             ${agent_environment_profile_commands.profile_id},
             ${agent_environment_profile_commands.sequence},
             ${agent_environment_profile_commands.command},
             ${agent_environment_profile_commands.created_at}
      FROM ${agent_environment_profile_commands}
      WHERE ${agent_environment_profile_commands.profile_id} = $1
      ORDER BY ${agent_environment_profile_commands.sequence} ASC
    `,
      { 1: profileId }
    );

    return rows as AgentEnvironmentProfileCommandRow[];
  }

  /**
   * Resolve a profile by ID and return the full configuration.
   * Returns null if profile not found.
   *
   * @param profileId - The profile UUID
   * @param ownerUserId - If provided, validates the profile is owned by this user
   * @param ownerOrgId - If provided, validates the profile is owned by this org
   */
  async resolveProfile(
    profileId: string,
    ownerUserId?: string | null,
    ownerOrgId?: string | null
  ): Promise<ResolvedProfileConfig | null> {
    const profile = await this.getProfileById(profileId);

    if (!profile) {
      return null;
    }

    // Validate ownership if specified
    if (ownerOrgId) {
      // For org triggers, profile must be owned by the org
      if (profile.owned_by_organization_id !== ownerOrgId) {
        return null;
      }
    } else if (ownerUserId) {
      // For user triggers, profile must be owned by the user
      if (profile.owned_by_user_id !== ownerUserId) {
        return null;
      }
    }

    const [vars, commands] = await Promise.all([
      this.getProfileVars(profileId),
      this.getProfileCommands(profileId),
    ]);

    const envVars: Record<string, string> = {};
    const encryptedSecrets: ResolvedProfileConfig['encryptedSecrets'] = {};

    for (const variable of vars) {
      if (variable.is_secret) {
        // Secrets are stored as JSON strings in the database
        try {
          const parsed = JSON.parse(variable.value) as {
            encryptedData: string;
            encryptedDEK: string;
            algorithm: 'rsa-aes-256-gcm';
            version: 1;
          };
          encryptedSecrets[variable.key] = parsed;
        } catch {
          // Skip malformed secrets
          console.error('Failed to parse encrypted secret', {
            profileId,
            key: variable.key,
          });
        }
      } else {
        envVars[variable.key] = variable.value;
      }
    }

    const setupCommands = commands.map(cmd => cmd.command);

    return {
      envVars,
      encryptedSecrets,
      setupCommands,
    };
  }
}
