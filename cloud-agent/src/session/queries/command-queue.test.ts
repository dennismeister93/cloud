/**
 * Tests for command queue queries module.
 *
 * Tests the SQL-backed command queue operations used by CloudAgentSession DO.
 * Uses a mock SqlStorage implementation to verify query behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCommandQueueQueries, type QueuedCommand } from './command-queue.js';

// ---------------------------------------------------------------------------
// Mock SqlStorage Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory SQL storage mock that simulates the basic behavior of
 * DurableObjectState.storage.sql for testing purposes.
 *
 * The SQL pattern matching is case-insensitive and checks for key patterns
 * that appear in the generated SQL. With table interpolators, queries use
 * the table name directly (e.g., "command_queue") and column names.
 */
function createMockSqlStorage() {
  // Simulate an auto-increment ID counter
  let nextId = 1;

  // In-memory store: Array of command queue entries
  const store: QueuedCommand[] = [];

  return {
    exec: (query: string, ...args: unknown[]) => {
      const sql = query.trim().toUpperCase();

      // INSERT INTO command_queue ... RETURNING id
      if (sql.includes('INSERT INTO') && sql.includes('COMMAND_QUEUE')) {
        const [sessionId, executionId, messageJson, createdAt] = args as [
          string,
          string,
          string,
          number,
        ];
        const id = nextId++;
        store.push({
          id,
          session_id: sessionId,
          execution_id: executionId,
          message_json: messageJson,
          created_at: createdAt,
        });
        // Return RETURNING id result
        return {
          [Symbol.iterator]: function* () {
            yield { id };
          },
        };
      }

      // SELECT ... FROM command_queue WHERE session_id = ? ORDER BY id ASC LIMIT 1
      if (sql.includes('SELECT') && sql.includes('COMMAND_QUEUE') && sql.includes('LIMIT 1')) {
        const [sessionId] = args as [string];
        const filtered = store
          .filter(entry => entry.session_id === sessionId)
          .sort((a, b) => a.id - b.id);
        const oldest = filtered[0] ?? null;
        return {
          [Symbol.iterator]: function* () {
            if (oldest) yield oldest;
          },
        };
      }

      // SELECT COUNT(*) as count FROM command_queue WHERE session_id = ?
      if (sql.includes('COUNT(*)') && sql.includes('COMMAND_QUEUE')) {
        const [sessionId] = args as [string];
        const count = store.filter(entry => entry.session_id === sessionId).length;
        return {
          [Symbol.iterator]: function* () {
            yield { count };
          },
        };
      }

      // DELETE FROM command_queue WHERE id = ?
      // Note: With table interpolators, the query includes the qualified column
      // e.g., DELETE FROM command_queue WHERE command_queue.id = ?
      if (
        sql.includes('DELETE') &&
        sql.includes('COMMAND_QUEUE') &&
        sql.includes('.ID') &&
        !sql.includes('SESSION_ID') &&
        !sql.includes('CREATED_AT')
      ) {
        const [id] = args as [number];
        const idx = store.findIndex(entry => entry.id === id);
        if (idx !== -1) {
          store.splice(idx, 1);
        }
        return { rowsWritten: idx !== -1 ? 1 : 0 };
      }

      // DELETE FROM command_queue WHERE session_id = ? AND created_at < ?
      // This is deleteExpired - has both session_id and created_at conditions
      if (
        sql.includes('DELETE') &&
        sql.includes('COMMAND_QUEUE') &&
        sql.includes('SESSION_ID') &&
        sql.includes('CREATED_AT')
      ) {
        const [sessionId, cutoff] = args as [string, number];
        const beforeCount = store.length;
        const toRemove = store.filter(
          entry => entry.session_id === sessionId && entry.created_at < cutoff
        );
        for (const entry of toRemove) {
          const idx = store.indexOf(entry);
          if (idx !== -1) store.splice(idx, 1);
        }
        const rowsWritten = beforeCount - store.length;
        return { rowsWritten };
      }

      // DELETE FROM command_queue WHERE created_at < ?
      // This is deleteOlderThan - only has created_at condition
      if (
        sql.includes('DELETE') &&
        sql.includes('COMMAND_QUEUE') &&
        sql.includes('CREATED_AT') &&
        !sql.includes('SESSION_ID')
      ) {
        const [timestamp] = args as [number];
        const beforeCount = store.length;
        const toRemove = store.filter(entry => entry.created_at < timestamp);
        for (const entry of toRemove) {
          const idx = store.indexOf(entry);
          if (idx !== -1) store.splice(idx, 1);
        }
        const rowsWritten = beforeCount - store.length;
        return { rowsWritten };
      }

      // Default: return empty iterator
      return {
        [Symbol.iterator]: function* () {},
        rowsWritten: 0,
      };
    },

    // Expose store for test assertions
    _getStore: () => store,
    _clear: () => {
      store.length = 0;
      nextId = 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCommandQueueQueries', () => {
  let mockSql: ReturnType<typeof createMockSqlStorage>;
  let queries: ReturnType<typeof createCommandQueueQueries>;

  beforeEach(() => {
    mockSql = createMockSqlStorage();
    queries = createCommandQueueQueries(
      mockSql as unknown as Parameters<typeof createCommandQueueQueries>[0]
    );
  });

  describe('enqueue', () => {
    it('inserts a new command and returns the generated ID', () => {
      const id = queries.enqueue('session-1', 'exec-1', '{"prompt":"Hello"}');

      expect(id).toBe(1);
      expect(mockSql._getStore()).toHaveLength(1);
      expect(mockSql._getStore()[0]).toMatchObject({
        id: 1,
        session_id: 'session-1',
        execution_id: 'exec-1',
        message_json: '{"prompt":"Hello"}',
      });
    });

    it('auto-increments IDs for multiple inserts', () => {
      const id1 = queries.enqueue('session-1', 'exec-1', '{"prompt":"First"}');
      const id2 = queries.enqueue('session-1', 'exec-2', '{"prompt":"Second"}');
      const id3 = queries.enqueue('session-2', 'exec-3', '{"prompt":"Third"}');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
      expect(mockSql._getStore()).toHaveLength(3);
    });

    it('sets created_at timestamp', () => {
      const before = Date.now();
      queries.enqueue('session-1', 'exec-1', '{}');
      const after = Date.now();

      const entry = mockSql._getStore()[0];
      expect(entry.created_at).toBeGreaterThanOrEqual(before);
      expect(entry.created_at).toBeLessThanOrEqual(after);
    });
  });

  describe('peekOldest', () => {
    it('returns null for empty queue', () => {
      const result = queries.peekOldest('session-1');
      expect(result).toBeNull();
    });

    it('returns the oldest entry for a session (FIFO order)', () => {
      queries.enqueue('session-1', 'exec-1', '{"order":"first"}');
      queries.enqueue('session-1', 'exec-2', '{"order":"second"}');
      queries.enqueue('session-1', 'exec-3', '{"order":"third"}');

      const oldest = queries.peekOldest('session-1');

      expect(oldest).not.toBeNull();
      expect(oldest!.execution_id).toBe('exec-1');
      expect(oldest!.message_json).toBe('{"order":"first"}');
    });

    it('only returns entries for the specified session', () => {
      queries.enqueue('session-1', 'exec-1', '{"session":"1"}');
      queries.enqueue('session-2', 'exec-2', '{"session":"2"}');

      const result1 = queries.peekOldest('session-1');
      const result2 = queries.peekOldest('session-2');

      expect(result1!.session_id).toBe('session-1');
      expect(result2!.session_id).toBe('session-2');
    });

    it('returns null for non-existent session', () => {
      queries.enqueue('session-1', 'exec-1', '{}');

      const result = queries.peekOldest('non-existent');
      expect(result).toBeNull();
    });

    it('does not remove the entry (peek semantics)', () => {
      queries.enqueue('session-1', 'exec-1', '{}');

      queries.peekOldest('session-1');
      queries.peekOldest('session-1');

      expect(mockSql._getStore()).toHaveLength(1);
    });
  });

  describe('dequeueById', () => {
    it('removes the entry with the specified ID', () => {
      queries.enqueue('session-1', 'exec-1', '{}');
      const id2 = queries.enqueue('session-1', 'exec-2', '{}');
      queries.enqueue('session-1', 'exec-3', '{}');

      queries.dequeueById(id2);

      const store = mockSql._getStore();
      expect(store).toHaveLength(2);
      expect(store.find(e => e.id === id2)).toBeUndefined();
    });

    it('does nothing for non-existent ID', () => {
      queries.enqueue('session-1', 'exec-1', '{}');

      // Should not throw
      queries.dequeueById(999);

      expect(mockSql._getStore()).toHaveLength(1);
    });

    it('correctly removes from queue after peek', () => {
      queries.enqueue('session-1', 'exec-1', '{"first":true}');
      queries.enqueue('session-1', 'exec-2', '{"second":true}');

      // Simulate the FIFO processing pattern used in onExecutionComplete
      const first = queries.peekOldest('session-1');
      expect(first).not.toBeNull();
      queries.dequeueById(first!.id);

      const second = queries.peekOldest('session-1');
      expect(second).not.toBeNull();
      expect(second!.execution_id).toBe('exec-2');
    });
  });

  describe('count', () => {
    it('returns 0 for empty queue', () => {
      expect(queries.count('session-1')).toBe(0);
    });

    it('returns correct count for session', () => {
      queries.enqueue('session-1', 'exec-1', '{}');
      queries.enqueue('session-1', 'exec-2', '{}');
      queries.enqueue('session-1', 'exec-3', '{}');

      expect(queries.count('session-1')).toBe(3);
    });

    it('counts only entries for the specified session', () => {
      queries.enqueue('session-1', 'exec-1', '{}');
      queries.enqueue('session-1', 'exec-2', '{}');
      queries.enqueue('session-2', 'exec-3', '{}');

      expect(queries.count('session-1')).toBe(2);
      expect(queries.count('session-2')).toBe(1);
      expect(queries.count('session-3')).toBe(0);
    });

    it('updates after dequeue', () => {
      const id1 = queries.enqueue('session-1', 'exec-1', '{}');
      queries.enqueue('session-1', 'exec-2', '{}');

      expect(queries.count('session-1')).toBe(2);

      queries.dequeueById(id1);

      expect(queries.count('session-1')).toBe(1);
    });
  });

  describe('deleteOlderThan', () => {
    it('returns 0 for empty queue', () => {
      const deleted = queries.deleteOlderThan(Date.now());
      expect(deleted).toBe(0);
    });

    it('deletes entries older than the timestamp', () => {
      // Manually inject entries with specific timestamps for testing
      const store = mockSql._getStore();
      const now = Date.now();

      store.push({
        id: 1,
        session_id: 'session-1',
        execution_id: 'exec-1',
        message_json: '{}',
        created_at: now - 3600000, // 1 hour ago
      });
      store.push({
        id: 2,
        session_id: 'session-1',
        execution_id: 'exec-2',
        message_json: '{}',
        created_at: now - 1800000, // 30 min ago
      });
      store.push({
        id: 3,
        session_id: 'session-1',
        execution_id: 'exec-3',
        message_json: '{}',
        created_at: now, // now
      });

      const cutoff = now - 1000000; // ~16 min ago
      const deleted = queries.deleteOlderThan(cutoff);

      // Should delete entries 1 and 2 (older than cutoff)
      expect(deleted).toBe(2);
      expect(store).toHaveLength(1);
      expect(store[0].id).toBe(3);
    });

    it('returns count of deleted entries', () => {
      const store = mockSql._getStore();
      const now = Date.now();

      // Add 5 old entries
      for (let i = 1; i <= 5; i++) {
        store.push({
          id: i,
          session_id: 'session-1',
          execution_id: `exec-${i}`,
          message_json: '{}',
          created_at: now - 100000,
        });
      }

      const deleted = queries.deleteOlderThan(now);
      expect(deleted).toBe(5);
    });

    it('deletes across all sessions', () => {
      const store = mockSql._getStore();
      const now = Date.now();

      store.push({
        id: 1,
        session_id: 'session-1',
        execution_id: 'exec-1',
        message_json: '{}',
        created_at: now - 100000,
      });
      store.push({
        id: 2,
        session_id: 'session-2',
        execution_id: 'exec-2',
        message_json: '{}',
        created_at: now - 100000,
      });

      const deleted = queries.deleteOlderThan(now);
      expect(deleted).toBe(2);
      expect(store).toHaveLength(0);
    });
  });

  describe('deleteExpired', () => {
    it('returns 0 for empty queue', () => {
      const deleted = queries.deleteExpired('session-1');
      expect(deleted).toBe(0);
    });

    it('deletes expired entries for specific session only', () => {
      const store = mockSql._getStore();
      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      store.push({
        id: 1,
        session_id: 'session-1',
        execution_id: 'exec-1',
        message_json: '{}',
        created_at: twoHoursAgo, // expired
      });
      store.push({
        id: 2,
        session_id: 'session-1',
        execution_id: 'exec-2',
        message_json: '{}',
        created_at: now, // not expired
      });
      store.push({
        id: 3,
        session_id: 'session-2',
        execution_id: 'exec-3',
        message_json: '{}',
        created_at: twoHoursAgo, // expired but different session
      });

      const deleted = queries.deleteExpired('session-1');

      expect(deleted).toBe(1);
      expect(store).toHaveLength(2);
      expect(store.find(e => e.id === 1)).toBeUndefined();
      expect(store.find(e => e.id === 2)).toBeDefined();
      expect(store.find(e => e.id === 3)).toBeDefined(); // different session, untouched
    });
  });

  describe('FIFO ordering', () => {
    it('maintains FIFO order even when entries have the same timestamp', () => {
      // The ID ordering guarantees FIFO even if timestamps collide
      queries.enqueue('session-1', 'first', '{}');
      queries.enqueue('session-1', 'second', '{}');
      queries.enqueue('session-1', 'third', '{}');

      const first = queries.peekOldest('session-1');
      expect(first!.execution_id).toBe('first');

      queries.dequeueById(first!.id);

      const second = queries.peekOldest('session-1');
      expect(second!.execution_id).toBe('second');

      queries.dequeueById(second!.id);

      const third = queries.peekOldest('session-1');
      expect(third!.execution_id).toBe('third');
    });
  });

  describe('session isolation', () => {
    it('operations on one session do not affect another', () => {
      queries.enqueue('session-1', 'exec-1-1', '{}');
      queries.enqueue('session-1', 'exec-1-2', '{}');
      queries.enqueue('session-2', 'exec-2-1', '{}');
      queries.enqueue('session-2', 'exec-2-2', '{}');
      queries.enqueue('session-2', 'exec-2-3', '{}');

      expect(queries.count('session-1')).toBe(2);
      expect(queries.count('session-2')).toBe(3);

      // Dequeue from session-1
      const oldest1 = queries.peekOldest('session-1');
      queries.dequeueById(oldest1!.id);

      // Session-2 should be unaffected
      expect(queries.count('session-1')).toBe(1);
      expect(queries.count('session-2')).toBe(3);

      // Session-2's oldest should be unchanged
      const oldest2 = queries.peekOldest('session-2');
      expect(oldest2!.execution_id).toBe('exec-2-1');
    });
  });
});
