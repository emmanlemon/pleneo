import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ID } from '../../helpers/principal.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/bff/authzero.client.js');
vi.mock('#modules/bff/session.repository.js');
vi.mock('#infra/auth/token-verifier.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const sessions = await import('#modules/bff/session.repository.js');
const verifier = await import('#infra/auth/token-verifier.js');
const { encrypt, sha256 } = await import('#infra/security/session-crypto.js');
const { resetGateway, gatewayStatus } = await import('#modules/gateway/gateway.js');
const { config } = await import('#config');

const ACCESS = 'header.payload.signature';
const IDENTITY_KEY = Buffer.from(config.INTERNAL_IDENTITY_KEY, 'hex');

const liveSession = () => ({
  id: 'session-row-id',
  user_id: USER_ID,
  email: 'user@example.com',
  access_token_enc: encrypt(ACCESS),
  refresh_token_enc: encrypt('refresh-token-value'),
  access_expires_at: new Date(Date.now() + 600_000).toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  csrf_hash: sha256('csrf-value'),
  revoked_at: null,
});

const signedIn = (request) => request.set('Cookie', 'pleneo_session=abc').set('X-CSRF-Token', 'csrf-value');
const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

let fetchMock;

beforeEach(() => {
  resetGateway();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  sessions.findByTokenHash.mockResolvedValue(liveSession());
  sessions.touch.mockResolvedValue();
  verifier.verifyAccessToken.mockResolvedValue({
    sub: USER_ID,
    token_use: 'user',
    email: 'user@example.com',
    roles: ['admin', 'user'],
    permissions: ['devices:write'],
    sid: 'session-row-id',
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('identity hand-off', () => {
  it('sends a short-lived internal assertion instead of the provider token', async () => {
    await signedIn(api().get('/v1/devices')).expect(200);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain(ACCESS);

    const { payload, protectedHeader } = await jwtVerify(init.headers['x-pleneo-identity'], IDENTITY_KEY, {
      issuer: 'pleneo-gateway',
      audience: 'pleneo-iot',
    });
    expect(protectedHeader).toMatchObject({ alg: 'HS256', typ: 'identity+jwt' });
    expect(payload).toMatchObject({ sub: USER_ID, token_use: 'user', roles: ['admin', 'user'] });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(config.INTERNAL_IDENTITY_TTL_SECONDS);
  });

  it('binds the assertion to the upstream it was minted for', async () => {
    await signedIn(api().get('/v1/queues/stats')).expect(200);
    const assertion = fetchMock.mock.calls[0][1].headers['x-pleneo-identity'];

    await expect(jwtVerify(assertion, IDENTITY_KEY, { audience: 'pleneo-events' })).resolves.toBeTruthy();
    await expect(jwtVerify(assertion, IDENTITY_KEY, { audience: 'pleneo-iot' })).rejects.toThrow();
  });

  it('hands the identity provider the session’s own token, never an assertion', async () => {
    await signedIn(api().get('/v1/users?limit=20')).expect(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${config.AUTH_INTERNAL_URL}/v1/admin/users?limit=20`);
    expect(init.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(init.headers['x-pleneo-identity']).toBeUndefined();
  });

  it('never forwards a client-supplied identity header or authorization', async () => {
    await signedIn(api().get('/v1/devices'))
      .set('X-Pleneo-Identity', 'forged-assertion')
      .set('Authorization', 'Bearer attacker-token')
      .expect(200);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['x-pleneo-identity']).not.toBe('forged-assertion');
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain('attacker-token');
  });
});

describe('route allowlist at the edge', () => {
  it('refuses an unlisted upstream path without calling the upstream', async () => {
    expectProblem(await signedIn(api().post('/v1/devices/v1/device/telemetry')).send({}), 404, 'NOT_FOUND');
    expectProblem(await signedIn(api().post('/v1/queues/ingest/authzero')).send({}), 404, 'NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gatewayStatus().upstreams.iot.blocked).toBe(1);
  });

  it('forwards the query string on an allowed route', async () => {
    await signedIn(api().get('/v1/devices?status=active&limit=5')).expect(200);
    expect(fetchMock.mock.calls[0][0]).toBe('http://iot.test/v1/devices?status=active&limit=5');
  });

  it('still enforces CSRF on a proxied mutation', async () => {
    const res = await api().post('/v1/devices').set('Cookie', 'pleneo_session=abc').send({ name: 'd' });
    expectProblem(res, 403, 'CSRF_FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resilience', () => {
  it('retries an idempotent read and succeeds on a later attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ devices: [] }));

    const res = await signedIn(api().get('/v1/devices')).expect(200);
    expect(res.body).toEqual({ devices: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(gatewayStatus().upstreams.iot.retries).toBe(1);
  });

  it('does not retry a write', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await signedIn(api().post('/v1/devices')).send({ name: 'd' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated failures and answers with Retry-After', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    for (let i = 0; i < config.GATEWAY_BREAKER_THRESHOLD; i += 1) {
      await signedIn(api().post('/v1/devices')).send({ name: 'd' });
    }
    fetchMock.mockClear();

    const res = await signedIn(api().post('/v1/devices')).send({ name: 'd' });
    expectProblem(res, 503, 'UPSTREAM_UNAVAILABLE');
    expect(res.headers['retry-after']).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gatewayStatus().upstreams.iot.breaker.state).toBe('open');
  });

  it('keeps a failing upstream from tripping the healthy one', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    for (let i = 0; i < config.GATEWAY_BREAKER_THRESHOLD; i += 1) {
      await signedIn(api().post('/v1/devices')).send({ name: 'd' });
    }

    fetchMock.mockResolvedValue(jsonResponse({ queues: {} }));
    await signedIn(api().get('/v1/queues/stats')).expect(200);
    expect(gatewayStatus().upstreams.events.breaker.state).toBe('closed');
  });
});

describe('response hygiene', () => {
  it('passes an upstream problem through without leaking the upstream address', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ type: 'x', title: 'Forbidden', status: 403, code: 'INSUFFICIENT_PERMISSIONS' }), {
        status: 403,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );
    const res = await signedIn(api().get('/v1/queues/stats'));
    expectProblem(res, 403, 'INSUFFICIENT_PERMISSIONS');
    expect(JSON.stringify(res.body)).not.toContain('events.test');
  });

  it('drops a cookie the upstream tried to set on the console origin', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true }, { headers: { 'content-type': 'application/json', 'set-cookie': 'upstream=1' } }),
    );
    const res = await signedIn(api().get('/v1/devices')).expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('records traffic per upstream for the admin view', async () => {
    await signedIn(api().get('/v1/devices')).expect(200);
    const status = gatewayStatus();
    expect(status.upstreams.iot).toMatchObject({ requests: 1, statuses: { '2xx': 1 } });
    expect(status.upstreams.iot.avgMs).toBeGreaterThanOrEqual(0);
  });
});
