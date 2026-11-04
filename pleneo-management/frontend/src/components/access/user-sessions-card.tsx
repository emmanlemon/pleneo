import type { UserSession } from '@/lib/access/api';
import { relativeTime } from '../notifications/notification-bell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function UserSessionsCard({ sessions }: { sessions: UserSession[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Refresh-token families that can still mint access tokens.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active sessions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell title={s.created_at}>{relativeTime(s.created_at)}</TableCell>
                  <TableCell>{s.last_used_at ? relativeTime(s.last_used_at) : '—'}</TableCell>
                  <TableCell>{s.ip ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate" title={s.user_agent ?? ''}>
                    {s.user_agent ?? '—'}
                  </TableCell>
                  <TableCell>{new Date(s.expires_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
