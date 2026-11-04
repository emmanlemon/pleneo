import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { receiveEvent } from './events.controller.js';

export const webhooksRouter = Router();

webhooksRouter.post('/events', h(receiveEvent));
