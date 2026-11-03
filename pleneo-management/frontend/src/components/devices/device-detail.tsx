'use client';

import { Loader2, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/lib/api/problem';
import type { Alert as DeviceAlert, Reading } from '@/lib/devices/api';
import {
  useAcknowledgeAlert,
  useAlerts,
  useCancelCommand,
  useCommands,
  useDevice,
  useIssueCommand,
  useLatestReadings,
  useResolveAlert,
  useRotateCredential,
  useSeries,
} from '@/lib/devices/hooks';
import { relativeTime } from '../notifications/notification-bell';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { connectionVariant } from './device-list';
import { SimulationControl } from './simulation-control';
import { TelemetryChart } from './telemetry-chart';

const severityVariant = (severity: string) =>
  severity === 'critical' ? ('destructive' as const) : ('secondary' as const);

export function DeviceDetail({ id }: { id: string }) {
  const device = useDevice(id);
  const [metric, setMetric] = useState<string>('');
  const metrics = device.data?.device_type_metrics ?? [];
  const activeMetric = metric || metrics[0]?.key || '';
  const series = useSeries(id, activeMetric);
  const latest = useLatestReadings(id);

  if (device.isPending) return <Skeleton className="h-64 w-full" role="status" aria-label="Loading device" />;
  if (device.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(device.error)}</AlertDescription>
      </Alert>
    );
  }

  const unit = metrics.find((m) => m.key === activeMetric)?.unit ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{device.data.name}</h1>
          <p className="text-muted-foreground text-sm">
            {device.data.external_id} · {device.data.device_type_name}
            {device.data.site ? ` · ${device.data.site}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connectionVariant(device.data.connection_status)}>{device.data.connection_status}</Badge>
          <Badge variant={device.data.status === 'active' ? 'secondary' : 'outline'}>{device.data.status}</Badge>
          <span className="text-muted-foreground text-xs">
            {device.data.last_seen_at ? `seen ${relativeTime(device.data.last_seen_at)}` : 'never seen'}
          </span>
        </div>
      </div>

      <SimulationControl deviceId={id} active={device.data.status === 'active'} />

      <LatestReadings readings={latest.data ?? []} loading={latest.isPending} />

      <Tabs defaultValue="telemetry">
        <TabsList>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry" className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Select value={activeMetric} onValueChange={setMetric}>
              <SelectTrigger className="w-56" aria-label="Metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metrics.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.key}
                    {m.unit ? ` (${m.unit})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">{series.data?.points.length ?? 0} readings</span>
          </div>
          {series.isPending ? (
            <Skeleton className="h-56 w-full" role="status" aria-label="Loading telemetry" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {activeMetric}
                  {unit ? ` (${unit})` : ''}
                </CardTitle>
                <CardDescription>Most recent readings reported by this device</CardDescription>
              </CardHeader>
              <CardContent>
                <TelemetryChart points={series.data?.points ?? []} unit={unit} label={activeMetric} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="commands" className="pt-2">
          <CommandPanel id={id} />
        </TabsContent>

        <TabsContent value="alerts" className="pt-2">
          <AlertPanel deviceId={id} />
        </TabsContent>

        <TabsContent value="credentials" className="pt-2">
          <CredentialPanel id={id} credentials={device.data.credentials} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LatestReadings({ readings, loading }: { readings: Reading[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-20 w-full" role="status" aria-label="Loading latest readings" />;
  if (readings.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {readings.map((reading) => (
        <Card key={reading.metric}>
          <CardHeader>
            <CardDescription>{reading.metric}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{reading.value.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{relativeTime(reading.ts)}</CardContent>
        </Card>
      ))}
    </div>
  );
}

function CommandPanel({ id }: { id: string }) {
  const [type, setType] = useState('');
  const commands = useCommands(id);
  const issue = useIssueCommand(id);
  const cancel = useCancelCommand();

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (type.trim()) issue.mutate({ type: type.trim() }, { onSuccess: () => setType('') });
        }}
      >
        <Input
          placeholder="Command type, e.g. reboot"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="max-w-xs"
          aria-label="Command type"
        />
        <Button type="submit" disabled={issue.isPending || !type.trim()}>
          {issue.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send
        </Button>
      </form>
      {issue.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(issue.error)}</AlertDescription>
        </Alert>
      )}
      <div className="bg-card rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commands.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                  No commands issued.
                </TableCell>
              </TableRow>
            )}
            {commands.data?.map((command) => (
              <TableRow key={command.id}>
                <TableCell className="font-medium">{command.type}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      command.status === 'acknowledged'
                        ? 'secondary'
                        : command.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {command.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{relativeTime(command.created_at)}</TableCell>
                <TableCell className="text-right">
                  {command.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancel.mutate(command.id)}
                      aria-label={`Cancel ${command.type}`}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AlertPanel({ deviceId }: { deviceId: string }) {
  const alerts = useAlerts({ deviceId, limit: 50 });
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();

  if (alerts.isPending) return <Skeleton className="h-32 w-full" role="status" aria-label="Loading alerts" />;

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alert</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Raised</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.data?.alerts.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                No alerts raised.
              </TableCell>
            </TableRow>
          )}
          {alerts.data?.alerts.map((alert: DeviceAlert) => (
            <TableRow key={alert.id}>
              <TableCell className="max-w-sm truncate" title={alert.message}>
                {alert.message}
              </TableCell>
              <TableCell>
                <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={alert.status === 'resolved' ? 'secondary' : 'outline'}>{alert.status}</Badge>
              </TableCell>
              <TableCell className="text-sm">{relativeTime(alert.raised_at)}</TableCell>
              <TableCell className="space-x-1 text-right">
                {alert.status === 'open' && (
                  <Button variant="ghost" size="sm" onClick={() => acknowledge.mutate(alert.id)}>
                    Acknowledge
                  </Button>
                )}
                {alert.status !== 'resolved' && (
                  <Button variant="outline" size="sm" onClick={() => resolve.mutate(alert.id)}>
                    Resolve
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CredentialPanel({
  id,
  credentials,
}: {
  id: string;
  credentials: {
    id: string;
    label: string;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
  }[];
}) {
  const rotate = useRotateCredential(id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Rotating issues a new token and revokes the previous one.</p>
        <Button variant="outline" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
          {rotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Rotate credential
        </Button>
      </div>
      {rotate.data && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Copy this token now, it is not shown again:</span>
            <code className="bg-muted mt-1 block overflow-x-auto rounded px-2 py-1 text-xs">{rotate.data.token}</code>
          </AlertDescription>
        </Alert>
      )}
      <div className="bg-card rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.map((credential) => (
              <TableRow key={credential.id}>
                <TableCell className="font-medium">{credential.label}</TableCell>
                <TableCell className="text-sm">{relativeTime(credential.created_at)}</TableCell>
                <TableCell className="text-sm">
                  {credential.last_used_at ? relativeTime(credential.last_used_at) : 'never'}
                </TableCell>
                <TableCell>
                  <Badge variant={credential.revoked_at ? 'secondary' : 'default'}>
                    {credential.revoked_at ? 'revoked' : 'active'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
