import { withTransaction } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { audit } from '#modules/audit/audit.service.js';
import { publish } from '#infra/messaging/outbox.service.js';
import * as users from '#modules/users/user.repository.js';
import * as sessions from '../repositories/session.repository.js';
import { issueSession } from './token-issuer.js';

async function handleReuse(session, ctx) {
  await sessions.revokeFamily(session.family_id, 'reuse_detected');
  await audit({
    actorId: session.user_id,
    actorType: 'user',
    action: 'auth.refresh_reuse_detected',
    targetType: 'session',
    targetId: session.id,
    ctx,
  });
  await publish('session.reuse_detected', { userId: session.user_id, sessionId: session.id });
}

export async function refresh(refreshToken, ctx) {
  let reused = null;
  try {
    return await withTransaction(async (client) => {
      const session = await sessions.findByRefreshTokenForUpdate(refreshToken, client);
      if (!session) throw DomainErrors.invalidToken('Invalid refresh token');
      if (session.revoked_at) {
        reused = session;
        throw DomainErrors.refreshReuse();
      }
      if (new Date(session.expires_at) <= new Date()) throw DomainErrors.tokenExpired();

      const user = await users.findById(session.user_id, client);
      if (!user || user.status !== 'active') throw DomainErrors.accountDisabled();

      const result = await issueSession(user, ctx, client, { familyId: session.family_id });
      await sessions.revoke(session.id, 'rotated', result.sessionId, client);
      return result;
    });
  } catch (err) {
    if (reused) await handleReuse(reused, ctx);
    throw err;
  }
}

export async function logout(auth, ctx) {
  await sessions.revoke(auth.sessionId, 'logout');
  await audit({
    actorId: auth.userId,
    actorType: 'user',
    action: 'auth.logout',
    targetType: 'session',
    targetId: auth.sessionId,
    ctx,
  });
}

export async function logoutAll(auth, ctx) {
  await sessions.revokeAllForUser(auth.userId, 'logout_all');
  await audit({ actorId: auth.userId, actorType: 'user', action: 'auth.logout_all', ctx });
}

export const listSessions = async (auth) =>
  (await sessions.listActiveForUser(auth.userId)).map((s) => ({ ...s, current: s.id === auth.sessionId }));

export async function revokeSession(auth, sessionId, ctx) {
  if (!(await sessions.revokeOwned(auth.userId, sessionId))) throw DomainErrors.notFound('Session');
  await audit({
    actorId: auth.userId,
    actorType: 'user',
    action: 'session.revoked',
    targetType: 'session',
    targetId: sessionId,
    ctx,
  });
}
