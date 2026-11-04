import { DomainErrors } from '#common/errors/domain-errors.js';
import { requestContext } from '#common/http/request-context.js';
import { created, noContent, ok } from '#common/http/respond.js';
import { audit } from '#modules/audit/audit.service.js';
import * as sessions from '#modules/auth/repositories/session.repository.js';
import { ROLES } from '#modules/users/catalogue.js';
import * as roles from '#modules/users/role.repository.js';
import * as security from '#modules/users/user-security.repository.js';
import * as invitations from '#modules/users/invitation.service.js';
import * as users from '#modules/users/user.repository.js';

const adminAudit = (req, action, metadata) =>
  audit({
    actorId: req.auth.userId,
    actorType: 'user',
    action,
    targetType: 'user',
    targetId: req.params.id,
    ctx: requestContext(req),
    metadata,
  });

export const list = async (req, res) => {
  const rows = await users.list(req.query);
  ok(res, { users: rows, nextCursor: rows.length === req.query.limit ? rows.at(-1).id : null });
};

export const invite = async (req, res) => {
  const user = await invitations.invite(req.body, req.auth, requestContext(req));
  created(res, { id: user.id, email: user.email, name: user.name, status: user.status });
};

export const resendInvitation = async (req, res) => {
  await invitations.resend(req.params.id, req.auth, requestContext(req));
  noContent(res);
};

export const get = async (req, res) => {
  const user = await users.findAdminView(req.params.id);
  if (!user) throw DomainErrors.notFound('User');
  ok(res, { ...user, ...(await roles.getAuthorization(user.id)), sessions: await sessions.listActiveForUser(user.id) });
};

export const setStatus = async (req, res) => {
  if (req.params.id === req.auth.userId) throw DomainErrors.selfModification('Cannot change own status');
  await security.setStatus(req.params.id, req.body.status);
  if (req.body.status === 'disabled') await sessions.revokeAllForUser(req.params.id, 'disabled_by_admin');
  await adminAudit(req, 'admin.user_status_changed', req.body);
  noContent(res);
};

export const unlock = async (req, res) => {
  await security.unlock(req.params.id);
  await adminAudit(req, 'admin.user_unlocked');
  noContent(res);
};

export const revokeSessions = async (req, res) => {
  await sessions.revokeAllForUser(req.params.id, 'revoked_by_admin');
  await adminAudit(req, 'admin.sessions_revoked');
  noContent(res);
};

export const grantRole = async (req, res) => {
  if (!(await roles.exists(req.body.role))) throw DomainErrors.notFound('Role');
  await roles.assign(req.params.id, req.body.role, req.auth.userId);
  await sessions.revokeAllForUser(req.params.id, 'roles_changed');
  await adminAudit(req, 'admin.role_granted', req.body);
  noContent(res);
};

export const revokeRole = async (req, res) => {
  if (req.params.id === req.auth.userId && req.params.role === ROLES.ADMIN)
    throw DomainErrors.selfModification('Cannot remove own admin role');
  await roles.remove(req.params.id, req.params.role);
  await sessions.revokeAllForUser(req.params.id, 'roles_changed');
  await adminAudit(req, 'admin.role_revoked', { role: req.params.role });
  noContent(res);
};
