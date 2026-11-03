import { config } from '#config';
import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { publishEvent } from './events-client.js';
import * as outbox from './outbox.repository.js';

const BATCH_SIZE = 25;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60 * 60 * 1000;
const log = logger.child({ component: 'outbox-relay' });

export const backoffMs = (attempts) => Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);

export async function relayOutbox({ publish = publishEvent } = {}) {
  return withTransaction(async (client) => {
    const rows = await outbox.claimPending(client, BATCH_SIZE);
    let published = 0;
    for (const row of rows) {
      try {
        const result = await publish({
          type: row.event_type,
          payload: row.payload,
          idempotencyKey: row.idempotency_key,
          occurredAt: row.created_at,
        });
        await outbox.markPublished(client, row.id, result?.eventId);
        published++;
      } catch (err) {
        const attempts = row.attempts + 1;
        const nextAttemptAt = new Date(Date.now() + backoffMs(attempts));
        await outbox.markFailed(client, row.id, {
          attempts,
          error: String(err?.message ?? err).slice(0, 500),
          nextAttemptAt,
        });
        log.warn({ outboxId: row.id, attempts, err: err?.message, nextAttemptAt }, 'outbox publish failed');
      }
    }
    return { claimed: rows.length, published };
  });
}

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    let result;
    do {
      result = await relayOutbox();
    } while (result.published > 0 && result.published === result.claimed);
  } catch (err) {
    log.error({ err }, 'outbox relay tick failed');
  } finally {
    running = false;
  }
}

export function startOutboxRelay() {
  if (!config.OUTBOX_ENABLED) return;
  timer = setInterval(tick, config.OUTBOX_POLL_INTERVAL_MS).unref();
  setTimeout(tick, 1_000).unref();
  log.info({ intervalMs: config.OUTBOX_POLL_INTERVAL_MS }, 'outbox relay started');
}

export function stopOutboxRelay() {
  clearInterval(timer);
  timer = null;
}
