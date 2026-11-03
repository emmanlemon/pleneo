import { query } from '#infra/database/pool.js';

const COLUMNS = `id, key, name, description, metrics, created_at, updated_at`;

export const listAll = async () => (await query(`SELECT ${COLUMNS} FROM device_types ORDER BY name`)).rows;

export const findById = async (id, client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM device_types WHERE id = $1`, [id])).rows[0] ?? null;

export const findByKey = async (key) =>
  (await query(`SELECT ${COLUMNS} FROM device_types WHERE key = $1`, [key])).rows[0] ?? null;

export const create = async ({ key, name, description, metrics, actorId }) =>
  (
    await query(
      `INSERT INTO device_types (key, name, description, metrics, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [key, name, description, JSON.stringify(metrics), actorId],
    )
  ).rows[0];

export const update = async (id, { name, description, metrics }) =>
  (
    await query(
      `UPDATE device_types SET name = COALESCE($2, name), description = COALESCE($3, description), metrics = COALESCE($4, metrics)
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, name ?? null, description ?? null, metrics ? JSON.stringify(metrics) : null],
    )
  ).rows[0] ?? null;
