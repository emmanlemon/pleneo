import { describe, expect, it, vi } from 'vitest';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/security/signing-keys.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const pool = await import('#infra/database/pool.js');
const keys = await import('#infra/security/signing-keys.js');

describe('system endpoints', () => {
  it('reports liveness', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('reports readiness from the database check', async () => {
    pool.healthCheck.mockResolvedValue();
    expect((await api().get('/ready')).status).toBe(200);
    pool.healthCheck.mockRejectedValue(new Error('down'));
    expect((await api().get('/ready')).status).toBe(503);
  });

  it('publishes the JWKS with a cache header', async () => {
    keys.getJwks.mockResolvedValue({ keys: [{ kid: 'k1' }] });
    const res = await api().get('/.well-known/jwks.json');
    expect(res.body.keys[0].kid).toBe('k1');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('publishes discovery metadata derived from the issuer', async () => {
    const res = await api().get('/.well-known/openid-configuration');
    expect(res.body.jwks_uri).toBe('http://localhost:4000/.well-known/jwks.json');
  });

  it('echoes a valid inbound request id and replaces an invalid one', async () => {
    const good = await api().get('/health').set('X-Request-Id', 'trace-abc-12345');
    expect(good.headers['x-request-id']).toBe('trace-abc-12345');
    const bad = await api().get('/health').set('X-Request-Id', 'x');
    expect(bad.headers['x-request-id']).not.toBe('x');
  });
});

describe('global request hygiene', () => {
  it('returns problem+json for unknown routes', async () => {
    expectProblem(await api().get('/nope'), 404, 'ROUTE_NOT_FOUND');
  });

  it('rejects non-JSON bodies on mutating routes', async () => {
    const res = await api().post('/v1/auth/login').set('Content-Type', 'text/plain').send('email=x');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed JSON', async () => {
    const res = await api().post('/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expectProblem(res, 400, 'MALFORMED_JSON');
  });

  it('sets hardening headers and no-store caching', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
