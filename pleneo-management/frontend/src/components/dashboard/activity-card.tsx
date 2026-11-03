'use client';

import Link from 'next/link';
import { useNotifications } from '@/lib/notifications/hooks';
import { cn } from '@/lib/utils';
import { relativeTime } from '../notifications/notification-bell';
import { Button } from '../ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

export function ActivityCard() {
  const { data, isPending } = useNotifications({ limit: 8 });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Delivered to your inbox as it happens</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/notifications">Inbox</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40 w-full" role="status" aria-label="Loading activity" />
        ) : !data?.notifications.length ? (
          <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
        ) : (
          <ol className="space-y-3">
            {data.notifications.map((n) => (
              <li key={n.id} className="flex gap-3">
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-border' : 'bg-series-1')}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', !n.read_at && 'font-medium')}>
                    {n.data.href ? (
                      <Link href={n.data.href} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {relativeTime(n.created_at)}
                    {n.body && ` · ${n.body}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
