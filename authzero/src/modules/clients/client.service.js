import { DomainErrors } from '#common/errors/domain-errors.js';
import { keyedHash, randomToken } from '#infra/security/crypto.js';
import { audit } from '#modules/audit/audit.service.js';
import * as clients from './client.repository.js';

export async function createClient({ name, scopes }, actor, ctx) {
  const clientSecret = randomToken(48);
  const client = await clients.create({
    clientId: `cid_${randomToken(16)}`,
    secretHash: keyedHash(clientSecret),
    name,
    scopes,
    createdBy: actor.userId,
  });
  await audit({
    actorId: actor.userId,
    actorType: 'user',
    action: 'client.created',
    targetType: 'client',
    targetId: client.id,
    ctx,
    metadata: { name, scopes },
  });
  return { ...client, clientSecret };
}

export const listClients = () => clients.listAll();

export async function revokeClient(id, actor, ctx) {
  if (!(await clients.revoke(id))) throw DomainErrors.notFound('Client');
  await audit({
    actorId: actor.userId,
    actorType: 'user',
    action: 'client.revoked',
    targetType: 'client',
    targetId: id,
    ctx,
  });
}
