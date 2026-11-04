'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import {
  devicesApi,
  type DeviceListParams,
  type DeviceStatsParams,
  type RegisterDeviceInput,
  type StartSimulationInput,
  type UpdateDeviceInput,
} from './api';

export const deviceKeys = {
  all: ['devices'] as const,
  list: (params: DeviceListParams) => ['devices', 'list', params] as const,
  stats: ['devices', 'stats'] as const,
  statsFor: (params: DeviceStatsParams) => ['devices', 'stats', params] as const,
  detail: (id: string) => ['devices', 'detail', id] as const,
  latest: (id: string) => ['devices', 'latest', id] as const,
  series: (id: string, metric: string) => ['devices', 'series', id, metric] as const,
  commands: (id: string) => ['devices', 'commands', id] as const,
  alerts: (params: Record<string, unknown>) => ['devices', 'alerts', params] as const,
  alertStats: ['devices', 'alerts', 'stats'] as const,
  types: ['devices', 'types'] as const,
  simulation: (id: string) => ['devices', 'simulation', id] as const,
};

export const useDevices = (params: DeviceListParams = {}) =>
  useQuery({ queryKey: deviceKeys.list(params), queryFn: () => devicesApi.list(params) });

export const useDeviceStats = (params: DeviceStatsParams = {}) =>
  useQuery({ queryKey: deviceKeys.statsFor(params), queryFn: () => devicesApi.stats(params) });

export const useDevice = (id: string) =>
  useQuery({ queryKey: deviceKeys.detail(id), queryFn: () => devicesApi.get(id), enabled: Boolean(id) });

export const useDeviceTypes = () =>
  useQuery({ queryKey: deviceKeys.types, queryFn: devicesApi.types, staleTime: 5 * 60_000 });

export const useLatestReadings = (id: string) =>
  useQuery({ queryKey: deviceKeys.latest(id), queryFn: () => devicesApi.latest(id), enabled: Boolean(id) });

export const useSeries = (id: string, metric: string) =>
  useQuery({
    queryKey: deviceKeys.series(id, metric),
    queryFn: () => devicesApi.series(id, metric),
    enabled: Boolean(id && metric),
  });

export const useCommands = (id: string) =>
  useQuery({ queryKey: deviceKeys.commands(id), queryFn: () => devicesApi.commands(id), enabled: Boolean(id) });

export const useAlerts = (params: { deviceId?: string; status?: string; limit?: number } = {}) =>
  useQuery({ queryKey: deviceKeys.alerts(params), queryFn: () => devicesApi.alerts(params) });

export const useAlertStats = () => useQuery({ queryKey: deviceKeys.alertStats, queryFn: devicesApi.alertStats });

export const useSimulation = (id: string) =>
  useQuery({ queryKey: deviceKeys.simulation(id), queryFn: () => devicesApi.simulation(id), enabled: Boolean(id) });

function useDeviceMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  message: string | ((result: TResult) => string),
  { quiet = false } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      notify.success(typeof message === 'function' ? message(result) : message);
      return queryClient.invalidateQueries({ queryKey: deviceKeys.all });
    },
    onError: (error) => {
      if (!quiet) notify.error(error);
    },
  });
}

export const useRegisterDevice = () =>
  useDeviceMutation(
    (input: RegisterDeviceInput) => devicesApi.register(input),
    (d) => `${d.name} registered`,
    {
      quiet: true,
    },
  );

export const useUpdateDevice = (id: string) =>
  useDeviceMutation((input: UpdateDeviceInput) => devicesApi.update(id, input), 'Device updated');

export const useDeleteDevice = () => useDeviceMutation((id: string) => devicesApi.remove(id), 'Device decommissioned');

export const useRotateCredential = (id: string) =>
  useDeviceMutation(() => devicesApi.rotateCredential(id), 'Credential rotated');

export const useIssueCommand = (id: string) =>
  useDeviceMutation(
    (input: { type: string; payload?: Record<string, unknown> }) => devicesApi.issueCommand(id, input),
    (c) => `Command "${c.type}" sent`,
  );

export const useCancelCommand = () =>
  useDeviceMutation((commandId: string) => devicesApi.cancelCommand(commandId), 'Command cancelled');

export const useAcknowledgeAlert = () =>
  useDeviceMutation((alertId: string) => devicesApi.acknowledgeAlert(alertId), 'Alert acknowledged');

export const useResolveAlert = () =>
  useDeviceMutation((alertId: string) => devicesApi.resolveAlert(alertId), 'Alert resolved');

export const useStartSimulation = (id: string) =>
  useDeviceMutation((input: StartSimulationInput) => devicesApi.startSimulation(id, input), 'Simulation started');

export const useStopSimulation = (id: string) =>
  useDeviceMutation(() => devicesApi.stopSimulation(id), 'Simulation stopped');
