import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID, PROJECT_ID } from '../../helpers/fixtures.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/devices/device.repository.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const { signPayload } = await import('#common/security/signature.js');
const devices = await import('#modules/devices/device.repository.js');
const { config } = await import('#config');

const EVENT_ID = '55555555-5555-4555-8555-555555555555';
const envelope = {
  id: EVENT_ID,
  type: 'project.deleted',
  source: 'client:management',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { projectId: PROJECT_ID, name: 'Launch' },
};

const send = (body, { secret = config.EVENTS_WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) =>
  api()
    .post('/v1/webhooks/events')
    .set('x-pleneo-timestamp', String(timestamp))
    .set('x-pleneo-signature', signPayload(secret, String(timestamp), body))
    .set('Content-Type', 'application/json')
    .send(body);

beforeEach(() => {
  tx.query.mockResolvedValue({ rowCount: 1 });
  devices.releaseProject.mockResolvedValue([{ id: DEVICE_ID }]);
});

describe('POST /v1/webhooks/events', () => {
  it('releases the devices of a deleted project exactly once', async () => {
    const res = await send(JSON.stringify(envelope));
    expect(res.status).toBe(202);
    expect(res.body.outcome).toBe('handled');
    expect(tx.query).toHaveBeenCalledWith(expect.stringMatching(/processed_webhooks/), [EVENT_ID, 'project.deleted']);
    expect(devices.releaseProject).toHaveBeenCalledWith(PROJECT_ID, tx);

    tx.query.mockResolvedValueOnce({ rowCount: 0 });
    const replay = await send(JSON.stringify(envelope));
    expect(replay.status).toBe(200);
    expect(replay.body.outcome).toBe('duplicate');
    expect(devices.releaseProject).toHaveBeenCalledTimes(1);
  });

  it('ignores event types it has no handler for', async () => {
    const res = await send(JSON.stringify({ ...envelope, type: 'project.created' }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('ignored');
    expect(devices.releaseProject).not.toHaveBeenCalled();
  });

  it('refuses a bad signature, a stale timestamp and a malformed envelope', async () => {
    const body = JSON.stringify(envelope);
    expectProblem(await send(body, { secret: 'x'.repeat(32) }), 401, 'INVALID_SIGNATURE');
    expectProblem(await send(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }), 401, 'STALE_SIGNATURE');
    expectProblem(await send(JSON.stringify({ id: 'nope', type: 'project.deleted' })), 400, 'VALIDATION_FAILED');
    expect(devices.releaseProject).not.toHaveBeenCalled();
  });
});
