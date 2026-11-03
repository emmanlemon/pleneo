'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/lib/auth/hooks';
import { Alert, AlertDescription } from '../ui/alert';

export const isAdmin = (roles: string[] | undefined) => roles?.includes('admin') ?? false;

export function AdminGuard({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  if (!isAdmin(session?.roles)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>This area requires the admin role.</AlertDescription>
      </Alert>
    );
  }
  return <>{children}</>;
}
