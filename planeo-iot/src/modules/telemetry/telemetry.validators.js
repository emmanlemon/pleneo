import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, query, validate } from '#common/validation/validator.js';
import { metricKey } from '#modules/devices/devices.validators.js';

const idParams = z.object({ id: r.uuid });
const finiteNumber = z.number().refine(Number.isFinite, 'Must be a finite number');

export const readingSchema = r.strictObject({
  metric: metricKey,
  value: finiteNumber,
  ts: z.iso.datetime({ offset: true }).optional(),
});

export const ingestSchema = z.union([
  r.strictObject({ readings: z.array(readingSchema).min(1).max(5000) }),
  readingSchema.transform((reading) => ({ readings: [reading] })),
  r
    .strictObject({ metrics: z.record(metricKey, finiteNumber), ts: z.iso.datetime({ offset: true }).optional() })
    .transform(({ metrics, ts }) => ({
      readings: Object.entries(metrics).map(([metric, value]) => ({ metric, value, ts })),
    })),
]);

export const validateIngest = body(ingestSchema);

export const validateSeries = validate({
  params: idParams,
  query: z.object({
    metric: metricKey,
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(500),
    bucketSeconds: z.coerce.number().int().min(10).max(86_400).optional(),
  }),
});

export const validateLatest = validate({ params: idParams });

export const validateReportedState = body(z.record(z.string(), z.unknown()));
