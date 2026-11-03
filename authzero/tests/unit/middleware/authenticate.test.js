import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, SESSION_ID, USER_ID } from '../../helpers/principal.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/security/jwt.js');

const { authenticate } = await import('#common/middleware/authenticate.js');
const pool = await import('#infra/database/pool.js');
const jwt = await import('#infra/security/jwt.js');

const run = (authorization) =>
  new Promise((resolve) => {
    const req = { get: (h) => (h.toLowerCase() === 'authorization' ? authorization : undefined) };
    authenticate(req, {}, (err) => resolve({ err, auth: req.auth }));
  });

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
const nowSeconds = Math.floor(Date.now() / 1000);

beforeEach(() => {
  jwt.verifyAccessToken.mockResolvedValue({
    sub: USER_ID,
    sid: SESSION_ID,
    token_use: 'user',
    iat: nowSeconds,
    roles: ['user'],
    permissions: ['a'],
    amr: ['pwd'],
    jti: 'j',
  });
});

describe('authenticate', () => {
  it('rejects a missing or malformed Authorization header', async () => {
    expect((await run(undefined)).err.code).toBe('AUTHENTICATION_REQUIRED');
    expect((await run('Basic abc')).err.code).toBe('AUTHENTICATION_REQUIRED');
    expect((await run('Bearer')).err.code).toBe('AUTHENTICATION_REQUIRED');
    expect((await run('Bearer a b')).err.code).toBe('AUTHENTICATION_REQUIRED');
    expect(jwt.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('propagates token verification failures', async () => {
    const { DomainErrors } = await import('#common/errors/domain-errors.js');
    jwt.verifyAccessToken.mockRejectedValue(DomainErrors.tokenExpired());
    expect((await run('Bearer x')).err.code).toBe('TOKEN_EXPIRED');
  });

  it('builds a user principal from a live session', async () => {
    pool.query.mockResolvedValue({
      rows: [{ revoked_at: null, expires_at: future, status: 'active', password_changed_at: past }],
    });
    const { err, auth } = await run('Bearer token');
    expect(err).toBeUndefined();
    expect(auth).toMatchObject({
      type: 'user',
      userId: USER_ID,
      sessionId: SESSION_ID,
      roles: ['user'],
      permissions: ['a'],
      amr: ['pwd'],
    });
    expect(pool.query.mock.calls[0][1]).toEqual([SESSION_ID, USER_ID]);
  });

  it('rejects revoked, expired or unknown sessions', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect((await run('Bearer t')).err.code).toBe('SESSION_REVOKED');
    pool.query.mockResolvedValueOnce({
      rows: [{ revoked_at: past, expires_at: future, status: 'active', password_changed_at: past }],
    });
    expect((await run('Bearer t')).err.code).toBe('SESSION_REVOKED');
    pool.query.mockResolvedValueOnce({
      rows: [{ revoked_at: null, expires_at: past, status: 'active', password_changed_at: past }],
    });
    expect((await run('Bearer t')).err.code).toBe('SESSION_REVOKED');
  });

  it('rejects disabled accounts and tokens issued before a password change', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ revoked_at: null, expires_at: future, status: 'disabled', password_changed_at: past }],
    });
    expect((await run('Bearer t')).err.code).toBe('ACCOUNT_DISABLED');
    pool.query.mockResolvedValueOnce({
      rows: [{ revoked_at: null, expires_at: future, status: 'active', password_changed_at: future }],
    });
    expect((await run('Bearer t')).err.code).toBe('CREDENTIALS_CHANGED');
  });

  it('builds a client principal with parsed scopes and rejects revoked clients', async () => {
    jwt.verifyAccessToken.mockResolvedValue({ sub: CLIENT_ID, token_use: 'client', scope: 'a:r b:w', jti: 'j' });
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'active' }] });
    const { auth } = await run('Bearer t');
    expect(auth).toMatchObject({ type: 'client', clientId: CLIENT_ID, scopes: ['a:r', 'b:w'] });
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'revoked' }] });
    expect((await run('Bearer t')).err.code).toBe('INVALID_TOKEN');
  });
});
