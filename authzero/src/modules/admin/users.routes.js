import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { requirePermission } from '#common/middleware/authorize.js';
import * as v from './admin.validators.js';
import * as c from './users.controller.js';

export const adminUsersRouter = Router();
const read = requirePermission('users:read');
const write = requirePermission('users:write');
const manageRoles = requirePermission('roles:manage');

adminUsersRouter.get('/', read, v.validateUserList, h(c.list));
adminUsersRouter.post('/', write, v.validateInviteUser, h(c.invite));
adminUsersRouter.get('/:id', read, v.validateId, h(c.get));
adminUsersRouter.patch('/:id', write, v.validateUserStatus, h(c.setStatus));
adminUsersRouter.post('/:id/unlock', write, v.validateId, h(c.unlock));
adminUsersRouter.post('/:id/revoke-sessions', write, v.validateId, h(c.revokeSessions));
adminUsersRouter.post('/:id/invitations', write, v.validateId, h(c.resendInvitation));
adminUsersRouter.post('/:id/roles', manageRoles, v.validateGrantRole, h(c.grantRole));
adminUsersRouter.delete('/:id/roles/:role', manageRoles, v.validateRevokeRole, h(c.revokeRole));
