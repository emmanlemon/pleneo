import * as r from '#common/validation/rules.js';
import { body } from '#common/validation/validator.js';

export const validateEnable = body(r.strictObject({ code: r.totpCode }));
export const validateDisable = body(r.strictObject({ password: r.rawPassword, code: r.mfaCode }));
export const validateReauth = body(r.strictObject({ password: r.rawPassword }));
