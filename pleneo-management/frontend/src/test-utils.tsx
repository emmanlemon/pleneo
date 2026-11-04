import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ConfirmProvider } from '@/components/confirm-dialog';

export const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
