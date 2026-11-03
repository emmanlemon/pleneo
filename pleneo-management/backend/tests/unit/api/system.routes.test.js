import { describe, expect, it, vi } from 'vitest';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { api, expectProblem } = await import('../../helpers/app.js');
const pool = await import('#infra/database/pool.js');

describe('system endpoints', () => {
  it('reports liveness with a request id and hardening headers', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('reports readiness from the database', async () => {
    pool.healthCheck.mockResolvedValue();
    expect((await api().get('/ready')).status).toBe(200);
    pool.healthCheck.mockRejectedValue(new Error('down'));
    expect((await api().get('/ready')).status).toBe(503);
  });

  it('applies the global error contract', async () => {
    expectProblem(await api().get('/nope'), 404, 'ROUTE_NOT_FOUND');
    expectProblem(
      await api().post('/v1/projects').set('Content-Type', 'text/plain').send('x'),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expectProblem(
      await api().post('/v1/projects').set('Content-Type', 'application/json').send('{bad'),
      400,
      'MALFORMED_JSON',
    );
  });
});
