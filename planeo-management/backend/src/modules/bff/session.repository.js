import { query } from '#infra/database/pool.js';

const COLUMNS = `id, user_id, email, access_token_enc, refresh_token_enc, access_expires_at, expires_at,
  csrf_hash, last_used_at, revoked_at, created_at`;

export const create = async (
  { tokenHash, csrfHash, userId, email, accessTokenEnc, refreshTokenEnc, accessExpiresAt, expiresAt, ip, userAgent },
  client = { query },
) =>
  (
    await client.query(
      `INSERT INTO bff_sessions (token_hash, csrf_hash, user_id, email, access_token_enc, refresh_token_enc,
                                 access_expires_at, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLUMNS}`,
      [tokenHash, csrfHash, userId, email ?? null, accessTokenEnc, refreshTokenEnc, accessExpiresAt, expiresAt, ip ?? null, userAgent ?? null],
    )
  ).rows[0];

export const findByTokenHash = async (tokenHash, client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM bff_sessions WHERE token_hash = $1`, [tokenHash])).rows[0] ?? null;

export const lockByTokenHash = async (tokenHash, client) =>
  (await client.query(`SELECT ${COLUMNS} FROM bff_sessions WHERE token_hash = $1 FOR UPDATE`, [tokenHash])).rows[0] ?? null;

export const storeTokens = (id, { accessTokenEnc, refreshTokenEnc, accessExpiresAt }, client = { query }) =>
  client.query(
    `UPDATE bff_sessions SET access_token_enc = $2, refresh_token_enc = $3, access_expires_at = $4, last_used_at = now()
      WHERE id = $1`,
    [id, accessTokenEnc, refreshTokenEnc, accessExpiresAt],
  );

export const touch = (id, client = { query }) => client.query(`UPDATE bff_sessions SET last_used_at = now() WHERE id = $1`, [id]);

export const revoke = (id, reason, client = { query }) =>
  client.query(`UPDATE bff_sessions SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL`, [id, reason]);

export const revokeAllForUser = (userId, reason) =>
  query(`UPDATE bff_sessions SET revoked_at = now(), revoke_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL`, [userId, reason]);

export const prune = (retentionDays) =>
  query(
    `DELETE FROM bff_sessions WHERE expires_at < now() - ($1 || ' days')::interval
        OR (revoked_at IS NOT NULL AND revoked_at < now() - ($1 || ' days')::interval)`,
    [String(retentionDays)],
  );
