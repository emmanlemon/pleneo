import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import * as c from './system.controller.js';

export const systemRouter = Router();

systemRouter.get('/health', c.health);
systemRouter.get('/ready', h(c.ready));
