import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import * as c from './projects.controller.js';
import * as v from './projects.validators.js';

export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.get('/', v.validateList, h(c.list));
projectsRouter.post('/', writeLimiter, v.validateCreate, h(c.create));
projectsRouter.get('/:id', v.validateId, h(c.get));
projectsRouter.patch('/:id', writeLimiter, v.validateId, v.validateUpdate, h(c.update));
projectsRouter.delete('/:id', writeLimiter, v.validateId, h(c.remove));
