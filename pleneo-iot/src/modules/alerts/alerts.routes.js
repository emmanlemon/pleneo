import { Router } from 'express';
import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { ok } from '#common/http/respond.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import { params, query } from '#common/validation/validator.js';
import * as service from './alerts.service.js';

const idParams = z.object({ id: r.uuid });

const validateList = query(
  z.object({
    deviceId: r.uuid.optional(),
    status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
);

export const alertsRouter = Router();

alertsRouter.get(
  '/',
  validateList,
  h(async (req, res) => ok(res, await service.listAlerts(req.auth, req.query))),
);

alertsRouter.get(
  '/stats',
  h(async (req, res) => ok(res, await service.alertStats(req.auth))),
);

alertsRouter.post(
  '/:id/acknowledge',
  writeLimiter,
  params(idParams),
  h(async (req, res) => ok(res, await service.acknowledgeAlert(req.auth, req.params.id))),
);

alertsRouter.post(
  '/:id/resolve',
  writeLimiter,
  params(idParams),
  h(async (req, res) => ok(res, await service.resolveAlert(req.auth, req.params.id))),
);
