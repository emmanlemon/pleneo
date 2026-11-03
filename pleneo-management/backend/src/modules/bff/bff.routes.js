import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requireUser } from '#common/middleware/authorize.js';
import { authLimiter, gatewayLimiter, sensitiveLimiter } from '#common/middleware/rate-limit.js';
import { body } from '#common/validation/validator.js';
import { createGateway } from '#modules/gateway/gateway.js';
import { UPSTREAMS } from '#modules/gateway/policy.js';
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

export const authRouter = Router();

authRouter.post('/login', authLimiter, body(loginSchema), h(c.login));
authRouter.post('/login/mfa', authLimiter, body(mfaSchema), h(c.loginMfa));
authRouter.post('/register', authLimiter, body(registerSchema), h(c.register));
authRouter.post('/email/verify', authLimiter, body(verifyEmailSchema), h(c.verifyEmail));
authRouter.post('/email/resend', sensitiveLimiter, body(emailOnlySchema), h(c.resendVerification));
authRouter.post('/password/forgot', sensitiveLimiter, body(emailOnlySchema), h(c.forgotPassword));
authRouter.post('/password/reset', authLimiter, body(resetPasswordSchema), h(c.resetPassword));
authRouter.post('/logout', h(c.logout));

authRouter.get('/session', authenticate, requireUser, h(c.session));
authRouter.post('/password/change', authenticate, requireUser, authLimiter, body(changePasswordSchema), h(c.changePassword));

/** Proxied surfaces mount at the resource root, so the console never learns which service serves them. */
export const proxyRouter = Router();
for (const [name, upstream] of Object.entries(UPSTREAMS))
  for (const mount of upstream.mounts)
    proxyRouter.use(mount, authenticate, requireUser, gatewayLimiter, h(createGateway(name, mount)));
