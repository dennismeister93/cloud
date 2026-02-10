export const DEFAULT_TTFB_THRESHOLD_MS = '3000';
export const DEFAULT_MIN_REQUESTS = '10';

/** Hardcoded SLO sent to the backend: 95% of requests should be under the threshold. */
export const TTFB_SLO = 0.95;

export function formatMs(value: number): string {
  return `${Math.round(value).toLocaleString()}ms`;
}
