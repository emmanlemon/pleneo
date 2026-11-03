import { describe, expect, it, vi } from 'vitest';
import { documentedOperations, listRoutes } from '../../helpers/routes.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { api } = await import('../../helpers/app.js');
const { app } = await import('../../helpers/app.js');
const { buildOpenApiDocument } = await import('#modules/../api/openapi.js');

const spec = buildOpenApiDocument();

describe('OpenAPI document', () => {
  it('documents every route the service actually exposes, and no others', () => {
    expect(documentedOperations(spec)).toEqual(listRoutes(app));
  });

  it('describes both authentication planes', () => {
    expect(Object.keys(spec.components.securitySchemes)).toEqual(['bearerAuth', 'deviceToken']);
    expect(spec.paths['/v1/devices'].get.security).toBeUndefined();
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths['/v1/device/telemetry'].post.security).toEqual([{ deviceToken: [] }]);
    expect(spec.paths['/v1/device/activate'].post.security).toEqual([]);
  });

  it('derives request bodies from the zod validators', () => {
    const register = spec.paths['/v1/devices'].post.requestBody.content['application/json'].schema;
    expect(register.required).toEqual(expect.arrayContaining(['externalId', 'name', 'deviceTypeId']));
    expect(register.additionalProperties).toBe(false);
    expect(register.properties.externalId.pattern).toBeDefined();
  });

  it('attaches the problem schema to every documented error response', () => {
    const errorResponses = Object.values(spec.paths)
      .flatMap((item) => Object.values(item))
      .flatMap((op) => Object.entries(op.responses))
      .filter(([status]) => Number(status) >= 400 && status !== '503');
    expect(errorResponses.length).toBeGreaterThan(40);
    for (const [, response] of errorResponses) {
      expect(response.content['application/problem+json'].schema.$ref).toBe('#/components/schemas/Problem');
    }
  });

  it('serves the document and the reference UI', async () => {
    const doc = await api().get('/openapi.json');
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe('3.1.0');
    expect(doc.body.info.title).toBe('Pleneo IoT');

    const page = await api().get('/docs');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain('cdn.jsdelivr.net');
    expect(page.text).toContain('/openapi.json');
  });
});
