import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const password = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => !/^\s|\s$/.test(v), 'Must not start or end with a space')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), 'Include upper case, lower case and a number');

const totp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');
const recoveryCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, 'Enter a valid recovery code');

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });
export const mfaSchema = z.object({
  mfaToken: z.string().min(20),
  code: z.union([totp, recoveryCode], { error: 'Enter a 6-digit or recovery code' }),
});
export const registerSchema = z.object({ email, password, name: z.string().trim().min(1, 'Enter your name').max(120) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ token: z.string().min(20), password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a different password',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type MfaInput = z.infer<typeof mfaSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = Pick<z.infer<typeof resetPasswordSchema>, 'token' | 'password'>;
export type ChangePasswordInput = Pick<z.infer<typeof changePasswordSchema>, 'currentPassword' | 'newPassword'>;
