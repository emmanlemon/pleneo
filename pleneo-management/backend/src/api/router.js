import { Router } from 'express';
import { bffRouter } from '#modules/bff/bff.routes.js';
import { emailRouter } from '#modules/email/email.routes.js';
import { gatewayRouter } from '#modules/gateway/gateway.routes.js';
import { notificationsRouter } from '#modules/notifications/notifications.routes.js';
import { projectsRouter } from '#modules/projects/index.js';
import { webhooksRouter } from '#modules/webhooks/events.routes.js';
import { docsRouter } from './docs.routes.js';
import { systemRouter } from './system.routes.js';

export const router = Router();

router.use(docsRouter);
router.use(systemRouter);
router.use('/v1/bff', bffRouter);
router.use('/v1/admin', gatewayRouter);
router.use('/v1/admin', emailRouter);
router.use('/v1/projects', projectsRouter);
router.use('/v1/notifications', notificationsRouter);
router.use('/v1/webhooks', webhooksRouter);
