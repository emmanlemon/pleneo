import { Router } from 'express';
import { bffRouter } from '#modules/bff/bff.routes.js';
import { emailRouter } from '#modules/email/email.routes.js';
import { gatewayRouter } from '#modules/gateway/gateway.routes.js';
import { notificationsRouter } from '#modules/notifications/notifications.routes.js';
import { projectsRouter } from '#modules/projects/projects.routes.js';
import { webhooksRouter } from '#modules/webhooks/events.routes.js';
import { docsRouter } from './docs.routes.js';
import { systemRouter } from './system.routes.js';

export const router = Router();

router.use(docsRouter);
router.use(systemRouter);
router.use('/bff', bffRouter);
router.use('/admin', gatewayRouter);
router.use('/admin', emailRouter);
router.use('/projects', projectsRouter);
router.use('/notifications', notificationsRouter);
router.use('/webhooks', webhooksRouter);
