import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_ID } from '../../helpers/principal.js';

vi.mock('#modules/events/event.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const { signPayload, verifySignedPayload, encrypt, decrypt } = await import('#infra/security/crypto.js');
const events = await import('#modules/events/event.service.js');

const SECRET = process.env.AUTHZERO_WEBHOOK_SECRET;
const envelope = {
  id: 42,
  type: 'user.registered',
  payload: { userId: 'u1', email: 'u@x.io', verificationToken: 't' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const signed = (body, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) => ({
  body,
  headers: {
    'x-authzero-timestamp': String(timestamp),
    'x-authzero-signature': signPayload(secret, String(timestamp), body),
  },
});

beforeEach(() => events.publish.mockResolvedValue({ event: { id: EVENT_ID }, duplicate: false, deliveries: 0 }));

describe('signature primitives', () => {
  it('round-trips signatures and rejects tampering or stale timestamps', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = signPayload('s'.repeat(32), ts, '{"a":1}');
    expect(verifySignedPayload({ secret: 's'.repeat(32), timestamp: ts, body: '{"a":1}', signature }).ok).toBe(true);
    expect(verifySignedPayload({ secret: 's'.repeat(32), timestamp: ts, body: '{"a":2}', signature }).reason).toBe(
      'invalid',
    );
    expect(
      verifySignedPayload({ secret: 's'.repeat(32), timestamp: String(Number(ts) - 1000), body: '{"a":1}', signature })
        .reason,
    ).toBe('stale');
  });

  it('encrypts secrets at rest', () => {
    const enc = encrypt('super-secret');
    expect(enc).not.toContain('super-secret');
    expect(decrypt(enc)).toBe('super-secret');
  });
});

describe('POST /ingest/authzero', () => {
  it('accepts a correctly signed envelope and republishes it as an auth event', async () => {
    const { body, headers } = signed(JSON.stringify(envelope));
    const res = await api().post('/ingest/authzero').set(headers).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(202);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth.user.registered',
        source: 'authzero',
        idempotencyKey: 'authzero:42',
        occurredAt: envelope.createdAt,
      }),
    );
  });

  it('returns 200 for duplicates', async () => {
    events.publish.mockResolvedValue({ event: { id: EVENT_ID }, duplicate: true, deliveries: 0 });
    const { body, headers } = signed(JSON.stringify(envelope));
    expect(
      (await api().post('/ingest/authzero').set(headers).set('Content-Type', 'application/json').send(body)).status,
    ).toBe(200);
  });

  it('rejects bad signatures, stale timestamps and tampered bodies', async () => {
    const raw = JSON.stringify(envelope);
    const bad = signed(raw, { secret: 'x'.repeat(32) });
    expectProblem(
      await api().post('/ingest/authzero').set(bad.headers).set('Content-Type', 'application/json').send(raw),
      401,
      'INVALID_SIGNATURE',
    );
    const stale = signed(raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expectProblem(
      await api().post('/ingest/authzero').set(stale.headers).set('Content-Type', 'application/json').send(raw),
      401,
      'STALE_SIGNATURE',
    );
    const { headers } = signed(raw);
    const tampered = JSON.stringify({ ...envelope, type: 'user.admin_granted' });
    expectProblem(
      await api().post('/ingest/authzero').set(headers).set('Content-Type', 'application/json').send(tampered),
      401,
      'INVALID_SIGNATURE',
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('validates the envelope after the signature passes', async () => {
    const { body, headers } = signed(JSON.stringify({ id: 1, type: 'BAD TYPE' }));
    expectProblem(
      await api().post('/ingest/authzero').set(headers).set('Content-Type', 'application/json').send(body),
      400,
      'VALIDATION_FAILED',
    );
  });
});
