import { query } from '#infra/database/pool.js';

const COLUMNS = `id, queue, type, payload, status, priority, attempts, max_attempts, run_at, locked_at, locked_by, last_error,
  idempotency_key, event_id, subscription_id, schedule_id, created_by, started_at, finished_at, created_at, updated_at`;

export const insert = async (
  {
    queue,
    type,
    payload,
    runAt,
    priority,
    maxAttempts,
    idempotencyKey,
    eventId,
    subscriptionId,
    scheduleId,
    createdBy,
  },
  client = { query },
) =>
  (
    await client.query(
      `INSERT INTO jobs (queue, type, payload, run_at, priority, max_attempts, idempotency_key, event_id, subscription_id, schedule_id, created_by)
       VALUES ($1, $2, $3, COALESCE($4, now()), $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        queue,
        type,
        payload,
        runAt ?? null,
        priority,
        maxAttempts,
        idempotencyKey ?? null,
        eventId ?? null,
        subscriptionId ?? null,
        scheduleId ?? null,
        createdBy ?? null,
      ],
    )
  ).rows[0] ?? null;

export const findByIdempotencyKey = async (key, client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM jobs WHERE idempotency_key = $1`, [key])).rows[0] ?? null;

export const claim = async (queues, limit, workerId) =>
  (
    await query(
      `WITH next AS (
         SELECT id FROM jobs
          WHERE status = 'pending' AND run_at <= now() AND queue = ANY($1)
          ORDER BY priority DESC, run_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED)
       UPDATE jobs j
          SET status = 'running', locked_at = now(), locked_by = $3, attempts = j.attempts + 1, started_at = now()
         FROM next WHERE j.id = next.id
       RETURNING j.*`,
      [queues, limit, workerId],
    )
  ).rows;

export async function succeed(job, { durationMs, workerId }) {
  await query(
    `UPDATE jobs SET status = 'succeeded', finished_at = now(), locked_at = NULL, locked_by = NULL, last_error = NULL WHERE id = $1`,
    [job.id],
  );
  await recordAttempt(job, { status: 'succeeded', durationMs, workerId });
}

export async function fail(job, { error, retryAt, durationMs, workerId }) {
  const status = retryAt ? 'pending' : 'dead';
  await query(
    `UPDATE jobs SET status = $2, run_at = COALESCE($3, run_at), last_error = $4, locked_at = NULL, locked_by = NULL,
            finished_at = CASE WHEN $2 = 'dead' THEN now() ELSE NULL END
      WHERE id = $1`,
    [job.id, status, retryAt ?? null, error],
  );
  await recordAttempt(job, { status: 'failed', error, durationMs, workerId });
  return status;
}

const recordAttempt = (job, { status, error = null, durationMs = null, workerId = null }) =>
  query(
    `INSERT INTO job_attempts (job_id, attempt, status, error, duration_ms, worker_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [job.id, job.attempts, status, error, durationMs, workerId],
  );

export const recoverStale = async (timeoutSeconds) =>
  (
    await query(
      `UPDATE jobs SET status = 'pending', locked_at = NULL, locked_by = NULL, last_error = COALESCE(last_error, 'lock expired')
        WHERE status = 'running' AND locked_at < now() - ($1 || ' seconds')::interval`,
      [String(timeoutSeconds)],
    )
  ).rowCount;

export const prune = async (retentionDays) =>
  (
    await query(
      `DELETE FROM jobs WHERE status IN ('succeeded', 'cancelled') AND finished_at < now() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    )
  ).rowCount;

export const findById = async (id) => (await query(`SELECT ${COLUMNS} FROM jobs WHERE id = $1`, [id])).rows[0] ?? null;

export const attemptsFor = async (jobId) =>
  (
    await query(
      `SELECT attempt, status, error, duration_ms, worker_id, created_at FROM job_attempts WHERE job_id = $1 ORDER BY attempt`,
      [jobId],
    )
  ).rows;

export async function list({ status, queue, type, before, limit }) {
  const params = [];
  const conditions = [];
  if (status) conditions.push(`status = $${params.push(status)}`);
  if (queue) conditions.push(`queue = $${params.push(queue)}`);
  if (type) conditions.push(`type = $${params.push(type)}`);
  if (before) conditions.push(`created_at < $${params.push(before)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (
    await query(`SELECT ${COLUMNS} FROM jobs ${where} ORDER BY created_at DESC LIMIT $${params.push(limit)}`, params)
  ).rows;
}

export const retry = async (id) =>
  (
    await query(
      `UPDATE jobs SET status = 'pending', attempts = 0, run_at = now(), last_error = NULL, finished_at = NULL, locked_at = NULL, locked_by = NULL
        WHERE id = $1 AND status IN ('dead', 'failed', 'cancelled') RETURNING ${COLUMNS}`,
      [id],
    )
  ).rows[0] ?? null;

export const cancel = async (id) =>
  (
    await query(
      `UPDATE jobs SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
      [id],
    )
  ).rows[0] ?? null;

export const stats = async () =>
  (
    await query(
      `SELECT queue, status, count(*)::int AS count,
              count(*) FILTER (WHERE finished_at > now() - interval '1 hour')::int AS last_hour
         FROM jobs GROUP BY queue, status ORDER BY queue, status`,
    )
  ).rows;
