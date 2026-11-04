import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { publishLimiter } from '#common/middleware/rate-limit.js';
import * as c from './events.controller.js';
import * as v from './events.validators.js';

export const eventsRouter = Router();
eventsRouter.use(authenticate);

eventsRouter.post(
  '/',
  publishLimiter,
  requirePermission('events:publish'),
  v.validatePublish,
  h(c.publish),
);
