import { DomainErrors } from '#common/errors/domain-errors.js';
import * as devices from './device.repository.js';

export const READ_SCOPE = 'devices:read';
export const WRITE_SCOPE = 'devices:write';

const isAdmin = (auth) => auth.type === 'user' && auth.roles.includes('admin');

export const canReadAll = (auth) => isAdmin(auth) || (auth.type === 'client' && auth.scopes.includes(READ_SCOPE));
export const canWriteAll = (auth) => isAdmin(auth) || (auth.type === 'client' && auth.scopes.includes(WRITE_SCOPE));
export const actorOf = (auth) => (auth.type === 'user' ? `user:${auth.userId}` : `client:${auth.clientId}`);
export const ownerScope = (auth) => (canReadAll(auth) ? null : auth.userId);

export async function loadAccessible(id, auth, { write = false } = {}) {
  const device = await devices.findById(id);
  if (!device) throw DomainErrors.notFound('Device');
  const allowed = write ? canWriteAll(auth) : canReadAll(auth);
  if (!allowed && device.owner_id !== auth.userId) throw DomainErrors.notOwner();
  return device;
}
