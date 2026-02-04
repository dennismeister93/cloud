import * as z from 'zod';

/**
 * Reserved trigger IDs that cannot be used by users.
 * These are reserved for routing purposes in the UI.
 */
export const RESERVED_TRIGGER_IDS = [
  'new',
  'edit',
  'delete',
  'requests',
  'settings',
  'api',
  'admin',
] as const;

/**
 * Validation schema for trigger IDs.
 *
 * Requirements:
 * - 1-64 characters
 * - Lowercase alphanumeric with hyphens only
 * - Cannot be a reserved word
 */
export const triggerIdSchema = z
  .string()
  .min(1, 'Trigger ID is required')
  .max(64, 'Trigger ID must be 64 characters or less')
  .regex(/^[a-z0-9-]+$/, 'Trigger ID must be lowercase alphanumeric with hyphens')
  .refine(
    id => !RESERVED_TRIGGER_IDS.includes(id as (typeof RESERVED_TRIGGER_IDS)[number]),
    'This trigger ID is reserved'
  );

/**
 * Transform user input to a valid trigger ID format.
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes invalid characters
 */
export function normalizeTriggerId(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
