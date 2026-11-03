import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import * as c from './users.controller.js';
import * as v from './users.validators.js';

export const usersRouter = Router();
usersRouter.use(authenticate, requireUser);

usersRouter.get('/me', h(c.me));
usersRouter.patch('/me', v.validateUpdateProfile, h(c.updateMe));
