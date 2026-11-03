'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type JobListParams } from './api';

const POLL_MS = 10_000;

export const eventsKeys = {
  all: ['events-admin'] as const,
  stats: ['events-admin', 'stats'] as const,
  jobs: (params: JobListParams) => ['events-admin', 'jobs', params] as const,
  job: (id: string) => ['events-admin', 'job', id] as const,
  events: ['events-admin', 'events'] as const,
  schedules: ['events-admin', 'schedules'] as const,
  subscriptions: ['events-admin', 'subscriptions'] as const,
};

export const useQueueStats = () =>
  useQuery({ queryKey: eventsKeys.stats, queryFn: eventsApi.stats, refetchInterval: POLL_MS });
export const useJobs = (params: JobListParams) =>
  useQuery({ queryKey: eventsKeys.jobs(params), queryFn: () => eventsApi.jobs(params), refetchInterval: POLL_MS });
export const useJob = (id: string | null) =>
  useQuery({ queryKey: eventsKeys.job(id ?? ''), queryFn: () => eventsApi.job(id!), enabled: Boolean(id) });

const TERMINAL = new Set(['succeeded', 'failed', 'dead', 'cancelled']);
export const useJobProgress = (id: string | null) =>
  useQuery({
    queryKey: eventsKeys.job(id ?? ''),
    queryFn: () => eventsApi.job(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && !TERMINAL.has(query.state.data.status) ? 2_000 : false),
  });
export const useRecentEvents = () =>
  useQuery({ queryKey: eventsKeys.events, queryFn: () => eventsApi.events({ limit: 50 }), refetchInterval: POLL_MS });
export const useSchedules = () =>
  useQuery({ queryKey: eventsKeys.schedules, queryFn: eventsApi.schedules, refetchInterval: POLL_MS });
export const useSubscriptions = () =>
  useQuery({ queryKey: eventsKeys.subscriptions, queryFn: eventsApi.subscriptions, refetchInterval: POLL_MS });

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: eventsKeys.all });
}

export function useRetryJob() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => eventsApi.retryJob(id), onSuccess: invalidate });
}

export function useCancelJob() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => eventsApi.cancelJob(id), onSuccess: invalidate });
}

export function useRunSchedule() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => eventsApi.runSchedule(id), onSuccess: invalidate });
}

export function useToggleSchedule() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => eventsApi.updateSchedule(id, { enabled }),
    onSuccess: invalidate,
  });
}

export function useToggleSubscription() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      eventsApi.updateSubscription(id, { status }),
    onSuccess: invalidate,
  });
}
