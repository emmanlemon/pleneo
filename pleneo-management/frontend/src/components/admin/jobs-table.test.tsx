import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/lib/events/api';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/events/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/events/api')>()),
  eventsApi: { jobs: vi.fn(), job: vi.fn(), retryJob: vi.fn(), cancelJob: vi.fn(), stats: vi.fn() },
}));

const { eventsApi } = await import('@/lib/events/api');
const { JobsTable } = await import('./jobs-table');

const job = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-1',
  queue: 'email',
  type: 'email.send',
  payload: { to: 'a@b.co' },
  status: 'dead',
  priority: 0,
  attempts: 8,
  max_attempts: 8,
  run_at: new Date().toISOString(),
  last_error: 'smtp timeout',
  event_id: null,
  subscription_id: null,
  schedule_id: null,
  created_by: 'internal',
  started_at: null,
  finished_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(eventsApi.jobs).mockResolvedValue({
    jobs: [job(), job({ id: 'job-2', status: 'pending', attempts: 0, last_error: null })],
    nextBefore: null,
  });
  vi.mocked(eventsApi.job).mockResolvedValue({
    ...job(),
    attempts_log: [
      {
        attempt: 1,
        status: 'failed',
        error: 'smtp timeout',
        duration_ms: 1200,
        worker_id: 'w',
        created_at: new Date().toISOString(),
      },
    ],
  });
  vi.mocked(eventsApi.retryJob).mockResolvedValue(job({ status: 'pending' }));
  vi.mocked(eventsApi.cancelJob).mockResolvedValue(job({ id: 'job-2', status: 'cancelled' }));
});

describe('JobsTable', () => {
  it('renders jobs with status badges and the right actions per status', async () => {
    renderWithProviders(<JobsTable queues={['email', 'webhooks']} />);
    expect(await screen.findAllByText('email.send')).toHaveLength(2);
    expect(screen.getByText('dead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry job job-1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel job job-2/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry job job-2/i })).not.toBeInTheDocument();
  });

  it('retries a dead job and refreshes', async () => {
    renderWithProviders(<JobsTable fixedStatus="dead" />);
    await userEvent.click(await screen.findByRole('button', { name: /retry job job-1/i }));
    await waitFor(() => expect(eventsApi.retryJob).toHaveBeenCalledWith('job-1'));
    await waitFor(() => expect(eventsApi.jobs).toHaveBeenCalledTimes(2));
    expect(eventsApi.jobs).toHaveBeenCalledWith(expect.objectContaining({ status: 'dead' }));
  });

  it('expands a row to show payload and attempt history', async () => {
    renderWithProviders(<JobsTable />);
    await userEvent.click((await screen.findAllByText('email.send'))[0]);
    expect(await screen.findByText(/"to": "a@b.co"/)).toBeInTheDocument();
    await waitFor(() => expect(eventsApi.job).toHaveBeenCalledWith('job-1'));
    expect(await screen.findByText('1200 ms')).toBeInTheDocument();
  });
});
