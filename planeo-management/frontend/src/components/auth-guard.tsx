'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/hooks';

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isPending, session, router, pathname]);

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500" role="status">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
