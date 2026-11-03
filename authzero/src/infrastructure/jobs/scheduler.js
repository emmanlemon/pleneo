import { pool } from '#infra/database/pool.js';
import { pruneRetiredKeys, rotateIfDue } from '#infra/security/signing-keys.js';
import { logger } from '#infra/logging/logger.js';
import * as sessions from '#modules/auth/repositories/session.repository.js';
import * as tokens from '#modules/auth/repositories/token.repository.js';
import { processOutbox } from '#infra/messaging/outbox.service.js';

const OUTBOX_INTERVAL_MS = 5_000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const MAINTENANCE_LOCK_ID = 7_431_903;

const timers = [];
let outboxRunning = false;

async function runOutbox() {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    let processed;
    do {
      processed = await processOutbox();
    } while (processed > 0);
  } catch (err) {
    logger.error({ err }, 'outbox processing failed');
  } finally {
    outboxRunning = false;
  }
}

async function runMaintenance() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MAINTENANCE_LOCK_ID]);
    if (!rows[0].locked) return;
    await sessions.deleteExpired();
    await tokens.deleteExpired();
    await rotateIfDue();
    await pruneRetiredKeys();
    logger.info('maintenance completed');
  } catch (err) {
    logger.error({ err }, 'maintenance failed');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MAINTENANCE_LOCK_ID]).catch(() => {});
    client.release();
  }
}

export function startScheduler() {
  timers.push(setInterval(runOutbox, OUTBOX_INTERVAL_MS).unref());
  timers.push(setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS).unref());
  setTimeout(runMaintenance, 5_000).unref();
}

export function stopScheduler() {
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
}
