import { logger } from '#infra/logging/logger.js';
import { startOutboxRelay, stopOutboxRelay } from '#infra/messaging/outbox.relay.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import { prune as pruneSessions } from '#modules/bff/session.service.js';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const OUTBOX_RETENTION_DAYS = 7;
const SESSION_RETENTION_DAYS = 7;
let maintenance = null;

async function runMaintenance() {
  try {
    await outbox.prune(OUTBOX_RETENTION_DAYS);
    await pruneSessions(SESSION_RETENTION_DAYS);
  } catch (err) {
    logger.error({ err }, 'maintenance failed');
  }
}

export function startScheduler() {
  startOutboxRelay();
  maintenance = setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS).unref();
}

export function stopScheduler() {
  stopOutboxRelay();
  clearInterval(maintenance);
}
