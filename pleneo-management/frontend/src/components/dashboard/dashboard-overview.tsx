'use client';

import { useSession } from '@/lib/auth/hooks';
import { useAlertStats, useDeviceStats } from '@/lib/devices/hooks';
import { useQueueStats } from '@/lib/events/hooks';
import { useUnreadCount } from '@/lib/notifications/hooks';
import { useProjectSummary } from '@/lib/projects/hooks';
import { isAdmin } from '../admin/admin-guard';
import { ActivityCard } from './activity-card';
import { FleetHealthCard } from './fleet-health-card';
import { OpenAlertsCard } from './open-alerts-card';
import { PortfolioCard } from './portfolio-card';
import { QueueHealthCard } from './queue-health-card';
import { StatTile } from './stat-tile';

const greeting = (hour = new Date().getHours()) =>
  hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

function FleetTile() {
  const { data, isPending } = useDeviceStats();
  const pct = data?.total ? Math.round((data.online / data.total) * 100) : 0;
  return (
    <StatTile
      label="Fleet online"
      href="/devices"
      loading={isPending}
      value={data?.total ? `${pct}%` : '—'}
      detail={data ? `${data.online} of ${data.total} devices reporting` : ''}
      tone={data?.offline ? 'warning' : data?.total ? 'good' : 'neutral'}
    />
  );
}

function AlertsTile() {
  const { data, isPending } = useAlertStats();
  return (
    <StatTile
      label="Open alerts"
      loading={isPending}
      value={data?.open ?? '—'}
      detail={data?.critical ? `${data.critical} critical` : 'None critical'}
      tone={data?.critical ? 'critical' : data?.open ? 'warning' : 'good'}
    />
  );
}

function ProjectsTile() {
  const { data, isPending } = useProjectSummary();
  const open = data ? data.byStatus.planning + data.byStatus.active + data.byStatus.on_hold : 0;
  return (
    <StatTile
      label="Open projects"
      href="/projects"
      loading={isPending}
      value={data ? open : '—'}
      detail={data?.overdue ? `${data.overdue} past end date` : `${data?.byStatus.active ?? 0} in progress`}
      tone={data?.overdue ? 'critical' : 'neutral'}
    />
  );
}

function BacklogTile() {
  const { data, isPending } = useQueueStats();
  const queues = Object.values(data?.queues ?? {});
  const pending = queues.reduce((sum, q) => sum + q.pending, 0);
  const dead = queues.reduce((sum, q) => sum + q.dead, 0);
  return (
    <StatTile
      label="Job backlog"
      href="/admin/queues"
      loading={isPending}
      value={data ? pending : '—'}
      detail={dead ? `${dead} in dead letter` : 'Dead letter is empty'}
      tone={dead ? 'critical' : 'good'}
    />
  );
}

function InboxTile() {
  const { data, isPending } = useUnreadCount();
  return (
    <StatTile
      label="Unread notifications"
      href="/notifications"
      loading={isPending}
      value={data ?? '—'}
      detail={data ? 'Waiting in your inbox' : 'Inbox is clear'}
    />
  );
}

export function DashboardOverview() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.roles);
  const name = session?.name?.split(' ')[0] ?? session?.email;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}
          {name && `, ${name}`}
        </h1>
        <p className="text-muted-foreground text-sm">
          Fleet health, open work and {admin ? 'platform processing' : 'recent activity'}, updated as events arrive.
        </p>
      </div>

      <section aria-label="Key indicators" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FleetTile />
        <AlertsTile />
        <ProjectsTile />
        {admin ? <BacklogTile /> : <InboxTile />}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OpenAlertsCard />
        </div>
        <FleetHealthCard />
        <div className="lg:col-span-2">
          <PortfolioCard />
        </div>
        <ActivityCard />
      </div>

      {admin && <QueueHealthCard />}
    </div>
  );
}
