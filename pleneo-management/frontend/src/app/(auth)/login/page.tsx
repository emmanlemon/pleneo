import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/forms/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
