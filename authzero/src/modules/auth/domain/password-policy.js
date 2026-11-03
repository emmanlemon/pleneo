import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { verifyPassword } from '#infra/security/crypto.js';
import * as security from '#modules/users/user-security.repository.js';

export function assertNotEmailDerived(email, password) {
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) throw DomainErrors.passwordContainsEmail();
}

export async function assertNotReused(user, password, client) {
  if (config.PASSWORD_HISTORY_SIZE === 0) return;
  const history = await security.getPasswordHistory(user.id, config.PASSWORD_HISTORY_SIZE, client);
  for (const { password_hash } of [{ password_hash: user.password_hash }, ...history]) {
    if (await verifyPassword(password_hash, password)) throw DomainErrors.passwordReused();
  }
}

export async function assertPasswordAllowed(user, password, client) {
  assertNotEmailDerived(user.email, password);
  await assertNotReused(user, password, client);
}
