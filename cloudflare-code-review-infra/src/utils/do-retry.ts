/**
 * Durable Object Retry Utility
 *
 * Provides retry logic for Durable Object operations based on Cloudflare's
 * documented .retryable property. When a DO operation fails with a retryable
 * error (e.g., during deployments), this utility will automatically retry
 * with exponential backoff.
 *
 * Adapted from cloud-agent/src/utils/do-retry.ts
 */

/**
 * Configuration for DO retry behavior
 */
export type DORetryConfig = {
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
};

const DEFAULT_CONFIG: DORetryConfig = {
  maxAttempts: 3,
  baseBackoffMs: 100,
  maxBackoffMs: 5000,
};

/**
 * Type for errors that may have Cloudflare's retryable property
 */
type RetryableError = Error & { retryable?: boolean };

/**
 * Check if an error is retryable based on Cloudflare's .retryable property.
 *
 * Per Cloudflare docs: JavaScript Errors with .retryable set to true are
 * suggested to be retried for idempotent operations.
 *
 * We only check the documented .retryable property, not error message strings,
 * as message formats are undocumented and could change.
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as RetryableError).retryable === true;
}

/**
 * Calculate backoff with jitter using exponential backoff formula.
 * Formula: min(maxBackoff, baseBackoff * random * 2^attempt)
 *
 * The random multiplier provides jitter to prevent thundering herd.
 */
function calculateBackoff(attempt: number, config: DORetryConfig): number {
  const exponentialBackoff = config.baseBackoffMs * Math.pow(2, attempt);
  const jitteredBackoff = exponentialBackoff * Math.random();
  return Math.min(config.maxBackoffMs, jitteredBackoff);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a Durable Object operation with retry logic.
 *
 * Creates a fresh stub for each retry attempt as recommended by Cloudflare,
 * since certain errors can break the stub.
 *
 * @param getStub - Function that returns a fresh DurableObjectStub
 * @param operation - Function that performs the DO operation using the stub
 * @param operationName - Name for logging purposes
 * @param config - Optional retry configuration override
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withDORetry(
 *   () => env.CODE_REVIEW_ORCHESTRATOR.get(id),
 *   (stub) => stub.start(params),
 *   'start'
 * );
 * ```
 */
export async function withDORetry<TStub, TResult>(
  getStub: () => TStub,
  operation: (stub: TStub) => Promise<TResult>,
  operationName: string,
  config: DORetryConfig = DEFAULT_CONFIG
): Promise<TResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      // Create fresh stub for each attempt
      const stub = getStub();
      return await operation(stub);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!isRetryableError(error)) {
        console.warn('[withDORetry] DO operation failed with non-retryable error', {
          operation: operationName,
          attempt: attempt + 1,
          error: lastError.message,
          retryable: false,
        });
        throw lastError;
      }

      // Check if we have retries left
      if (attempt + 1 >= config.maxAttempts) {
        console.error('[withDORetry] DO operation failed after all retry attempts', {
          operation: operationName,
          attempts: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate backoff and wait
      const backoffMs = calculateBackoff(attempt, config);
      console.warn('[withDORetry] DO operation failed, retrying', {
        operation: operationName,
        attempt: attempt + 1,
        backoffMs: Math.round(backoffMs),
        error: lastError.message,
      });

      await sleep(backoffMs);
    }
  }

  // TypeScript: This should never be reached, but satisfies the compiler
  throw lastError ?? new Error('Unexpected retry loop exit');
}
