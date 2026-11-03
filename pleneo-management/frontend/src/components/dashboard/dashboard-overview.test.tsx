import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/api';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/auth/api', () => ({ authApi: { session: vi.fn() } }));
vi.mock('@/lib/devices/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/devices/api')>()),
  devicesApi: { stats: vi.fn(), alerts: vi.fn(), alertStats: vi.fn(), acknowledgeAlert: vi.fn() },
}));
vi.mock('@/lib/projects/api', () => ({ projectsApi: { summary: vi.fn() } }));
vi.mock('@/lib/notifications/api', () => ({ notificationsApi: { list: vi.fn(), unreadCount: vi.fn() } }));
vi.mock('@/lib/events/api', () => ({ eventsApi: { stats: vi.fn() } }));

const { authApi } = await import('@/lib/auth/api');
const { devicesApi } = await import('@/lib/devices/api');
const { projectsApi } = await import('@/lib/projects/api');
const { notificationsApi } = await import('@/lib/notifications/api');
const { eventsApi } = await import('@/lib/events/api');
const { DashboardOverview } = await import('./dashboard-overview');
const { daysUntil } = await import('./portfolio-card');
const { throughputBuckets } = await import('./queue-health-card');

const session = (roles: string[]): Session => ({
  id: 'u1',
  email: 'ops@example.com',
  email_verified: true,
  name: 'Dana Cruz',
  mfa_enabled: false,
  roles,
  permissions: [],
});

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.mocked(authApi.session).mockResolvedValue(session(['user']));
  vi.mocked(devicesApi.stats).mockResolvedValue({ total: 8, online: 6, offline: 1, provisioning: 1, disabled: 0 });
  vi.mocked(devicesApi.alertStats).mockResolvedValue({ open: 2, critical: 1 });
  vi.mocked(devicesApi.alerts).mockResolvedValue({
    alerts: [
      {
        id: 'a1',
        device_id: 'd1',
        device_name: 'Cold room sensor',
        device_external_id: 'sensor-001',
        metric: 'temperature',
        value: 9.4,
        threshold: 8,
        severity: 'critical',
        status: 'open',
        message: 'Temperature above 8',
        raised_at: new Date().toISOString(),
      },
    ],
    nextBefore: null,
  });
  vi.mocked(projectsApi.summary).mockResolvedValue({
    total: 5,
    byStatus: { planning: 1, active: 2, on_hold: 0, completed: 2, archived: 0 },
    overdue: 1,
    horizonDays: 14,
    dueSoon: [
      {
        id: 'p1',
        owner_id: 'u1',
        name: 'Warehouse retrofit',
        description: '',
        status: 'active',
        starts_on: null,
        ends_on: isoDay(-3),
        created_at: '',
        updated_at: '',
      },
    ],
  });
  vi.mocked(notificationsApi.list).mockResolvedValue({ notifications: [], nextBefore: null });
  vi.mocked(notificationsApi.unreadCount).mockResolvedValue(4);
});

describe('DashboardOverview', () => {
  it('leads with the indicators an operator acts on', async () => {
    renderWithProviders(<DashboardOverview />);

    const kpis = within(await screen.findByRole('region', { name: 'Key indicators' }));
    expect(await kpis.findByText('75%')).toBeInTheDocument();
    expect(kpis.getByText('6 of 8 devices reporting')).toBeInTheDocument();
    expect(await kpis.findByText('1 critical')).toBeInTheDocument();
    expect(await kpis.findByText('1 past end date')).toBeInTheDocument();
    expect(await kpis.findByText('Unread notifications')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /, Dana$/ })).toBeInTheDocument();
  });

  it('lists open alerts and work that is running late', async () => {
    renderWithProviders(<DashboardOverview />);

    expect(await screen.findByText('Temperature above 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acknowledge alert on Cold room sensor' })).toBeEnabled();
    expect(await screen.findByText('3d overdue')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Projects by status: Planning 1 \(20%\), Active 2 \(40%\)/ })).toBeInTheDocument();
  });

  it('shows platform processing to admins only', async () => {
    vi.mocked(authApi.session).mockResolvedValue(session(['admin', 'user']));
    vi.mocked(eventsApi.stats).mockResolvedValue({
      queues: {
        default: { pending: 3, running: 1, succeeded: 40, failed: 0, dead: 2, cancelled: 0, oldestPending: null },
      },
      throughput: [],
      types: [],
      handlerTypes: [],
      generatedAt: new Date().toISOString(),
    });
    renderWithProviders(<DashboardOverview />);

    expect(await screen.findByText('Job processing')).toBeInTheDocument();
    expect(screen.getByText('2 in dead letter')).toBeInTheDocument();
    expect(screen.queryByText('Unread notifications')).not.toBeInTheDocument();
  });
});

describe('dashboard helpers', () => {
  it('counts calendar days to an end date', () => {
    const now = new Date(2026, 10, 3, 23, 30);
    expect(daysUntil('2026-11-03', now)).toBe(0);
    expect(daysUntil('2026-11-10', now)).toBe(7);
    expect(daysUntil('2026-10-31T00:00:00.000Z', now)).toBe(-3);
  });

  it('folds sparse per-minute throughput into twelve five-minute buckets', () => {
    const buckets = throughputBuckets({
      queues: {},
      types: [],
      handlerTypes: [],
      generatedAt: '2026-11-03T12:00:00.000Z',
      throughput: [
        { minute: '2026-11-03T11:56:00.000Z', succeeded: 4, dead: 1 },
        { minute: '2026-11-03T11:58:00.000Z', succeeded: 6, dead: 0 },
        { minute: '2026-11-03T11:01:00.000Z', succeeded: 2, dead: 0 },
      ],
    });
    expect(buckets).toHaveLength(12);
    expect(buckets.at(-1)).toMatchObject({ succeeded: 10, dead: 1 });
    expect(buckets[0].succeeded).toBe(2);
  });
});
