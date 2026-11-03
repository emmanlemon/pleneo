'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { sessionKey, useSession } from '@/lib/auth/hooks';
import { deviceKeys } from '@/lib/devices/hooks';
import { eventsKeys } from '@/lib/events/hooks';
import { notificationKeys } from '@/lib/notifications/hooks';
import { projectKeys } from '@/lib/projects/hooks';
import { connectSocket, disconnectSocket, getSocket, type RealtimeEvents } from './socket';

const CONNECTION_EVENTS = ['connect', 'disconnect', 'connect_error'] as const;
const SESSION_LOST = ['AUTHENTICATION_REQUIRED', 'SESSION_REQUIRED', 'INVALID_TOKEN'];

/** Narrow the refresh to what the event actually touched, rather than every device query. */
export function invalidateForEvent(queryClient: QueryClient, payload: RealtimeEvents['event:received']) {
  const { type, deviceId, projectId } = payload;
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  if (type.startsWith('project.')) {
    queryClient.invalidateQueries({ queryKey: projectKeys.all });
    if (projectId) queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    return;
  }

  if (!type.startsWith('iot.')) return;

  if (type.startsWith('iot.alert.')) {
    queryClient.invalidateQueries({ queryKey: ['devices', 'alerts'] });
    queryClient.invalidateQueries({ queryKey: deviceKeys.stats });
  }

  if (type.startsWith('iot.device.')) {
    queryClient.invalidateQueries({ queryKey: ['devices', 'list'] });
    queryClient.invalidateQueries({ queryKey: deviceKeys.stats });
  }

  if (deviceId) {
    queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) });
    queryClient.invalidateQueries({ queryKey: deviceKeys.latest(deviceId) });
    queryClient.invalidateQueries({ queryKey: ['devices', 'series', deviceId] });
    queryClient.invalidateQueries({ queryKey: deviceKeys.commands(deviceId) });
  }
}

function useConnectionState() {
  const subscribe = useCallback((onChange: () => void) => {
    const socket = getSocket();
    for (const event of CONNECTION_EVENTS) socket.on(event, onChange);
    return () => {
      for (const event of CONNECTION_EVENTS) socket.off(event, onChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => getSocket().connected,
    () => false,
  );
}

export function useRealtime() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const connected = useConnectionState();

  useEffect(() => {
    if (!session) {
      disconnectSocket();
      return;
    }

    const socket = getSocket();
    const onError = (error: Error) => {
      if (SESSION_LOST.includes(error.message)) queryClient.invalidateQueries({ queryKey: sessionKey });
    };
    const onNotification = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    const onEvent = (payload: RealtimeEvents['event:received']) => invalidateForEvent(queryClient, payload);
    const onQueueChanged = () => queryClient.invalidateQueries({ queryKey: eventsKeys.all });
    // Events raised while the socket was down were never delivered, so resync once on return.
    const onReady = () => queryClient.invalidateQueries();

    socket.on('connect_error', onError);
    socket.on('ready', onReady);
    socket.on('notification:new', onNotification);
    socket.on('notification:read', onNotification);
    socket.on('event:received', onEvent);
    socket.on('queue:changed', onQueueChanged);
    connectSocket();

    return () => {
      socket.off('connect_error', onError);
      socket.off('ready', onReady);
      socket.off('notification:new', onNotification);
      socket.off('notification:read', onNotification);
      socket.off('event:received', onEvent);
      socket.off('queue:changed', onQueueChanged);
    };
  }, [queryClient, session]);

  return { connected: session ? connected : false };
}
