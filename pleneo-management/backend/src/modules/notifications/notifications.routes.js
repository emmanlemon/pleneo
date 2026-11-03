import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import * as c from './notifications.controller.js';
import * as v from './notifications.validators.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate, requireUser);

notificationsRouter.get('/', v.validateList, h(c.list));
notificationsRouter.get('/unread-count', h(c.unreadCount));
notificationsRouter.post('/read-all', h(c.markAllRead));
notificationsRouter.post('/:id/read', v.validateId, h(c.markRead));
notificationsRouter.delete('/:id', v.validateId, h(c.remove));
