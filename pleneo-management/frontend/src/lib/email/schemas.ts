import { z } from 'zod';
import { email } from '@/lib/auth/schemas';

export const testEmailSchema = z.object({
  to: email,
  note: z.string().trim().max(200, 'Keep the note under 200 characters').optional(),
});

export type TestEmailInput = z.infer<typeof testEmailSchema>;
