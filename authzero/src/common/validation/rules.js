import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);

export const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => !/^\s|\s$/.test(v), 'Password must not start or end with whitespace')
  .refine(
    (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
    'Password must contain upper, lower and numeric characters',
  );

export const rawPassword = z.string().min(1).max(128);
export const uuid = z.string().uuid();
export const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Code must be 6 digits');
export const recoveryCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, 'Invalid recovery code format');
export const mfaCode = z.union([totpCode, recoveryCode]);
export const opaqueToken = z.string().min(20).max(512);
export const jwt = z
  .string()
  .min(20)
  .max(4096)
  .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'Invalid token format');
export const displayName = z.string().trim().min(1).max(120);
export const roleName = z.string().regex(/^[a-z][a-z0-9_-]{1,48}$/, 'Invalid role name');
export const scope = z.string().regex(/^[a-z0-9:_.-]{1,64}$/, 'Invalid scope format');
export const clientId = z.string().min(1).max(128);
export const clientSecret = z.string().min(1).max(256);
export const searchTerm = z.string().trim().max(120);

export const pagination = (max = 100) =>
  z.object({ limit: z.coerce.number().int().min(1).max(max).default(Math.min(50, max)) });

export const strictObject = (shape) => z.object(shape).strict();
