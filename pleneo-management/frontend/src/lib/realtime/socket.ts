import { io, type Socket } from 'socket.io-client';
import { env } from '@/lib/env';

export type RealtimeEvents = {
  ready: { userId: string; admin: boolean; serverTime: string };
  'notification:new': { notification: { id: string }; unreadDelta: number };
  'notification:read': { id?: string; all: boolean; updated?: number; removed?: boolean };
  'event:received': { type: string; eventId: string; deviceId?: string; projectId?: string; alertId?: string; ownerId?: string };
  'queue:changed': { at: string | null };
};

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(env.bffUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    withCredentials: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function connectSocket(): Socket {
  const current = getSocket();
  if (!current.connected) current.connect();
  return current;
}

export function disconnectSocket() {
  socket?.disconnect();
}

export function resetSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
