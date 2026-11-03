import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { withTransaction } from '#infra/database/pool.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import { loadAccessible } from '#modules/devices/access.js';
import * as devices from '#modules/devices/device.repository.js';
import { raiseAlerts } from '#modules/alerts/alerts.service.js';
import { evaluate } from '#modules/rules/rules.engine.js';
import * as telemetry from './telemetry.repository.js';

const MAX_SKEW_MS = () => config.INGEST_MAX_SKEW_MINUTES * 60_000;
const MAX_BACKFILL_MS = () => config.INGEST_MAX_BACKFILL_DAYS * 86_400_000;

export function normaliseReadings(device, readings) {
  if (readings.length > config.INGEST_MAX_BATCH) throw DomainErrors.batchTooLarge(config.INGEST_MAX_BATCH);
  const declared = new Set((device.device_type_metrics ?? []).map((m) => m.key));
  const now = Date.now();

  return readings.map((reading) => {
    if (declared.size && !declared.has(reading.metric)) throw DomainErrors.unknownMetric(reading.metric);
    const ts = reading.ts ? new Date(reading.ts) : new Date();
    const age = now - ts.getTime();
    if (age < -MAX_SKEW_MS()) throw DomainErrors.timestampSkew();
    if (age > MAX_BACKFILL_MS()) throw DomainErrors.timestampTooOld();
    return { metric: reading.metric, value: reading.value, ts: ts.toISOString() };
  });
}

export async function ingest(device, rawReadings) {
  const readings = normaliseReadings(device, rawReadings);

  return withTransaction(async (client) => {
    const accepted = await telemetry.insertBatch(device.id, readings, client);
    const transition = await devices.markOnline(device.id, client);
    if (!transition) await devices.touch(device.id, client);
    else {
      await outbox.add(
        {
          type: 'iot.device.online',
          payload: {
            deviceId: device.id,
            externalId: transition.external_id,
            deviceName: transition.name,
            ownerId: transition.owner_id,
            ownerEmail: transition.owner_email,
          },
          idempotencyKey: `iot.device.online:${device.id}:${new Date().toISOString().slice(0, 16)}`,
        },
        client,
      );
    }

    const breached = await evaluate(device, accepted);
    const alerts = await raiseAlerts(device, breached, client);
    return { accepted: accepted.length, duplicates: readings.length - accepted.length, alerts: alerts.length };
  });
}

export async function latestFor(auth, deviceId) {
  await loadAccessible(deviceId, auth);
  return { latest: await telemetry.latest(deviceId) };
}

export async function seriesFor(auth, deviceId, { metric, from, to, limit, bucketSeconds }) {
  await loadAccessible(deviceId, auth);
  const range = {
    deviceId,
    metric,
    from: from ?? new Date(Date.now() - 3_600_000).toISOString(),
    to: to ?? new Date().toISOString(),
  };
  if (bucketSeconds) return { metric, buckets: await telemetry.aggregate({ ...range, bucketSeconds }) };
  const points = await telemetry.series({ ...range, limit });
  return { metric, points: points.reverse() };
}
