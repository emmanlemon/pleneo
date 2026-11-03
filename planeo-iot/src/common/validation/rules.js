import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z.iso.date();
export const name = z.string().trim().min(1).max(120);
export const description = z.string().trim().max(2000);
export const searchTerm = z.string().trim().max(120);

export const pagination = (max = 100) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(max).default(Math.min(25, max)),
    cursor: uuid.optional(),
  });

export const strictObject = (shape) => z.object(shape).strict();
