'use client';

import { Loader2, Trash2 } from 'lucide-react';
import type { ApiClient } from '@/lib/access/api';
import { useClients, useRevokeClient } from '@/lib/access/hooks';
import { errorMessage } from '@/lib/api/problem';
import { useConfirm } from '../confirm-dialog';
import { relativeTime } from '../notifications/notification-bell';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function ClientsTable() {
  const clients = useClients();
  const revoke = useRevokeClient();
  const confirm = useConfirm();

  if (clients.isPending) return <Skeleton className="h-40 w-full" role="status" aria-label="Loading clients" />;
  if (clients.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(clients.error)}</AlertDescription>
      </Alert>
    );
  }

  const revokeClient = async (client: ApiClient) => {
    const ok = await confirm({
      title: `Revoke "${client.name}"?`,
      description: 'Tokens issued to this client stop working immediately. This cannot be undone.',
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (ok) revoke.mutate(client.id);
  };

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                No API clients yet.
              </TableCell>
            </TableRow>
          )}
          {clients.data.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">{c.name}</div>
                <code className="text-muted-foreground text-xs">{c.client_id}</code>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex max-w-md flex-wrap gap-1">
                  {c.scopes.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={c.status === 'active' ? 'outline' : 'destructive'}>{c.status}</Badge>
              </TableCell>
              <TableCell>{c.last_used_at ? relativeTime(c.last_used_at) : 'never'}</TableCell>
              <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                {c.status === 'active' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke ${c.name}`}
                    disabled={revoke.isPending && revoke.variables === c.id}
                    onClick={() => revokeClient(c)}
                  >
                    {revoke.isPending && revoke.variables === c.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 className="text-destructive" />
                    )}
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
