import { query } from '#infra/database/pool.js';

export async function insertBatch(deviceId, readings, client = { query }) {
  const metrics = readings.map((r) => r.metric);
  const values = readings.map((r) => r.value);
  const timestamps = readings.map((r) => r.ts);
  const { rows } = await client.query(
    `INSERT INTO telemetry (device_id, metric, value, ts)
     SELECT $1, m, v, t FROM unnest($2::text[], $3::double precision[], $4::timestamptz[]) AS s(m, v, t)
     ON CONFLICT (device_id, metric, ts) DO NOTHING
     RETURNING metric, value, ts`,
    [deviceId, metrics, values, timestamps],
  );
  return rows;
}

export const latest = async (deviceId) =>
  (
    await query(
      `SELECT DISTINCT ON (metric) metric, value, ts FROM telemetry
        WHERE device_id = $1 ORDER BY metric, ts DESC`,
      [deviceId],
    )
  ).rows;

export const series = async ({ deviceId, metric, from, to, limit }) =>
  (
    await query(
      `SELECT metric, value, ts FROM telemetry
        WHERE device_id = $1 AND metric = $2 AND ts >= $3 AND ts <= $4
        ORDER BY ts DESC LIMIT $5`,
      [deviceId, metric, from, to, limit],
    )
  ).rows;

export const aggregate = async ({ deviceId, metric, from, to, bucketSeconds }) =>
  (
    await query(
      `SELECT to_timestamp(floor(extract(epoch FROM ts) / $5) * $5) AS bucket,
              avg(value) AS avg, min(value) AS min, max(value) AS max, count(*)::int AS samples
         FROM telemetry
        WHERE device_id = $1 AND metric = $2 AND ts >= $3 AND ts <= $4
        GROUP BY bucket ORDER BY bucket`,
      [deviceId, metric, from, to, bucketSeconds],
    )
  ).rows;

export const prune = async (retentionDays) =>
  (await query(`DELETE FROM telemetry WHERE ts < now() - ($1 || ' days')::interval`, [String(retentionDays)])).rowCount;
