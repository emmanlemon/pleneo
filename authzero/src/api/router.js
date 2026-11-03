import { Router } from 'express';
import { adminRouter } from '#modules/admin/index.js';
import { authRouter } from '#modules/auth/auth.routes.js';
import { oauthRouter } from '#modules/clients/oauth.routes.js';
import { mfaRouter } from '#modules/mfa/mfa.routes.js';
import { usersRouter } from '#modules/users/users.routes.js';
import { docsRouter } from './docs.routes.js';
import { systemRouter } from './system.routes.js';

export const router = Router();

router.use(docsRouter);
router.use(systemRouter);
router.use('/v1/auth/mfa', mfaRouter);
router.use('/v1/auth', authRouter);
router.use('/v1/users', usersRouter);
router.use('/v1/oauth', oauthRouter);
router.use('/v1/admin', adminRouter);
