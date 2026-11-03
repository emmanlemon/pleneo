import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, query } from '#common/validation/validator.js';

export const eventType = z
  .string()
  .regex(/^[a-z0-9]+(\.[a-z0-9_]+)+$/, 'Use dotted lower-case segments, e.g. project.created');
export const eventTypePattern = z
  .string()
  .regex(/^(\*|[a-z0-9]+(\.[a-z0-9_]+)*(\.\*)?)$/, 'Use a type, a prefix.* pattern or *');
export const jsonObject = z.record(z.string(), z.unknown());
export const idempotencyKey = z.string().min(1).max(200);

export const publishEventSchema = r.strictObject({
  type: eventType,
  payload: jsonObject.default({}),
  idempotencyKey: idempotencyKey.optional(),
  correlationId: z.string().max(128).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const validatePublish = body(publishEventSchema);

export const validateEventId = params(z.object({ id: r.uuid }));

export const validateEventList = query(
  r.pagination(200).extend({
    type: z.string().max(120).optional(),
    source: z.string().max(120).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
);
