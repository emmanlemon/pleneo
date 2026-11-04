import { Router } from 'express';
import { ok } from '#common/http/respond.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { gatewayStatus } from './gateway.js';

export const gatewayRouter = Router();

gatewayRouter.get('/gateway', authenticate, requirePermission('platform:manage'), (_req, res) =>
  ok(res, gatewayStatus()),
);
