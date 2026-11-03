import { Router } from 'express';
import { config } from '#config';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireMfa, requireUser } from '#common/middleware/authorize.js';
import { adminPlatformRouter } from './platform.routes.js';
import { adminUsersRouter } from './users.routes.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireUser);
if (config.ADMIN_REQUIRE_MFA) adminRouter.use(requireMfa);

adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/', adminPlatformRouter);
