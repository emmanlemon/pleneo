import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInviteForm } from '@/components/forms/accept-invite-form';

export const metadata: Metadata = { title: 'Accept invitation' };

export default function AcceptInvitePage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Welcome to Pleneo</h1>
      <p className="text-muted-foreground mb-4 text-sm">Set a password to activate your account.</p>
      <Suspense>
        <AcceptInviteForm />
      </Suspense>
    </>
  );
}
