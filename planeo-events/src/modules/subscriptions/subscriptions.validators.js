import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, validate } from '#common/validation/validator.js';
import { eventTypePattern } from '#modules/events/events.validators.js';

const idParams = z.object({ id: r.uuid });
const name = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'Use lower-case letters, digits and dashes');
const url = z.string().url().max(2048);
const secret = z.string().min(32).max(256);

export const validateId = params(idParams);

export const validateCreate = body(
  r.strictObject({
    name,
    description: r.description.default(''),
    url,
    secret: secret.optional(),
    eventTypes: z.array(eventTypePattern).min(1).max(100),
  }),
);

export const validateUpdate = validate({
  params: idParams,
  body: r
    .strictObject({
      description: r.description.optional(),
      url: url.optional(),
      secret: secret.optional(),
      eventTypes: z.array(eventTypePattern).min(1).max(100).optional(),
      status: z.enum(['active', 'paused']).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});
