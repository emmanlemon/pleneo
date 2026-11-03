import { query, withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { deliver } from './webhook.js';

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 25;

export const publish = (type, payload, client = { query }) =>
  client.query(`INSERT INTO outbox_events (type, payload) VALUES ($1, $2)`, [type, payload]);

const backoffSeconds = (attempts) => (attempts >= MAX_ATTEMPTS ? 86_400 : Math.min(2 ** attempts * 5, 3600));

async function markDelivered(client, event) {
  await client.query(`UPDATE outbox_events SET delivered_at = now(), attempts = attempts + 1 WHERE id = $1`, [
    event.id,
  ]);
}

async function markFailed(client, event, err) {
  const attempts = event.attempts + 1;
  await client.query(
    `UPDATE outbox_events SET attempts = $2, last_error = $3, next_attempt_at = now() + ($4 || ' seconds')::interval WHERE id = $1`,
    [event.id, attempts, String(err.message).slice(0, 500), String(backoffSeconds(attempts))],
  );
  logger.warn({ eventId: event.id, attempts, err: err.message }, 'event delivery failed');
}

export function processOutbox() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, type, payload, attempts, created_at FROM outbox_events
        WHERE delivered_at IS NULL AND next_attempt_at <= now()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );
    for (const event of rows) {
      await deliver(event).then(
        () => markDelivered(client, event),
        (err) => markFailed(client, event, err),
      );
    }
    return rows.length;
  });
}
