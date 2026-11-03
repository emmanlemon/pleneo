'use client';

import { Loader2, Pause, Play, Zap } from 'lucide-react';
import { errorMessage } from '@/lib/api/problem';
import { useRunSchedule, useSchedules, useToggleSchedule } from '@/lib/events/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { relativeTime } from '../notifications/notification-bell';

export function SchedulesTable() {
  const schedules = useSchedules();
  const run = useRunSchedule();
  const toggle = useToggleSchedule();

  if (schedules.isPending) return <Skeleton className="h-40 w-full" role="status" aria-label="Loading schedules" />;
  if (schedules.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(schedules.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Cron</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.data.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <div className="font-medium">{s.name}</div>
                {s.description && <div className="text-muted-foreground text-xs">{s.description}</div>}
              </TableCell>
              <TableCell>
                <code className="text-xs">{s.cron}</code>{' '}
                <span className="text-muted-foreground text-xs">{s.timezone}</span>
              </TableCell>
              <TableCell>
                {s.job_type} <span className="text-muted-foreground text-xs">({s.queue})</span>
              </TableCell>
              <TableCell title={s.next_run_at}>{s.enabled ? new Date(s.next_run_at).toLocaleString() : '—'}</TableCell>
              <TableCell>{s.last_run_at ? relativeTime(s.last_run_at) : 'never'}</TableCell>
              <TableCell>
                <Badge variant={s.enabled ? 'default' : 'secondary'}>{s.enabled ? 'enabled' : 'paused'}</Badge>
              </TableCell>
              <TableCell className="space-x-1 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={run.isPending && run.variables === s.id}
                  onClick={() => run.mutate(s.id)}
                  aria-label={`Run ${s.name} now`}
                >
                  {run.isPending && run.variables === s.id ? <Loader2 className="animate-spin" /> : <Zap />} Run now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}
                  aria-label={`${s.enabled ? 'Pause' : 'Resume'} ${s.name}`}
                >
                  {s.enabled ? <Pause /> : <Play />}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
