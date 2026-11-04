import { z } from 'zod';
import { email } from '@/lib/auth/schemas';
import type { UserStatus } from './api';

const roleName = z.string().regex(/^[a-z][a-z0-9_-]{1,48}$/);
const scope = z.string().regex(/^[a-z0-9:_.-]{1,64}$/);

export const inviteSchema = z.object({
  email,
  name: z.string().trim().max(120).optional(),
  roles: z.array(roleName).max(10),
});
export type InviteFormValues = z.infer<typeof inviteSchema>;

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  scopes: z.array(scope).min(1, 'Pick at least one scope').max(50),
});
export type ClientFormValues = z.infer<typeof clientSchema>;

export const STATUS_LABELS: Record<UserStatus, string> = { invited: 'Invited', active: 'Active', disabled: 'Disabled' };

export const STATUS_VARIANT: Record<UserStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  invited: 'outline',
  active: 'secondary',
  disabled: 'destructive',
};

export const isLocked = (lockedUntil: string | null, now = Date.now()) =>
  Boolean(lockedUntil) && new Date(lockedUntil!).getTime() > now;

export const permissionGroup = (permission: string) => permission.split(':')[0]!;
