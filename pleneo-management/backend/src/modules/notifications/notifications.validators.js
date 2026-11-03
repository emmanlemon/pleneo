import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { params, query } from '#common/validation/validator.js';

export const validateId = params(z.object({ id: r.uuid }));

export const validateList = query(
  z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: z.iso.datetime({ offset: true }).optional(),
    unread: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
);
