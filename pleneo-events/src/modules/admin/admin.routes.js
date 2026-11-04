import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { ok } from '#common/http/respond.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { adminWriteLimiter } from '#common/middleware/rate-limit.js';
import { getEmailProvider } from '#infra/email/provider.js';
import { handlerTypes } from '#queue/handlers/index.js';
import * as eventsController from '#modules/events/events.controller.js';
import * as eventsValidators from '#modules/events/events.validators.js';
import * as jobsController from '#modules/jobs/jobs.controller.js';
import * as jobsValidators from '#modules/jobs/jobs.validators.js';
import { schedulesRouter } from '#modules/schedules/schedules.routes.js';
import { subscriptionsRouter } from '#modules/subscriptions/subscriptions.routes.js';
import { overview } from './stats.repository.js';

export const adminRouter = Router();
adminRouter.use(authenticate, requirePermission('queues:manage'));
adminRouter.use((req, res, next) => (req.method === 'GET' ? next() : adminWriteLimiter(req, res, next)));

adminRouter.get(
  '/stats',
  h(async (_req, res) =>
    ok(res, { ...(await overview()), handlerTypes: handlerTypes(), email: { provider: getEmailProvider().name } }),
  ),
);

adminRouter.get('/jobs', jobsValidators.validateJobList, h(jobsController.list));
adminRouter.get('/jobs/:id', jobsValidators.validateJobId, h(jobsController.get));
adminRouter.post('/jobs/:id/retry', jobsValidators.validateJobId, h(jobsController.retry));
adminRouter.post('/jobs/:id/cancel', jobsValidators.validateJobId, h(jobsController.cancel));

adminRouter.get('/events', eventsValidators.validateEventList, h(eventsController.list));
adminRouter.get('/events/:id', eventsValidators.validateEventId, h(eventsController.get));

adminRouter.use('/subscriptions', subscriptionsRouter);
adminRouter.use('/schedules', schedulesRouter);
