import { describe, expect, it, vi } from 'vitest';
import { documentedOperations, listRoutes } from '../../helpers/routes.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { api, app } = await import('../../helpers/app.js');
const { buildOpenApiDocument } = await import('#modules/../api/openapi.js');

const spec = buildOpenApiDocument();

// The gateway forwards whole path trees, so these are mounted with use() and never
// appear as discrete Express routes.
const CATCH_ALL = ['queues', 'devices', 'commands', 'alerts', 'rules', 'users', 'roles', 'clients', 'audit'].map(
  (m) => `GET /v1/${m}/:path`,
);

describe('OpenAPI document', () => {
  it('documents every route the service actually exposes, and no others', () => {
    const documented = documentedOperations(spec).filter((op) => !CATCH_ALL.includes(op));
    expect(documented).toEqual(listRoutes(app));
  });

  it('documents the gateway proxies that forward whole path trees', () => {
    expect(documentedOperations(spec)).toEqual(expect.arrayContaining(CATCH_ALL));
  });

  it('declares the title, version and security schemes', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Pleneo Management');
    expect(Object.keys(spec.components.securitySchemes).length).toBeGreaterThan(0);
  });

  it('attaches the problem schema to every documented error response', () => {
    const responses = Object.values(spec.paths)
      .flatMap((item) => Object.values(item))
      .flatMap((op) => Object.entries(op.responses))
      .filter(([status]) => Number(status) >= 400 && status !== '503');
    expect(responses.length).toBeGreaterThan(10);
    for (const [, response] of responses) {
      expect(response.content['application/problem+json'].schema.$ref).toBe('#/components/schemas/Problem');
    }
  });

  it('serves the document and the reference UI', async () => {
    const doc = await api().get('/openapi.json');
    expect(doc.status).toBe(200);
    expect(doc.body.info.title).toBe('Pleneo Management');

    const page = await api().get('/docs');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain('cdn.jsdelivr.net');
  });
});
