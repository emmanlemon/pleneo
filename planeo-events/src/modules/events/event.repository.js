import { query } from '#infra/database/pool.js';

const COLUMNS = `id, type, source, payload, idempotency_key, correlation_id, occurred_at, created_at`;

export const insert = async (
  { type, source, payload, idempotencyKey, correlationId, occurredAt },
  client = { query },
) =>
  (
    await client.query(
      `INSERT INTO events (type, source, payload, idempotency_key, correlation_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING ${COLUMNS}`,
      [type, source, payload, idempotencyKey ?? null, correlationId ?? null, occurredAt ?? null],
    )
  ).rows[0] ?? null;

export const findByIdempotencyKey = async (key, client = { query }) =>
  (await client.query(`SELECT ${COLUMNS} FROM events WHERE idempotency_key = $1`, [key])).rows[0] ?? null;

export const findById = async (id) =>
  (await query(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [id])).rows[0] ?? null;

export async function list({ type, source, before, limit }) {
  const params = [];
  const conditions = [];
  if (type) conditions.push(`type LIKE $${params.push(type.replace(/\*/g, '%'))}`);
  if (source) conditions.push(`source = $${params.push(source)}`);
  if (before) conditions.push(`created_at < $${params.push(before)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (
    await query(`SELECT ${COLUMNS} FROM events ${where} ORDER BY created_at DESC LIMIT $${params.push(limit)}`, params)
  ).rows;
}

export const deliveriesFor = async (eventId) =>
  (
    await query(
      `SELECT j.id, j.status, j.attempts, j.max_attempts, j.run_at, j.last_error, j.finished_at, s.name AS subscription
         FROM jobs j LEFT JOIN subscriptions s ON s.id = j.subscription_id
        WHERE j.event_id = $1 ORDER BY j.created_at`,
      [eventId],
    )
  ).rows;
