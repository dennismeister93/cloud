/**
 * Command queue table schema for CloudAgentSession Durable Object.
 */

import { z } from 'zod';
import { getTableFromZodSchema } from '../../utils/table.js';

/**
 * Full command queue record schema.
 * Use for full-row queries like peekOldest().
 */
export const QueuedCommandRecord = z.object({
  id: z.number(),
  session_id: z.string(),
  execution_id: z.string(),
  message_json: z.string(),
  created_at: z.number(),
});

export type QueuedCommandRecord = z.infer<typeof QueuedCommandRecord>;

/**
 * Partial schemas for queries returning fewer columns.
 */
export const QueuedCommandIdOnly = QueuedCommandRecord.pick({ id: true });
export type QueuedCommandIdOnly = z.infer<typeof QueuedCommandIdOnly>;

/**
 * Table interpolator for type-safe SQL queries.
 *
 * @example
 * // Use command_queue.columns.* for INSERT column lists (unqualified)
 * const { columns: cols } = command_queue;
 * sql.exec(`INSERT INTO ${command_queue} (${cols.session_id}, ...) VALUES (?, ...)`, ...);
 *
 * // Use command_queue.* for SELECT/WHERE/ORDER (qualified)
 * sql.exec(`SELECT ${command_queue.id} FROM ${command_queue} WHERE ${command_queue.session_id} = ?`, ...);
 */
export const command_queue = getTableFromZodSchema('command_queue', QueuedCommandRecord);
