import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRow } from '@/lib/access/api';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/access/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/access/api')>()),
  accessApi: { users: vi.fn() },
}));

const { accessApi } = await import('@/lib/access/api');
const { UsersTable } = await import('./users-table');

const user = (overrides: Partial<UserRow>): UserRow => ({
  id: 'u-1',
  email: 'dana@example.com',
  email_verified: true,
  name: 'Dana Cruz',
  status: 'active',
  mfa_enabled: true,
  last_login_at: new Date().toISOString(),
  created_at: '2026-01-10T00:00:00.000Z',
  updated_at: '2026-01-10T00:00:00.000Z',
  failed_login_attempts: 0,
  locked_until: null,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(accessApi.users).mockResolvedValue({
    users: [
      user({}),
      user({
        id: 'u-2',
        email: 'new@example.com',
        name: null,
        status: 'invited',
        mfa_enabled: false,
        last_login_at: null,
      }),
      user({
        id: 'u-3',
        email: 'locked@example.com',
        name: 'Lee',
        locked_until: new Date(Date.now() + 600_000).toISOString(),
      }),
    ],
    nextCursor: 'u-3',
  });
});

describe('UsersTable', () => {
  it('lists accounts with their state and links to the detail page', async () => {
    renderWithProviders(<UsersTable />);
    const dana = (await screen.findByRole('link', { name: 'Dana Cruz' })).closest('tr')!;
    expect(within(dana).getByText('Active')).toBeInTheDocument();
    expect(within(dana).getByText('MFA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dana Cruz' })).toHaveAttribute('href', '/admin/users/u-1');

    const invited = screen.getByRole('link', { name: 'new@example.com' }).closest('tr')!;
    expect(within(invited).getByText('Invited')).toBeInTheDocument();
    expect(within(invited).getByText('never')).toBeInTheDocument();

    expect(within(screen.getByRole('link', { name: 'Lee' }).closest('tr')!).getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /invite user/i })).toHaveAttribute('href', '/admin/users/new');
  });

  it('pages with the cursor the API hands back and searches server-side', async () => {
    renderWithProviders(<UsersTable />);
    await screen.findByRole('link', { name: 'Dana Cruz' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(accessApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'u-3' }));

    await userEvent.type(screen.getByLabelText(/search users/i), 'lee');
    expect(accessApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'lee', cursor: undefined }));
  });
});
