import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#modules/subscriptions/subscription.repository.js', () => ({ listActive: vi.fn(), findById: vi.fn() }));

const { flushQueueSignal, markQueueDirty } = await import('#queue/queue-signal.js');
const subscriptions = await import('#modules/subscriptions/subscription.repository.js');
const { encrypt } = await import('#infra/security/crypto.js');

const subscription = (overrides = {}) => ({
  id: 's1',
  name: 'pleneo-management',
  url: 'http://management.test/v1/webhooks/events',
  secret_enc: encrypt('a-secret-that-is-long-enough-to-sign'),
  event_types: ['project.*', 'iot.*', 'queue.*'],
  status: 'active',
  ...overrides,
});

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
  subscriptions.listActive.mockResolvedValue([subscription()]);
  subscriptions.findById.mockImplementation(async () => subscription());
});

describe('queue signal', () => {
  it('stays silent until something marks the queue dirty', async () => {
    await flushQueueSignal();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('collapses a burst of changes into one delivery', async () => {
    markQueueDirty();
    markQueueDirty();
    markQueueDirty();
    await flushQueueSignal();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flushQueueSignal();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delivers directly rather than enqueuing a job, so the queue cannot feed itself', async () => {
    markQueueDirty();
    await flushQueueSignal();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://management.test/v1/webhooks/events');
    expect(init.headers['x-pleneo-event']).toBe('queue.changed');
    expect(init.headers['x-pleneo-signature']).toMatch(/^sha256=/);
    expect(JSON.parse(init.body)).toMatchObject({ type: 'queue.changed', source: 'pleneo-events' });
  });

  it('skips a subscription that did not ask for queue events', async () => {
    subscriptions.listActive.mockResolvedValue([subscription({ event_types: ['project.*'] })]);
    subscriptions.findById.mockResolvedValue(subscription({ event_types: ['project.*'] }));
    markQueueDirty();
    await flushQueueSignal();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('survives an unreachable subscriber without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    markQueueDirty();
    await expect(flushQueueSignal()).resolves.toBeUndefined();
  });
});
