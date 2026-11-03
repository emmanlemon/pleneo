import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireAny, requireRole, requireScope } from '#common/middleware/authorize.js';
import { publishLimiter } from '#common/middleware/rate-limit.js';
import * as c from './events.controller.js';
import * as v from './events.validators.js';

export const eventsRouter = Router();
eventsRouter.use(authenticate);

eventsRouter.post(
  '/',
  publishLimiter,
  requireAny(requireScope('events:publish'), requireRole('admin')),
  v.validatePublish,
  h(c.publish),
);
