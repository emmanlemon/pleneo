import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { publishCommand } from '#infra/mqtt/bus.js';
import { actorOf, loadAccessible } from '#modules/devices/access.js';
import * as commands from './command.repository.js';

const MAX_FETCH = 20;

export async function issueCommand(auth, deviceId, { type, payload, ttlSeconds }) {
  const device = await loadAccessible(deviceId, auth, { write: true });
  if (device.status !== 'active') throw DomainErrors.deviceDisabled();
  const expiresAt = new Date(Date.now() + (ttlSeconds ?? config.COMMAND_DEFAULT_TTL_SECONDS) * 1000);
  const command = await commands.insert({ deviceId, type, payload, expiresAt, issuedBy: actorOf(auth) });
  publishCommand(device.external_id, command);
  return command;
}

export async function listCommands(auth, deviceId, filters) {
  await loadAccessible(deviceId, auth);
  return { commands: await commands.listForDevice(deviceId, filters) };
}

export async function cancelCommand(auth, id) {
  const current = await commands.findById(id);
  if (!current) throw DomainErrors.notFound('Command');
  await loadAccessible(current.device_id, auth, { write: true });
  const cancelled = await commands.cancel(id);
  if (!cancelled) throw DomainErrors.invalidCommandTransition(current.status, 'cancelled');
  return cancelled;
}

export const fetchForDevice = (deviceId, limit = 10) => commands.claimPending(deviceId, Math.min(limit, MAX_FETCH));

export async function acknowledge(deviceId, id, { status, result, error }) {
  const completed = await commands.complete({ id, deviceId, status, result, error });
  if (!completed) {
    const current = await commands.findById(id);
    if (!current || current.device_id !== deviceId) throw DomainErrors.notFound('Command');
    throw DomainErrors.invalidCommandTransition(current.status, status);
  }
  return completed;
}
