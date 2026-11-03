import { describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, USER_ID } from '../../helpers/principal.js';

vi.mock('#infra/auth/token-verifier.js');
vi.mock('#infra/auth/introspection.js', () => ({ assertNotRevoked: vi.fn() }));

const { authenticate } = await import('#common/middleware/authenticate.js');
const verifier = await import('#infra/auth/token-verifier.js');
const introspection = await import('#infra/auth/introspection.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const run = (authorization) =>
  new Promise((resolve) => {
    const req = { get: (h) => (h.toLowerCase() === 'authorization' ? authorization : undefined) };
    authenticate(req, {}, (err) => resolve({ err, auth: req.auth }));
  });

describe('authenticate', () => {
  it('rejects missing or malformed bearer headers without calling the verifier', async () => {
    for (const header of [undefined, 'Basic abc', 'Bearer', 'Bearer a b']) {
      expect((await run(header)).err.code).toBe('AUTHENTICATION_REQUIRED');
    }
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('propagates verifier failures', async () => {
    verifier.verifyAccessToken.mockRejectedValue(DomainErrors.tokenExpired());
    expect((await run('Bearer t')).err.code).toBe('TOKEN_EXPIRED');
  });

  it('builds a user principal from claims', async () => {
    verifier.verifyAccessToken.mockResolvedValue({
      sub: USER_ID,
      sid: 's1',
      token_use: 'user',
      email: 'u@x.io',
      roles: ['user'],
      permissions: ['p'],
      amr: ['pwd', 'otp'],
      jti: 'j',
    });
    const { err, auth } = await run('Bearer t');
    expect(err).toBeUndefined();
    expect(auth).toMatchObject({
      type: 'user',
      userId: USER_ID,
      sessionId: 's1',
      roles: ['user'],
      permissions: ['p'],
      amr: ['pwd', 'otp'],
    });
    expect(introspection.assertNotRevoked).toHaveBeenCalledWith('t', expect.objectContaining({ jti: 'j' }));
  });

  it('builds a client principal with parsed scopes', async () => {
    verifier.verifyAccessToken.mockResolvedValue({
      sub: CLIENT_ID,
      token_use: 'client',
      scope: 'projects:read projects:write',
      jti: 'j',
    });
    const { auth } = await run('Bearer t');
    expect(auth).toMatchObject({ type: 'client', clientId: CLIENT_ID, scopes: ['projects:read', 'projects:write'] });
  });

  it('surfaces revocation from introspection', async () => {
    verifier.verifyAccessToken.mockResolvedValue({ sub: USER_ID, token_use: 'user', jti: 'j' });
    introspection.assertNotRevoked.mockRejectedValue(DomainErrors.tokenRevoked());
    expect((await run('Bearer t')).err.code).toBe('TOKEN_REVOKED');
  });
});
