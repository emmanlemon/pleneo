import { DomainErrors } from '#common/errors/domain-errors.js';
import * as devices from './device.repository.js';

export const READ_SCOPE = 'devices:read';
export const WRITE_SCOPE = 'devices:write';

const hasPermission = (auth, permission) => auth?.permissions?.includes(permission) ?? false;
const can = (auth, permission, ownerId) =>
  hasPermission(auth, permission) || (auth?.type === 'user' && Boolean(ownerId) && ownerId === auth.userId);

export const canReadAll = (auth) => hasPermission(auth, READ_SCOPE);
export const canWriteAll = (auth) => hasPermission(auth, WRITE_SCOPE);
export const actorOf = (auth) => (auth.type === 'user' ? `user:${auth.userId}` : `client:${auth.clientId}`);

export function ownerScope(auth) {
  if (canReadAll(auth)) return null;
  if (auth?.type !== 'user') throw DomainErrors.insufficientScope();
  return auth.userId;
}

export function resolveOwnerId(auth, requestedOwnerId) {
  if (!requestedOwnerId) {
    if (auth.type !== 'user') throw DomainErrors.ownerRequired();
    return auth.userId;
  }
  if (requestedOwnerId !== auth.userId && !canWriteAll(auth)) throw DomainErrors.notOwner();
  return requestedOwnerId;
}

export async function loadAccessible(id, auth, { write = false } = {}) {
  const device = await devices.findById(id);
  if (!device) throw DomainErrors.notFound('Device');
  if (!can(auth, write ? WRITE_SCOPE : READ_SCOPE, device.owner_id)) throw DomainErrors.notOwner();
  return device;
}
