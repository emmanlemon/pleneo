import { describe, expect, it, vi } from 'vitest';

vi.mock('#modules/clients/oauth.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const oauth = await import('#modules/clients/oauth.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const grant = { access_token: 'a.b.c', token_type: 'Bearer', expires_in: 900, scope: 'billing:read' };

describe('POST /oauth/token', () => {
  it('accepts form-encoded requests with basic auth', async () => {
    oauth.clientCredentialsGrant.mockResolvedValue(grant);
    const res = await api()
      .post('/oauth/token')
      .set('Authorization', `Basic ${Buffer.from('cid_x:secret').toString('base64')}`)
      .type('form')
      .send({ grant_type: 'client_credentials', scope: 'billing:read' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(grant);
    const [req] = oauth.clientCredentialsGrant.mock.calls[0];
    expect(req.body).toEqual({ grant_type: 'client_credentials', scope: 'billing:read' });
  });

  it('accepts JSON bodies with client_secret_post', async () => {
    oauth.clientCredentialsGrant.mockResolvedValue(grant);
    const res = await api()
      .post('/oauth/token')
      .send({ grant_type: 'client_credentials', client_id: 'cid_x', client_secret: 's' });
    expect(res.status).toBe(200);
  });

  it('rejects unsupported grant types', async () => {
    const res = await api().post('/oauth/token').type('form').send({ grant_type: 'password' });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0].field).toBe('grant_type');
  });

  it('maps invalid client credentials to 401', async () => {
    oauth.clientCredentialsGrant.mockRejectedValue(DomainErrors.invalidClient());
    const res = await api().post('/oauth/token').type('form').send({ grant_type: 'client_credentials' });
    expectProblem(res, 401, 'INVALID_CLIENT');
  });

  it('maps scope escalation to 403', async () => {
    oauth.clientCredentialsGrant.mockRejectedValue(DomainErrors.scopeNotGranted());
    const res = await api()
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', scope: 'admin' });
    expectProblem(res, 403, 'SCOPE_NOT_GRANTED');
  });
});

describe('POST /oauth/introspect', () => {
  it('requires a token field', async () => {
    expectProblem(await api().post('/oauth/introspect').type('form').send({}), 400, 'VALIDATION_FAILED');
  });

  it('returns the introspection result', async () => {
    oauth.introspect.mockResolvedValue({ active: false });
    const res = await api()
      .post('/oauth/introspect')
      .type('form')
      .send({ token: 'x.y.z', client_id: 'c', client_secret: 's' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false });
  });
});
