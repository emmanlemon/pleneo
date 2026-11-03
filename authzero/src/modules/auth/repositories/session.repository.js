import { randomUUID } from 'node:crypto';
import { query } from '#infra/database/pool.js';
import { config } from '#config';
import { randomToken, sha256 } from '#infra/security/crypto.js';

const TTL = `${config.REFRESH_TOKEN_TTL_DAYS} days`;

export async function create({ userId, familyId = randomUUID(), ctx }, client = { query }) {
  const refreshToken = randomToken(48);
  const { rows } = await client.query(
    `INSERT INTO sessions (user_id, family_id, refresh_token_hash, ip, user_agent, expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, now() + $6::interval, now())
     RETURNING id, family_id, expires_at`,
    [userId, familyId, sha256(refreshToken), ctx.ip ?? null, ctx.userAgent ?? null, TTL],
  );
  return { ...rows[0], refreshToken };
}

export const findByRefreshTokenForUpdate = async (refreshToken, client) =>
  (
    await client.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = $1 FOR UPDATE`,
      [sha256(refreshToken)],
    )
  ).rows[0] ?? null;

export const revoke = (sessionId, reason, replacedBy = null, client = { query }) =>
  client.query(
    `UPDATE sessions SET revoked_at = now(), revoke_reason = $2, replaced_by = $3 WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, reason, replacedBy],
  );

export const revokeFamily = (familyId, reason, client = { query }) =>
  client.query(
    `UPDATE sessions SET revoked_at = now(), revoke_reason = $2 WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId, reason],
  );

export const revokeAllForUser = (userId, reason, exceptSessionId = null, client = { query }) =>
  client.query(
    `UPDATE sessions SET revoked_at = now(), revoke_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3)`,
    [userId, reason, exceptSessionId],
  );

export const revokeOwned = async (userId, sessionId) =>
  (
    await query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = 'user_revoked' WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL`,
      [userId, sessionId],
    )
  ).rowCount > 0;

export const listActiveForUser = async (userId) =>
  (
    await query(
      `SELECT id, ip, user_agent, created_at, last_used_at, expires_at
         FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC`,
      [userId],
    )
  ).rows;

export const deleteExpired = () =>
  query(
    `DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`,
  );
