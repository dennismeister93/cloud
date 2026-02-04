import { SqlStore } from '../SqlStore.js';
import type { Database, Transaction } from '../database.js';
import { kilocode_users, type UserForToken } from '../tables/kilocode-users.table.js';
import { organizations } from '../tables/organizations.table.js';
import { organization_memberships } from '../tables/organization-memberships.table.js';

// Bot user constants - must match kilocode-backend's src/lib/bot-users/types.ts
const WEBHOOK_BOT_ID_PREFIX = 'bot-webhook';
const WEBHOOK_BOT_EMAIL_SUFFIX = 'webhook-bot';
const WEBHOOK_BOT_DISPLAY_NAME = 'Webhook Bot';
const BOT_AVATAR_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyNCIgY3k9IjI0IiByPSIyNCIgZmlsbD0iIzY2NjY2NiIvPjwvc3ZnPg==';

export function generateBotUserId(organizationId: string): string {
  return `${WEBHOOK_BOT_ID_PREFIX}-${organizationId}`;
}

export function generateBotUserEmail(organizationId: string): string {
  return `${WEBHOOK_BOT_EMAIL_SUFFIX}-${organizationId}@kilocode.internal`;
}

/**
 * Generate a random hex string for api_token_pepper.
 * Uses Web Crypto API available in Workers.
 */
function generateApiTokenPepper(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random hex string for stripe_customer_id placeholder.
 */
function generateBotStripeCustomerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `bot_stripe_${Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

export type BotUserForToken = {
  id: string;
  api_token_pepper: string;
};

export class UserStore extends SqlStore {
  constructor(db: Database | Transaction) {
    super(db);
  }

  /**
   * Find a user by ID and return data needed for token minting.
   */
  async findUserForToken(userId: string): Promise<UserForToken | null> {
    const rows = await this.query(
      /* sql */ `
      SELECT ${kilocode_users.id}, ${kilocode_users.blocked_reason}, ${kilocode_users.api_token_pepper}
      FROM ${kilocode_users}
      WHERE ${kilocode_users.id} = $1
      LIMIT 1
    `,
      { 1: userId }
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as UserForToken;
    return row;
  }

  /**
   * Check if an organization exists and is not deleted.
   */
  async organizationExists(orgId: string): Promise<boolean> {
    const rows = await this.query(
      /* sql */ `
      SELECT ${organizations.id}
      FROM ${organizations}
      WHERE ${organizations.id} = $1
        AND ${organizations.deleted_at} IS NULL
      LIMIT 1
    `,
      { 1: orgId }
    );

    return rows.length > 0;
  }

  /**
   * Get or create a webhook bot user for an organization.
   * Returns the bot user with api_token_pepper.
   *
   * If the bot user exists but has NULL api_token_pepper, return it as-is (match backend behavior).
   */
  async ensureBotUserForOrg(orgId: string): Promise<BotUserForToken> {
    const botId = generateBotUserId(orgId);
    const botEmail = generateBotUserEmail(orgId);

    // Try to get existing bot user
    const existingRows = await this.query(
      /* sql */ `
      SELECT ${kilocode_users.id}, ${kilocode_users.api_token_pepper}
      FROM ${kilocode_users}
      WHERE ${kilocode_users.id} = $1
        AND ${kilocode_users.is_bot} = true
      LIMIT 1
    `,
      { 1: botId }
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0] as { id: string; api_token_pepper: string | null };

      // Ensure membership for existing bot (may have been deleted)
      await this.ensureBotIsOrgMember(existing.id, orgId);

      // If existing bot has api_token_pepper, use it; otherwise generate one
      if (existing.api_token_pepper) {
        return { id: existing.id, api_token_pepper: existing.api_token_pepper };
      }

      // Edge case: existing bot has NULL api_token_pepper (shouldn't happen for bots
      // created by this code, but handle defensively by updating the DB)
      const newPepper = generateApiTokenPepper();
      await this.query(
        /* sql */ `
        UPDATE ${kilocode_users}
        SET ${kilocode_users.columns.api_token_pepper} = $2
        WHERE ${kilocode_users.id} = $1
      `,
        { 1: existing.id, 2: newPepper }
      );

      return { id: existing.id, api_token_pepper: newPepper };
    }

    // Create new bot user
    const apiTokenPepper = generateApiTokenPepper();
    const stripeCustomerId = generateBotStripeCustomerId();

    await this.query(
      /* sql */ `
      INSERT INTO ${kilocode_users} (
        ${kilocode_users.columns.id},
        ${kilocode_users.columns.google_user_email},
        ${kilocode_users.columns.google_user_name},
        ${kilocode_users.columns.google_user_image_url},
        ${kilocode_users.columns.stripe_customer_id},
        ${kilocode_users.columns.is_bot},
        ${kilocode_users.columns.api_token_pepper}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      {
        1: botId,
        2: botEmail,
        3: WEBHOOK_BOT_DISPLAY_NAME,
        4: BOT_AVATAR_PLACEHOLDER,
        5: stripeCustomerId,
        6: true,
        7: apiTokenPepper,
      }
    );

    // Ensure bot is org member
    await this.ensureBotIsOrgMember(botId, orgId);

    return { id: botId, api_token_pepper: apiTokenPepper };
  }

  /**
   * Ensure bot user is a member of the organization.
   * Public so it can be called for both new and existing bots.
   */
  async ensureBotIsOrgMember(botUserId: string, orgId: string): Promise<void> {
    // Check if membership already exists
    const existingRows = await this.query(
      /* sql */ `
      SELECT ${organization_memberships.id}
      FROM ${organization_memberships}
      WHERE ${organization_memberships.organization_id} = $1
        AND ${organization_memberships.kilo_user_id} = $2
      LIMIT 1
    `,
      { 1: orgId, 2: botUserId }
    );

    if (existingRows.length > 0) {
      return; // Already a member
    }

    // Add bot as organization member with 'member' role
    await this.query(
      /* sql */ `
      INSERT INTO ${organization_memberships} (
        ${organization_memberships.columns.organization_id},
        ${organization_memberships.columns.kilo_user_id},
        ${organization_memberships.columns.role}
      ) VALUES ($1, $2, $3)
    `,
      { 1: orgId, 2: botUserId, 3: 'member' }
    );
  }
}
