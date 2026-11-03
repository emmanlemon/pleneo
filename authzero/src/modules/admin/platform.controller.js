import { requestContext } from '#common/http/request-context.js';
import { created, noContent, ok } from '#common/http/respond.js';
import { listKeys, rotateSigningKey } from '#infra/security/signing-keys.js';
import { audit, listAudit } from '#modules/audit/audit.service.js';
import * as clientService from '#modules/clients/client.service.js';
import * as roles from '#modules/users/role.repository.js';

export const listRoles = async (_req, res) => ok(res, { roles: await roles.listAll() });

export const listClients = async (_req, res) => ok(res, { clients: await clientService.listClients() });

export const createClient = async (req, res) =>
  created(res, await clientService.createClient(req.body, req.auth, requestContext(req)));

export const revokeClient = async (req, res) => {
  await clientService.revokeClient(req.params.id, req.auth, requestContext(req));
  noContent(res);
};

export const listSigningKeys = async (_req, res) => ok(res, { keys: await listKeys() });

export const rotateKeys = async (req, res) => {
  const kid = await rotateSigningKey();
  await audit({
    actorId: req.auth.userId,
    actorType: 'user',
    action: 'admin.key_rotated',
    targetType: 'signing_key',
    targetId: kid,
    ctx: requestContext(req),
  });
  created(res, { kid });
};

export const auditLog = async (req, res) => {
  const events = await listAudit(req.query);
  ok(res, { events, nextBefore: events.length === req.query.limit ? events.at(-1).id : null });
};
