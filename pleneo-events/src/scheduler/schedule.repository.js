import { query } from '#infra/database/pool.js';

const COLUMNS = `id, name, description, cron, timezone, queue, job_type, payload, enabled, next_run_at, last_run_at, last_job_id, created_by, created_at, updated_at`;

export const listAll = async () => (await query(`SELECT ${COLUMNS} FROM schedules ORDER BY name`)).rows;

export const findById = async (id) =>
  (await query(`SELECT ${COLUMNS} FROM schedules WHERE id = $1`, [id])).rows[0] ?? null;

export const create = async ({
  name,
  description,
  cron,
  timezone,
  queue,
  jobType,
  payload,
  enabled,
  nextRunAt,
  createdBy,
}) =>
  (
    await query(
      `INSERT INTO schedules (name, description, cron, timezone, queue, job_type, payload, enabled, next_run_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLUMNS}`,
      [name, description, cron, timezone, queue, jobType, payload, enabled, nextRunAt, createdBy ?? null],
    )
  ).rows[0];

export const update = async (id, { description, cron, timezone, queue, jobType, payload, enabled, nextRunAt }) =>
  (
    await query(
      `UPDATE schedules
          SET description = COALESCE($2, description), cron = COALESCE($3, cron), timezone = COALESCE($4, timezone),
              queue = COALESCE($5, queue), job_type = COALESCE($6, job_type), payload = COALESCE($7, payload),
              enabled = COALESCE($8, enabled), next_run_at = COALESCE($9, next_run_at)
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [
        id,
        description ?? null,
        cron ?? null,
        timezone ?? null,
        queue ?? null,
        jobType ?? null,
        payload ?? null,
        enabled ?? null,
        nextRunAt ?? null,
      ],
    )
  ).rows[0] ?? null;

export const remove = async (id) => (await query(`DELETE FROM schedules WHERE id = $1`, [id])).rowCount > 0;

export const claimDue = async (client, limit = 20) =>
  (
    await client.query(
      `SELECT ${COLUMNS} FROM schedules WHERE enabled AND next_run_at <= now() ORDER BY next_run_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    )
  ).rows;

export const markRun = (client, id, { nextRunAt, jobId }) =>
  client.query(`UPDATE schedules SET next_run_at = $2, last_run_at = now(), last_job_id = $3 WHERE id = $1`, [
    id,
    nextRunAt,
    jobId ?? null,
  ]);
