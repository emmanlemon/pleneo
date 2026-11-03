import { DomainErrors } from '#common/errors/domain-errors.js';
import { ok } from '#common/http/respond.js';
import * as users from './user.repository.js';

export const me = async (req, res) => {
  const user = await users.findPublicById(req.auth.userId);
  if (!user) throw DomainErrors.notFound('User');
  ok(res, { ...user, roles: req.auth.roles, permissions: req.auth.permissions });
};

export const updateMe = async (req, res) => ok(res, await users.updateProfile(req.auth.userId, req.body));
