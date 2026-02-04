import { z } from 'zod';
import { getTableFromZodSchema, getCreateTableQueryFromTable } from '../../util/table';
import { AttributionsMetadataRecord } from './attributions_metadata.table';

export type LinesAddedRecord = z.infer<typeof LinesAddedRecord>;
export const LinesAddedRecord = z.object({
  id: z.number().int(),
  attributions_metadata_id: AttributionsMetadataRecord.shape.id,
  line_number: z.number().int(),
  line_hash: z.string(),
});

export type LinesAddedInput = z.infer<typeof LinesAddedInput>;
export const LinesAddedInput = LinesAddedRecord.omit({ id: true });

export const lines_added = getTableFromZodSchema('lines_added', LinesAddedRecord);

export function createTableLinesAdded(): string {
  return getCreateTableQueryFromTable(
    lines_added,
    {
      id: /* sql */ `integer primary key autoincrement`,
      attributions_metadata_id: /* sql */ `integer not null`,
      line_number: /* sql */ `integer not null`,
      line_hash: /* sql */ `text not null`,
    },
    'sqlite'
  );
}

export function getIndexesLinesAdded(): string[] {
  return [
    /* sql */ `create index if not exists idx_attribution_added on ${lines_added}(${lines_added.columns.attributions_metadata_id})`,
    /* sql */ `create index if not exists idx_hash_added on ${lines_added}(${lines_added.columns.line_hash})`,
  ];
}
