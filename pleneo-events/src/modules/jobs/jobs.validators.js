import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, query } from '#common/validation/validator.js';
import { idempotencyKey, jsonObject } from '#modules/events/events.validators.js';

export const JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled'];
export const queueName = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid queue name');
export const jobType = z.string().regex(/^[a-z0-9]+(\.[a-z0-9_-]+)+$/, 'Invalid job type');

export const enqueueJobSchema = r.strictObject({
  type: jobType,
  queue: queueName.default('default'),
  payload: jsonObject.default({}),
  runAt: z.iso.datetime({ offset: true }).optional(),
  priority: z.number().int().min(-100).max(100).default(0),
  maxAttempts: z.number().int().min(1).max(50).default(8),
  idempotencyKey: idempotencyKey.optional(),
});

export const validateEnqueue = body(enqueueJobSchema);

export const validateJobId = params(z.object({ id: r.uuid }));

export const validateJobList = query(
  r.pagination(200).extend({
    status: z.enum(JOB_STATUSES).optional(),
    queue: queueName.optional(),
    type: jobType.optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
);
