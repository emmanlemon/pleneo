'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { useLogin, useLoginMfa } from '@/lib/auth/hooks';
import { loginSchema, mfaSchema, type LoginInput, type MfaInput } from '@/lib/auth/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

const safeNext = (value: string | null) =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const login = useLogin();
  const loginMfa = useLoginMfa();

  const credentials = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const mfa = useForm<MfaInput>({ resolver: zodResolver(mfaSchema), defaultValues: { mfaToken: '', code: '' } });

  const submitCredentials = credentials.handleSubmit(async (values) => {
    try {
      const result = await login.mutateAsync(values);
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        mfa.setValue('mfaToken', result.mfaToken);
        return;
      }
      router.replace(next);
    } catch (error) {
      const apiError = toApiError(error);
      if (applyFieldErrors(apiError, credentials.setError, ['email', 'password'])) return;
      credentials.setError('root', { type: apiError.code, message: apiError.message });
    }
  });

  const submitMfa = mfa.handleSubmit(async (values) => {
    try {
      await loginMfa.mutateAsync(values);
      router.replace(next);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'TOKEN_EXPIRED' || apiError.code === 'INVALID_TOKEN') {
        setMfaToken(null);
        credentials.setError('root', { message: 'Your verification window expired. Sign in again.' });
        return;
      }
      mfa.setError('code', { type: apiError.code, message: apiError.message });
    }
  });

  if (mfaToken) {
    return (
      <Form {...mfa}>
        <form onSubmit={submitMfa} noValidate className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Enter the code from your authenticator app or a recovery code.
          </p>
          <FormField
            control={mfa.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification code</FormLabel>
                <FormControl>
                  <Input autoFocus autoComplete="one-time-code" inputMode="numeric" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMfaToken(null)}>
              Back
            </Button>
            <Button type="submit" disabled={loginMfa.isPending}>
              {loginMfa.isPending && <Loader2 className="animate-spin" />}
              Verify
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  const rootError = credentials.formState.errors.root;
  return (
    <Form {...credentials}>
      <form onSubmit={submitCredentials} noValidate className="space-y-4">
        {rootError && (
          <Alert variant="destructive">
            <AlertDescription>
              {rootError.message}
              {rootError.type === 'EMAIL_UNVERIFIED' && (
                <Link href="/verify-email" className="underline">
                  Resend verification email
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}
        <FormField
          control={credentials.control}
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
        <FormField
          control={credentials.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline">
            Forgot password?
          </Link>
          <Link href="/register" className="text-muted-foreground underline">
            Create an account
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>
    </Form>
  );
}
