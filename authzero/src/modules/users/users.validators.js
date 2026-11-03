import * as r from '#common/validation/rules.js';
import { body } from '#common/validation/validator.js';

export const validateUpdateProfile = body(r.strictObject({ name: r.displayName.optional() }));
