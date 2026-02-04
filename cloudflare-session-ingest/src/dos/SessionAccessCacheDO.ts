import { DurableObject } from 'cloudflare:workers';

import type { Env } from '../env';

/**
 * Strongly-consistent per-user cache of session ids.
 *
 * Keyed by kiloUserId (one instance per user).
 */
export class SessionAccessCacheDO extends DurableObject<Env> {
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
    if (this.initialized) return;

    this.sql.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY
      );
    `);

    this.initialized = true;
  }

  async has(sessionId: string): Promise<boolean> {
    this.initSchema();
    const rows = this.sql
      .exec('SELECT 1 AS ok FROM sessions WHERE session_id = ? LIMIT 1', sessionId)
      .toArray();
    return rows.length > 0;
  }

  async add(sessionId: string): Promise<void> {
    this.initSchema();
    this.sql.exec('INSERT OR IGNORE INTO sessions (session_id) VALUES (?)', sessionId);
  }

  async remove(sessionId: string): Promise<void> {
    this.initSchema();
    this.sql.exec('DELETE FROM sessions WHERE session_id = ?', sessionId);
  }
}

export function getSessionAccessCacheDO(env: Env, params: { kiloUserId: string }) {
  const id = env.SESSION_ACCESS_CACHE_DO.idFromName(params.kiloUserId);
  return env.SESSION_ACCESS_CACHE_DO.get(id);
}
