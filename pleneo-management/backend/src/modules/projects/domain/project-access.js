import { DomainErrors } from '#common/errors/domain-errors.js';
import { isOwnedBy } from './project.js';

export const READ_ALL_SCOPE = 'projects:read';
export const WRITE_ALL_SCOPE = 'projects:write';

const hasPermission = (auth, permission) => auth?.permissions?.includes(permission) ?? false;

export const canReadAll = (auth) => hasPermission(auth, READ_ALL_SCOPE);
export const canWriteAll = (auth) => hasPermission(auth, WRITE_ALL_SCOPE);

export const actorOf = (auth) => (auth.type === 'user' ? auth.userId : auth.clientId);

export function visibleOwnerId(auth) {
  if (canReadAll(auth)) return null;
  if (auth?.type !== 'user') throw DomainErrors.insufficientScope();
  return auth.userId;
}

export function assertCanAccess(project, auth, { write }) {
  const privileged = write ? canWriteAll(auth) : canReadAll(auth);
  if (!privileged && !isOwnedBy(project, auth.userId)) throw DomainErrors.notOwner();
}

export function resolveOwnerId(auth, requestedOwnerId) {
  if (!requestedOwnerId) {
    if (auth.type !== 'user') throw DomainErrors.ownerRequired();
    return auth.userId;
  }
  if (requestedOwnerId !== auth.userId && !canWriteAll(auth)) throw DomainErrors.notOwner();
  return requestedOwnerId;
}
