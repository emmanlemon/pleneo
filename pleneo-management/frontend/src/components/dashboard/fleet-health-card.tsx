'use client';

import Link from 'next/link';
import { useDeviceStats } from '@/lib/devices/hooks';
import { Button } from '../ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { SegmentedBar } from './segmented-bar';

export function FleetHealthCard() {
  const { data: stats, isPending } = useDeviceStats();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Fleet connectivity</CardTitle>
        <CardDescription>{stats ? `${stats.total} registered devices` : 'Registered devices'}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/devices">Registry</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending || !stats ? (
          <Skeleton className="h-16 w-full" role="status" aria-label="Loading fleet" />
        ) : (
          <>
            <SegmentedBar
              label="Device connectivity"
              segments={[
                { key: 'online', label: 'Online', value: stats.online, color: 'var(--status-good)' },
                { key: 'offline', label: 'Offline', value: stats.offline, color: 'var(--status-critical)' },
                {
                  key: 'unknown',
                  label: 'No contact yet',
                  value: Math.max(0, stats.total - stats.online - stats.offline),
                  color: 'var(--viz-neutral)',
                },
              ]}
            />
            <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Provisioning</dt>
                <dd className="font-medium">{stats.provisioning} awaiting activation</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Disabled</dt>
                <dd className="font-medium">{stats.disabled} taken out of service</dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
