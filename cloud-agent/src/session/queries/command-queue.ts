/**
 * Command queue queries module for CloudAgentSession Durable Object.
 *
 * Provides type-safe SQL operations for the command queue, which stores
 * pending execution commands when an execution is already active.
 * The queue runner processes them sequentially in FIFO order.
 */

import {
  command_queue,
  QueuedCommandRecord,
  CountResult,
  type QueuedCommandRecordType,
} from '../../db/tables/index.js';

type SqlStorage = DurableObjectState['storage']['sql'];

// Destructure for convenient access to columns
const { columns: cols } = command_queue;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A queued command entry from the database */
export type QueuedCommand = QueuedCommandRecordType;

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create command queue queries for the CloudAgentSession Durable Object.
 *
 * @param sql - SqlStorage instance from the DO context
 * @returns Object with command queue query methods
 */
export function createCommandQueueQueries(sql: SqlStorage) {
  return {
    /**
     * Insert a new command into the queue.
     *
     * @param sessionId - Session ID this command belongs to
     * @param executionId - Execution ID for the command
     * @param messageJson - JSON stringified message payload
     * @returns The auto-generated row ID
     */
    enqueue(sessionId: string, executionId: string, messageJson: string): number {
      const now = Date.now();
      const result = sql.exec(
        `INSERT INTO ${command_queue} (${cols.session_id}, ${cols.execution_id}, ${cols.message_json}, ${cols.created_at})
         VALUES (?, ?, ?, ?)
         RETURNING ${cols.id}`,
        sessionId,
        executionId,
        messageJson,
        now
      );

      const row = [...result][0];
      return QueuedCommandRecord.pick({ id: true }).parse(row).id;
    },

    /**
     * Get the oldest queued command for a session (FIFO order).
     *
     * @param sessionId - Session ID to peek queue for
     * @returns The oldest queued command, or null if queue is empty
     */
    peekOldest(sessionId: string): QueuedCommand | null {
      const result = sql.exec(
        `SELECT ${command_queue.id}, ${command_queue.session_id}, ${command_queue.execution_id}, ${command_queue.message_json}, ${command_queue.created_at}
         FROM ${command_queue}
         WHERE ${command_queue.session_id} = ?
         ORDER BY ${command_queue.id} ASC
         LIMIT 1`,
        sessionId
      );

      const row = [...result][0];

      if (!row) return null;

      return QueuedCommandRecord.parse(row);
    },

    /**
     * Remove a specific command by ID (after processing).
     *
     * @param id - The command ID to remove
     */
    dequeueById(id: number): void {
      sql.exec(`DELETE FROM ${command_queue} WHERE ${command_queue.id} = ?`, id);
    },

    /**
     * Get total queued commands for a session.
     *
     * @param sessionId - Session ID to count queue for
     * @returns Number of queued commands
     */
    count(sessionId: string): number {
      const result = sql.exec(
        `SELECT COUNT(*) as count FROM ${command_queue} WHERE ${command_queue.session_id} = ?`,
        sessionId
      );
      const row = [...result][0];
      if (!row) return 0;
      return CountResult.parse(row).count;
    },

    /**
     * Cleanup old entries (for alarm-based cleanup).
     *
     * @param timestamp - Delete entries with created_at < this timestamp
     * @returns Number of entries deleted
     */
    deleteOlderThan(timestamp: number): number {
      const result = sql.exec(
        `DELETE FROM ${command_queue} WHERE ${command_queue.created_at} < ?`,
        timestamp
      );
      return result.rowsWritten;
    },

    /**
     * Delete expired entries for a specific session.
     * Used to purge stale commands before checking queue depth.
     *
     * @param sessionId - Session ID to purge expired entries for
     * @param expiryMs - Max age in milliseconds (default: 1 hour)
     * @returns Number of entries deleted
     */
    deleteExpired(sessionId: string, expiryMs: number = 60 * 60 * 1000): number {
      const cutoff = Date.now() - expiryMs;
      const result = sql.exec(
        `DELETE FROM ${command_queue} WHERE ${command_queue.session_id} = ? AND ${command_queue.created_at} < ?`,
        sessionId,
        cutoff
      );
      return result.rowsWritten;
    },
  };
}

// ---------------------------------------------------------------------------
// Type Export
// ---------------------------------------------------------------------------

/** Type of the command queue queries object returned by createCommandQueueQueries */
export type CommandQueueQueries = ReturnType<typeof createCommandQueueQueries>;
