import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_ID, USER_ID } from '../../helpers/principal.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn({ query: vi.fn() })),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/security/crypto.js', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyPassword: vi.fn(),
  dummyPasswordVerify: vi.fn(),
  needsRehash: vi.fn(() => false),
  hashPassword: vi.fn(async (p) => `hashed:${p}`),
}));
vi.mock('#infra/security/jwt.js');
vi.mock('#modules/audit/audit.service.js');
vi.mock('#infra/messaging/outbox.service.js');
vi.mock('#modules/mfa/mfa.service.js');
vi.mock('#modules/users/user.repository.js');
vi.mock('#modules/users/user-security.repository.js');
vi.mock('#modules/auth/services/token-issuer.js');

const { login, loginMfa } = await import('#modules/auth/services/login.service.js');
const crypto = await import('#infra/security/crypto.js');
const jwt = await import('#infra/security/jwt.js');
const audit = await import('#modules/audit/audit.service.js');
const outbox = await import('#infra/messaging/outbox.service.js');
const mfa = await import('#modules/mfa/mfa.service.js');
const users = await import('#modules/users/user.repository.js');
const security = await import('#modules/users/user-security.repository.js');
const issuer = await import('#modules/auth/services/token-issuer.js');

const ctx = { ip: '127.0.0.1', userAgent: 'test', requestId: 'r' };
const baseUser = {
  id: USER_ID,
  email: 'user@example.com',
  password_hash: 'h',
  status: 'active',
  email_verified: true,
  mfa_enabled: false,
  locked_until: null,
};
const tokens = { accessToken: 'a', refreshToken: 'r', sessionId: SESSION_ID };

beforeEach(() => {
  audit.audit.mockResolvedValue();
  outbox.publish.mockResolvedValue();
  security.recordFailedLogin.mockResolvedValue({ locked_until: null });
  security.recordSuccessfulLogin.mockResolvedValue();
  issuer.issueSession.mockResolvedValue(tokens);
});

describe('login', () => {
  it('burns a dummy hash and fails generically for unknown users', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(login({ email: 'ghost@example.com', password: 'x' }, ctx)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(crypto.dummyPasswordVerify).toHaveBeenCalled();
    expect(crypto.verifyPassword).not.toHaveBeenCalled();
  });

  it('blocks locked accounts before checking the password', async () => {
    users.findByEmail.mockResolvedValue({ ...baseUser, locked_until: new Date(Date.now() + 60_000) });
    await expect(login({ email: baseUser.email, password: 'x' }, ctx)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
    expect(crypto.verifyPassword).not.toHaveBeenCalled();
  });

  it('records failures and publishes a lock event when the threshold is reached', async () => {
    users.findByEmail.mockResolvedValue(baseUser);
    crypto.verifyPassword.mockResolvedValue(false);
    security.recordFailedLogin.mockResolvedValue({ locked_until: new Date() });
    await expect(login({ email: baseUser.email, password: 'bad' }, ctx)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(security.recordFailedLogin).toHaveBeenCalledWith(USER_ID, expect.any(Number), expect.any(Number));
    expect(outbox.publish).toHaveBeenCalledWith('user.locked', expect.objectContaining({ userId: USER_ID }));
  });

  it('refuses disabled and unverified accounts after a correct password', async () => {
    crypto.verifyPassword.mockResolvedValue(true);
    users.findByEmail.mockResolvedValueOnce({ ...baseUser, status: 'disabled' });
    await expect(login({ email: baseUser.email, password: 'ok' }, ctx)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    users.findByEmail.mockResolvedValueOnce({ ...baseUser, email_verified: false });
    await expect(login({ email: baseUser.email, password: 'ok' }, ctx)).rejects.toMatchObject({
      code: 'EMAIL_UNVERIFIED',
    });
    expect(issuer.issueSession).not.toHaveBeenCalled();
  });

  it('issues a session on success and resets the failure counter', async () => {
    users.findByEmail.mockResolvedValue(baseUser);
    crypto.verifyPassword.mockResolvedValue(true);
    const result = await login({ email: baseUser.email, password: 'ok' }, ctx);
    expect(result).toMatchObject({ mfaRequired: false, ...tokens });
    expect(security.recordSuccessfulLogin).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(audit.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', targetId: SESSION_ID }));
  });

  it('upgrades outdated password hashes transparently', async () => {
    users.findByEmail.mockResolvedValue(baseUser);
    crypto.verifyPassword.mockResolvedValue(true);
    crypto.needsRehash.mockReturnValue(true);
    await login({ email: baseUser.email, password: 'ok' }, ctx);
    expect(security.updatePasswordHash).toHaveBeenCalledWith(USER_ID, 'hashed:ok');
  });

  it('returns an MFA challenge instead of tokens when MFA is enabled', async () => {
    users.findByEmail.mockResolvedValue({ ...baseUser, mfa_enabled: true });
    crypto.verifyPassword.mockResolvedValue(true);
    jwt.signMfaToken.mockResolvedValue('mfa.jwt');
    const result = await login({ email: baseUser.email, password: 'ok' }, ctx);
    expect(result).toMatchObject({ mfaRequired: true, mfaToken: 'mfa.jwt' });
    expect(issuer.issueSession).not.toHaveBeenCalled();
  });
});

describe('loginMfa', () => {
  beforeEach(() => {
    jwt.verifyMfaToken.mockResolvedValue({ sub: USER_ID, token_use: 'mfa' });
    users.findById.mockResolvedValue({ ...baseUser, mfa_enabled: true });
  });

  it('rejects challenge tokens of the wrong type', async () => {
    jwt.verifyMfaToken.mockResolvedValue({ sub: USER_ID, token_use: 'user' });
    await expect(loginMfa({ mfaToken: 't', code: '123456' }, ctx)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('counts a wrong code as a failed login attempt', async () => {
    mfa.verifyCode.mockResolvedValue(false);
    await expect(loginMfa({ mfaToken: 't', code: '000000' }, ctx)).rejects.toMatchObject({ code: 'MFA_INVALID' });
    expect(security.recordFailedLogin).toHaveBeenCalled();
  });

  it('completes the login with a valid code', async () => {
    mfa.verifyCode.mockResolvedValue(true);
    const result = await loginMfa({ mfaToken: 't', code: '123456' }, ctx);
    expect(result.accessToken).toBe('a');
  });
});
