'use client';

import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/lib/notifications/hooks';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export const relativeTime = (iso: string, now = Date.now()) => {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export function NotificationBell() {
  const unread = useUnreadCount();
  const recent = useNotifications({ limit: 8 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const count = unread.data ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={count ? `${count} unread notifications` : 'Notifications'}
          className="relative"
        >
          <Bell />
          {count > 0 && (
            <span className="bg-destructive absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!count || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto" aria-label="Recent notifications">
          {recent.data?.notifications.length === 0 && (
            <li className="text-muted-foreground px-3 py-6 text-center text-sm">You are all caught up.</li>
          )}
          {recent.data?.notifications.map((n) => (
            <li key={n.id} className={cn('px-3 py-2 text-sm', !n.read_at && 'bg-accent/40')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {n.data.href ? (
                    <Link
                      href={n.data.href}
                      className="font-medium hover:underline"
                      onClick={() => !n.read_at && markRead.mutate(n.id)}
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  {n.body && <p className="text-muted-foreground line-clamp-2 text-xs">{n.body}</p>}
                  <p className="text-muted-foreground mt-1 text-[11px]">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Mark "${n.title}" as read`}
                    onClick={() => markRead.mutate(n.id)}
                  >
                    Read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t px-3 py-2 text-center">
          <Link href="/notifications" className="text-muted-foreground text-xs underline">
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
