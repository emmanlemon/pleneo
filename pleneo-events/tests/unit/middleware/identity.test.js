import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#infra/auth/token-verifier.js', () => ({ verifyAccessToken: vi.fn() }));

const { authenticate } = await import('#common/middleware/authenticate.js');
const { verifyAccessToken } = await import('#infra/auth/token-verifier.js');
const { config } = await import('#config');

const KEY = Buffer.from(config.INTERNAL_IDENTITY_KEY, 'hex');
const OTHER_KEY = Buffer.from('11'.repeat(32), 'hex');

const assertion = ({ claims = {}, issuer, audience, expiresIn = '60s', typ = 'identity+jwt', key = KEY } = {}) =>
  new SignJWT({ token_use: 'user', email: 'user@example.com', roles: ['admin'], permissions: ['queues:read'], ...claims })
    .setProtectedHeader({ alg: 'HS256', typ })
    .setIssuer(issuer ?? config.INTERNAL_IDENTITY_ISSUER)
    .setAudience(audience ?? 'pleneo-events')
    .setSubject('user-1')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);

const run = (headers) =>
  new Promise((resolve) => {
    const req = { get: (name) => headers[name.toLowerCase()] };
    authenticate(req, {}, (err) => resolve({ err, auth: req.auth }));
  });

beforeEach(() => {
  verifyAccessToken.mockReset();
  verifyAccessToken.mockResolvedValue({ sub: 'client-1', token_use: 'client', scope: 'events:publish' });
});

describe('gateway identity', () => {
  it('accepts an assertion minted by the gateway', async () => {
    const { err, auth } = await run({ 'x-pleneo-identity': await assertion() });
    expect(err).toBeUndefined();
    expect(auth).toMatchObject({ type: 'user', userId: 'user-1', roles: ['admin'], viaGateway: true });
  });

  it('does not call the identity provider on the hot path', async () => {
    await run({ 'x-pleneo-identity': await assertion() });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an assertion signed with another key', async () => {
    const { err, auth } = await run({ 'x-pleneo-identity': await assertion({ key: OTHER_KEY }) });
    expect(err?.code).toBe('INVALID_TOKEN');
    expect(auth).toBeUndefined();
  });

  it('rejects an assertion minted for a different upstream', async () => {
    const { err } = await run({ 'x-pleneo-identity': await assertion({ audience: 'pleneo-iot' }) });
    expect(err?.code).toBe('INVALID_TOKEN');
  });

  it('rejects an assertion from an unexpected issuer', async () => {
    const { err } = await run({ 'x-pleneo-identity': await assertion({ issuer: 'someone-else' }) });
    expect(err?.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired assertion', async () => {
    const { err } = await run({ 'x-pleneo-identity': await assertion({ expiresIn: '-120s' }) });
    expect(err?.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token that is not an identity assertion', async () => {
    const { err } = await run({ 'x-pleneo-identity': await assertion({ typ: 'at+jwt' }) });
    expect(err?.code).toBe('INVALID_TOKEN');
  });
});

describe('direct callers', () => {
  it('still accepts a provider token from a service client', async () => {
    const { err, auth } = await run({ authorization: 'Bearer service-token' });
    expect(err).toBeUndefined();
    expect(auth).toMatchObject({ type: 'client', clientId: 'client-1', viaGateway: false });
    expect(verifyAccessToken).toHaveBeenCalledWith('service-token');
  });

  it('refuses a request carrying neither', async () => {
    const { err } = await run({});
    expect(err?.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
