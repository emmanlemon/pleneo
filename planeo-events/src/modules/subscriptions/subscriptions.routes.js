import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import * as c from './subscriptions.controller.js';
import * as v from './subscriptions.validators.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/', h(c.list));
subscriptionsRouter.post('/', v.validateCreate, h(c.create));
subscriptionsRouter.patch('/:id', v.validateUpdate, h(c.update));
subscriptionsRouter.delete('/:id', v.validateId, h(c.remove));
