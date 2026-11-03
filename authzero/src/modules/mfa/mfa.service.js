import { query, withTransaction } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { decrypt, encrypt, verifyPassword } from '#infra/security/crypto.js';
import { audit } from '#modules/audit/audit.service.js';
import { publish } from '#infra/messaging/outbox.service.js';
import * as sessions from '#modules/auth/repositories/session.repository.js';
import * as users from '#modules/users/user.repository.js';
import * as recovery from './recovery-codes.js';
import { checkTotp, generateSecret, isTotpFormat, keyUri } from './totp.js';

export async function verifyCode(user, code) {
  if (!user.mfa_secret_enc) return false;
  return isTotpFormat(code) ? checkTotp(code, decrypt(user.mfa_secret_enc)) : recovery.consume(user.id, code);
}

async function loadUser(auth, { enabled }) {
  const user = await users.findById(auth.userId);
  if (enabled && !user.mfa_enabled) throw DomainErrors.mfaNotEnabled();
  if (!enabled && user.mfa_enabled) throw DomainErrors.mfaAlreadyEnabled();
  return user;
}

async function reauthenticate(user, password) {
  if (!(await verifyPassword(user.password_hash, password))) throw DomainErrors.invalidCredentials();
}

export async function setup(auth, ctx) {
  const user = await loadUser(auth, { enabled: false });
  const secret = generateSecret();
  await query(`UPDATE users SET mfa_secret_enc = $2 WHERE id = $1`, [user.id, encrypt(secret)]);
  await audit({ actorId: user.id, actorType: 'user', action: 'mfa.setup_started', ctx });
  return { secret, otpauthUrl: keyUri(user.email, secret) };
}

export async function enable(auth, { code }, ctx) {
  const user = await loadUser(auth, { enabled: false });
  if (!user.mfa_secret_enc || !checkTotp(code, decrypt(user.mfa_secret_enc))) throw DomainErrors.mfaInvalid();

  const recoveryCodes = await withTransaction(async (client) => {
    await client.query(`UPDATE users SET mfa_enabled = TRUE WHERE id = $1`, [user.id]);
    const codes = await recovery.regenerate(user.id, client);
    await sessions.revokeAllForUser(user.id, 'mfa_enabled', auth.sessionId, client);
    await publish('user.mfa_enabled', { userId: user.id, email: user.email }, client);
    return codes;
  });
  await audit({ actorId: user.id, actorType: 'user', action: 'mfa.enabled', ctx });
  return { recoveryCodes };
}

export async function disable(auth, { password, code }, ctx) {
  const user = await loadUser(auth, { enabled: true });
  await reauthenticate(user, password);
  if (!(await verifyCode(user, code))) throw DomainErrors.mfaInvalid();

  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET mfa_enabled = FALSE, mfa_secret_enc = NULL WHERE id = $1`, [user.id]);
    await recovery.removeAll(user.id, client);
    await publish('user.mfa_disabled', { userId: user.id, email: user.email }, client);
  });
  await audit({ actorId: user.id, actorType: 'user', action: 'mfa.disabled', ctx });
}

export async function regenerateRecoveryCodes(auth, { password }, ctx) {
  const user = await loadUser(auth, { enabled: true });
  await reauthenticate(user, password);
  const recoveryCodes = await withTransaction((client) => recovery.regenerate(user.id, client));
  await audit({ actorId: user.id, actorType: 'user', action: 'mfa.recovery_codes_regenerated', ctx });
  return { recoveryCodes };
}
