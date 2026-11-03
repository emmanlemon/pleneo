'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { useChangePassword } from '@/lib/auth/hooks';
import { changePasswordSchema } from '@/lib/auth/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

type Values = z.infer<typeof changePasswordSchema>;

const FIELDS = [
  { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
] as const;

export function ChangePasswordForm() {
  const change = useChangePassword();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'INVALID_CREDENTIALS')
        return form.setError('currentPassword', { message: 'Current password is incorrect' });
      if (!applyFieldErrors(apiError, form.setError, ['currentPassword', 'newPassword']))
        form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="max-w-md space-y-4">
        {change.isSuccess && (
          <Alert>
            <AlertDescription>Password updated. Other sessions were signed out.</AlertDescription>
          </Alert>
        )}
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        {FIELDS.map(({ name, label, autoComplete }) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete={autoComplete} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <div className="flex justify-end">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </div>
      </form>
    </Form>
  );
}
