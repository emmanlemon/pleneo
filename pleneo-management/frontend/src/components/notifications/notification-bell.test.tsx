import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/notifications/api', () => ({
  notificationsApi: { list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), remove: vi.fn() },
}));

const { notificationsApi } = await import('@/lib/notifications/api');
const { NotificationBell, relativeTime } = await import('./notification-bell');

const notification = (overrides = {}) => ({
  id: 'n1',
  user_id: 'u1',
  type: 'project.created',
  title: 'Project "Launch" created',
  body: 'Your project is ready.',
  data: { href: '/projects/p1' },
  read_at: null,
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(notificationsApi.unreadCount).mockResolvedValue(2);
  vi.mocked(notificationsApi.list).mockResolvedValue({
    notifications: [notification(), notification({ id: 'n2', read_at: '2026-01-01T00:00:00Z', title: 'Old one' })],
    nextBefore: null,
  });
  vi.mocked(notificationsApi.markRead).mockResolvedValue(notification({ read_at: 'now' }));
  vi.mocked(notificationsApi.markAllRead).mockResolvedValue(2);
});

describe('NotificationBell', () => {
  it('shows the unread badge and lists recent notifications on open', async () => {
    renderWithProviders(<NotificationBell />);
    const trigger = await screen.findByRole('button', { name: /2 unread notifications/i });
    await userEvent.click(trigger);
    expect(await screen.findByText('Project "Launch" created')).toBeInTheDocument();
    expect(screen.getByText('Old one')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Project "Launch" created' })).toHaveAttribute('href', '/projects/p1');
    expect(screen.getAllByRole('button', { name: /mark .* as read/i })).toHaveLength(1);
  });

  it('marks a single notification and all notifications as read', async () => {
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole('button', { name: /unread notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark "project "launch" created" as read/i }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith('n1'));
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(notificationsApi.markAllRead).toHaveBeenCalled());
  });

  it('formats relative time', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 10_000).toISOString(), now)).toBe('just now');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
    expect(relativeTime(new Date(now - 49 * 3_600_000).toISOString(), now)).toBe('2d ago');
  });
});
