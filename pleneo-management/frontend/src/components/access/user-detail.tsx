'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/lib/access/hooks';
import { STATUS_LABELS, STATUS_VARIANT } from '@/lib/access/schemas';
import { errorMessage } from '@/lib/api/problem';
import { useSession } from '@/lib/auth/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { UserAccountCard } from './user-account-card';
import { UserRolesCard } from './user-roles-card';
import { UserSessionsCard } from './user-sessions-card';

export function UserDetail({ id }: { id: string }) {
  const user = useUser(id);
  const { data: session } = useSession();

  if (user.isPending) return <Skeleton className="h-64 w-full" role="status" aria-label="Loading user" />;
  if (user.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(user.error)}</AlertDescription>
      </Alert>
    );
  }

  const u = user.data;
  const self = session?.id === u.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to users">
          <Link href="/admin/users">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {u.name ?? u.email}
            <Badge variant={STATUS_VARIANT[u.status]}>{STATUS_LABELS[u.status]}</Badge>
            {self && <Badge variant="outline">You</Badge>}
          </h1>
          <p className="text-muted-foreground text-sm">
            {u.email} · joined {new Date(u.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <UserAccountCard user={u} self={self} />
        <UserRolesCard user={u} self={self} />
      </div>
      <UserSessionsCard sessions={u.sessions} />
    </div>
  );
}
