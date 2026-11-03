import { bffHttp } from '@/lib/api/http';

export const JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type Job = {
  id: string;
  queue: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  event_id: string | null;
  subscription_id: string | null;
  schedule_id: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type JobAttempt = {
  attempt: number;
  status: 'succeeded' | 'failed';
  error: string | null;
  duration_ms: number | null;
  worker_id: string | null;
  created_at: string;
};
export type JobDetail = Job & { attempts_log: JobAttempt[] };

export type QueueCounts = {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
  cancelled: number;
  oldestPending: string | null;
};
export type QueueStats = {
  queues: Record<string, QueueCounts>;
  throughput: { minute: string; succeeded: number; dead: number }[];
  types: { type: string; status: JobStatus; count: number }[];
  handlerTypes: string[];
  email?: { provider: string };
  generatedAt: string;
};

export type Schedule = {
  id: string;
  name: string;
  description: string;
  cron: string;
  timezone: string;
  queue: string;
  job_type: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_job_id: string | null;
};

export type Subscription = {
  id: string;
  name: string;
  description: string;
  url: string;
  event_types: string[];
  status: 'active' | 'paused';
  created_at: string;
  deliveries24h: Partial<Record<JobStatus, number>>;
};

export type EventRecord = {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type JobListParams = { status?: JobStatus; queue?: string; type?: string; limit?: number; before?: string };

export const eventsApi = {
  stats: () => bffHttp.get<QueueStats>('/events/admin/stats').then((r) => r.data),
  jobs: (params: JobListParams = {}) =>
    bffHttp.get<{ jobs: Job[]; nextBefore: string | null }>('/events/admin/jobs', { params }).then((r) => r.data),
  job: (id: string) => bffHttp.get<JobDetail>(`/events/admin/jobs/${id}`).then((r) => r.data),
  retryJob: (id: string) => bffHttp.post<Job>(`/events/admin/jobs/${id}/retry`).then((r) => r.data),
  cancelJob: (id: string) => bffHttp.post<Job>(`/events/admin/jobs/${id}/cancel`).then((r) => r.data),
  events: (params: { type?: string; limit?: number } = {}) =>
    bffHttp
      .get<{ events: EventRecord[]; nextBefore: string | null }>('/events/admin/events', { params })
      .then((r) => r.data),
  schedules: () => bffHttp.get<{ schedules: Schedule[] }>('/events/admin/schedules').then((r) => r.data.schedules),
  updateSchedule: (id: string, input: Partial<Pick<Schedule, 'enabled' | 'cron' | 'timezone' | 'description'>>) =>
    bffHttp.patch<Schedule>(`/events/admin/schedules/${id}`, input).then((r) => r.data),
  runSchedule: (id: string) => bffHttp.post<{ jobId: string }>(`/events/admin/schedules/${id}/run`).then((r) => r.data),
  subscriptions: () =>
    bffHttp.get<{ subscriptions: Subscription[] }>('/events/admin/subscriptions').then((r) => r.data.subscriptions),
  updateSubscription: (id: string, input: { status?: 'active' | 'paused' }) =>
    bffHttp.patch<Subscription>(`/events/admin/subscriptions/${id}`, input).then((r) => r.data),
};
