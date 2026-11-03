'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi, type DeviceListParams, type RegisterDeviceInput, type StartSimulationInput } from './api';


export const deviceKeys = {
  all: ['devices'] as const,
  list: (params: DeviceListParams) => ['devices', 'list', params] as const,
  stats: ['devices', 'stats'] as const,
  detail: (id: string) => ['devices', 'detail', id] as const,
  latest: (id: string) => ['devices', 'latest', id] as const,
  series: (id: string, metric: string) => ['devices', 'series', id, metric] as const,
  commands: (id: string) => ['devices', 'commands', id] as const,
  alerts: (params: Record<string, unknown>) => ['devices', 'alerts', params] as const,
  types: ['devices', 'types'] as const,
  simulation: (id: string) => ['devices', 'simulation', id] as const,
};

export const useDevices = (params: DeviceListParams = {}) =>
  useQuery({ queryKey: deviceKeys.list(params), queryFn: () => devicesApi.list(params) });

export const useDeviceStats = () =>
  useQuery({ queryKey: deviceKeys.stats, queryFn: devicesApi.stats });

export const useDevice = (id: string) =>
  useQuery({
    queryKey: deviceKeys.detail(id),
    queryFn: () => devicesApi.get(id),
    enabled: Boolean(id)
  });

export const useDeviceTypes = () =>
  useQuery({ queryKey: deviceKeys.types, queryFn: devicesApi.types, staleTime: 5 * 60_000 });

export const useLatestReadings = (id: string) =>
  useQuery({
    queryKey: deviceKeys.latest(id),
    queryFn: () => devicesApi.latest(id),
    enabled: Boolean(id)
  });

export const useSeries = (id: string, metric: string) =>
  useQuery({
    queryKey: deviceKeys.series(id, metric),
    queryFn: () => devicesApi.series(id, metric),
    enabled: Boolean(id && metric)
  });

export const useCommands = (id: string) =>
  useQuery({
    queryKey: deviceKeys.commands(id),
    queryFn: () => devicesApi.commands(id),
    enabled: Boolean(id)
  });

export const useAlerts = (params: { deviceId?: string; status?: string; limit?: number } = {}) =>
  useQuery({ queryKey: deviceKeys.alerts(params), queryFn: () => devicesApi.alerts(params) });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: deviceKeys.all });
}

export function useRegisterDevice() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: RegisterDeviceInput) => devicesApi.register(input), onSuccess: invalidate });
}

export function useDeleteDevice() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => devicesApi.remove(id), onSuccess: invalidate });
}

export function useRotateCredential(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => devicesApi.rotateCredential(id), onSuccess: invalidate });
}

export function useIssueCommand(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { type: string; payload?: Record<string, unknown> }) => devicesApi.issueCommand(id, input),
    onSuccess: invalidate
  });
}

export function useCancelCommand() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (commandId: string) => devicesApi.cancelCommand(commandId), onSuccess: invalidate });
}

export function useAcknowledgeAlert() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (alertId: string) => devicesApi.acknowledgeAlert(alertId), onSuccess: invalidate });
}

export function useResolveAlert() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (alertId: string) => devicesApi.resolveAlert(alertId), onSuccess: invalidate });
}

export const useSimulation = (id: string) =>
  useQuery({ queryKey: deviceKeys.simulation(id), queryFn: () => devicesApi.simulation(id), enabled: Boolean(id) });

export function useStartSimulation(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: StartSimulationInput) => devicesApi.startSimulation(id, input), onSuccess: invalidate });
}

export function useStopSimulation(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => devicesApi.stopSimulation(id), onSuccess: invalidate });
}
