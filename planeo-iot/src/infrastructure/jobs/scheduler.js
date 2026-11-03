import { config } from '#config';
import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { startOutboxRelay, stopOutboxRelay } from '#infra/messaging/outbox.relay.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import * as commands from '#modules/commands/command.repository.js';
import * as devices from '#modules/devices/device.repository.js';
import * as telemetry from '#modules/telemetry/telemetry.repository.js';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const OUTBOX_RETENTION_DAYS = 7;
const log = logger.child({ component: 'scheduler' });

export async function sweepOfflineDevices() {
  return withTransaction(async (client) => {
    const stale = await devices.claimStale(client, config.DEVICE_OFFLINE_AFTER_SECONDS);
    for (const device of stale) {
      await outbox.add(
        {
          type: 'iot.device.offline',
          payload: {
            deviceId: device.id,
            externalId: device.external_id,
            deviceName: device.name,
            ownerId: device.owner_id,
            ownerEmail: device.owner_email,
            lastSeenAt: device.last_seen_at,
            offlineAfterSeconds: config.DEVICE_OFFLINE_AFTER_SECONDS,
          },
          idempotencyKey: `iot.device.offline:${device.id}:${new Date(device.last_seen_at).toISOString()}`,
        },
        client,
      );
    }
    if (stale.length) log.info({ count: stale.length }, 'devices marked offline');
    return stale.length;
  });
}

export async function expireCommands() {
  const expired = await withTransaction((client) => commands.expireOverdue(client));
  if (expired.length) log.info({ count: expired.length }, 'commands expired');
  return expired.length;
}

async function runSweep() {
  try {
    await sweepOfflineDevices();
    await expireCommands();
  } catch (err) {
    log.error({ err }, 'sweep failed');
  }
}

async function runMaintenance() {
  try {
    const pruned = await telemetry.prune(config.TELEMETRY_RETENTION_DAYS);
    await outbox.prune(OUTBOX_RETENTION_DAYS);
    log.info({ prunedReadings: pruned }, 'maintenance completed');
  } catch (err) {
    log.error({ err }, 'maintenance failed');
  }
}

let sweepTimer = null;
let maintenanceTimer = null;

export function startScheduler() {
  startOutboxRelay();
  sweepTimer = setInterval(runSweep, config.OFFLINE_SWEEP_INTERVAL_MS).unref();
  maintenanceTimer = setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS).unref();
  setTimeout(runSweep, 5_000).unref();
}

export function stopScheduler() {
  stopOutboxRelay();
  clearInterval(sweepTimer);
  clearInterval(maintenanceTimer);
}
