import { config } from '#config';
import { ok } from '#common/http/respond.js';
import { healthCheck } from '#infra/database/pool.js';

export const health = (_req, res) => ok(res, { status: 'ok' });

export const ready = async (_req, res) => {
  await healthCheck().then(
    () => ok(res, { status: 'ready' }),
    () => res.status(503).json({ status: 'unavailable' }),
  );
};

export const capabilities = (_req, res) =>
  ok(res, {
    deviceApi: '/v1/device',
    mqtt: config.MQTT_ENABLED
      ? {
          port: config.MQTT_PORT,
          tls: Boolean(config.MQTT_TLS_KEY_PATH),
          maxPayloadBytes: config.MQTT_MAX_PAYLOAD_BYTES,
          topics: {
            telemetry: 'devices/{externalId}/telemetry',
            reportedState: 'devices/{externalId}/state/reported',
            desiredState: 'devices/{externalId}/state/desired',
            commands: 'devices/{externalId}/commands',
            commandAck: 'devices/{externalId}/commands/ack',
            status: 'devices/{externalId}/status',
          },
        }
      : null,
    ingest: {
      maxBatch: config.INGEST_MAX_BATCH,
      maxSkewMinutes: config.INGEST_MAX_SKEW_MINUTES,
      maxBackfillDays: config.INGEST_MAX_BACKFILL_DAYS,
    },
    lifecycle: {
      offlineAfterSeconds: config.DEVICE_OFFLINE_AFTER_SECONDS,
      commandTtlSeconds: config.COMMAND_DEFAULT_TTL_SECONDS,
    },
    retentionDays: config.TELEMETRY_RETENTION_DAYS,
  });
