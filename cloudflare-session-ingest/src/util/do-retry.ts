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

declare const scheduler: undefined | { wait: (ms: number) => Promise<void> };

async function waitMs(ms: number): Promise<void> {
  // Cloudflare Workers provide scheduler.wait(); Node-based unit tests do not.
  if (typeof scheduler !== 'undefined' && scheduler) {
    await scheduler.wait(ms);
    return;
  }

  await new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a Durable Object operation with retry logic.
 *
 * Creates a fresh stub for each retry attempt as recommended by Cloudflare,
 * since certain errors can break the stub.
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
      const stub = getStub();
      return await operation(stub);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        console.warn('DO operation failed with non-retryable error', {
          operation: operationName,
          attempt: attempt + 1,
          error: lastError.message,
          retryable: false,
        });
        throw lastError;
      }

      if (attempt + 1 >= config.maxAttempts) {
        console.error('DO operation failed after all retry attempts', {
          operation: operationName,
          attempts: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      const backoffMs = calculateBackoff(attempt, config);
      console.warn('DO operation failed, retrying', {
        operation: operationName,
        attempt: attempt + 1,
        backoffMs: Math.round(backoffMs),
        error: lastError.message,
      });

      await waitMs(backoffMs);
    }
  }

  throw lastError ?? new Error('Unexpected retry loop exit');
}
