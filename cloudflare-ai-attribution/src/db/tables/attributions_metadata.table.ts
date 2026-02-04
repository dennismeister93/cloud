import { z } from 'zod';
import { getTableFromZodSchema, getCreateTableQueryFromTable } from '../../util/table';

export const AttributionsMetadataRecord = z.object({
  id: z.number().int(),
  user_id: z.string(),
  project_id: z.string(),
  organization_id: z.string().nullable(),
  branch: z.string(),
  file_path: z.string(),
  status: z.enum(['accepted', 'rejected']),
  task_id: z.string().nullable(),
  created_at: z.string(),
});

export const AttributionsMetadataInput = AttributionsMetadataRecord.omit({
  id: true,
  created_at: true,
});

const Accepted = AttributionsMetadataRecord.shape.status.enum.accepted;
const Rejected = AttributionsMetadataRecord.shape.status.enum.rejected;

export type AttributionsMetadataRecord = z.infer<typeof AttributionsMetadataRecord>;
export type AttributionsMetadataInput = z.infer<typeof AttributionsMetadataInput>;

export const attributions_metadata = getTableFromZodSchema(
  'attributions_metadata',
  AttributionsMetadataRecord
);

export function createTableAttributionMetadata(): string {
  return getCreateTableQueryFromTable(
    attributions_metadata,
    {
      id: /* sql */ `integer primary key autoincrement`,
      user_id: /* sql */ `text not null`,
      project_id: /* sql */ `text not null`,
      organization_id: /* sql */ `text`,
      branch: /* sql */ `text not null`,
      file_path: /* sql */ `text not null`,
      status: /* sql */ `text not null check(status in ('${Accepted}', '${Rejected}'))`,
      task_id: /* sql */ `text`,
      created_at: /* sql */ `text not null default current_timestamp`,
    },
    'sqlite'
  );
}

export function getIndexesAttributionMetadata(): string[] {
  return [
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_file_path ON ${attributions_metadata}(${attributions_metadata.columns.file_path})`,
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_created_at ON ${attributions_metadata}(${attributions_metadata.columns.created_at})`,
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_user_org ON ${attributions_metadata}(${attributions_metadata.columns.user_id}, ${attributions_metadata.columns.organization_id})`,
  ];
}
