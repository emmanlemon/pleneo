'use client';

import Link from 'next/link';
import type { QueueStats } from '@/lib/events/api';
import { useQueueStats } from '@/lib/events/hooks';
import { relativeTime } from '../notifications/notification-bell';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

const BUCKET_MS = 5 * 60_000;
const BUCKETS = 12;

const formatTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function throughputBuckets(stats: QueueStats) {
  const end = Date.parse(stats.generatedAt);
  return Array.from({ length: BUCKETS }, (_, i) => {
    const start = end - (BUCKETS - i) * BUCKET_MS;
    const rows = stats.throughput.filter((t) => {
      const at = Date.parse(t.minute);
      return at >= start && at < start + BUCKET_MS;
    });
    return {
      start,
      succeeded: rows.reduce((sum, t) => sum + t.succeeded, 0),
      dead: rows.reduce((sum, t) => sum + t.dead, 0),
    };
  });
}

export function QueueHealthCard() {
  const { data: stats, isPending } = useQueueStats();

  if (isPending || !stats) return <Skeleton className="h-56 w-full" role="status" aria-label="Loading queues" />;

  const queues = Object.values(stats.queues);
  const sum = (key: 'pending' | 'running' | 'dead') => queues.reduce((total, q) => total + q[key], 0);
  const oldest = queues
    .map((q) => q.oldestPending)
    .filter((at): at is string => Boolean(at))
    .sort()[0];
  const buckets = throughputBuckets(stats);
  const peak = Math.max(1, ...buckets.map((b) => b.succeeded));
  const processed = buckets.reduce((total, b) => total + b.succeeded, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Job processing
          {stats.email && <Badge variant="outline">email via {stats.email.provider}</Badge>}
        </CardTitle>
        <CardDescription>{processed} jobs succeeded in the last hour</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/queues">Queues</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_auto]">
        <figure>
          <div className="flex h-24 items-end gap-1 border-b" role="img" aria-label="Succeeded jobs per 5 minutes, last hour">
            {buckets.map((b) => (
              <div
                key={b.start}
                className="group relative flex h-full flex-1 items-end"
                title={`${formatTime(b.start)}–${formatTime(b.start + BUCKET_MS)}: ${b.succeeded} succeeded, ${b.dead} dead`}
              >
                <div
                  className="bg-series-1 group-hover:bg-series-1/80 w-full rounded-t-[4px]"
                  style={{ height: `${(b.succeeded / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <figcaption className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
            <span>{formatTime(buckets[0].start)}</span>
            <span>now</span>
          </figcaption>
        </figure>
        <dl className="grid grid-cols-2 content-start gap-x-8 gap-y-3 text-sm md:grid-cols-1">
          <div>
            <dt className="text-muted-foreground text-xs">Backlog</dt>
            <dd className="font-medium">
              {sum('pending')} pending, {sum('running')} running
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Oldest waiting</dt>
            <dd className="font-medium">{oldest ? relativeTime(oldest) : 'none'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Dead letter</dt>
            <dd className={sum('dead') ? 'text-status-critical font-medium' : 'font-medium'}>
              {sum('dead')} exhausted retries
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
