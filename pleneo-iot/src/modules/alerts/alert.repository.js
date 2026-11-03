import { query } from '#infra/database/pool.js';

const COLUMNS = `a.id, a.rule_id, a.device_id, a.metric, a.value, a.threshold, a.operator, a.severity, a.status,
  a.message, a.raised_at, a.acknowledged_at, a.acknowledged_by, a.resolved_at`;
const WITH_DEVICE = `${COLUMNS}, d.name AS device_name, d.external_id AS device_external_id, d.owner_id`;
const JOIN = `FROM alerts a JOIN devices d ON d.id = a.device_id`;

export const findById = async (id) =>
  (await query(`SELECT ${WITH_DEVICE} ${JOIN} WHERE a.id = $1`, [id])).rows[0] ?? null;

export async function list({ ownerId, deviceId, status, severity, before, limit }) {
  const params = [limit];
  const conditions = ['d.deleted_at IS NULL'];
  if (ownerId) conditions.push(`d.owner_id = $${params.push(ownerId)}`);
  if (deviceId) conditions.push(`a.device_id = $${params.push(deviceId)}`);
  if (status) conditions.push(`a.status = $${params.push(status)}`);
  if (severity) conditions.push(`a.severity = $${params.push(severity)}`);
  if (before) conditions.push(`a.raised_at < $${params.push(before)}`);
  return (
    await query(
      `SELECT ${WITH_DEVICE} ${JOIN} WHERE ${conditions.join(' AND ')} ORDER BY a.raised_at DESC LIMIT $1`,
      params,
    )
  ).rows;
}

export const recentForRule = async (ruleId, deviceId, cooldownSeconds, client = { query }) =>
  (
    await client.query(
      `SELECT id FROM alerts
        WHERE rule_id = $1 AND device_id = $2 AND status <> 'resolved'
          AND raised_at > now() - ($3 || ' seconds')::interval
        LIMIT 1`,
      [ruleId, deviceId, String(cooldownSeconds)],
    )
  ).rows[0] ?? null;

export const insert = async (
  { ruleId, deviceId, metric, value, threshold, operator, severity, message },
  client = { query },
) =>
  (
    await client.query(
      `INSERT INTO alerts (rule_id, device_id, metric, value, threshold, operator, severity, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS.replace(/a\./g, '')}`,
      [ruleId, deviceId, metric, value, threshold, operator, severity, message],
    )
  ).rows[0];

export const transition = async (id, { status, actorId }) =>
  (
    await query(
      `UPDATE alerts
          SET status = $2,
              acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN now() ELSE acknowledged_at END,
              acknowledged_by = CASE WHEN $2 = 'acknowledged' THEN $3 ELSE acknowledged_by END,
              resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END
        WHERE id = $1 AND status <> $2 RETURNING ${COLUMNS.replace(/a\./g, '')}`,
      [id, status, actorId],
    )
  ).rows[0] ?? null;

export const openCount = async (ownerId) => {
  const params = ownerId ? [ownerId] : [];
  const scope = ownerId ? 'AND d.owner_id = $1' : '';
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE a.status = 'open')::int AS open,
            count(*) FILTER (WHERE a.status = 'open' AND a.severity = 'critical')::int AS critical
       FROM alerts a JOIN devices d ON d.id = a.device_id
      WHERE d.deleted_at IS NULL ${scope}`,
    params,
  );
  return rows[0];
};
