import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import { authLimiter, sensitiveLimiter } from '#common/middleware/rate-limit.js';
import * as c from './auth.controller.js';
import * as v from './auth.validators.js';

export const authRouter = Router();
const protectedRoute = [authenticate, requireUser];

authRouter.post('/register', authLimiter, v.validateRegister, h(c.register));
authRouter.post('/login', authLimiter, v.validateLogin, h(c.login));
authRouter.post('/login/mfa', authLimiter, v.validateMfaLogin, h(c.loginMfa));
authRouter.post('/refresh', authLimiter, v.validateRefresh, h(c.refresh));
authRouter.post('/logout', protectedRoute, h(c.logout));
authRouter.post('/logout-all', protectedRoute, h(c.logoutAll));

authRouter.post('/email/verify', authLimiter, v.validateVerifyEmail, h(c.verifyEmail));
authRouter.post('/email/resend', sensitiveLimiter, v.validateEmailOnly, h(c.resendVerification));

authRouter.post('/invitations/accept', authLimiter, v.validateAcceptInvitation, h(c.acceptInvitation));

authRouter.post('/password/forgot', sensitiveLimiter, v.validateEmailOnly, h(c.forgotPassword));
authRouter.post('/password/reset', authLimiter, v.validateResetPassword, h(c.resetPassword));
authRouter.post('/password/change', protectedRoute, authLimiter, v.validateChangePassword, h(c.changePassword));

authRouter.get('/sessions', protectedRoute, h(c.listSessions));
authRouter.delete('/sessions/:id', protectedRoute, v.validateSessionId, h(c.revokeSession));
