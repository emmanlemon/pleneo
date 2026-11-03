import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_ID, USER_ID } from '../../helpers/principal.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/notifications/notifications.service.js');
vi.mock('#infra/realtime/socket-server.js', () => ({
  emitToUser: vi.fn(),
  emitToOwnerAndAdmins: vi.fn(),
  emitToAdmins: vi.fn(),
}));

const { api, expectProblem } = await import('../../helpers/app.js');
const { signPayload } = await import('#common/security/signature.js');
const notifications = await import('#modules/notifications/notifications.service.js');
const realtime = await import('#infra/realtime/socket-server.js');

const SECRET = process.env.EVENTS_WEBHOOK_SECRET;
const EVENT_ID = '55555555-5555-4555-8555-555555555555';
const envelope = {
  id: EVENT_ID,
  type: 'project.created',
  source: 'client:management',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {
    projectId: PROJECT_ID,
    ownerId: USER_ID,
    name: 'Launch',
    status: 'planning',
    actorEmail: 'user@example.com',
  },
};

const send = (body, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) =>
  api()
    .post('/v1/webhooks/events')
    .set('x-pleneo-timestamp', String(timestamp))
    .set('x-pleneo-signature', signPayload(secret, String(timestamp), body))
    .set('Content-Type', 'application/json')
    .send(body);

beforeEach(() => {
  tx.query.mockResolvedValue({ rowCount: 1 });
  notifications.notify.mockResolvedValue({ id: 'n1' });
});

describe('POST /webhooks/events', () => {
  it('verifies the signature, records the event id and creates a notification', async () => {
    const res = await send(JSON.stringify(envelope));
    expect(res.status).toBe(202);
    expect(res.body.outcome).toBe('handled');
    expect(tx.query).toHaveBeenCalledWith(expect.stringMatching(/processed_webhooks/), [EVENT_ID, 'project.created']);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        type: 'project.created',
        title: expect.stringContaining('Launch'),
        email: expect.objectContaining({ to: 'user@example.com' }),
      }),
      tx,
    );
  });

  it('pushes the event to the owner over Socket.IO', async () => {
    await send(JSON.stringify(envelope));
    expect(realtime.emitToOwnerAndAdmins).toHaveBeenCalledWith(
      USER_ID,
      'event:received',
      expect.objectContaining({ type: 'project.created', eventId: EVENT_ID, projectId: PROJECT_ID }),
    );
  });

  it('reaches operators as well as the owner, so an admin view is not blind', async () => {
    await send(JSON.stringify(envelope));
    const [userId] = realtime.emitToOwnerAndAdmins.mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('turns a queue signal into an operator-only push', async () => {
    const signal = { ...envelope, id: '55555555-5555-4555-8555-555555555555', type: 'queue.changed', payload: {} };
    const res = await send(JSON.stringify(signal));
    expect(res.status).toBe(200);
    expect(realtime.emitToAdmins).toHaveBeenCalledWith('queue:changed', expect.any(Object));
    expect(realtime.emitToOwnerAndAdmins).not.toHaveBeenCalled();
  });

  it('does not push a redelivered event', async () => {
    tx.query.mockResolvedValue({ rowCount: 0 });
    await send(JSON.stringify(envelope));
    expect(realtime.emitToOwnerAndAdmins).not.toHaveBeenCalled();
  });

  it('does not push when the signature is rejected', async () => {
    await send(JSON.stringify(envelope), { secret: 'x'.repeat(32) });
    expect(realtime.emitToOwnerAndAdmins).not.toHaveBeenCalled();
  });

  it('is idempotent on redelivery', async () => {
    tx.query.mockResolvedValue({ rowCount: 0 });
    const res = await send(JSON.stringify(envelope));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('duplicate');
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('acknowledges unknown event types without side effects', async () => {
    const res = await send(JSON.stringify({ ...envelope, type: 'auth.user.locked' }));
    expect(res.body.outcome).toBe('ignored');
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('rejects invalid or stale signatures and tampered bodies', async () => {
    const raw = JSON.stringify(envelope);
    expectProblem(await send(raw, { secret: 'x'.repeat(32) }), 401, 'INVALID_SIGNATURE');
    expectProblem(await send(raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 }), 401, 'STALE_SIGNATURE');
    const ts = String(Math.floor(Date.now() / 1000));
    const tampered = await api()
      .post('/v1/webhooks/events')
      .set('x-pleneo-timestamp', ts)
      .set('x-pleneo-signature', signPayload(SECRET, ts, raw))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...envelope, payload: { ...envelope.payload, ownerId: 'someone-else' } }));
    expectProblem(tampered, 401, 'INVALID_SIGNATURE');
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('validates the envelope', async () => {
    expectProblem(await send(JSON.stringify({ id: 'not-a-uuid', type: 'x' })), 400, 'VALIDATION_FAILED');
  });
});
