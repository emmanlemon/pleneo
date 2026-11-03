import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import { acknowledge } from '#modules/commands/commands.service.js';
import * as credentials from '#modules/devices/credential.repository.js';
import * as devices from '#modules/devices/device.repository.js';
import * as state from '#modules/devices/state.repository.js';
import { ackSchema } from '#modules/device-api/device.routes.js';
import { ingest } from '#modules/telemetry/telemetry.service.js';
import { ingestSchema } from '#modules/telemetry/telemetry.validators.js';
import { publishStatus } from './bus.js';
import { LEAF, parseTopic } from './topics.js';

const log = logger.child({ component: 'mqtt' });

const ackMessageSchema = ackSchema.extend({ id: r.uuid });
const reportedSchema = z.record(z.string(), z.unknown());

const presencePayload = (device, row) => ({
  deviceId: device.id,
  externalId: device.externalId,
  deviceName: row?.name ?? device.externalId,
  ownerId: row?.owner_id ?? device.ownerId,
  ownerEmail: row?.owner_email ?? null,
});

export async function onConnected(client) {
  const device = client.device;
  if (!device) return;

  const row = await devices.findById(device.id);
  if (!row) return;
  client.deviceRow = row;

  await withTransaction(async (tx) => {
    const transition = await devices.markOnline(device.id, tx);
    if (!transition) {
      await devices.touch(device.id, tx);
      return;
    }
    await outbox.add(
      {
        type: 'iot.device.online',
        payload: presencePayload(device, transition),
        idempotencyKey: `iot.device.online:${device.id}:${new Date().toISOString().slice(0, 16)}`,
      },
      tx,
    );
  });

  publishStatus(device.externalId, 'online');
  void credentials.touch(device.credentialId).catch(() => {});
  log.info({ deviceId: device.id, externalId: device.externalId }, 'device connected');
}

export async function onDisconnected(client) {
  const device = client.device;
  if (!device) return;

  await withTransaction(async (tx) => {
    const transition = await devices.markOffline(device.id, tx);
    if (!transition) return;
    await outbox.add(
      {
        type: 'iot.device.offline',
        payload: { ...presencePayload(device, transition), lastSeenAt: transition.last_seen_at },
        idempotencyKey: `iot.device.offline:${device.id}:${new Date(transition.last_seen_at).toISOString()}`,
      },
      tx,
    );
  });

  publishStatus(device.externalId, 'offline');
  log.info({ deviceId: device.id, externalId: device.externalId }, 'device disconnected');
}

async function handleTelemetry(client, body) {
  const { readings } = ingestSchema.parse(body);
  const row = client.deviceRow ?? (await devices.findById(client.device.id));
  if (!row) throw new Error('device no longer exists');
  const result = await ingest(row, readings);
  void credentials.touch(client.device.credentialId).catch(() => {});
  return result;
}

const handleReported = (client, body) => state.setReported(client.device.id, reportedSchema.parse(body));

async function handleAck(client, body) {
  const { id, ...rest } = ackMessageSchema.parse(body);
  return acknowledge(client.device.id, id, rest);
}

const HANDLERS = {
  [LEAF.telemetry]: handleTelemetry,
  [LEAF.reported]: handleReported,
  [LEAF.ack]: handleAck,
};

export async function dispatch(client, packet) {
  const parsed = parseTopic(packet.topic);
  const handler = parsed && HANDLERS[parsed.leaf];
  if (!handler) return;

  try {
    await handler(client, JSON.parse(packet.payload.toString('utf8')));
  } catch (err) {
    log.warn(
      { deviceId: client.device?.id, topic: packet.topic, err: err.message },
      'rejected a device message',
    );
  }
}
