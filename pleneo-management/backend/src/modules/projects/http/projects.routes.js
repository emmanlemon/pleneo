import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import * as v from './projects.validators.js';

export function makeProjectsRouter(controller) {
  const router = Router();
  router.use(authenticate);

  router.get('/', v.validateList, h(controller.list));
  router.post('/', writeLimiter, v.validateCreate, h(controller.create));
  router.get('/:id', v.validateId, h(controller.get));
  router.patch('/:id', writeLimiter, v.validateId, v.validateUpdate, h(controller.update));
  router.delete('/:id', writeLimiter, v.validateId, h(controller.remove));

  return router;
}
