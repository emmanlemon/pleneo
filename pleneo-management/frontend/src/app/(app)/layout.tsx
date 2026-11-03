import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

const fallback = (
  <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm" role="status">
    Loading…
  </div>
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </Suspense>
  );
}
