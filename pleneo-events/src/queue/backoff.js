import { config } from '#config';

export function backoffDelayMs(
  attempt,
  { baseMs = config.BACKOFF_BASE_MS, factor = 2, maxMs = config.BACKOFF_MAX_MS, jitter = 0.25 } = {},
) {
  const exponential = Math.min(baseMs * factor ** Math.max(0, attempt - 1), maxMs);
  const spread = exponential * jitter;
  return Math.round(Math.min(maxMs, exponential - spread + Math.random() * 2 * spread));
}

export const nextRunAt = (attempt, options) => new Date(Date.now() + backoffDelayMs(attempt, options));
