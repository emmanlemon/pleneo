'use client';

import { ChevronRight, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { USER_STATUSES, type UserRow, type UserStatus } from '@/lib/access/api';
import { useUsers } from '@/lib/access/hooks';
import { isLocked, STATUS_LABELS, STATUS_VARIANT } from '@/lib/access/schemas';
import { errorMessage } from '@/lib/api/problem';
import { relativeTime } from '../notifications/notification-bell';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const ALL = 'all';
const PAGE = 50;

export function UsersTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const users = useUsers({ limit: PAGE, search: search || undefined, cursor });
  const rows = (users.data?.users ?? []).filter((u) => status === ALL || u.status === status);

  const resetPaging = () => setCursors([]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPaging();
          }}
          className="max-w-xs"
          aria-label="Search users"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as UserStatus | typeof ALL)}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {USER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild className="ml-auto">
          <Link href="/admin/users/new">
            <UserPlus /> Invite user
          </Link>
        </Button>
      </div>

      {users.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(users.error)}</AlertDescription>
        </Alert>
      )}
      {users.isPending ? (
        <Skeleton className="h-48 w-full" role="status" aria-label="Loading users" />
      ) : (
        <div className="bg-card rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    No users match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((user) => (
                <UserRowView key={user.id} user={user} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {cursors.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))}>
            Previous
          </Button>
        )}
        {users.data?.nextCursor && (
          <Button variant="outline" size="sm" onClick={() => setCursors((c) => [...c, users.data.nextCursor!])}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

function UserRowView({ user }: { user: UserRow }) {
  const locked = isLocked(user.locked_until);
  return (
    <TableRow>
      <TableCell>
        <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
          {user.name ?? user.email}
        </Link>
        {user.name && <div className="text-muted-foreground text-xs">{user.email}</div>}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[user.status]}>{STATUS_LABELS[user.status]}</Badge>
      </TableCell>
      <TableCell className="space-x-1">
        {user.mfa_enabled && (
          <Badge variant="outline">
            <ShieldCheck /> MFA
          </Badge>
        )}
        {locked && (
          <Badge variant="destructive">
            <Lock /> Locked
          </Badge>
        )}
        {!user.email_verified && user.status !== 'invited' && <Badge variant="outline">Unverified</Badge>}
      </TableCell>
      <TableCell title={user.last_login_at ?? ''}>
        {user.last_login_at ? relativeTime(user.last_login_at) : 'never'}
      </TableCell>
      <TableCell title={user.created_at}>{new Date(user.created_at).toLocaleDateString()}</TableCell>
      <TableCell>
        <Link href={`/admin/users/${user.id}`} aria-label={`Open ${user.email}`}>
          <ChevronRight className="text-muted-foreground size-4" />
        </Link>
      </TableCell>
    </TableRow>
  );
}
