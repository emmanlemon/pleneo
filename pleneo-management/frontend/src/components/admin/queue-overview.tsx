'use client';

import { useQueueStats } from '@/lib/events/hooks';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { relativeTime } from '../notifications/notification-bell';

export function QueueOverview() {
  const stats = useQueueStats();

  if (stats.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading queue statistics">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (!stats.data) return null;

  const queues = Object.entries(stats.data.queues);
  const totals = queues.reduce(
    (acc, [, q]) => ({ pending: acc.pending + q.pending, running: acc.running + q.running, dead: acc.dead + q.dead }),
    { pending: 0, running: 0, dead: 0 },
  );
  const lastHour = stats.data.throughput.reduce((acc, t) => acc + t.succeeded, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending" value={totals.pending} description="waiting to run" />
        <Stat label="Running" value={totals.running} description="in flight" />
        <Stat
          label="Dead letter"
          value={totals.dead}
          description="exhausted retries"
          tone={totals.dead ? 'destructive' : 'default'}
        />
        <Stat label="Succeeded / hour" value={lastHour} description="last 60 minutes" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {queues.map(([name, q]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {name}
                {q.oldestPending && <Badge variant="outline">oldest {relativeTime(q.oldestPending)}</Badge>}
              </CardTitle>
              <CardDescription>queue</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">pending {q.pending}</Badge>
              <Badge variant="secondary">running {q.running}</Badge>
              <Badge variant="secondary">succeeded {q.succeeded}</Badge>
              <Badge variant={q.dead ? 'destructive' : 'secondary'}>dead {q.dead}</Badge>
              <Badge variant="secondary">cancelled {q.cancelled}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  description,
  tone = 'default',
}: {
  label: string;
  value: number;
  description: string;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={tone === 'destructive' && value ? 'text-destructive text-3xl' : 'text-3xl'}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{description}</CardContent>
    </Card>
  );
}
