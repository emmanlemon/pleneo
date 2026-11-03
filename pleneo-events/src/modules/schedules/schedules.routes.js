import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import * as c from './schedules.controller.js';
import * as v from './schedules.validators.js';

export const schedulesRouter = Router();

schedulesRouter.get('/', h(c.list));
schedulesRouter.post('/', v.validateCreate, h(c.create));
schedulesRouter.patch('/:id', v.validateUpdate, h(c.update));
schedulesRouter.delete('/:id', v.validateId, h(c.remove));
schedulesRouter.post('/:id/run', v.validateId, h(c.run));
