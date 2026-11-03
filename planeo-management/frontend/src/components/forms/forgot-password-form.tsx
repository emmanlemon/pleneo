'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { errorMessage } from '@/lib/api/problem';
import { useForgotPassword } from '@/lib/auth/hooks';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  if (forgot.isSuccess) {
    return (
      <Alert>
        <AlertDescription>If an account exists for that address, a reset link has been sent.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => forgot.mutateAsync(values).catch(() => undefined))}
        noValidate
        className="space-y-4"
      >
        {forgot.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(forgot.error)}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
