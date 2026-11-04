import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/problem';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/access/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/access/api')>()),
  accessApi: { roles: vi.fn() },
}));

const { accessApi } = await import('@/lib/access/api');
const { InviteUserForm } = await import('./invite-user-form');

beforeEach(() => {
  vi.mocked(accessApi.roles).mockResolvedValue([
    { name: 'admin', description: 'Full administrative access', permissions: ['users:read', 'users:write'] },
    { name: 'user', description: 'Standard user', permissions: [] },
  ]);
});

describe('InviteUserForm', () => {
  it('keeps the base role implicit and sends only the extra roles', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<InviteUserForm pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    const base = await screen.findByRole('checkbox', { name: 'user' });
    expect(base).toBeChecked();
    expect(base).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/email/i), 'New.Person@Example.com');
    await userEvent.type(screen.getByLabelText(/name/i), 'New Person');
    await userEvent.click(screen.getByRole('checkbox', { name: 'admin' }));
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: 'new.person@example.com', name: 'New Person', roles: ['admin'] }),
    );
  });

  it('validates the email first and maps a duplicate onto the field', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ type: 'x', title: 'c', status: 409, code: 'ALREADY_EXISTS', detail: 'exists' }),
      );
    renderWithProviders(<InviteUserForm pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await screen.findByRole('checkbox', { name: 'user' });

    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send invitation/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });
});
