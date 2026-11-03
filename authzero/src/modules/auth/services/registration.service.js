import { config } from '#config';
import { withTransaction } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { hashPassword } from '#infra/security/crypto.js';
import { audit } from '#modules/audit/audit.service.js';
import { publish } from '#infra/messaging/outbox.service.js';
import * as roles from '#modules/users/role.repository.js';
import * as users from '#modules/users/user.repository.js';
import { assertNotEmailDerived } from '../domain/password-policy.js';
import * as tokens from '../repositories/token.repository.js';

const issueVerification = (userId, client) =>
  tokens.issue({ userId, purpose: 'email_verify', ttlMinutes: config.EMAIL_TOKEN_TTL_MINUTES }, client);

export async function register({ email, password, name }, ctx) {
  assertNotEmailDerived(email, password);
  const existing = await users.findByEmail(email);
  if (existing) {
    await publish('user.registration_attempt_existing', { userId: existing.id, email: existing.email });
    await audit({ action: 'user.register_duplicate', targetType: 'user', targetId: existing.id, ctx });
    return;
  }
  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    const user = await users.create({ email, passwordHash, name }, client);
    await roles.assign(user.id, 'user', null, client);
    const verificationToken = await issueVerification(user.id, client);
    await publish(
      'user.registered',
      { userId: user.id, email: user.email, name: user.name, verificationToken },
      client,
    );
    await audit({
      actorId: user.id,
      actorType: 'user',
      action: 'user.registered',
      targetType: 'user',
      targetId: user.id,
      ctx,
    });
  });
}

export async function verifyEmail({ token }, ctx) {
  await withTransaction(async (client) => {
    const userId = await tokens.consume({ token, purpose: 'email_verify' }, client);
    if (!userId) throw DomainErrors.invalidToken('Invalid or expired verification token');
    await users.markEmailVerified(userId, client);
    await publish('user.email_verified', { userId }, client);
    await audit({
      actorId: userId,
      actorType: 'user',
      action: 'user.email_verified',
      targetType: 'user',
      targetId: userId,
      ctx,
    });
  });
}

export async function resendVerification({ email }, ctx) {
  const user = await users.findByEmail(email);
  if (!user || user.email_verified) return;
  const verificationToken = await issueVerification(user.id);
  await publish('user.email_verification_requested', { userId: user.id, email: user.email, verificationToken });
  await audit({ actorId: user.id, actorType: 'user', action: 'user.verification_resent', ctx });
}
