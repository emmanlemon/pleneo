'use client';

import { errorMessage } from '@/lib/api/problem';
import { useRecentEvents } from '@/lib/events/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { relativeTime } from '../notifications/notification-bell';

export function EventsTable() {
  const events = useRecentEvents();

  if (events.isPending) return <Skeleton className="h-40 w-full" role="status" aria-label="Loading events" />;
  if (events.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(events.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Payload</TableHead>
            <TableHead>Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.data.events.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                No events yet.
              </TableCell>
            </TableRow>
          )}
          {events.data.events.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <Badge variant="outline">{e.type}</Badge>
              </TableCell>
              <TableCell className="text-xs">{e.source}</TableCell>
              <TableCell className="text-muted-foreground max-w-md truncate text-xs" title={JSON.stringify(e.payload)}>
                {JSON.stringify(e.payload)}
              </TableCell>
              <TableCell title={e.created_at}>{relativeTime(e.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
