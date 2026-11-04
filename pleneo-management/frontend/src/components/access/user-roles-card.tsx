'use client';

import type { UserDetail } from '@/lib/access/api';
import { useRoleAssignment, useRoles } from '@/lib/access/hooks';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { RolePicker } from './role-picker';

export function UserRolesCard({ user, self }: { user: UserDetail; self: boolean }) {
  const roles = useRoles();
  const assign = useRoleAssignment(user.id);

  const onChange = (next: string[]) => {
    const added = next.find((r) => !user.roles.includes(r));
    const removed = user.roles.find((r) => !next.includes(r));
    if (added) assign.mutate({ role: added, granted: true });
    else if (removed) assign.mutate({ role: removed, granted: false });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>Granting or revoking a role signs the user out so the change applies at once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {roles.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <RolePicker
            roles={roles.data ?? []}
            selected={user.roles}
            onChange={onChange}
            busy={assign.isPending}
            disabled={(role) => self && role.name === 'admin'}
          />
        )}
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs">Effective permissions</p>
          <div className="flex flex-wrap gap-1">
            {user.permissions.length === 0 && <span className="text-muted-foreground text-sm">None</span>}
            {user.permissions.map((p) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
