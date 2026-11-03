import { config } from '#config';
import { withTransaction } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { dummyPasswordVerify, hashPassword, needsRehash, verifyPassword } from '#infra/security/crypto.js';
import { signMfaToken, verifyMfaToken } from '#infra/security/jwt.js';
import { audit } from '#modules/audit/audit.service.js';
import { publish } from '#infra/messaging/outbox.service.js';
import { verifyCode } from '#modules/mfa/mfa.service.js';
import * as security from '#modules/users/user-security.repository.js';
import * as users from '#modules/users/user.repository.js';
import { issueSession } from './token-issuer.js';

const isLocked = (user) => user.locked_until && new Date(user.locked_until) > new Date();

async function registerFailure(user, reason, ctx) {
  const { locked_until } = await security.recordFailedLogin(user.id, config.MAX_FAILED_LOGINS, config.LOCKOUT_MINUTES);
  await audit({
    actorId: user.id,
    actorType: 'user',
    action: 'auth.login_failed',
    ctx,
    metadata: { reason, locked: Boolean(locked_until) },
  });
  if (locked_until) await publish('user.locked', { userId: user.id, email: user.email, lockedUntil: locked_until });
}

async function completeLogin(user, ctx) {
  const result = await withTransaction(async (client) => {
    await security.recordSuccessfulLogin(user.id, client);
    return issueSession(user, ctx, client);
  });
  await audit({
    actorId: user.id,
    actorType: 'user',
    action: 'auth.login',
    targetType: 'session',
    targetId: result.sessionId,
    ctx,
  });
  return { mfaRequired: false, ...result };
}

export async function login({ email, password }, ctx) {
  const user = await users.findByEmail(email);
  if (!user) {
    await dummyPasswordVerify();
    await audit({ action: 'auth.login_failed', ctx, metadata: { reason: 'unknown_user' } });
    throw DomainErrors.invalidCredentials();
  }
  if (isLocked(user)) {
    await audit({
      actorId: user.id,
      actorType: 'user',
      action: 'auth.login_blocked',
      ctx,
      metadata: { reason: 'locked' },
    });
    throw DomainErrors.accountLocked();
  }
  if (!(await verifyPassword(user.password_hash, password))) {
    await registerFailure(user, 'bad_password', ctx);
    throw DomainErrors.invalidCredentials();
  }
  if (user.status !== 'active') throw DomainErrors.accountDisabled();
  if (config.REQUIRE_EMAIL_VERIFICATION && !user.email_verified) throw DomainErrors.emailUnverified();
  if (needsRehash(user.password_hash)) await security.updatePasswordHash(user.id, await hashPassword(password));

  if (!user.mfa_enabled) return completeLogin(user, ctx);

  const mfaToken = await signMfaToken({ subject: user.id, claims: { token_use: 'mfa' } });
  await audit({ actorId: user.id, actorType: 'user', action: 'auth.mfa_challenge', ctx });
  return { mfaRequired: true, mfaToken, expiresIn: config.MFA_CHALLENGE_TTL_SECONDS };
}

export async function loginMfa({ mfaToken, code }, ctx) {
  const payload = await verifyMfaToken(mfaToken);
  if (payload.token_use !== 'mfa') throw DomainErrors.invalidToken();
  const user = await users.findById(payload.sub);
  if (!user || user.status !== 'active' || !user.mfa_enabled || isLocked(user)) throw DomainErrors.invalidToken();
  if (!(await verifyCode(user, code))) {
    await registerFailure(user, 'bad_mfa_code', ctx);
    throw DomainErrors.mfaInvalid();
  }
  return completeLogin(user, ctx);
}
