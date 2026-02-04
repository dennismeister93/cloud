import { z } from 'zod';
import { getTableFromZodSchema, getCreateTableQueryFromTable } from '../../util/table';
import { AttributionsMetadataRecord } from './attributions_metadata.table';

export type LinesRemovedRecord = z.infer<typeof LinesRemovedRecord>;
export const LinesRemovedRecord = z.object({
  id: z.number().int(),
  attributions_metadata_id: AttributionsMetadataRecord.shape.id,
  line_number: z.number().int(),
  line_hash: z.string(),
});

export type LinesRemovedInput = z.infer<typeof LinesRemovedInput>;
export const LinesRemovedInput = LinesRemovedRecord.omit({ id: true });

export const lines_removed = getTableFromZodSchema('lines_removed', LinesRemovedRecord);

export function createTableLinesRemoved(): string {
  return getCreateTableQueryFromTable(
    lines_removed,
    {
      id: /* sql */ `integer primary key autoincrement`,
      attributions_metadata_id: /* sql */ `integer not null`,
      line_number: /* sql */ `integer not null`,
      line_hash: /* sql */ `text not null`,
    },
    'sqlite'
  );
}

export function getIndexesLinesRemoved(): string[] {
  return [
    /* sql */ `create index if not exists idx_attribution_removed on ${lines_removed}(${lines_removed.columns.attributions_metadata_id})`,
    /* sql */ `create index if not exists idx_hash_removed on ${lines_removed}(${lines_removed.columns.line_hash})`,
  ];
}
