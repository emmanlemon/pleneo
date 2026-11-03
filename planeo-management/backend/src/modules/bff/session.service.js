import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from '#infra/security/session-crypto.js';
import * as upstream from './authzero.client.js';
import * as sessions from './session.repository.js';

const log = logger.child({ component: 'bff' });

const sessionTtl = () => new Date(Date.now() + config.BFF_SESSION_TTL_DAYS * 86_400_000);
const needsRefresh = (session) =>
  new Date(session.access_expires_at).getTime() - Date.now() < config.BFF_REFRESH_SKEW_SECONDS * 1000;

export async function establish({ tokens, ctx }) {
  const sessionToken = randomToken(48);
  const csrfToken = randomToken(24);
  const profile = await upstream.profile(tokens.accessToken);

  const session = await sessions.create({
    tokenHash: sha256(sessionToken),
    csrfHash: sha256(csrfToken),
    userId: profile.id,
    email: profile.email,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: encrypt(tokens.refreshToken),
    accessExpiresAt: upstream.accessTokenExpiry(tokens.accessToken),
    expiresAt: sessionTtl(),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  log.info({ sessionId: session.id, userId: profile.id }, 'bff session established');
  return { sessionToken, csrfToken, profile };
}

async function rotate(session, client) {
  const refreshed = await upstream.refresh(decrypt(session.refresh_token_enc));
  await sessions.storeTokens(
    session.id,
    {
      accessTokenEnc: encrypt(refreshed.accessToken),
      refreshTokenEnc: encrypt(refreshed.refreshToken),
      accessExpiresAt: upstream.accessTokenExpiry(refreshed.accessToken),
    },
    client,
  );
  return refreshed.accessToken;
}

export async function resolve(sessionToken) {
  if (!sessionToken) return null;
  const tokenHash = sha256(sessionToken);

  const current = await sessions.findByTokenHash(tokenHash);
  if (!current || current.revoked_at || new Date(current.expires_at) <= new Date()) return null;

  if (!needsRefresh(current)) {
    void sessions.touch(current.id).catch(() => {});
    return { session: current, accessToken: decrypt(current.access_token_enc) };
  }

  return withTransaction(async (client) => {
    const locked = await sessions.lockByTokenHash(tokenHash, client);
    if (!locked || locked.revoked_at) return null;
    if (!needsRefresh(locked)) return { session: locked, accessToken: decrypt(locked.access_token_enc) };

    try {
      const accessToken = await rotate(locked, client);
      return { session: locked, accessToken };
    } catch (err) {
      await sessions.revoke(locked.id, 'refresh_failed', client);
      log.warn({ sessionId: locked.id, err: err.message }, 'bff session refresh failed, session revoked');
      return null;
    }
  });
}

export function assertCsrf(session, presented) {
  if (!presented || !safeEqual(session.csrf_hash, sha256(presented))) throw DomainErrors.csrfFailed();
}

export async function destroy(sessionToken) {
  if (!sessionToken) return;
  const session = await sessions.findByTokenHash(sha256(sessionToken));
  if (!session || session.revoked_at) return;
  await sessions.revoke(session.id, 'logout');
  await upstream.logout(decrypt(session.access_token_enc));
  log.info({ sessionId: session.id }, 'bff session destroyed');
}

export const revokeAllForUser = (userId) => sessions.revokeAllForUser(userId, 'logout_all');
export const prune = (retentionDays) => sessions.prune(retentionDays);
