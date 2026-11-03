'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { errorMessage } from '@/lib/api/problem';
import { CONNECTION_STATUSES, type ConnectionStatus } from '@/lib/devices/api';
import { useDeleteDevice, useDeviceStats, useDevices } from '@/lib/devices/hooks';
import { relativeTime } from '../notifications/notification-bell';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const ALL = 'all';

export const connectionVariant = (status: ConnectionStatus) =>
  status === 'online' ? ('default' as const) : status === 'offline' ? ('destructive' as const) : ('secondary' as const);

export function DeviceList() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const devices = useDevices({
    limit: 50,
    connectionStatus: connectionStatus === ALL ? undefined : connectionStatus,
    search: search || undefined,
  });
  const stats = useDeviceStats();
  const remove = useDeleteDevice();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Devices" value={stats.data?.total} description="registered" />
        <Stat label="Online" value={stats.data?.online} description="reporting now" />
        <Stat
          label="Offline"
          value={stats.data?.offline}
          description="stopped reporting"
          tone={stats.data?.offline ? 'destructive' : 'default'}
        />
        <Stat label="Provisioning" value={stats.data?.provisioning} description="awaiting activation" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Search devices"
        />
        <Select
          value={connectionStatus}
          onValueChange={(value) => setConnectionStatus(value as ConnectionStatus | typeof ALL)}
        >
          <SelectTrigger className="w-44" aria-label="Filter by connection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All connections</SelectItem>
            {CONNECTION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild className="ml-auto">
          <Link href="/devices/new">
            <Plus /> Register device
          </Link>
        </Button>
      </div>

      {devices.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(devices.error)}</AlertDescription>
        </Alert>
      )}

      {devices.isPending ? (
        <Skeleton className="h-40 w-full" role="status" aria-label="Loading devices" />
      ) : devices.data?.devices.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">No devices yet.</p>
      ) : (
        <div className="bg-card rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.data?.devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                      {device.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{device.external_id}</div>
                  </TableCell>
                  <TableCell className="text-sm">{device.device_type_name}</TableCell>
                  <TableCell>
                    <Badge variant={device.status === 'active' ? 'secondary' : 'outline'}>{device.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={connectionVariant(device.connection_status)}>{device.connection_status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm" title={device.last_seen_at ?? ''}>
                    {device.last_seen_at ? relativeTime(device.last_seen_at) : 'never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${device.name}`}
                      disabled={remove.isPending && remove.variables === device.id}
                      onClick={() => window.confirm(`Decommission "${device.name}"?`) && remove.mutate(device.id)}
                    >
                      {remove.isPending && remove.variables === device.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 className="text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  description,
  tone = 'default',
}: {
  label: string;
  value?: number;
  description: string;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={tone === 'destructive' && value ? 'text-destructive text-3xl' : 'text-3xl'}>
          {value ?? '—'}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{description}</CardContent>
    </Card>
  );
}
