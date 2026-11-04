import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { claimCode, deviceToken, keyedHash } from '#common/security/crypto.js';
import { withTransaction } from '#infra/database/pool.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import { publishDesired } from '#infra/mqtt/bus.js';
import { actorOf, loadAccessible, ownerScope, resolveOwnerId } from './access.js';
import * as credentials from './credential.repository.js';
import * as deviceTypes from './device-type.repository.js';
import * as devices from './device.repository.js';
import * as state from './state.repository.js';

const PG_UNIQUE_VIOLATION = '23505';

const summary = (device) => ({
  deviceId: device.id,
  externalId: device.external_id,
  deviceName: device.name,
  projectId: device.project_id ?? null,
  ownerId: device.owner_id,
  ownerEmail: device.owner_email,
  deviceType: device.device_type_key,
});

export const listDevices = async (auth, filters) => {
  const rows = await devices.list({ ...filters, ownerId: ownerScope(auth) });
  return { devices: rows, nextCursor: rows.length === filters.limit ? rows.at(-1).id : null };
};

export const deviceStats = (auth, { projectId } = {}) => devices.stats({ ownerId: ownerScope(auth), projectId });

export async function getDevice(auth, id) {
  const device = await loadAccessible(id, auth);
  return { ...device, state: await state.get(id), credentials: await credentials.listForDevice(id) };
}

export async function registerDevice(auth, input) {
  const type = await deviceTypes.findById(input.deviceTypeId);
  if (!type) throw DomainErrors.invalidReference();
  const ownerId = resolveOwnerId(auth, input.ownerId);

  const code = claimCode();
  const actorId = actorOf(auth);
  try {
    return await withTransaction(async (client) => {
      const { id } = await devices.create(
        {
          ...input,
          ownerId,
          ownerEmail: ownerId === auth.userId ? (auth.email ?? null) : null,
          claimCodeHash: keyedHash(code),
          metadata: input.metadata,
          actorId,
        },
        client,
      );
      await state.ensure(id, client);
      const device = await devices.findById(id, client);
      await outbox.add(
        { type: 'iot.device.registered', payload: summary(device), idempotencyKey: `iot.device.registered:${id}` },
        client,
      );
      return { ...device, claimCode: code };
    });
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) throw DomainErrors.duplicateExternalId();
    throw err;
  }
}

export async function updateDevice(auth, id, input) {
  await loadAccessible(id, auth, { write: true });
  await devices.update(id, { ...input, actorId: actorOf(auth) });
  return devices.findById(id);
}

export async function deleteDevice(auth, id) {
  const device = await loadAccessible(id, auth, { write: true });
  await withTransaction(async (client) => {
    await credentials.revokeAllForDevice(id, 'device_deleted', client);
    await devices.softDelete(id, actorOf(auth), client);
    await outbox.add(
      {
        type: 'iot.device.decommissioned',
        payload: summary(device),
        idempotencyKey: `iot.device.decommissioned:${id}`,
      },
      client,
    );
  });
}

export async function rotateCredential(auth, id, { label, expiresAt, revokeExisting = true }) {
  const device = await loadAccessible(id, auth, { write: true });
  const token = deviceToken(device.id);
  const credential = await withTransaction(async (client) => {
    if (revokeExisting) await credentials.revokeAllForDevice(device.id, 'rotated', client);
    return credentials.issue(
      { deviceId: device.id, tokenHash: keyedHash(token), label, expiresAt, actorId: actorOf(auth) },
      client,
    );
  });
  return { ...credential, token };
}

export async function revokeCredential(auth, id, credentialId) {
  await loadAccessible(id, auth, { write: true });
  if (!(await credentials.revokeOne(id, credentialId, 'revoked'))) throw DomainErrors.notFound('Credential');
}

export async function setDesiredState(auth, id, desired) {
  const device = await loadAccessible(id, auth, { write: true });
  const updated = await state.setDesired(id, desired);
  publishDesired(device.external_id, updated);
  return updated;
}

export async function activate({ externalId, claimCode: code, firmware }) {
  const device = await devices.findByClaimCodeHash(keyedHash(code));
  if (!device || device.external_id.toLowerCase() !== externalId.toLowerCase())
    throw DomainErrors.invalidDeviceCredential();
  if (device.status === 'disabled') throw DomainErrors.deviceDisabled();
  if (device.status === 'active') throw DomainErrors.alreadyActivated();

  const token = deviceToken(device.id);
  return withTransaction(async (client) => {
    await devices.activate(device.id, { firmware }, client);
    await credentials.issue(
      { deviceId: device.id, tokenHash: keyedHash(token), label: 'primary', actorId: 'activation' },
      client,
    );
    await state.ensure(device.id, client);
    await outbox.add(
      { type: 'iot.device.activated', payload: summary(device), idempotencyKey: `iot.device.activated:${device.id}` },
      client,
    );
    return {
      deviceId: device.id,
      externalId: device.external_id,
      token,
      ingestUrl: '/v1/device/telemetry',
      heartbeatSeconds: Math.max(15, Math.floor(config.DEVICE_OFFLINE_AFTER_SECONDS / 3)),
    };
  });
}

export const listDeviceTypes = () => deviceTypes.listAll();

export async function createDeviceType(auth, input) {
  if (await deviceTypes.findByKey(input.key)) throw DomainErrors.duplicateExternalId();
  return deviceTypes.create({ ...input, actorId: actorOf(auth) });
}
