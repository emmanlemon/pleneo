import { describe, expect, it } from 'vitest';
import { backoffDelayMs, nextRunAt } from '#queue/backoff.js';

describe('backoff', () => {
  it('grows exponentially with bounded jitter', () => {
    const opts = { baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0.25 };
    for (const [attempt, expected] of [
      [1, 1000],
      [2, 2000],
      [3, 4000],
      [4, 8000],
    ]) {
      for (let i = 0; i < 25; i++) {
        const delay = backoffDelayMs(attempt, opts);
        expect(delay).toBeGreaterThanOrEqual(expected * 0.75);
        expect(delay).toBeLessThanOrEqual(expected * 1.25);
      }
    }
  });

  it('never exceeds the cap even with jitter', () => {
    for (let i = 0; i < 50; i++)
      expect(backoffDelayMs(40, { baseMs: 1000, maxMs: 30_000 })).toBeLessThanOrEqual(30_000);
  });

  it('treats attempt 0 like attempt 1 and produces a future run time', () => {
    expect(backoffDelayMs(0, { baseMs: 500, maxMs: 1000, jitter: 0 })).toBe(500);
    expect(nextRunAt(1, { baseMs: 500, maxMs: 1000, jitter: 0 }).getTime()).toBeGreaterThan(Date.now() + 400);
  });
});
