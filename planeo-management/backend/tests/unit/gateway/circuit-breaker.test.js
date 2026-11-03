import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBreaker } from '#modules/gateway/circuit-breaker.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('circuit breaker', () => {
  it('stays closed until the failure threshold is reached', () => {
    const breaker = createBreaker({ failureThreshold: 3, resetMs: 1000 });
    breaker.failure();
    breaker.failure();
    expect(breaker.allow()).toBe(true);
    breaker.failure();
    expect(breaker.allow()).toBe(false);
    expect(breaker.snapshot().state).toBe('open');
  });

  it('lets a single probe through once the reset window passes', () => {
    const breaker = createBreaker({ failureThreshold: 1, resetMs: 1000 });
    breaker.failure();
    expect(breaker.allow()).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(breaker.allow()).toBe(true);
    expect(breaker.allow()).toBe(false);
    expect(breaker.snapshot().state).toBe('half-open');
  });

  it('closes again when the probe succeeds', () => {
    const breaker = createBreaker({ failureThreshold: 1, resetMs: 1000 });
    breaker.failure();
    vi.advanceTimersByTime(1001);
    breaker.allow();
    breaker.success();
    expect(breaker.snapshot()).toMatchObject({ state: 'closed', failures: 0 });
    expect(breaker.allow()).toBe(true);
  });

  it('reopens immediately when the probe fails', () => {
    const breaker = createBreaker({ failureThreshold: 5, resetMs: 1000 });
    for (let i = 0; i < 5; i += 1) breaker.failure();
    vi.advanceTimersByTime(1001);
    breaker.allow();
    breaker.failure();
    expect(breaker.allow()).toBe(false);
    expect(breaker.snapshot().state).toBe('open');
  });

  it('reports how long callers should wait', () => {
    const breaker = createBreaker({ failureThreshold: 1, resetMs: 5000 });
    breaker.failure();
    expect(breaker.retryAfterSeconds()).toBe(5);
    vi.advanceTimersByTime(3000);
    expect(breaker.retryAfterSeconds()).toBe(2);
  });
});
