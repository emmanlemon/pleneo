import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/problem';

const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => count < 2 && !(error instanceof ApiError && NO_RETRY_STATUSES.has(error.status)),
      },
      mutations: { retry: false },
    },
  });
