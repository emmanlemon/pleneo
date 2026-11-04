'use client';

import { ChevronDown, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Session } from '@/lib/auth/api';
import { useLogout } from '@/lib/auth/hooks';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export const initialsOf = (session: Pick<Session, 'name' | 'email'>) => {
  const source = session.name?.trim() || session.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
};

export function UserMenu({ session }: { session: Session }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="Account menu">
          <span className="bg-muted grid size-7 place-items-center rounded-full text-xs font-semibold">
            {initialsOf(session)}
          </span>
          <span className="hidden max-w-40 truncate text-sm sm:inline">{session.name ?? session.email}</span>
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-3">
          <p className="truncate text-sm font-medium">{session.name ?? 'Unnamed account'}</p>
          <p className="text-muted-foreground truncate text-xs">{session.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {session.roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            {session.mfa_enabled && (
              <Badge variant="outline">
                <ShieldCheck /> MFA
              </Badge>
            )}
          </div>
        </div>
        <div className="p-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link href="/settings/security">Security settings</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
          >
            {logout.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
