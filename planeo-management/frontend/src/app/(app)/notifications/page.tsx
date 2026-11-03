'use client';

import { CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { relativeTime } from '@/components/notifications/notification-bell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api/problem';
import { useMarkAllRead, useMarkRead, useNotifications, useRemoveNotification } from '@/lib/notifications/hooks';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const notifications = useNotifications({ limit: 50, unread: filter === 'unread' });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const remove = useRemoveNotification();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
      </div>

      {notifications.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(notifications.error)}</AlertDescription>
        </Alert>
      )}
      {notifications.isPending ? (
        <div className="space-y-2" role="status" aria-label="Loading notifications">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notifications.data?.notifications.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No notifications.
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-md border">
          {notifications.data?.notifications.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-4 px-4 py-3', !n.read_at && 'bg-accent/30')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {n.data.href ? (
                    <Link
                      href={n.data.href}
                      className="font-medium hover:underline"
                      onClick={() => !n.read_at && markRead.mutate(n.id)}
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{n.title}</span>
                  )}
                  {!n.read_at && <Badge variant="secondary">New</Badge>}
                </div>
                {n.body && <p className="text-muted-foreground text-sm">{n.body}</p>}
                <p className="text-muted-foreground mt-1 text-xs">
                  {n.type} · {relativeTime(n.created_at)}
                </p>
              </div>
              {!n.read_at && (
                <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                  Mark read
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Delete notification" onClick={() => remove.mutate(n.id)}>
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
