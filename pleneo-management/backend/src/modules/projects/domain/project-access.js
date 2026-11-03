import { DomainErrors } from '#common/errors/domain-errors.js';
import { isOwnedBy } from './project.js';

export const READ_ALL_SCOPE = 'projects:read';
export const WRITE_ALL_SCOPE = 'projects:write';

const isAdmin = (auth) => auth.type === 'user' && auth.roles.includes('admin');
const hasScope = (auth, scope) => auth.type === 'client' && auth.scopes.includes(scope);

export const canReadAll = (auth) => isAdmin(auth) || hasScope(auth, READ_ALL_SCOPE);
export const canWriteAll = (auth) => isAdmin(auth) || hasScope(auth, WRITE_ALL_SCOPE);

export const actorOf = (auth) => (auth.type === 'user' ? auth.userId : auth.clientId);

export const visibleOwnerId = (auth) => (canReadAll(auth) ? null : auth.userId);

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
