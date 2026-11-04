import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { withTransaction } from '#infra/database/pool.js';
import { publish } from '#infra/messaging/outbox.service.js';
import { hashPassword, randomToken } from '#infra/security/crypto.js';
import { audit } from '#modules/audit/audit.service.js';
import { assertNotEmailDerived } from '#modules/auth/domain/password-policy.js';
import * as tokens from '#modules/auth/repositories/token.repository.js';
import { ROLES } from '#modules/users/catalogue.js';
import * as roles from '#modules/users/role.repository.js';
import * as users from '#modules/users/user.repository.js';

const PURPOSE = 'invite';

const issue = (userId, client) =>
  tokens.issue({ userId, purpose: PURPOSE, ttlMinutes: config.INVITE_TTL_MINUTES }, client);

const invitedPayload = (user, inviteToken, actor) => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  inviteToken,
  invitedBy: actor.email,
});

export async function invite({ email, name, roles: requested }, actor, ctx) {
  if (await users.findByEmail(email)) throw DomainErrors.alreadyExists();
  const roleNames = [...new Set([ROLES.USER, ...requested])];
  const known = new Set((await roles.listAll()).map((r) => r.name));
  if (!roleNames.every((r) => known.has(r))) throw DomainErrors.notFound('Role');

  const passwordHash = await hashPassword(randomToken(32));
  return withTransaction(async (client) => {
    const user = await users.create({ email, passwordHash, name, status: 'invited' }, client);
    for (const role of roleNames) await roles.assign(user.id, role, actor.userId, client);
    const inviteToken = await issue(user.id, client);
    await publish('user.invited', invitedPayload(user, inviteToken, actor), client);
    await audit({
      actorId: actor.userId,
      actorType: 'user',
      action: 'admin.user_invited',
      targetType: 'user',
      targetId: user.id,
      ctx,
      metadata: { email, roles: roleNames },
    });
    return user;
  });
}

export async function resend(userId, actor, ctx) {
  const user = await users.findById(userId);
  if (!user) throw DomainErrors.notFound('User');
  if (user.status !== 'invited') throw DomainErrors.invitationAccepted();
  const inviteToken = await issue(user.id);
  await publish('user.invited', invitedPayload(user, inviteToken, actor));
  await audit({
    actorId: actor.userId,
    actorType: 'user',
    action: 'admin.invitation_resent',
    targetType: 'user',
    targetId: user.id,
    ctx,
  });
}

export async function accept({ token, password }, ctx) {
  await withTransaction(async (client) => {
    const userId = await tokens.consume({ token, purpose: PURPOSE }, client);
    if (!userId) throw DomainErrors.invalidToken('Invalid or expired invitation');
    const user = await users.findById(userId, client);
    assertNotEmailDerived(user.email, password);
    const activated = await users.activateInvited(userId, await hashPassword(password), client);
    if (!activated) throw DomainErrors.invalidToken('Invalid or expired invitation');
    await publish('user.invitation_accepted', { userId, email: user.email }, client);
    await audit({
      actorId: userId,
      actorType: 'user',
      action: 'user.invitation_accepted',
      targetType: 'user',
      targetId: userId,
      ctx,
    });
  });
}
