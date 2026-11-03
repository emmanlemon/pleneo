import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { requirePermission } from '#common/middleware/authorize.js';
import * as v from './admin.validators.js';
import * as c from './platform.controller.js';

export const adminPlatformRouter = Router();

adminPlatformRouter.get('/roles', requirePermission('users:read'), h(c.listRoles));

adminPlatformRouter.get('/clients', requirePermission('clients:manage'), h(c.listClients));
adminPlatformRouter.post('/clients', requirePermission('clients:manage'), v.validateCreateClient, h(c.createClient));
adminPlatformRouter.delete('/clients/:id', requirePermission('clients:manage'), v.validateId, h(c.revokeClient));

adminPlatformRouter.get('/keys', requirePermission('keys:rotate'), h(c.listSigningKeys));
adminPlatformRouter.post('/keys/rotate', requirePermission('keys:rotate'), h(c.rotateKeys));

adminPlatformRouter.get('/audit', requirePermission('audit:read'), v.validateAuditQuery, h(c.auditLog));
