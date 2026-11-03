import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/problem';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/email/api', () => ({ emailApi: { sendTest: vi.fn() } }));

const job = { current: null as unknown };
const stats = { current: { email: { provider: 'mailtrap-sandbox' } } as unknown };
vi.mock('@/lib/events/hooks', () => ({
  useQueueStats: () => ({ data: stats.current }),
  useJobProgress: () => ({ data: job.current }),
}));

const { emailApi } = await import('@/lib/email/api');
const { TestEmailCard } = await import('./test-email-card');

const queued = { jobId: 'job-abcdef12', status: 'pending', to: 'ops@example.com', queuedAt: '2026-11-02T00:00:00Z' };

const submit = async (to = 'ops@example.com') => {
  await userEvent.type(screen.getByLabelText(/recipient/i), to);
  await userEvent.click(screen.getByRole('button', { name: /send test email/i }));
};

beforeEach(() => {
  job.current = null;
  stats.current = { email: { provider: 'mailtrap-sandbox' } };
  vi.mocked(emailApi.sendTest).mockResolvedValue(queued);
});

describe('TestEmailCard', () => {
  it('names the provider the message will go through', () => {
    renderWithProviders(<TestEmailCard />);
    expect(screen.getByText('mailtrap-sandbox')).toBeInTheDocument();
  });

  it('validates the recipient before calling the API', async () => {
    renderWithProviders(<TestEmailCard />);
    await submit('not-an-email');
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(emailApi.sendTest).not.toHaveBeenCalled();
  });

  it('sends the note and reports the job while it is in flight', async () => {
    renderWithProviders(<TestEmailCard />);
    await userEvent.type(screen.getByLabelText(/note/i), 'mailtrap check');
    await submit();

    await waitFor(() =>
      expect(emailApi.sendTest).toHaveBeenCalledWith({ to: 'ops@example.com', note: 'mailtrap check' }),
    );
    expect(await screen.findByText(/waiting for the worker/i)).toBeInTheDocument();
  });

  it('omits an empty note rather than sending a blank string', async () => {
    renderWithProviders(<TestEmailCard />);
    await submit();
    await waitFor(() => expect(emailApi.sendTest).toHaveBeenCalledWith({ to: 'ops@example.com', note: undefined }));
  });

  it('confirms delivery once the job succeeds', async () => {
    job.current = { status: 'succeeded', attempts: 1, attempts_log: [], last_error: null };
    renderWithProviders(<TestEmailCard />);
    await submit();
    expect(await screen.findByText(/delivered to the provider after 1 attempt/i)).toBeInTheDocument();
  });

  it('surfaces why a delivery failed', async () => {
    job.current = {
      status: 'dead',
      attempts: 3,
      attempts_log: [{ error: 'mailtrap rejected the message' }],
      last_error: 'mailtrap rejected the message',
    };
    renderWithProviders(<TestEmailCard />);
    await submit();
    expect(await screen.findByText(/mailtrap rejected the message/i)).toBeInTheDocument();
  });

  it('shows a server refusal inline', async () => {
    vi.mocked(emailApi.sendTest).mockRejectedValue(
      new ApiError({
        type: 'x',
        title: 'Service Unavailable',
        status: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        detail: 'planeo-events is unavailable',
      }),
    );
    renderWithProviders(<TestEmailCard />);
    await submit();
    expect(await screen.findByText(/planeo-events is unavailable/i)).toBeInTheDocument();
  });
});
