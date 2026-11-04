'use client';

import { Check } from 'lucide-react';
import { useRoles } from '@/lib/access/hooks';
import { permissionGroup } from '@/lib/access/schemas';
import { errorMessage } from '@/lib/api/problem';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function RolesMatrix() {
  const roles = useRoles();

  if (roles.isPending) return <Skeleton className="h-64 w-full" role="status" aria-label="Loading roles" />;
  if (roles.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(roles.error)}</AlertDescription>
      </Alert>
    );
  }

  const permissions = [...new Set(roles.data.flatMap((r) => r.permissions))].sort();
  const groups = [...new Set(permissions.map(permissionGroup))];

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permission</TableHead>
            {roles.data.map((role) => (
              <TableHead key={role.name} className="text-center">
                <div className="font-medium">{role.name}</div>
                <div className="text-muted-foreground text-xs font-normal">{role.description}</div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <GroupRows
              key={group}
              group={group}
              permissions={permissions.filter((p) => permissionGroup(p) === group)}
              roles={roles.data}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type GroupProps = { group: string; permissions: string[]; roles: { name: string; permissions: string[] }[] };

function GroupRows({ group, permissions, roles }: GroupProps) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={roles.length + 1} className="py-1.5">
          <Badge variant="outline">{group}</Badge>
        </TableCell>
      </TableRow>
      {permissions.map((permission) => (
        <TableRow key={permission}>
          <TableCell>
            <code className="text-xs">{permission}</code>
          </TableCell>
          {roles.map((role) => (
            <TableCell key={role.name} className="text-center">
              {role.permissions.includes(permission) ? (
                <Check className="mx-auto size-4" aria-label={`${role.name} has ${permission}`} />
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
