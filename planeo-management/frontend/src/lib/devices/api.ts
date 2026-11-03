import { bffHttp } from '@/lib/api/http';

export const DEVICE_STATUSES = ['provisioning', 'active', 'disabled'] as const;
export const CONNECTION_STATUSES = ['online', 'offline', 'unknown'] as const;
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type MetricDefinition = { key: string; unit: string; min?: number; max?: number };

export type Device = {
  id: string;
  external_id: string;
  name: string;
  device_type_id: string;
  device_type_key: string;
  device_type_name: string;
  device_type_metrics: MetricDefinition[];
  owner_id: string;
  status: DeviceStatus;
  connection_status: ConnectionStatus;
  site: string | null;
  firmware: string | null;
  metadata: Record<string, unknown>;
  last_seen_at: string | null;
  created_at: string;
};

export type DeviceCredential = {
  id: string;
  label: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type DeviceState = {
  desired: Record<string, unknown>;
  reported: Record<string, unknown>;
  desired_version: number;
  reported_version: number;
} | null;
export type DeviceDetail = Device & { state: DeviceState; credentials: DeviceCredential[] };
export type RegisteredDevice = Device & { claimCode: string };

export type DeviceType = { id: string; key: string; name: string; description: string; metrics: MetricDefinition[] };
export type DeviceStats = { total: number; online: number; offline: number; provisioning: number; disabled: number };

export type Reading = { metric: string; value: number; ts: string };
export type Command = {
  id: string;
  device_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'dispatched' | 'acknowledged' | 'failed' | 'expired' | 'cancelled';
  result: Record<string, unknown> | null;
  error: string | null;
  expires_at: string;
  created_at: string;
};

export type Alert = {
  id: string;
  device_id: string;
  device_name: string;
  device_external_id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: AlertSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
  message: string;
  raised_at: string;
};

export type Rule = {
  id: string;
  name: string;
  device_type_id: string | null;
  device_id: string | null;
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
};

export type DeviceListParams = {
  limit?: number;
  cursor?: string;
  status?: DeviceStatus;
  connectionStatus?: ConnectionStatus;
  search?: string;
};

export type RegisterDeviceInput = { externalId: string; name: string; deviceTypeId: string; site?: string };

export const devicesApi = {
  list: (params: DeviceListParams = {}) =>
    bffHttp.get<{ devices: Device[]; nextCursor: string | null }>('/iot/devices', { params }).then((r) => r.data),
  stats: () => bffHttp.get<DeviceStats>('/iot/devices/stats').then((r) => r.data),
  get: (id: string) => bffHttp.get<DeviceDetail>(`/iot/devices/${id}`).then((r) => r.data),
  register: (input: RegisterDeviceInput) => bffHttp.post<RegisteredDevice>('/iot/devices', input).then((r) => r.data),
  update: (id: string, input: Partial<Pick<Device, 'name' | 'site' | 'status'>>) =>
    bffHttp.patch<Device>(`/iot/devices/${id}`, input).then((r) => r.data),
  remove: (id: string) => bffHttp.delete(`/iot/devices/${id}`).then(() => undefined),
  rotateCredential: (id: string) =>
    bffHttp.post<{ id: string; token: string }>(`/iot/devices/${id}/credentials`, {}).then((r) => r.data),
  setDesiredState: (id: string, desired: Record<string, unknown>) =>
    bffHttp.put<DeviceState>(`/iot/devices/${id}/state/desired`, desired).then((r) => r.data),

  types: () => bffHttp.get<{ deviceTypes: DeviceType[] }>('/iot/devices/types').then((r) => r.data.deviceTypes),
  latest: (id: string) => bffHttp.get<{ latest: Reading[] }>(`/iot/devices/${id}/latest`).then((r) => r.data.latest),
  series: (id: string, metric: string, limit = 200) =>
    bffHttp
      .get<{ metric: string; points: Reading[] }>(`/iot/devices/${id}/series`, { params: { metric, limit } })
      .then((r) => r.data),

  commands: (id: string) =>
    bffHttp.get<{ commands: Command[] }>(`/iot/devices/${id}/commands`).then((r) => r.data.commands),
  issueCommand: (id: string, input: { type: string; payload?: Record<string, unknown> }) =>
    bffHttp.post<Command>(`/iot/devices/${id}/commands`, input).then((r) => r.data),
  cancelCommand: (commandId: string) => bffHttp.post<Command>(`/iot/commands/${commandId}/cancel`).then((r) => r.data),

  alerts: (params: { deviceId?: string; status?: string; limit?: number } = {}) =>
    bffHttp.get<{ alerts: Alert[]; nextBefore: string | null }>('/iot/alerts', { params }).then((r) => r.data),
  alertStats: () => bffHttp.get<{ open: number; critical: number }>('/iot/alerts/stats').then((r) => r.data),
  acknowledgeAlert: (id: string) => bffHttp.post<Alert>(`/iot/alerts/${id}/acknowledge`).then((r) => r.data),
  resolveAlert: (id: string) => bffHttp.post<Alert>(`/iot/alerts/${id}/resolve`).then((r) => r.data),

  rules: (params: { deviceId?: string } = {}) =>
    bffHttp.get<{ rules: Rule[] }>('/iot/rules', { params }).then((r) => r.data.rules),
};
