import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/problem';
import { sessionKey } from '@/lib/auth/hooks';

const replace = vi.fn();
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/login',
}));
vi.mock('@/lib/auth/api', () => ({
  authApi: { login: vi.fn(), loginMfa: vi.fn(), session: vi.fn() },
}));

const { authApi } = await import('@/lib/auth/api');
const { LoginForm } = await import('./login-form');

const user = {
  id: 'u1',
  email: 'user@example.com',
  email_verified: true,
  name: 'User',
  mfa_enabled: false,
  roles: ['user'],
  permissions: [],
};
const opened = { mfaRequired: false as const, user, csrfToken: 'csrf-value' };
const problem = (status: number, code: string, detail: string, errors?: ApiError['errors']) =>
  new ApiError({ type: 'x', title: code, status, code, detail, errors });

let queryClient: QueryClient;

function renderForm() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<LoginForm />, { wrapper });
}

beforeEach(() => {
  replace.mockClear();
  searchParams.delete('next');
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe('LoginForm', () => {
  it('validates before calling the API', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('opens a cookie session and redirects to the safe next path', async () => {
    searchParams.set('next', '/projects/new');
    vi.mocked(authApi.login).mockResolvedValue(opened);
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), ' User@Example.com ');
    await userEvent.type(screen.getByLabelText(/password/i), 'Correct-Horse-9');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects/new'));
    expect(authApi.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'Correct-Horse-9' });
    expect(queryClient.getQueryData(sessionKey)).toEqual(user);
  });

  it('never receives a token the browser could store', async () => {
    vi.mocked(authApi.login).mockResolvedValue(opened);
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'u@x.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(Object.keys(opened)).not.toContain('accessToken');
    expect(Object.keys(opened)).not.toContain('refreshToken');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignores open-redirect next values', async () => {
    searchParams.set('next', 'https://evil.example');
    vi.mocked(authApi.login).mockResolvedValue(opened);
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'u@x.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows server errors inline and offers verification resend', async () => {
    vi.mocked(authApi.login).mockRejectedValue(problem(403, 'EMAIL_UNVERIFIED', 'Email address not verified'));
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'u@x.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not verified/i);
    expect(screen.getByRole('link', { name: /resend verification/i })).toHaveAttribute('href', '/verify-email');
    expect(queryClient.getQueryData(sessionKey)).toBeUndefined();
  });

  it('maps field-level problems onto inputs', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      problem(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'email', source: 'body', code: 'INVALID_FORMAT', message: 'Server says no' },
      ]),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'u@x.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });

  it('steps into MFA and only then opens the session', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ mfaRequired: true, mfaToken: 'm'.repeat(30), expiresIn: 300 });
    vi.mocked(authApi.loginMfa).mockResolvedValue(opened);
    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'u@x.io');
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const code = await screen.findByLabelText(/verification code/i);
    expect(queryClient.getQueryData(sessionKey)).toBeUndefined();
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(authApi.loginMfa).toHaveBeenCalledWith({ mfaToken: 'm'.repeat(30), code: '123456' });
    expect(queryClient.getQueryData(sessionKey)).toEqual(user);
  });
});
