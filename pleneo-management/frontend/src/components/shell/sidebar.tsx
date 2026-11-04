'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from '@/lib/auth/api';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { isActive, visibleGroups } from './nav';

type Props = { session: Session | null | undefined; open: boolean; collapsed: boolean; onClose: () => void };

export function Sidebar({ session, open, collapsed, onClose }: Props) {
  const pathname = usePathname();

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden onClick={onClose} />}
      <aside
        className={cn(
          'bg-background fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r transition-[transform,width] md:translate-x-0',
          collapsed && 'md:w-16',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Sidebar"
        data-collapsed={collapsed || undefined}
      >
        <div
          className={cn(
            'flex h-14 items-center justify-between border-b px-4',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold" title="Pleneo">
            <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs">
              P
            </span>
            <span className={cn(collapsed && 'md:hidden')}>Pleneo</span>
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Close menu" onClick={onClose}>
            <X />
          </Button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
          {visibleGroups(session).map((group) => (
            <div key={group.label}>
              <p
                className={cn(
                  'text-muted-foreground mb-1 px-2 text-[11px] font-semibold tracking-wider uppercase',
                  collapsed && 'md:sr-only',
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={onClose}
                        title={item.label}
                        className={cn(
                          'hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition',
                          collapsed && 'md:justify-center md:px-0',
                          active ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground',
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className={cn(collapsed && 'md:sr-only')}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className={cn('text-muted-foreground border-t px-4 py-3 text-xs', collapsed && 'md:hidden')}>
          Management console
        </div>
      </aside>
    </>
  );
}
