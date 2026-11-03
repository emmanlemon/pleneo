'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { sessionKey, useSession } from '@/lib/auth/hooks';
import { deviceKeys } from '@/lib/devices/hooks';
import { notificationKeys } from '@/lib/notifications/hooks';
import { projectKeys } from '@/lib/projects/hooks';
import { connectSocket, disconnectSocket, getSocket, type RealtimeEvents } from './socket';

const CONNECTION_EVENTS = ['connect', 'disconnect', 'connect_error'] as const;
const SESSION_LOST = ['AUTHENTICATION_REQUIRED', 'SESSION_REQUIRED', 'INVALID_TOKEN'];

export function invalidateForEvent(queryClient: QueryClient, type: string) {
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  if (type.startsWith('iot.')) queryClient.invalidateQueries({ queryKey: deviceKeys.all });
  if (type.startsWith('project.')) queryClient.invalidateQueries({ queryKey: projectKeys.all });
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
    const onEvent = (payload: RealtimeEvents['event:received']) => invalidateForEvent(queryClient, payload.type);

    socket.on('connect_error', onError);
    socket.on('notification:new', onNotification);
    socket.on('notification:read', onNotification);
    socket.on('event:received', onEvent);
    connectSocket();

    return () => {
      socket.off('connect_error', onError);
      socket.off('notification:new', onNotification);
      socket.off('notification:read', onNotification);
      socket.off('event:received', onEvent);
    };
  }, [queryClient, session]);

  return { connected: session ? connected : false };
}
