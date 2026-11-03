import { query } from '#infra/database/pool.js';

const COLUMNS = `id, device_id, type, payload, status, result, error, expires_at, dispatched_at, completed_at, issued_by, created_at, updated_at`;

export const findById = async (id) =>
  (await query(`SELECT ${COLUMNS} FROM commands WHERE id = $1`, [id])).rows[0] ?? null;

export const insert = async ({ deviceId, type, payload, expiresAt, issuedBy }, client = { query }) =>
  (
    await client.query(
      `INSERT INTO commands (device_id, type, payload, expires_at, issued_by) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [deviceId, type, payload, expiresAt, issuedBy],
    )
  ).rows[0];

export const listForDevice = async (deviceId, { status, limit }) => {
  const params = [deviceId, limit];
  const conditions = ['device_id = $1'];
  if (status) conditions.push(`status = $${params.push(status)}`);
  return (
    await query(
      `SELECT ${COLUMNS} FROM commands WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $2`,
      params,
    )
  ).rows;
};

export const claimPending = async (deviceId, limit) =>
  (
    await query(
      `UPDATE commands SET status = 'dispatched', dispatched_at = now()
        WHERE id IN (
          SELECT id FROM commands
           WHERE device_id = $1 AND status = 'pending' AND expires_at > now()
           ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING ${COLUMNS}`,
      [deviceId, limit],
    )
  ).rows;

export const complete = async ({ id, deviceId, status, result, error }) =>
  (
    await query(
      `UPDATE commands SET status = $3, result = $4, error = $5, completed_at = now()
        WHERE id = $1 AND device_id = $2 AND status IN ('pending', 'dispatched') RETURNING ${COLUMNS}`,
      [id, deviceId, status, result ?? null, error ?? null],
    )
  ).rows[0] ?? null;

export const cancel = async (id) =>
  (
    await query(
      `UPDATE commands SET status = 'cancelled', completed_at = now() WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
      [id],
    )
  ).rows[0] ?? null;

export const expireOverdue = async (client) =>
  (
    await client.query(
      `UPDATE commands SET status = 'expired', completed_at = now()
        WHERE status IN ('pending', 'dispatched') AND expires_at <= now()
        RETURNING id, device_id, type`,
    )
  ).rows;
