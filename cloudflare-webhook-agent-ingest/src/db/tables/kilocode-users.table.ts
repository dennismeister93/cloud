import { getTable } from '../../util/table.js';

/**
 * Table definition for kilocode_users.
 * Only includes columns needed for token minting.
 */
export const kilocode_users = getTable({
  name: 'kilocode_users',
  columns: [
    'id',
    'google_user_email',
    'google_user_name',
    'google_user_image_url',
    'created_at',
    'updated_at',
    'blocked_reason',
    'api_token_pepper',
    'is_bot',
    'stripe_customer_id',
  ] as const,
});

export type KilocodeUserRow = {
  id: string;
  google_user_email: string;
  google_user_name: string;
  google_user_image_url: string;
  created_at: string;
  updated_at: string;
  blocked_reason: string | null;
  api_token_pepper: string | null;
  is_bot: boolean;
  stripe_customer_id: string;
};

/**
 * Minimal user data needed for token minting
 */
export type UserForToken = {
  id: string;
  blocked_reason: string | null;
  api_token_pepper: string | null;
};
