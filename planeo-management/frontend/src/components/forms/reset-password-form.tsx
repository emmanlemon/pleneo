'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { useResetPassword } from '@/lib/auth/hooks';
import { resetPasswordSchema } from '@/lib/auth/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

type Values = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const reset = useResetPassword();
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This reset link is incomplete. Request a new one from the forgot password page.
        </AlertDescription>
      </Alert>
    );
  }

  if (reset.isSuccess) {
    return (
      <Alert>
        <AlertDescription>
          Your password has been updated.
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const submit = form.handleSubmit(async ({ token: t, password }) => {
    try {
      await reset.mutateAsync({ token: t, password });
    } catch (error) {
      const apiError = toApiError(error);
      if (!applyFieldErrors(apiError, form.setError, ['password']))
        form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="animate-spin" />}
          Update password
        </Button>
      </form>
    </Form>
  );
}
