import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import { authLimiter, gatewayLimiter, sensitiveLimiter } from '#common/middleware/rate-limit.js';
import { body } from '#common/validation/validator.js';
import { createGateway } from '#modules/gateway/gateway.js';
import * as c from './bff.controller.js';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
const opaqueToken = z.string().min(20).max(512);

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const mfaSchema = z
  .object({ mfaToken: z.string().min(20).max(4096), code: z.string().trim().min(5).max(20) })
  .strict();
export const registerSchema = z.object({ email, password, name: z.string().trim().min(1).max(120) }).strict();
export const emailOnlySchema = z.object({ email }).strict();
export const verifyEmailSchema = z.object({ token: opaqueToken }).strict();
export const resetPasswordSchema = z.object({ token: opaqueToken, password }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict();

export const bffRouter = Router();

bffRouter.post('/auth/login', authLimiter, body(loginSchema), h(c.login));
bffRouter.post('/auth/login/mfa', authLimiter, body(mfaSchema), h(c.loginMfa));
bffRouter.post('/auth/register', authLimiter, body(registerSchema), h(c.register));
bffRouter.post('/auth/email/verify', authLimiter, body(verifyEmailSchema), h(c.verifyEmail));
bffRouter.post('/auth/email/resend', sensitiveLimiter, body(emailOnlySchema), h(c.resendVerification));
bffRouter.post('/auth/password/forgot', sensitiveLimiter, body(emailOnlySchema), h(c.forgotPassword));
bffRouter.post('/auth/password/reset', authLimiter, body(resetPasswordSchema), h(c.resetPassword));
bffRouter.post('/auth/logout', h(c.logout));

bffRouter.get('/auth/session', authenticate, requireUser, h(c.session));
bffRouter.post('/auth/password/change', authenticate, requireUser, authLimiter, body(changePasswordSchema), h(c.changePassword));

bffRouter.use('/events', authenticate, requireUser, gatewayLimiter, h(createGateway('events')));
bffRouter.use('/iot', authenticate, requireUser, gatewayLimiter, h(createGateway('iot')));
