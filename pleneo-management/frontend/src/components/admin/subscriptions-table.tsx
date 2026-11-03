'use client';

import { Pause, Play } from 'lucide-react';
import { errorMessage } from '@/lib/api/problem';
import { useSubscriptions, useToggleSubscription } from '@/lib/events/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function SubscriptionsTable() {
  const subscriptions = useSubscriptions();
  const toggle = useToggleSubscription();

  if (subscriptions.isPending)
    return <Skeleton className="h-40 w-full" role="status" aria-label="Loading subscriptions" />;
  if (subscriptions.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(subscriptions.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Endpoint</TableHead>
            <TableHead>Event types</TableHead>
            <TableHead>Deliveries 24h</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                No subscriptions yet.
              </TableCell>
            </TableRow>
          )}
          {subscriptions.data.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="max-w-xs truncate" title={s.url}>
                <code className="text-xs">{s.url}</code>
              </TableCell>
              <TableCell className="space-x-1">
                {s.event_types.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </TableCell>
              <TableCell className="space-x-1 text-xs">
                <span>ok {s.deliveries24h.succeeded ?? 0}</span>
                <span className="text-muted-foreground">pending {s.deliveries24h.pending ?? 0}</span>
                <span className={s.deliveries24h.dead ? 'text-destructive' : 'text-muted-foreground'}>
                  dead {s.deliveries24h.dead ?? 0}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{s.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle.mutate({ id: s.id, status: s.status === 'active' ? 'paused' : 'active' })}
                  aria-label={`${s.status === 'active' ? 'Pause' : 'Resume'} ${s.name}`}
                >
                  {s.status === 'active' ? <Pause /> : <Play />}
                  {s.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
