import { z } from 'zod';
import { getTableFromZodSchema, getCreateTableQueryFromTable } from '../../util/table';

/**
 * Processing status for captured webhook requests
 */
export const ProcessStatus = z.enum(['captured', 'inprogress', 'success', 'failed']);
export type ProcessStatus = z.infer<typeof ProcessStatus>;

/**
 * Full request record as stored in SQLite
 */
export const RequestRecord = z.object({
  id: z.string(),
  timestamp: z.string(),
  method: z.string(),
  path: z.string(),
  query_string: z.string().nullable(), // Query string from URL (e.g., "foo=bar&baz=qux")
  headers: z.string(), // JSON-stringified headers object
  body: z.string(),
  content_type: z.string().nullable(),
  source_ip: z.string().nullable(),
  created_at: z.number().int(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  process_status: ProcessStatus,
  cloud_agent_session_id: z.string().nullable(),
  error_message: z.string().nullable(),
});

export type RequestRecord = z.infer<typeof RequestRecord>;

/**
 * Input for inserting a new request (excludes auto-generated fields)
 */
export const RequestInput = RequestRecord.omit({
  created_at: true,
});

export type RequestInput = z.infer<typeof RequestInput>;

/**
 * Updatable fields for a request
 */
export const RequestUpdates = z.object({
  process_status: ProcessStatus.optional(),
  cloud_agent_session_id: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  error_message: z.string().optional(),
});

export type RequestUpdates = z.infer<typeof RequestUpdates>;

/**
 * Table query interpolator for type-safe SQL queries
 */
export const requests = getTableFromZodSchema('requests', RequestRecord);

/**
 * Get the CREATE TABLE statement for the requests table
 */
export function createTableRequests(): string {
  return getCreateTableQueryFromTable(requests, {
    id: /* sql */ `text primary key`,
    timestamp: /* sql */ `text not null`,
    method: /* sql */ `text not null`,
    path: /* sql */ `text not null`,
    query_string: /* sql */ `text`,
    headers: /* sql */ `text not null`,
    body: /* sql */ `text not null`,
    content_type: /* sql */ `text`,
    source_ip: /* sql */ `text`,
    created_at: /* sql */ `integer default (unixepoch())`,
    started_at: /* sql */ `text`,
    completed_at: /* sql */ `text`,
    process_status: /* sql */ `text default 'captured' check(process_status in ('captured', 'inprogress', 'success', 'failed'))`,
    cloud_agent_session_id: /* sql */ `text`,
    error_message: /* sql */ `text`,
  });
}

/**
 * Get the CREATE INDEX statements for the requests table
 */
export function getIndexesRequests(): string[] {
  return [
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON ${requests.toString()}(${requests.columns.timestamp} DESC)`,
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_requests_status ON ${requests.toString()}(${requests.columns.process_status})`,
    /* sql */ `CREATE INDEX IF NOT EXISTS idx_requests_session ON ${requests.toString()}(${requests.columns.cloud_agent_session_id})`,
  ];
}
