'use client';

import { Loader2, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLogout, useSession } from '@/lib/auth/hooks';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { cn } from '@/lib/utils';
import { isAdmin } from './admin/admin-guard';
import { NotificationBell } from './notifications/notification-bell';
import { Button } from './ui/button';

function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex" role="status">
      <span aria-hidden className={cn('size-2 rounded-full', connected ? 'bg-green-600' : 'bg-muted-foreground/40')} />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/devices', label: 'Devices' },
  { href: '/settings/security', label: 'Security' },
];
const ADMIN_NAV = [{ href: '/admin/queues', label: 'Queues' }];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const logout = useLogout();
  const { connected } = useRealtime();
  const items = isAdmin(session?.roles) ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-1" aria-label="Main">
            <span className="mr-4 font-semibold">Pleneo</span>
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'hover:bg-accent rounded-md px-3 py-1.5 text-sm transition',
                    active ? 'bg-accent text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <LiveIndicator connected={connected} />
            <NotificationBell />
            <span className="text-muted-foreground hidden sm:inline">{session?.email}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
            >
              {logout.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
