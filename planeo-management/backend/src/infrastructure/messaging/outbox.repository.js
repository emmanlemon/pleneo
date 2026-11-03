import { query } from '#infra/database/pool.js';

export const add = ({ type, payload, idempotencyKey }, client = { query }) =>
  client.query(
    `INSERT INTO outbox_events (event_type, payload, idempotency_key) VALUES ($1, $2, $3) ON CONFLICT (idempotency_key) DO NOTHING`,
    [type, payload, idempotencyKey],
  );

export const claimPending = async (client, limit) =>
  (
    await client.query(
      `SELECT id, event_type, payload, idempotency_key, attempts, created_at FROM outbox_events
        WHERE published_at IS NULL AND next_attempt_at <= now()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    )
  ).rows;

export const markPublished = (client, id, remoteEventId) =>
  client.query(`UPDATE outbox_events SET published_at = now(), remote_event_id = $2, last_error = NULL WHERE id = $1`, [
    id,
    remoteEventId ?? null,
  ]);

export const markFailed = (client, id, { attempts, error, nextAttemptAt }) =>
  client.query(`UPDATE outbox_events SET attempts = $2, last_error = $3, next_attempt_at = $4 WHERE id = $1`, [
    id,
    attempts,
    error,
    nextAttemptAt,
  ]);

export const stats = async () =>
  (
    await query(
      `SELECT count(*) FILTER (WHERE published_at IS NULL)::int AS pending,
              count(*) FILTER (WHERE published_at IS NULL AND attempts >= 5)::int AS stuck,
              max(created_at) FILTER (WHERE published_at IS NULL) AS oldest_pending
         FROM outbox_events`,
    )
  ).rows[0];

export const prune = (retentionDays) =>
  query(`DELETE FROM outbox_events WHERE published_at < now() - ($1 || ' days')::interval`, [String(retentionDays)]);
