'use client';

import type { ReactNode } from 'react';
import type { Session } from '@/lib/auth/api';
import { useSession } from '@/lib/auth/hooks';
import { Alert, AlertDescription } from '../ui/alert';

export const PLATFORM_PERMISSION = 'platform:manage';

type Principal = Pick<Session, 'permissions'> | null | undefined;

export const hasPermission = (session: Principal, permission: string) =>
  session?.permissions.includes(permission) ?? false;

export const isPlatformOperator = (session: Principal) => hasPermission(session, PLATFORM_PERMISSION);

export function PermissionGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const { data: session } = useSession();
  if (!hasPermission(session, permission)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>This area requires the {permission} permission.</AlertDescription>
      </Alert>
    );
  }
  return <>{children}</>;
}

export const AdminGuard = ({ children }: { children: ReactNode }) => (
  <PermissionGuard permission={PLATFORM_PERMISSION}>{children}</PermissionGuard>
);
