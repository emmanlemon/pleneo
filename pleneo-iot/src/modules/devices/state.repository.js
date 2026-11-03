import { query } from '#infra/database/pool.js';

const COLUMNS = `device_id, desired, reported, desired_version, reported_version, desired_updated_at, reported_updated_at, updated_at`;

export const ensure = (deviceId, client = { query }) =>
  client.query(`INSERT INTO device_state (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`, [deviceId]);

export const get = async (deviceId, client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM device_state WHERE device_id = $1`, [deviceId])).rows[0] ?? null;

export const setDesired = async (deviceId, desired, client = { query }) =>
  (
    await client.query(
      `INSERT INTO device_state (device_id, desired, desired_version, desired_updated_at, updated_at)
       VALUES ($1, $2, 1, now(), now())
       ON CONFLICT (device_id) DO UPDATE
         SET desired = $2, desired_version = device_state.desired_version + 1, desired_updated_at = now(), updated_at = now()
       RETURNING ${COLUMNS}`,
      [deviceId, desired],
    )
  ).rows[0];

export const setReported = async (deviceId, reported, client = { query }) =>
  (
    await client.query(
      `INSERT INTO device_state (device_id, reported, reported_version, reported_updated_at, updated_at)
       VALUES ($1, $2, 1, now(), now())
       ON CONFLICT (device_id) DO UPDATE
         SET reported = $2, reported_version = device_state.reported_version + 1, reported_updated_at = now(), updated_at = now()
       RETURNING ${COLUMNS}`,
      [deviceId, reported],
    )
  ).rows[0];
