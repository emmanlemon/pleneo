import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const upstream = await import('#modules/bff/authzero.client.js');
const sessions = await import('#modules/bff/session.repository.js');
const verifier = await import('#infra/auth/token-verifier.js');
const { sha256 } = await import('#infra/security/session-crypto.js');
const { encrypt } = await import('#infra/security/session-crypto.js');
const { UpstreamAuthError } = await vi.importActual('#modules/bff/authzero.client.js');

const PROFILE = { id: USER_ID, email: 'user@example.com', name: 'User', roles: ['user'], permissions: [] };
const ACCESS = 'header.payload.signature';
const TOKENS = { accessToken: ACCESS, refreshToken: 'refresh-token-value', mfaRequired: false };

const cookieValue = (res, name) =>
  (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1] ?? null;

const liveSession = (overrides = {}) => ({
  id: 'session-row-id',
  user_id: USER_ID,
  email: PROFILE.email,
  access_token_enc: encrypt(ACCESS),
  refresh_token_enc: encrypt('refresh-token-value'),
  access_expires_at: new Date(Date.now() + 600_000).toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  csrf_hash: sha256('csrf-value'),
  revoked_at: null,
  ...overrides,
});

beforeEach(() => {
  upstream.accessTokenExpiry.mockReturnValue(new Date(Date.now() + 900_000));
  upstream.profile.mockResolvedValue(PROFILE);
  upstream.logout.mockResolvedValue(undefined);
  sessions.create.mockImplementation(async (input) => ({ id: 'session-row-id', ...input }));
  sessions.touch.mockResolvedValue();
  sessions.revoke.mockResolvedValue();
  verifier.verifyAccessToken.mockResolvedValue({
    sub: USER_ID,
    token_use: 'user',
    email: PROFILE.email,
    roles: ['user'],
    permissions: [],
  });
});

describe('POST /bff/auth/login', () => {
  it('opens a session and returns cookies instead of tokens', async () => {
    upstream.login.mockResolvedValue(TOKENS);
    const res = await api().post('/bff/auth/login').send({ email: PROFILE.email, password: 'whatever' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mfaRequired: false, user: { id: USER_ID } });

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain(ACCESS);
    expect(serialised).not.toContain('refresh-token-value');

    const sessionCookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('pleneo_session='));
    expect(sessionCookie).toMatch(/HttpOnly/);
    expect(sessionCookie).toMatch(/SameSite=Lax/);
    expect((res.headers['set-cookie'] ?? []).find((c) => c.startsWith('pleneo_csrf='))).not.toMatch(/HttpOnly/);
  });

  it('stores the provider tokens encrypted, never in the clear', async () => {
    upstream.login.mockResolvedValue(TOKENS);
    await api().post('/bff/auth/login').send({ email: PROFILE.email, password: 'whatever' });

    const [stored] = sessions.create.mock.calls[0];
    expect(stored.accessTokenEnc).not.toContain(ACCESS);
    expect(stored.refreshTokenEnc).not.toContain('refresh-token-value');
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.csrfHash).toHaveLength(64);
  });

  it('returns the MFA challenge without opening a session', async () => {
    upstream.login.mockResolvedValue({ mfaRequired: true, mfaToken: 'm'.repeat(30), expiresIn: 300 });
    const res = await api().post('/bff/auth/login').send({ email: PROFILE.email, password: 'whatever' });

    expect(res.body.mfaRequired).toBe(true);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('passes provider failures through without leaking its address', async () => {
    upstream.login.mockRejectedValue(new UpstreamAuthError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'));
    const res = await api().post('/bff/auth/login').send({ email: PROFILE.email, password: 'bad' });

    expectProblem(res, 401, 'INVALID_CREDENTIALS');
    expect(JSON.stringify(res.body)).not.toContain('4000');
  });

  it('validates the body before calling the provider', async () => {
    expectProblem(await api().post('/bff/auth/login').send({ email: 'nope' }), 400, 'VALIDATION_FAILED');
    expect(upstream.login).not.toHaveBeenCalled();
  });
});

describe('session-backed requests', () => {
  it('rejects a request with no session', async () => {
    expectProblem(await api().get('/bff/auth/session'), 401, 'AUTHENTICATION_REQUIRED');
  });

  it('resolves the caller from the session cookie', async () => {
    sessions.findByTokenHash.mockResolvedValue(liveSession());
    const res = await api().get('/bff/auth/session').set('Cookie', 'pleneo_session=abc');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(USER_ID);
    expect(upstream.profile).toHaveBeenCalledWith(ACCESS);
  });

  it('rejects a revoked or expired session', async () => {
    sessions.findByTokenHash.mockResolvedValueOnce(liveSession({ revoked_at: new Date().toISOString() }));
    expectProblem(await api().get('/bff/auth/session').set('Cookie', 'pleneo_session=abc'), 401, 'SESSION_REQUIRED');

    sessions.findByTokenHash.mockResolvedValueOnce(liveSession({ expires_at: new Date(Date.now() - 1000).toISOString() }));
    expectProblem(await api().get('/bff/auth/session').set('Cookie', 'pleneo_session=abc'), 401, 'SESSION_REQUIRED');
  });

  it('requires the CSRF header on mutating requests', async () => {
    sessions.findByTokenHash.mockResolvedValue(liveSession());

    const missing = await api()
      .post('/bff/auth/password/change')
      .set('Cookie', 'pleneo_session=abc')
      .send({ currentPassword: 'old', newPassword: 'Correct-Horse-9' });
    expectProblem(missing, 403, 'CSRF_FAILED');

    const wrong = await api()
      .post('/bff/auth/password/change')
      .set('Cookie', 'pleneo_session=abc')
      .set('X-CSRF-Token', 'not-the-value')
      .send({ currentPassword: 'old', newPassword: 'Correct-Horse-9' });
    expectProblem(wrong, 403, 'CSRF_FAILED');

    upstream.changePassword.mockResolvedValue({ message: 'Password updated' });
    const accepted = await api()
      .post('/bff/auth/password/change')
      .set('Cookie', 'pleneo_session=abc')
      .set('X-CSRF-Token', 'csrf-value')
      .send({ currentPassword: 'old', newPassword: 'Correct-Horse-9' });
    expect(accepted.status).toBe(200);
    expect(upstream.changePassword).toHaveBeenCalledWith(expect.any(Object), ACCESS);
  });

  it('reaches the management API with the same cookie', async () => {
    sessions.findByTokenHash.mockResolvedValue(liveSession());
    const res = await api().get('/notifications').set('Cookie', 'pleneo_session=abc');
    expect(res.status).not.toBe(401);
  });
});

describe('POST /bff/auth/logout', () => {
  it('revokes the session, tells the provider, and clears both cookies', async () => {
    sessions.findByTokenHash.mockResolvedValue(liveSession());
    const res = await api().post('/bff/auth/logout').set('Cookie', 'pleneo_session=abc');

    expect(res.status).toBe(204);
    expect(sessions.revoke).toHaveBeenCalledWith('session-row-id', 'logout');
    expect(upstream.logout).toHaveBeenCalledWith(ACCESS);
    expect(cookieValue(res, 'pleneo_session')).toBe('');
    expect(cookieValue(res, 'pleneo_csrf')).toBe('');
  });

  it('is safe without a session', async () => {
    expect((await api().post('/bff/auth/logout')).status).toBe(204);
  });
});

describe('anonymous account routes', () => {
  it('accepts a registration and answers with the provider message only', async () => {
    upstream.register.mockResolvedValue({ message: 'Check your inbox to verify the address' });
    const res = await api()
      .post('/bff/auth/register')
      .send({ email: 'new@example.com', password: 'Correct-Horse-9', name: 'New' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: 'Check your inbox to verify the address' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers the resend and forgot-password routes without revealing whether the account exists', async () => {
    upstream.resendVerification.mockResolvedValue(undefined);
    upstream.forgotPassword.mockResolvedValue(undefined);

    const resend = await api().post('/bff/auth/email/resend').send({ email: 'ghost@example.com' });
    expect(resend.status).toBe(202);
    expect(resend.body.message).toMatch(/if the account exists/i);

    const forgot = await api().post('/bff/auth/password/forgot').send({ email: 'ghost@example.com' });
    expect(forgot.status).toBe(202);
    expect(forgot.body.message).toMatch(/if the account exists/i);
  });

  it('verifies an email and resets a password through the gateway', async () => {
    upstream.verifyEmail.mockResolvedValue({ message: 'Email verified' });
    upstream.resetPassword.mockResolvedValue({ message: 'Password updated' });

    const verify = await api().post('/bff/auth/email/verify').send({ token: 't'.repeat(40) });
    expect(verify.status).toBe(200);

    const reset = await api()
      .post('/bff/auth/password/reset')
      .send({ token: 't'.repeat(40), password: 'Correct-Horse-9' });
    expect(reset.status).toBe(200);
  });
});
