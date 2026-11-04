'use client';

import { useState } from 'react';
import type { AuditEvent } from '@/lib/access/api';
import { useAuditLog } from '@/lib/access/hooks';
import { errorMessage } from '@/lib/api/problem';
import { relativeTime } from '../notifications/notification-bell';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const PAGE = 100;
const ACTOR_VARIANT: Record<AuditEvent['actor_type'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  user: 'secondary',
  client: 'outline',
  system: 'default',
  anonymous: 'destructive',
};

export function AuditTable({ targetId }: { targetId?: string }) {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [pages, setPages] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const log = useAuditLog({
    limit: PAGE,
    action: action || undefined,
    actorId: actorId || undefined,
    targetId,
    before: pages.at(-1),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Action, e.g. auth.login"
          value={action}
          onChange={(e) => {
            setAction(e.target.value.trim());
            setPages([]);
          }}
          className="max-w-xs"
          aria-label="Filter by action"
        />
        <Input
          placeholder="Actor id"
          value={actorId}
          onChange={(e) => {
            setActorId(e.target.value.trim());
            setPages([]);
          }}
          className="max-w-xs"
          aria-label="Filter by actor"
        />
      </div>

      {log.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(log.error)}</AlertDescription>
        </Alert>
      )}
      {log.isPending ? (
        <Skeleton className="h-64 w-full" role="status" aria-label="Loading audit log" />
      ) : log.isError ? null : (
        <div className="bg-card rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.data.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No events match these filters.
                  </TableCell>
                </TableRow>
              )}
              {log.data.events.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  expanded={expanded === e.id}
                  onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {pages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setPages((p) => p.slice(0, -1))}>
            Newer
          </Button>
        )}
        {log.data?.nextBefore && (
          <Button variant="outline" size="sm" onClick={() => setPages((p) => [...p, log.data.nextBefore!])}>
            Older
          </Button>
        )}
      </div>
    </div>
  );
}

function EventRow({ event, expanded, onToggle }: { event: AuditEvent; expanded: boolean; onToggle: () => void }) {
  const { requestId, ...metadata } = event.metadata;
  const hasMetadata = Object.keys(metadata).length > 0;
  return (
    <>
      <TableRow
        className={hasMetadata ? 'cursor-pointer' : undefined}
        onClick={hasMetadata ? onToggle : undefined}
        aria-expanded={hasMetadata ? expanded : undefined}
      >
        <TableCell title={event.created_at}>{relativeTime(event.created_at)}</TableCell>
        <TableCell>
          <Badge variant={ACTOR_VARIANT[event.actor_type]}>{event.actor_type}</Badge>{' '}
          <code className="text-muted-foreground text-xs">{event.actor_id?.slice(0, 8) ?? '—'}</code>
        </TableCell>
        <TableCell>
          <code className="text-xs">{event.action}</code>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {event.target_type ? `${event.target_type} ${event.target_id?.slice(0, 8) ?? ''}` : '—'}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">{event.ip ?? '—'}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30 whitespace-normal">
            <pre className="bg-background max-h-48 overflow-auto rounded border p-2 text-xs">
              {JSON.stringify(metadata, null, 2)}
            </pre>
            {typeof requestId === 'string' && <p className="text-muted-foreground mt-1 text-xs">request {requestId}</p>}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
