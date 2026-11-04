'use client';

import { Menu, PanelLeft } from 'lucide-react';
import type { Session } from '@/lib/auth/api';
import { cn } from '@/lib/utils';
import { NotificationBell } from '../notifications/notification-bell';
import { ThemeToggle } from '../theme-toggle';
import { Button } from '../ui/button';
import { UserMenu } from './user-menu';

type Props = {
  title: string;
  connected: boolean;
  session: Session | null | undefined;
  onMenu: () => void;
  onToggleSidebar: () => void;
};

function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex" role="status">
      <span aria-hidden className={cn('size-2 rounded-full', connected ? 'bg-green-600' : 'bg-muted-foreground/40')} />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

export function Topbar({ title, connected, session, onMenu, onToggleSidebar }: Props) {
  return (
    <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={onMenu}>
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>
      <h2 className="truncate text-sm font-medium">{title}</h2>
      <div className="ml-auto flex items-center gap-1">
        <LiveIndicator connected={connected} />
        <ThemeToggle />
        <NotificationBell />
        {session && <UserMenu session={session} />}
      </div>
    </header>
  );
}
