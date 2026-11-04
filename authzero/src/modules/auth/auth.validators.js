import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params } from '#common/validation/validator.js';

export const validateRegister = body(
  r.strictObject({ email: r.email, password: r.password, name: r.displayName.optional() }),
);

export const validateLogin = body(r.strictObject({ email: r.email, password: r.rawPassword }));

export const validateMfaLogin = body(r.strictObject({ mfaToken: r.jwt, code: r.mfaCode }));

export const validateRefresh = body(r.strictObject({ refreshToken: r.opaqueToken.optional() }));

export const validateEmailOnly = body(r.strictObject({ email: r.email }));

export const validateVerifyEmail = body(r.strictObject({ token: r.opaqueToken }));

export const validateResetPassword = body(r.strictObject({ token: r.opaqueToken, password: r.password }));

export const validateAcceptInvitation = body(r.strictObject({ token: r.opaqueToken, password: r.password }));

export const validateChangePassword = body(
  r
    .strictObject({ currentPassword: r.rawPassword, newPassword: r.password })
    .refine((v) => v.currentPassword !== v.newPassword, {
      message: 'New password must differ from the current password',
      path: ['newPassword'],
    }),
);

export const validateSessionId = params(z.object({ id: r.uuid }));
