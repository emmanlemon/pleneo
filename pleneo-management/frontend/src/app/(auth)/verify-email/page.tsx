import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/components/forms/verify-email';

export const metadata: Metadata = { title: 'Verify email' };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Verify your email</h1>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </>
  );
}
