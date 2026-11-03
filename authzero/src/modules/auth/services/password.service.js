import { config } from '#config';
import { withTransaction } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { hashPassword, verifyPassword } from '#infra/security/crypto.js';
import { audit } from '#modules/audit/audit.service.js';
import { publish } from '#infra/messaging/outbox.service.js';
import * as security from '#modules/users/user-security.repository.js';
import * as users from '#modules/users/user.repository.js';
import { assertPasswordAllowed } from '../domain/password-policy.js';
import * as sessions from '../repositories/session.repository.js';
import * as tokens from '../repositories/token.repository.js';

async function rotate({ user, newPassword, reason, keepSessionId = null, ctx }, client) {
  await assertPasswordAllowed(user, newPassword, client);
  await security.rotatePassword(
    {
      userId: user.id,
      previousHash: user.password_hash,
      newHash: await hashPassword(newPassword),
      historySize: config.PASSWORD_HISTORY_SIZE,
    },
    client,
  );
  await sessions.revokeAllForUser(user.id, `password_${reason}`, keepSessionId, client);
  await publish('user.password_changed', { userId: user.id, email: user.email, reason }, client);
  await audit({
    actorId: user.id,
    actorType: 'user',
    action: `user.password_${reason}`,
    targetType: 'user',
    targetId: user.id,
    ctx,
  });
}

export async function forgotPassword({ email }, ctx) {
  const user = await users.findByEmail(email);
  if (!user || user.status !== 'active') return;
  const resetToken = await tokens.issue({
    userId: user.id,
    purpose: 'password_reset',
    ttlMinutes: config.PASSWORD_RESET_TTL_MINUTES,
  });
  await publish('user.password_reset_requested', { userId: user.id, email: user.email, resetToken });
  await audit({ actorId: user.id, actorType: 'user', action: 'user.password_reset_requested', ctx });
}

export async function resetPassword({ token, password }, ctx) {
  await withTransaction(async (client) => {
    const userId = await tokens.consume({ token, purpose: 'password_reset' }, client);
    if (!userId) throw DomainErrors.invalidToken('Invalid or expired reset token');
    const user = await users.findById(userId, client);
    await rotate({ user, newPassword: password, reason: 'reset', ctx }, client);
  });
}

export async function changePassword(auth, { currentPassword, newPassword }, ctx) {
  const user = await users.findById(auth.userId);
  if (!(await verifyPassword(user.password_hash, currentPassword))) {
    await audit({ actorId: user.id, actorType: 'user', action: 'user.password_change_failed', ctx });
    throw DomainErrors.invalidCredentials();
  }
  await withTransaction((client) =>
    rotate({ user, newPassword, reason: 'changed', keepSessionId: auth.sessionId, ctx }, client),
  );
}
