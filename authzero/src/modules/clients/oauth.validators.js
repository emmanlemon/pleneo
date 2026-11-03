import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body } from '#common/validation/validator.js';

const clientCredentialFields = { client_id: r.clientId.optional(), client_secret: r.clientSecret.optional() };

export const validateTokenRequest = body(
  z.object({
    grant_type: z.literal('client_credentials'),
    scope: z.string().max(512).optional(),
    ...clientCredentialFields,
  }),
);

export const validateIntrospect = body(z.object({ token: z.string().min(1).max(4096), ...clientCredentialFields }));
