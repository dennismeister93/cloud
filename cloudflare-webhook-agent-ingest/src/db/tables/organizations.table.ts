import { getTable } from '../../util/table.js';

/**
 * Table definition for organizations.
 * Only includes columns needed for token minting (existence check).
 */
export const organizations = getTable({
  name: 'organizations',
  columns: ['id', 'name', 'created_at', 'deleted_at'] as const,
});

export type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
};
