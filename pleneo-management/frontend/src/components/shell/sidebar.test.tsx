import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users/abc' }));

const { Sidebar } = await import('./sidebar');
const { pageTitle } = await import('./nav');

const session = (permissions: string[]): Session => ({
  id: 'u1',
  email: 'ops@example.com',
  email_verified: true,
  name: 'Ops',
  mfa_enabled: false,
  roles: ['user'],
  permissions,
});

const links = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((l) => l.textContent);

describe('Sidebar', () => {
  it('shows only the areas the session is permitted to use', () => {
    const { rerender } = render(<Sidebar session={session([])} open={false} collapsed={false} onClose={vi.fn()} />);
    expect(links()).toEqual(['Dashboard', 'Projects', 'Devices']);
    expect(screen.queryByText('Access')).not.toBeInTheDocument();

    rerender(
      <Sidebar session={session(['users:read', 'audit:read'])} open={false} collapsed={false} onClose={vi.fn()} />,
    );
    expect(links()).toEqual(['Dashboard', 'Projects', 'Devices', 'Users', 'Roles', 'Audit log']);

    rerender(
      <Sidebar
        session={session(['platform:manage', 'clients:manage'])}
        open={false}
        collapsed={false}
        onClose={vi.fn()}
      />,
    );
    expect(links()).toEqual(['Dashboard', 'Projects', 'Devices', 'API clients', 'Queues']);
  });

  it('marks the current section, including nested routes', () => {
    render(<Sidebar session={session(['users:read'])} open={false} collapsed onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Roles' })).not.toHaveAttribute('aria-current');
    expect(pageTitle('/admin/users/abc')).toBe('Users');
    expect(pageTitle('/settings/security')).toBe('Security');
  });
});
