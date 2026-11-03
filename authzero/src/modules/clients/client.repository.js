import { query } from '#infra/database/pool.js';

const PUBLIC_COLUMNS = `id, client_id, name, scopes, status, last_used_at, created_at`;

export const create = async ({ clientId, secretHash, name, scopes, createdBy }) =>
  (
    await query(
      `INSERT INTO clients (client_id, client_secret_hash, name, scopes, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING ${PUBLIC_COLUMNS}`,
      [clientId, secretHash, name, scopes, createdBy],
    )
  ).rows[0];

export const findByClientId = async (clientId) =>
  (
    await query(`SELECT id, client_id, client_secret_hash, scopes, status FROM clients WHERE client_id = $1`, [
      clientId,
    ])
  ).rows[0] ?? null;

export const isActive = async (id) =>
  (await query(`SELECT 1 FROM clients WHERE id = $1 AND status = 'active'`, [id])).rows.length > 0;

export const listAll = async () => (await query(`SELECT ${PUBLIC_COLUMNS} FROM clients ORDER BY created_at DESC`)).rows;

export const touch = (id) => query(`UPDATE clients SET last_used_at = now() WHERE id = $1`, [id]);

export const revoke = async (id) =>
  (await query(`UPDATE clients SET status = 'revoked' WHERE id = $1 AND status = 'active'`, [id])).rowCount > 0;

export const upsertByClientId = async ({ clientId, secretHash, name, scopes, createdBy }) =>
  (
    await query(
      `INSERT INTO clients (client_id, client_secret_hash, name, scopes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO UPDATE
         SET client_secret_hash = $2, name = $3, scopes = $4, status = 'active'
       RETURNING ${PUBLIC_COLUMNS}`,
      [clientId, secretHash, name, scopes, createdBy ?? null],
    )
  ).rows[0];
