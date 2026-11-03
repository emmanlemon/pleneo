import { query } from '#infra/database/pool.js';

const COLUMNS = `id, name, description, device_type_id, device_id, metric, operator, threshold, severity, cooldown_seconds, enabled, created_by, created_at, updated_at`;

export const listEnabled = async (client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM rules WHERE enabled ORDER BY created_at`)).rows;

export const listAll = async ({ deviceId, deviceTypeId, metric }) => {
  const params = [];
  const conditions = [];
  if (deviceId) conditions.push(`device_id = $${params.push(deviceId)}`);
  if (deviceTypeId) conditions.push(`device_type_id = $${params.push(deviceTypeId)}`);
  if (metric) conditions.push(`metric = $${params.push(metric)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (await query(`SELECT ${COLUMNS} FROM rules ${where} ORDER BY created_at DESC`, params)).rows;
};

export const findById = async (id) => (await query(`SELECT ${COLUMNS} FROM rules WHERE id = $1`, [id])).rows[0] ?? null;

export const create = async ({
  name,
  description,
  deviceTypeId,
  deviceId,
  metric,
  operator,
  threshold,
  severity,
  cooldownSeconds,
  enabled,
  actorId,
}) =>
  (
    await query(
      `INSERT INTO rules (name, description, device_type_id, device_id, metric, operator, threshold, severity, cooldown_seconds, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNS}`,
      [
        name,
        description,
        deviceTypeId ?? null,
        deviceId ?? null,
        metric,
        operator,
        threshold,
        severity,
        cooldownSeconds,
        enabled,
        actorId,
      ],
    )
  ).rows[0];

export const update = async (id, { name, description, operator, threshold, severity, cooldownSeconds, enabled }) =>
  (
    await query(
      `UPDATE rules SET name = COALESCE($2, name), description = COALESCE($3, description), operator = COALESCE($4, operator),
              threshold = COALESCE($5, threshold), severity = COALESCE($6, severity),
              cooldown_seconds = COALESCE($7, cooldown_seconds), enabled = COALESCE($8, enabled)
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [
        id,
        name ?? null,
        description ?? null,
        operator ?? null,
        threshold ?? null,
        severity ?? null,
        cooldownSeconds ?? null,
        enabled ?? null,
      ],
    )
  ).rows[0] ?? null;

export const remove = async (id) => (await query(`DELETE FROM rules WHERE id = $1`, [id])).rowCount > 0;
