import { query } from '#infra/database/pool.js';

export const findActiveByDevice = async (deviceId, tokenHash, client = { query }) =>
  (
    await client.query(
      `SELECT c.id, c.device_id, c.expires_at, d.external_id, d.owner_id, d.device_type_id, d.status AS device_status
         FROM device_credentials c
         JOIN devices d ON d.id = c.device_id AND d.deleted_at IS NULL
        WHERE c.device_id = $1 AND c.token_hash = $2 AND c.revoked_at IS NULL`,
      [deviceId, tokenHash],
    )
  ).rows[0] ?? null;

export const issue = async ({ deviceId, tokenHash, label, expiresAt, actorId }, client = { query }) =>
  (
    await client.query(
      `INSERT INTO device_credentials (device_id, token_hash, label, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, label, expires_at, created_at`,
      [deviceId, tokenHash, label, expiresAt ?? null, actorId ?? null],
    )
  ).rows[0];

export const listForDevice = async (deviceId) =>
  (
    await query(
      `SELECT id, label, expires_at, last_used_at, revoked_at, revoke_reason, created_at
         FROM device_credentials WHERE device_id = $1 ORDER BY created_at DESC`,
      [deviceId],
    )
  ).rows;

export const revokeAllForDevice = (deviceId, reason, client = { query }) =>
  client.query(
    `UPDATE device_credentials SET revoked_at = now(), revoke_reason = $2 WHERE device_id = $1 AND revoked_at IS NULL`,
    [deviceId, reason],
  );

export const revokeOne = async (deviceId, credentialId, reason) =>
  (
    await query(
      `UPDATE device_credentials SET revoked_at = now(), revoke_reason = $3
        WHERE device_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`,
      [deviceId, credentialId, reason],
    )
  ).rows[0] ?? null;

export const touch = (id) => query(`UPDATE device_credentials SET last_used_at = now() WHERE id = $1`, [id]);
