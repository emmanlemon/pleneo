import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/messaging/outbox.repository.js');

const outbox = await import('#infra/messaging/outbox.repository.js');
const { backoffMs, relayOutbox } = await import('#infra/messaging/outbox.relay.js');
const { publishEvent, serviceToken, invalidateServiceToken } = await import('#infra/messaging/events-client.js');

const row = (overrides = {}) => ({
  id: 1,
  event_type: 'project.created',
  payload: { projectId: 'p1' },
  idempotency_key: 'project.created:p1',
  attempts: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  outbox.markPublished.mockResolvedValue();
  outbox.markFailed.mockResolvedValue();
  invalidateServiceToken();
});

describe('relayOutbox', () => {
  it('publishes claimed rows with their idempotency key and marks them published', async () => {
    outbox.claimPending.mockResolvedValue([row(), row({ id: 2, idempotency_key: 'k2' })]);
    const publish = vi.fn().mockResolvedValue({ eventId: 'evt-1' });
    const result = await relayOutbox({ publish });
    expect(result).toEqual({ claimed: 2, published: 2 });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project.created',
        idempotencyKey: 'project.created:p1',
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(outbox.markPublished).toHaveBeenCalledWith(tx, 1, 'evt-1');
  });

  it('applies exponential backoff on failure without blocking other rows', async () => {
    outbox.claimPending.mockResolvedValue([row({ attempts: 2 }), row({ id: 2, idempotency_key: 'k2' })]);
    const publish = vi.fn().mockRejectedValueOnce(new Error('events down')).mockResolvedValueOnce({ eventId: 'evt-2' });
    const result = await relayOutbox({ publish });
    expect(result).toEqual({ claimed: 2, published: 1 });
    const [, id, failure] = outbox.markFailed.mock.calls[0];
    expect(id).toBe(1);
    expect(failure.attempts).toBe(3);
    expect(failure.error).toBe('events down');
    expect(failure.nextAttemptAt.getTime() - Date.now()).toBeGreaterThanOrEqual(backoffMs(3) - 50);
  });

  it('caps the backoff', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(4)).toBe(40_000);
    expect(backoffMs(30)).toBe(3_600_000);
  });
});

describe('events client', () => {
  it('caches the client-credentials token and refreshes after a 401', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const tokenResponse = (token) => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: token, expires_in: 900 }),
    });
    fetchMock
      .mockResolvedValueOnce(tokenResponse('t1'))
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(tokenResponse('t2'))
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ eventId: 'evt' }) });

    const result = await publishEvent({ type: 'project.created', payload: {}, idempotencyKey: 'k' });
    expect(result.eventId).toBe('evt');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/v1/oauth/token');
    expect(fetchMock.mock.calls[3][1].headers.authorization).toBe('Bearer t2');
    await expect(serviceToken()).resolves.toBe('t2');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
