import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { noContent, ok } from '#common/http/respond.js';
import * as credentials from '#modules/devices/credential.repository.js';
import * as devices from '#modules/devices/device.repository.js';
import * as deviceService from '#modules/devices/devices.service.js';
import * as state from '#modules/devices/state.repository.js';
import * as commandService from '#modules/commands/commands.service.js';
import { ingest } from '#modules/telemetry/telemetry.service.js';

const noteUsage = (req) => void credentials.touch(req.device.credentialId).catch(() => {});

async function loadDevice(req) {
  const device = await devices.findById(req.device.id);
  if (!device) throw DomainErrors.notFound('Device');
  return device;
}

export const activate = async (req, res) => ok(res, await deviceService.activate(req.body));

export const ingestTelemetry = async (req, res) => {
  const device = await loadDevice(req);
  const result = await ingest(device, req.body.readings);
  noteUsage(req);
  res.status(202).json(result);
};

export const heartbeat = async (req, res) => {
  await devices.touch(req.device.id);
  noteUsage(req);
  ok(res, {
    ok: true,
    serverTime: new Date().toISOString(),
    heartbeatSeconds: Math.max(15, Math.floor(config.DEVICE_OFFLINE_AFTER_SECONDS / 3)),
  });
};

export const fetchCommands = async (req, res) => {
  const commands = await commandService.fetchForDevice(req.device.id, Number(req.query.limit) || 10);
  noteUsage(req);
  ok(res, { commands });
};

export const acknowledgeCommand = async (req, res) =>
  ok(res, await commandService.acknowledge(req.device.id, req.params.id, req.body));

export const getState = async (req, res) => {
  const current = await state.get(req.device.id);
  ok(res, { desired: current?.desired ?? {}, desiredVersion: current?.desired_version ?? 0 });
};

export const reportState = async (req, res) => ok(res, await state.setReported(req.device.id, req.body));

export const whoami = async (req, res) => {
  const device = await loadDevice(req);
  ok(res, {
    deviceId: device.id,
    externalId: device.external_id,
    name: device.name,
    deviceType: device.device_type_key,
    metrics: device.device_type_metrics,
    status: device.status,
  });
};

export const deregister = async (req, res) => {
  await credentials.revokeOne(req.device.id, req.device.credentialId, 'device_deregistered');
  noContent(res);
};
