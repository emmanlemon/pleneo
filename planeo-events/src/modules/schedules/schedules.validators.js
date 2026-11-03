import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, validate } from '#common/validation/validator.js';
import { jsonObject } from '#modules/events/events.validators.js';
import { jobType, queueName } from '#modules/jobs/jobs.validators.js';
import { isValidCron } from '#scheduler/cron.js';

const idParams = z.object({ id: r.uuid });
const name = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/, 'Use lower-case letters, digits, dots and dashes');
const timezone = z.string().min(1).max(64).default('UTC');
const cron = z.string().min(9).max(120);

const cronWithTimezone = (schema) =>
  schema.refine((v) => v.cron === undefined || isValidCron(v.cron, v.timezone ?? 'UTC'), {
    message: 'Invalid cron expression',
    path: ['cron'],
  });

export const validateId = params(idParams);

export const validateCreate = body(
  cronWithTimezone(
    r.strictObject({
      name,
      description: r.description.default(''),
      cron,
      timezone,
      queue: queueName.default('default'),
      jobType,
      payload: jsonObject.default({}),
      enabled: z.boolean().default(true),
    }),
  ),
);

export const validateUpdate = validate({
  params: idParams,
  body: cronWithTimezone(
    r
      .strictObject({
        description: r.description.optional(),
        cron: cron.optional(),
        timezone: timezone.optional(),
        queue: queueName.optional(),
        jobType: jobType.optional(),
        payload: jsonObject.optional(),
        enabled: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
  ),
});
