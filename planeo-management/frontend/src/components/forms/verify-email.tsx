'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { errorMessage } from '@/lib/api/problem';
import { useResendVerification, useVerifyEmail } from '@/lib/auth/hooks';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { mutate: runVerify } = verify;

  useEffect(() => {
    if (token) runVerify(token);
  }, [token, runVerify]);

  if (token && verify.isPending) return <p className="text-muted-foreground text-sm">Verifying your email…</p>;
  if (verify.isSuccess) {
    return (
      <Alert>
        <AlertDescription>
          Email verified.
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {verify.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(verify.error)} Request a new link below.</AlertDescription>
        </Alert>
      )}
      {resend.isSuccess ? (
        <Alert>
          <AlertDescription>If the account exists and is unverified, a new link has been sent.</AlertDescription>
        </Alert>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(({ email }) => resend.mutateAsync(email).catch(() => undefined))}
            noValidate
            className="space-y-4"
          >
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
            <Button type="submit" className="w-full" disabled={resend.isPending}>
              {resend.isPending && <Loader2 className="animate-spin" />}
              Resend verification email
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
