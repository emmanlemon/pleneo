'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/lib/query-client';
import { ConfirmProvider } from './confirm-dialog';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors closeButton position="top-right" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>{children}</ConfirmProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
