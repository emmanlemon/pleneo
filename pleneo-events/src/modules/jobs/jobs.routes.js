import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { publishLimiter } from '#common/middleware/rate-limit.js';
import * as c from './jobs.controller.js';
import * as v from './jobs.validators.js';

export const jobsRouter = Router();
jobsRouter.use(authenticate);

jobsRouter.post(
  '/',
  publishLimiter,
  requirePermission('jobs:enqueue'),
  v.validateEnqueue,
  h(c.enqueue),
);
