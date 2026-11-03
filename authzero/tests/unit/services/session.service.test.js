import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_ID, USER_ID } from '../../helpers/principal.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/audit/audit.service.js');
vi.mock('#infra/messaging/outbox.service.js');
vi.mock('#modules/users/user.repository.js');
vi.mock('#modules/auth/repositories/session.repository.js');
vi.mock('#modules/auth/services/token-issuer.js');

const { listSessions, refresh, revokeSession } = await import('#modules/auth/services/session.service.js');
const audit = await import('#modules/audit/audit.service.js');
const outbox = await import('#infra/messaging/outbox.service.js');
const users = await import('#modules/users/user.repository.js');
const sessions = await import('#modules/auth/repositories/session.repository.js');
const issuer = await import('#modules/auth/services/token-issuer.js');

const ctx = { ip: '::1', userAgent: 'ua', requestId: 'r' };
const NEW_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const FAMILY = '66666666-6666-4666-8666-666666666666';
const live = {
  id: SESSION_ID,
  user_id: USER_ID,
  family_id: FAMILY,
  expires_at: new Date(Date.now() + 60_000),
  revoked_at: null,
};

beforeEach(() => {
  audit.audit.mockResolvedValue();
  outbox.publish.mockResolvedValue();
  sessions.revoke.mockResolvedValue();
  sessions.revokeFamily.mockResolvedValue();
  users.findById.mockResolvedValue({ id: USER_ID, status: 'active' });
  issuer.issueSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', sessionId: NEW_SESSION_ID });
});

describe('refresh', () => {
  it('rejects unknown tokens', async () => {
    sessions.findByRefreshTokenForUpdate.mockResolvedValue(null);
    await expect(refresh('t', ctx)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('revokes the entire family when a rotated token is replayed', async () => {
    sessions.findByRefreshTokenForUpdate.mockResolvedValue({ ...live, revoked_at: new Date() });
    await expect(refresh('t', ctx)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSE' });
    expect(sessions.revokeFamily).toHaveBeenCalledWith(FAMILY, 'reuse_detected');
    expect(outbox.publish).toHaveBeenCalledWith('session.reuse_detected', { userId: USER_ID, sessionId: SESSION_ID });
    expect(audit.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.refresh_reuse_detected' }));
    expect(issuer.issueSession).not.toHaveBeenCalled();
  });

  it('rejects expired tokens and disabled users', async () => {
    sessions.findByRefreshTokenForUpdate.mockResolvedValueOnce({ ...live, expires_at: new Date(Date.now() - 1) });
    await expect(refresh('t', ctx)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    sessions.findByRefreshTokenForUpdate.mockResolvedValueOnce(live);
    users.findById.mockResolvedValueOnce({ id: USER_ID, status: 'disabled' });
    await expect(refresh('t', ctx)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(sessions.revokeFamily).not.toHaveBeenCalled();
  });

  it('rotates within the same family and links the replaced session', async () => {
    sessions.findByRefreshTokenForUpdate.mockResolvedValue(live);
    const result = await refresh('t', ctx);
    expect(result.sessionId).toBe(NEW_SESSION_ID);
    expect(issuer.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: USER_ID }), ctx, tx, {
      familyId: FAMILY,
    });
    expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID, 'rotated', NEW_SESSION_ID, tx);
  });
});

describe('session management', () => {
  it('marks the current session in listings', async () => {
    sessions.listActiveForUser.mockResolvedValue([{ id: SESSION_ID }, { id: NEW_SESSION_ID }]);
    const list = await listSessions({ userId: USER_ID, sessionId: SESSION_ID });
    expect(list.map((s) => s.current)).toEqual([true, false]);
  });

  it('only revokes sessions owned by the caller', async () => {
    sessions.revokeOwned.mockResolvedValue(false);
    await expect(revokeSession({ userId: USER_ID }, NEW_SESSION_ID, ctx)).rejects.toMatchObject({ status: 404 });
    sessions.revokeOwned.mockResolvedValue(true);
    await expect(revokeSession({ userId: USER_ID }, NEW_SESSION_ID, ctx)).resolves.toBeUndefined();
  });
});
