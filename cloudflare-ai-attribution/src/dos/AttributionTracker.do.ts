/**
 * Durable Object for tracking AI attributions per file
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { logger } from '../util/logger';
import type { AttributionsMetadataInput } from '../db/tables/attributions_metadata.table';
import {
  attributions_metadata,
  AttributionsMetadataRecord,
  createTableAttributionMetadata,
  getIndexesAttributionMetadata,
} from '../db/tables/attributions_metadata.table';
import type { LinesAddedInput } from '../db/tables/lines_added.table';
import {
  createTableLinesAdded,
  getIndexesLinesAdded,
  lines_added,
  LinesAddedRecord,
} from '../db/tables/lines_added.table';
import type { LinesRemovedInput } from '../db/tables/lines_removed.table';
import {
  createTableLinesRemoved,
  getIndexesLinesRemoved,
  lines_removed,
  LinesRemovedRecord,
} from '../db/tables/lines_removed.table';
// import { WithLogTags } from 'workers-tagged-logger';
import type { AttributionsTrackRequestBody } from '../schemas';

export class AttributionTrackerDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    void this.ctx.blockConcurrencyWhile(async () => {
      this.initializeDatabase();
    });
  }

  private query<Query extends string>(query: Query, params: SqliteParams<Query>) {
    return this.sql.exec(query, ...(params as unknown[]));
  }

  /**
   * Initialize SQLite database schema
   */
  private initializeDatabase(): void {
    // Create attributions_metadata table
    this.query(createTableAttributionMetadata(), []);

    for (const idx of getIndexesAttributionMetadata()) {
      this.query(idx, []);
    }

    // Create lines_added table
    this.query(createTableLinesAdded(), []);

    for (const idx of getIndexesLinesAdded()) {
      this.query(idx, []);
    }

    // Create lines_removed table
    this.query(createTableLinesRemoved(), []);

    for (const idx of getIndexesLinesRemoved()) {
      this.query(idx, []);
    }

    logger.info('Database initialized');
  }

  clearAllData() {
    this.query(/* sql */ `delete from ${lines_added}`, []);
    this.query(/* sql */ `delete from ${lines_removed}`, []);
    this.query(/* sql */ `delete from ${attributions_metadata}`, []);
  }

  /**
   * Delete a single attribution record and its associated lines added/removed
   * @param id - The attribution metadata ID to delete
   * @returns true if the attribution was found and deleted, false if not found
   */
  deleteAttribution(id: number): boolean {
    // First check if the attribution exists
    const existing = this.query(
      /* sql */ `
        SELECT ${attributions_metadata.id}
        FROM ${attributions_metadata}
        WHERE ${attributions_metadata.id} = ?
      `,
      [id]
    ).toArray();

    if (existing.length === 0) {
      return false;
    }

    // Delete lines added for this attribution
    this.query(
      /* sql */ `
        DELETE FROM ${lines_added}
        WHERE ${lines_added.attributions_metadata_id} = ?
      `,
      [id]
    );

    // Delete lines removed for this attribution
    this.query(
      /* sql */ `
        DELETE FROM ${lines_removed}
        WHERE ${lines_removed.attributions_metadata_id} = ?
      `,
      [id]
    );

    // Delete the attribution metadata record
    this.query(
      /* sql */ `
        DELETE FROM ${attributions_metadata}
        WHERE ${attributions_metadata.id} = ?
      `,
      [id]
    );

    logger.info('Attribution deleted', { id });

    return true;
  }

  insertAttributionMetadata(data: AttributionsMetadataInput): AttributionsMetadataRecord {
    const [result] = this.query(
      /* sql */ `
insert into ${attributions_metadata} (
  ${attributions_metadata.columns.user_id},
  ${attributions_metadata.columns.project_id},
  ${attributions_metadata.columns.organization_id},
  ${attributions_metadata.columns.branch},
  ${attributions_metadata.columns.file_path},
  ${attributions_metadata.columns.status},
  ${attributions_metadata.columns.task_id}
) values (?, ?, ?, ?, ?, ?, ?)
returning *
       `,
      [
        data.user_id,
        data.project_id,
        data.organization_id,
        data.branch,
        data.file_path,
        data.status,
        data.task_id,
      ]
    ).toArray();

    return AttributionsMetadataRecord.parse(result);
  }

  insertLinesAdded(data: LinesAddedInput) {
    const [result] = this.query(
      /* sql */ `
insert into ${lines_added} (
  ${lines_added.columns.attributions_metadata_id},
  ${lines_added.columns.line_number},
  ${lines_added.columns.line_hash}
) values (?, ?, ?)
returning *
       `,
      [data.attributions_metadata_id, data.line_number, data.line_hash]
    );

    return LinesAddedRecord.parse(result);
  }

  insertLinesRemoved(data: LinesRemovedInput) {
    const [result] = this.query(
      /* sql */ `
insert into ${lines_removed} (
  ${lines_removed.columns.attributions_metadata_id},
  ${lines_removed.columns.line_number},
  ${lines_removed.columns.line_hash}
) values (?, ?, ?)
returning *
       `,
      [data.attributions_metadata_id, data.line_number, data.line_hash]
    );

    return LinesRemovedRecord.parse(result);
  }

  /**
   * Track a new attribution
   */
  async trackAttribution(
    params: AttributionsTrackRequestBody & { user_id: string; organization_id: string }
  ): Promise<AttributionsMetadataRecord & { linesAdded: number; linesRemoved: number }> {
    const metadata = this.insertAttributionMetadata(params);
    const attributionId = metadata.id;

    // Insert lines added
    for (const line of params.lines_added) {
      this.insertLinesAdded({
        attributions_metadata_id: attributionId,
        line_number: line.line_number,
        line_hash: line.line_hash,
      });
    }

    // Insert lines removed
    for (const line of params.lines_removed) {
      this.insertLinesRemoved({
        attributions_metadata_id: attributionId,
        line_number: line.line_number,
        line_hash: line.line_hash,
      });
    }

    logger.info('Attribution tracked', {
      ...metadata,
      linesAdded: params.lines_added.length,
      linesRemoved: params.lines_removed.length,
    });

    return {
      ...metadata,
      linesAdded: params.lines_added.length,
      linesRemoved: params.lines_removed.length,
    };
  }

  /**
   * Get all lines added grouped by hash where the attribution status is 'accepted'
   * Returns an object where keys are line hashes and values are arrays of line numbers
   * @param branch - Optional branch name to filter by. If not provided, returns lines from all branches.
   * @deprecated Use getAttributionEvents() for flexible retention calculation
   */
  getLinesAddedByHash(branch?: string): Record<string, number[]> {
    // Use GLOB pattern: specific branch or '*' to match all branches
    const branchPattern = branch ?? '*';

    const rows = this.query(
      /* sql */ `
        SELECT ${lines_added.line_hash}, ${lines_added.line_number}
        FROM ${lines_added}
        INNER JOIN ${attributions_metadata} ON ${lines_added.attributions_metadata_id} = ${attributions_metadata.id}
        WHERE ${attributions_metadata.status} = 'accepted'
          AND ${attributions_metadata.branch} GLOB ?
        ORDER BY ${lines_added.line_hash}, ${lines_added.line_number}
      `,
      [branchPattern]
    ).toArray();

    const result: Record<string, number[]> = {};

    for (const row of rows) {
      const parsed = z
        .object({
          line_hash: z.string(),
          line_number: z.number(),
        })
        .parse(row);

      if (!result[parsed.line_hash]) {
        result[parsed.line_hash] = [];
      }
      result[parsed.line_hash].push(parsed.line_number);
    }

    return result;
  }

  /**
   * Get all attribution events with their ordered line hashes.
   * This is the preferred method for flexible retention calculation using LCS.
   *
   * Returns an array of attribution events, each containing:
   * - id: The attribution metadata ID
   * - taskId: The task ID associated with this attribution (if any)
   * - lineHashes: Ordered array of line hashes from the AI-generated code
   *
   * @param branch - Optional branch name to filter by. If not provided, returns events from all branches.
   */
  getAttributionEvents(
    branch?: string
  ): Array<{ id: number; taskId: string | null; lineHashes: string[] }> {
    // Use GLOB pattern: specific branch or '*' to match all branches
    const branchPattern = branch ?? '*';

    // First, get all accepted attribution metadata records
    const metadataRows = this.query(
      /* sql */ `
        SELECT ${attributions_metadata.id}, ${attributions_metadata.task_id}
        FROM ${attributions_metadata}
        WHERE ${attributions_metadata.status} = 'accepted'
          AND ${attributions_metadata.branch} GLOB ?
        ORDER BY ${attributions_metadata.created_at} ASC
      `,
      [branchPattern]
    ).toArray();

    const MetadataRow = z.object({
      id: z.number(),
      task_id: z.string().nullable(),
    });

    const result: Array<{ id: number; taskId: string | null; lineHashes: string[] }> = [];

    for (const metadataRow of metadataRows) {
      const metadata = MetadataRow.parse(metadataRow);

      // Get ordered line hashes for this attribution event
      const lineRows = this.query(
        /* sql */ `
          SELECT ${lines_added.line_hash}
          FROM ${lines_added}
          WHERE ${lines_added.attributions_metadata_id} = ?
          ORDER BY ${lines_added.line_number} ASC
        `,
        [metadata.id]
      ).toArray();

      const LineRow = z.object({
        line_hash: z.string(),
      });

      const lineHashes = lineRows.map(row => LineRow.parse(row).line_hash);

      result.push({
        id: metadata.id,
        taskId: metadata.task_id,
        lineHashes,
      });
    }

    return result;
  }

  /**
   * Get all data from the DO for debugging purposes.
   * Returns all attribution metadata records with their associated lines added/removed.
   */
  getDebugData(): {
    attributions: Array<
      AttributionsMetadataRecord & {
        lines_added: LinesAddedRecord[];
        lines_removed: LinesRemovedRecord[];
      }
    >;
    summary: {
      total_attributions: number;
      total_lines_added: number;
      total_lines_removed: number;
      by_status: Record<string, number>;
      by_branch: Record<string, number>;
    };
  } {
    // Get all attribution metadata
    const metadataRows = this.query(
      /* sql */ `
          SELECT *
          FROM ${attributions_metadata}
          ORDER BY ${attributions_metadata.created_at} DESC
        `,
      []
    ).toArray();

    const attributions: Array<
      AttributionsMetadataRecord & {
        lines_added: LinesAddedRecord[];
        lines_removed: LinesRemovedRecord[];
      }
    > = [];

    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const byStatus: Record<string, number> = {};
    const byBranch: Record<string, number> = {};

    for (const row of metadataRows) {
      const metadata = AttributionsMetadataRecord.parse(row);

      // Count by status
      byStatus[metadata.status] = (byStatus[metadata.status] || 0) + 1;

      // Count by branch
      byBranch[metadata.branch] = (byBranch[metadata.branch] || 0) + 1;

      // Get lines added for this attribution
      const linesAddedRows = this.query(
        /* sql */ `
            SELECT *
            FROM ${lines_added}
            WHERE ${lines_added.attributions_metadata_id} = ?
            ORDER BY ${lines_added.line_number} ASC
          `,
        [metadata.id]
      ).toArray();

      const linesAddedParsed = linesAddedRows.map(r => LinesAddedRecord.parse(r));
      totalLinesAdded += linesAddedParsed.length;

      // Get lines removed for this attribution
      const linesRemovedRows = this.query(
        /* sql */ `
            SELECT *
            FROM ${lines_removed}
            WHERE ${lines_removed.attributions_metadata_id} = ?
            ORDER BY ${lines_removed.line_number} ASC
          `,
        [metadata.id]
      ).toArray();

      const linesRemovedParsed = linesRemovedRows.map(r => LinesRemovedRecord.parse(r));
      totalLinesRemoved += linesRemovedParsed.length;

      attributions.push({
        ...metadata,
        lines_added: linesAddedParsed,
        lines_removed: linesRemovedParsed,
      });
    }

    return {
      attributions,
      summary: {
        total_attributions: metadataRows.length,
        total_lines_added: totalLinesAdded,
        total_lines_removed: totalLinesRemoved,
        by_status: byStatus,
        by_branch: byBranch,
      },
    };
  }
}

/**
 * Helper function to get a properly typed Durable Object stub
 */
export function getAttributionTrackerDO(
  env: Env,
  params: {
    organization_id: string;
    project_id: string;
    file_path: string;
  }
): DurableObjectStub<AttributionTrackerDO> {
  const doKey = `${params.organization_id}/${params.project_id}/${params.file_path}`;
  const id = env.ATTRIBUTION_TRACKER.idFromName(doKey);
  return env.ATTRIBUTION_TRACKER.get(id);
}

/**
 * CountOccurrences type counts the number of times a SubString appears in a String_.
 * It uses a recursive approach with a counter represented as an array of unknown.
 *
 * @template String_ The main string literal type.
 * @template SubString The substring literal type to count.
 * @template Count The counter array (internal use).
 */
type CountOccurrences<
  String_ extends string,
  SubString extends string,
  Count extends unknown[] = [],
> =
  // Check if String_ starts with any string, followed by SubString, followed by the rest (Tail)
  String_ extends `${string}${SubString}${infer Tail}`
    ? // If true, recurse with Tail and increment the counter array
      CountOccurrences<Tail, SubString, [unknown, ...Count]>
    : // If false, return the length of the counter array (the final count)
      Count['length'];

// A helper type for creating an N-length array/tuple
type Tuple<T, N extends number, Acc extends T[] = []> = Acc['length'] extends N
  ? Acc
  : Tuple<T, N, [...Acc, T]>;

type SqliteParams<Query extends string> = Tuple<unknown, CountOccurrences<Query, '?'>>;
