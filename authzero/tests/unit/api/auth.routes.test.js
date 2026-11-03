import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asClient, asUser, SESSION_ID, USER_ID } from '../../helpers/principal.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/principal.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
  };
});
vi.mock('#modules/auth/services/login.service.js');
vi.mock('#modules/auth/services/registration.service.js');
vi.mock('#modules/auth/services/password.service.js');
vi.mock('#modules/auth/services/session.service.js');

const { api, cookieNamed, expectProblem } = await import('../../helpers/app.js');
const loginService = await import('#modules/auth/services/login.service.js');
const registrationService = await import('#modules/auth/services/registration.service.js');
const passwordService = await import('#modules/auth/services/password.service.js');
const sessionService = await import('#modules/auth/services/session.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const tokens = {
  tokenType: 'Bearer',
  accessToken: 'access.jwt.token',
  expiresIn: 900,
  refreshToken: 'r'.repeat(64),
  refreshExpiresAt: new Date().toISOString(),
  sessionId: SESSION_ID,
};
const strongPassword = 'Correct-Horse-Battery-9';

beforeEach(() => anonymous());

describe('POST /auth/register', () => {
  it('normalises the email and responds 202 without revealing existence', async () => {
    registrationService.register.mockResolvedValue();
    const res = await api()
      .post('/v1/auth/register')
      .send({ email: '  New.User@Example.COM ', password: strongPassword, name: 'New' });
    expect(res.status).toBe(202);
    expect(registrationService.register).toHaveBeenCalledWith(
      { email: 'new.user@example.com', password: strongPassword, name: 'New' },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it('rejects weak input with field-level validation errors', async () => {
    const res = await api().post('/v1/auth/register').send({ email: 'nope', password: 'short', extra: true });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email', source: 'body', code: 'INVALID_FORMAT' }),
        expect.objectContaining({ field: 'password', code: 'TOO_SHORT' }),
        expect.objectContaining({ code: 'UNRECOGNIZED_FIELD' }),
      ]),
    );
    expect(registrationService.register).not.toHaveBeenCalled();
  });

  it('requires mixed case and a digit in the password', async () => {
    const res = await api().post('/v1/auth/register').send({ email: 'a@b.co', password: 'alllowercaseletters' });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0].field).toBe('password');
  });
});

describe('POST /auth/login', () => {
  it('returns tokens and sets a hardened refresh cookie', async () => {
    loginService.login.mockResolvedValue({ mfaRequired: false, ...tokens });
    const res = await api().post('/v1/auth/login').send({ email: 'user@example.com', password: 'whatever' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    const cookie = cookieNamed(res, 'rt');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/v1\/auth/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns an MFA challenge without a cookie when MFA is enabled', async () => {
    loginService.login.mockResolvedValue({ mfaRequired: true, mfaToken: 'a.b.c', expiresIn: 300 });
    const res = await api().post('/v1/auth/login').send({ email: 'user@example.com', password: 'whatever' });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(cookieNamed(res, 'rt')).toBeNull();
  });

  it('maps invalid credentials to a 401 problem with WWW-Authenticate', async () => {
    loginService.login.mockRejectedValue(DomainErrors.invalidCredentials());
    const res = await api().post('/v1/auth/login').send({ email: 'user@example.com', password: 'bad' });
    expectProblem(res, 401, 'INVALID_CREDENTIALS');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('maps a locked account to 423', async () => {
    loginService.login.mockRejectedValue(DomainErrors.accountLocked());
    const res = await api().post('/v1/auth/login').send({ email: 'user@example.com', password: 'bad' });
    expectProblem(res, 423, 'ACCOUNT_LOCKED');
  });
});

describe('POST /auth/login/mfa', () => {
  it('accepts a TOTP code', async () => {
    loginService.loginMfa.mockResolvedValue({ mfaRequired: false, ...tokens });
    const res = await api()
      .post('/v1/auth/login/mfa')
      .send({ mfaToken: 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc', code: '123456' });
    expect(res.status).toBe(200);
    expect(cookieNamed(res, 'rt')).not.toBeNull();
  });

  it('rejects a malformed code', async () => {
    const res = await api().post('/v1/auth/login/mfa').send({ mfaToken: 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc', code: '12' });
    expectProblem(res, 400, 'VALIDATION_FAILED');
  });
});

describe('POST /auth/refresh', () => {
  it('reads the refresh token from the cookie when the body is empty', async () => {
    sessionService.refresh.mockResolvedValue(tokens);
    const res = await api()
      .post('/v1/auth/refresh')
      .set('Cookie', `rt=${'c'.repeat(64)}`)
      .send({});
    expect(res.status).toBe(200);
    expect(sessionService.refresh).toHaveBeenCalledWith('c'.repeat(64), expect.any(Object));
  });

  it('prefers the body token over the cookie', async () => {
    sessionService.refresh.mockResolvedValue(tokens);
    await api()
      .post('/v1/auth/refresh')
      .set('Cookie', `rt=${'c'.repeat(64)}`)
      .send({ refreshToken: 'b'.repeat(64) });
    expect(sessionService.refresh).toHaveBeenCalledWith('b'.repeat(64), expect.any(Object));
  });

  it('responds 401 when no token is supplied', async () => {
    const res = await api().post('/v1/auth/refresh').send({});
    expectProblem(res, 401, 'AUTHENTICATION_REQUIRED');
    expect(sessionService.refresh).not.toHaveBeenCalled();
  });

  it('clears the cookie when rotation fails', async () => {
    sessionService.refresh.mockRejectedValue(DomainErrors.refreshReuse());
    const res = await api()
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'b'.repeat(64) });
    expectProblem(res, 401, 'REFRESH_TOKEN_REUSE');
    expect(cookieNamed(res, 'rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('session endpoints', () => {
  it('rejects anonymous logout', async () => {
    const res = await api().post('/v1/auth/logout');
    expectProblem(res, 401, 'AUTHENTICATION_REQUIRED');
  });

  it('rejects client tokens on user-only routes', async () => {
    asClient(['billing:read']);
    const res = await api().post('/v1/auth/logout');
    expectProblem(res, 403, 'USER_TOKEN_REQUIRED');
  });

  it('logs out and clears the cookie', async () => {
    asUser();
    sessionService.logout.mockResolvedValue();
    const res = await api().post('/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(sessionService.logout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, sessionId: SESSION_ID }),
      expect.any(Object),
    );
    expect(cookieNamed(res, 'rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('lists sessions', async () => {
    asUser();
    sessionService.listSessions.mockResolvedValue([{ id: SESSION_ID, current: true }]);
    const res = await api().get('/v1/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
  });

  it('validates the session id parameter', async () => {
    asUser();
    const res = await api().delete('/v1/auth/sessions/not-a-uuid');
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0]).toMatchObject({ field: 'id', source: 'params' });
  });
});

describe('password endpoints', () => {
  it('always responds 202 to forgot-password', async () => {
    passwordService.forgotPassword.mockResolvedValue();
    const res = await api().post('/v1/auth/password/forgot').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(202);
  });

  it('rejects a change where the new password equals the current one', async () => {
    asUser();
    const res = await api()
      .post('/v1/auth/password/change')
      .send({ currentPassword: strongPassword, newPassword: strongPassword });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0].field).toBe('newPassword');
    expect(passwordService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password for the authenticated user', async () => {
    asUser();
    passwordService.changePassword.mockResolvedValue();
    const res = await api()
      .post('/v1/auth/password/change')
      .send({ currentPassword: 'Old-Password-1', newPassword: strongPassword });
    expect(res.status).toBe(200);
    expect(passwordService.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      { currentPassword: 'Old-Password-1', newPassword: strongPassword },
      expect.any(Object),
    );
  });
});
