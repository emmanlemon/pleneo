import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { ingestLimiter } from '#common/middleware/rate-limit.js';
import { ingestAuthzero } from './authzero.controller.js';

export const ingestRouter = Router();

ingestRouter.post('/authzero', ingestLimiter, h(ingestAuthzero));
