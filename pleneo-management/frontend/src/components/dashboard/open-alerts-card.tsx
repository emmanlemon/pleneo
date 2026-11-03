'use client';

import { Info, Loader2, OctagonAlert, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { errorMessage } from '@/lib/api/problem';
import type { AlertSeverity } from '@/lib/devices/api';
import { useAcknowledgeAlert, useAlerts, useAlertStats } from '@/lib/devices/hooks';
import { cn } from '@/lib/utils';
import { relativeTime } from '../notifications/notification-bell';
import { Button } from '../ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

const SEVERITY: Record<AlertSeverity, { icon: typeof Info; label: string; className: string }> = {
  critical: { icon: OctagonAlert, label: 'Critical', className: 'text-status-critical' },
  warning: { icon: TriangleAlert, label: 'Warning', className: 'text-status-warning' },
  info: { icon: Info, label: 'Info', className: 'text-series-1' },
};

const PARAMS = { status: 'open', limit: 6 };

export function OpenAlertsCard() {
  const alerts = useAlerts(PARAMS);
  const stats = useAlertStats();
  const acknowledge = useAcknowledgeAlert();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Open alerts</CardTitle>
        <CardDescription>
          {stats.data ? `${stats.data.open} open, ${stats.data.critical} critical` : 'Raised by telemetry rules'}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/devices">Fleet</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {alerts.isPending ? (
          <div className="space-y-2" role="status" aria-label="Loading alerts">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : alerts.isError ? (
          <p className="text-destructive text-sm">{errorMessage(alerts.error)}</p>
        ) : alerts.data.alerts.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
            No open alerts. Every device is within its rule thresholds.
          </p>
        ) : (
          <ul className="divide-y">
            {alerts.data.alerts.map((alert) => {
              const severity = SEVERITY[alert.severity];
              const pending = acknowledge.isPending && acknowledge.variables === alert.id;
              return (
                <li key={alert.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <severity.icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', severity.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alert.message}</p>
                    <p className="text-muted-foreground text-xs">
                      <span className="text-foreground">{severity.label}</span>
                      {' · '}
                      <Link href={`/devices/${alert.device_id}`} className="hover:underline">
                        {alert.device_name}
                      </Link>
                      {' · '}
                      {alert.metric} {alert.value} vs {alert.threshold}
                      {' · '}
                      <span title={new Date(alert.raised_at).toLocaleString()}>{relativeTime(alert.raised_at)}</span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    aria-label={`Acknowledge alert on ${alert.device_name}`}
                    onClick={() => acknowledge.mutate(alert.id)}
                  >
                    {pending && <Loader2 className="animate-spin" />}
                    Acknowledge
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
