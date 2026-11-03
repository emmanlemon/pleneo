import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import { sensitiveLimiter } from '#common/middleware/rate-limit.js';
import * as c from './mfa.controller.js';
import * as v from './mfa.validators.js';

export const mfaRouter = Router();
mfaRouter.use(authenticate, requireUser, sensitiveLimiter);

mfaRouter.post('/setup', h(c.setup));
mfaRouter.post('/enable', v.validateEnable, h(c.enable));
mfaRouter.post('/disable', v.validateDisable, h(c.disable));
mfaRouter.post('/recovery-codes', v.validateReauth, h(c.regenerateRecoveryCodes));
