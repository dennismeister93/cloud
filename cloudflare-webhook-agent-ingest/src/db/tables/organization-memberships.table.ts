import { getTable } from '../../util/table.js';

/**
 * Table definition for organization_memberships.
 * Used to add bot users to organizations.
 */
export const organization_memberships = getTable({
  name: 'organization_memberships',
  columns: [
    'id',
    'organization_id',
    'kilo_user_id',
    'role',
    'joined_at',
    'invited_by',
    'created_at',
    'updated_at',
  ] as const,
});

export type OrganizationMembershipRow = {
  id: string;
  organization_id: string;
  kilo_user_id: string;
  role: string;
  joined_at: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};
