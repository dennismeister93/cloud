import { WorkersLogger } from 'workers-tagged-logger';

/**
 * Tag types for structured logging across db-proxy
 */
export type DbProxyTags = {
  // Core identifier (primary search key)
  appId?: string;

  // Request context
  source?: string; // 'runtime' | 'admin'
  operation?: string; // 'query' | 'batch' | 'provision' | 'credentials' | 'schema' | 'export'
};

/**
 * Global logger instance for db-proxy
 */
export const logger = new WorkersLogger<DbProxyTags>({
  minimumLogLevel: 'debug',
  debug: false,
});

export { withLogTags, WithLogTags } from 'workers-tagged-logger';

/**
 * Format an error for structured logging with message and optional stack trace
 */
export function formatError(error: unknown): { error: string; stack?: string } {
  if (error instanceof Error) {
    return { error: error.message, stack: error.stack };
  }
  return { error: String(error) };
}
