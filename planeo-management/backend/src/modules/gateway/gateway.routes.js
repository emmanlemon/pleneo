import { Router } from 'express';
import { ok } from '#common/http/respond.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireRole } from '#common/middleware/authorize.js';
import { gatewayStatus } from './gateway.js';

export const gatewayRouter = Router();

gatewayRouter.get('/gateway', authenticate, requireRole('admin'), (_req, res) => ok(res, gatewayStatus()));
