import { DurableObject } from 'cloudflare:workers';

import type { Env } from '../env';
import type { IngestBatch } from '../types/session-sync';
import type { SessionDataItem } from '../types/session-sync';
import { getItemIdentity } from '../util/compaction';
import { buildSharedSessionSnapshot } from '../util/share-output';
import {
  extractNormalizedOrgIdFromItem,
  extractNormalizedParentIdFromItem,
  extractNormalizedPlatformFromItem,
  extractNormalizedTitleFromItem,
} from './session-ingest-extractors';

function writeIngestMetaIfChanged(
  sql: SqlStorage,
  params: { key: string; incomingValue: string | null | undefined }
): { changed: boolean; value: string | null } {
  if (params.incomingValue === undefined) {
    return { changed: false, value: null };
  }

  const existing = sql
    .exec<{
      value: string | null;
    }>('SELECT value FROM ingest_meta WHERE key = ? LIMIT 1', params.key)
    .toArray();
  const currentValue = existing[0]?.value ?? null;

  if (currentValue === params.incomingValue) {
    return { changed: false, value: params.incomingValue };
  }

  sql.exec(
    `
      INSERT INTO ingest_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    params.key,
    params.incomingValue
  );

  return { changed: true, value: params.incomingValue };
}

type IngestMetaKey = 'title' | 'parentId' | 'platform' | 'orgId';

const INGEST_META_EXTRACTORS: Array<{
  key: IngestMetaKey;
  extract: (item: IngestBatch[number]) => string | null | undefined;
}> = [
  { key: 'title', extract: extractNormalizedTitleFromItem },
  { key: 'parentId', extract: extractNormalizedParentIdFromItem },
  { key: 'platform', extract: extractNormalizedPlatformFromItem },
  { key: 'orgId', extract: extractNormalizedOrgIdFromItem },
];

type Changes = Array<{ name: IngestMetaKey; value: string | null }>;

export class SessionIngestDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;

    void state.blockConcurrencyWhile(async () => {
      this.initSchema();
    });
  }

  private initSchema() {
    if (this.initialized) {
      return;
    }

    this.sql.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS ingest_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL UNIQUE,
        item_type TEXT NOT NULL,
        item_data TEXT NOT NULL
      );
    `);

    this.sql.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS ingest_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    this.initialized = true;
  }

  async ingest(payload: IngestBatch): Promise<{
    changes: Changes;
  }> {
    this.initSchema();

    const incomingByKey: Record<IngestMetaKey, string | null | undefined> = {
      title: undefined,
      parentId: undefined,
      platform: undefined,
      orgId: undefined,
    };

    for (const item of payload) {
      const { item_id, item_type } = getItemIdentity(item);

      const itemDataJson = JSON.stringify(item.data);

      this.sql.exec(
        `
          INSERT INTO ingest_items (item_id, item_type, item_data)
          VALUES (?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            item_type = excluded.item_type,
            item_data = excluded.item_data
        `,
        item_id,
        item_type,
        itemDataJson
      );

      for (const extractor of INGEST_META_EXTRACTORS) {
        const maybeValue = extractor.extract(item);
        if (maybeValue !== undefined) {
          incomingByKey[extractor.key] = maybeValue;
        }
      }
    }

    const changes: Changes = [];

    for (const key of Object.keys(incomingByKey) as IngestMetaKey[]) {
      const meta = writeIngestMetaIfChanged(this.sql, {
        key,
        incomingValue: incomingByKey[key],
      });
      if (meta.changed) {
        changes.push({ name: key, value: meta.value });
      }
    }

    return {
      changes,
    };
  }

  async getAll(): Promise<string> {
    this.initSchema();

    const rows = this.sql
      .exec('SELECT item_id, item_type, item_data FROM ingest_items ORDER BY id')
      .toArray() as Array<{ item_id: string; item_type: string; item_data: string }>;

    const items: IngestBatch = [];
    for (const row of rows) {
      try {
        const parsedData: unknown = JSON.parse(row.item_data);

        // DB values are untyped; trust stored shape.
        items.push({
          type: row.item_type as SessionDataItem['type'],
          data: parsedData as SessionDataItem['data'],
        } as IngestBatch[number]);
      } catch {
        // Ignore corrupted rows; best-effort read.
      }
    }

    const snapshot = buildSharedSessionSnapshot(items);
    return JSON.stringify(snapshot);
  }

  async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();

    this.initialized = false;
  }
}

export function getSessionIngestDO(env: Env, params: { kiloUserId: string; sessionId: string }) {
  const doKey = `${params.kiloUserId}/${params.sessionId}`;
  const id = env.SESSION_INGEST_DO.idFromName(doKey);
  return env.SESSION_INGEST_DO.get(id);
}
