'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/hooks';
import { useRealtime } from '@/lib/realtime/use-realtime';
import { toggleSidebar, useSidebarCollapsed } from '@/lib/ui/sidebar-store';
import { cn } from '@/lib/utils';
import { pageTitle } from './shell/nav';
import { Sidebar } from './shell/sidebar';
import { Topbar } from './shell/topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { connected } = useRealtime();
  const collapsed = useSidebarCollapsed();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={cn('bg-muted/40 min-h-screen transition-[padding]', collapsed ? 'md:pl-16' : 'md:pl-60')}>
      <Sidebar session={session} open={menuOpen} collapsed={collapsed} onClose={() => setMenuOpen(false)} />
      <Topbar
        title={pageTitle(pathname)}
        connected={connected}
        session={session}
        onMenu={() => setMenuOpen(true)}
        onToggleSidebar={toggleSidebar}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
