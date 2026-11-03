import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (payload: unknown) => void>();
const socket = {
  connected: false,
  on: vi.fn((event: string, handler: (payload: unknown) => void) => listeners.set(event, handler)),
  off: vi.fn((event: string) => listeners.delete(event)),
  connect: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('./socket', () => ({
  getSocket: () => socket,
  connectSocket: () => socket.connect(),
  disconnectSocket: () => socket.disconnect(),
  resetSocket: vi.fn(),
}));

const sessionKey = ['session'] as const;
const session = { current: { id: 'u1', email: 'user@example.com', roles: ['user'] } as unknown };
vi.mock('@/lib/auth/hooks', () => ({ useSession: () => ({ data: session.current }), sessionKey: ['session'] }));

const { invalidateForEvent, useRealtime } = await import('./use-realtime');
const { notificationKeys } = await import('@/lib/notifications/hooks');
const { deviceKeys } = await import('@/lib/devices/hooks');
const { projectKeys } = await import('@/lib/projects/hooks');
const { eventsKeys } = await import('@/lib/events/hooks');

const emit = (event: string, payload?: unknown) => {
  if (event === 'connect') socket.connected = true;
  if (event === 'disconnect' || event === 'connect_error') socket.connected = false;
  listeners.get(event)?.(payload);
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useRealtime(), { wrapper });
  return { ...view, invalidate, queryClient };
}

beforeEach(() => {
  listeners.clear();
  socket.connected = false;
  socket.connect.mockClear();
  socket.disconnect.mockClear();
  session.current = { id: 'u1', email: 'user@example.com', roles: ['user'] };
});

describe('useRealtime', () => {
  it('connects once a session exists and tracks connection state', async () => {
    const { result } = setup();
    expect(socket.connect).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);

    emit('connect');
    await waitFor(() => expect(result.current.connected).toBe(true));

    emit('disconnect');
    await waitFor(() => expect(result.current.connected).toBe(false));
  });

  it('does not connect without a session', () => {
    session.current = null;
    setup();
    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('carries no credentials of its own into the handshake', () => {
    setup();
    expect(JSON.stringify(socket.connect.mock.calls)).not.toMatch(/token|bearer/i);
  });

  it('refreshes notifications when one is pushed', async () => {
    const { invalidate } = setup();
    invalidate.mockClear();
    emit('notification:new', { notification: { id: 'n1' }, unreadDelta: 1 });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all }));
  });

  it('revalidates the session when the handshake is rejected', async () => {
    const { invalidate, result } = setup();
    invalidate.mockClear();
    emit('connect_error', new Error('SESSION_REQUIRED'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKey }));
    expect(result.current.connected).toBe(false);
  });

  it('leaves the session alone on a transient transport failure', async () => {
    const { invalidate } = setup();
    invalidate.mockClear();
    emit('connect_error', new Error('xhr poll error'));
    await waitFor(() => expect(invalidate).not.toHaveBeenCalledWith({ queryKey: sessionKey }));
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = setup();
    unmount();
    expect(socket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('event:received', expect.any(Function));
  });
});

describe('invalidateForEvent', () => {
  const harness = () => {
    const queryClient = new QueryClient();
    return { queryClient, invalidate: vi.spyOn(queryClient, 'invalidateQueries') };
  };
  const event = (type: string, extra = {}) => ({ type, eventId: 'e1', ...extra });

  it('refreshes only the device that changed, not every device query', () => {
    const { queryClient, invalidate } = harness();
    invalidateForEvent(queryClient, event('iot.device.offline', { deviceId: 'd1' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: deviceKeys.detail('d1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['devices', 'list'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: deviceKeys.all });
  });

  it('keeps an alert away from the project caches and vice versa', () => {
    const alerts = harness();
    invalidateForEvent(alerts.queryClient, event('iot.alert.raised', { deviceId: 'd1' }));
    expect(alerts.invalidate).toHaveBeenCalledWith({ queryKey: ['devices', 'alerts'] });
    expect(alerts.invalidate).not.toHaveBeenCalledWith({ queryKey: projectKeys.all });

    const projects = harness();
    invalidateForEvent(projects.queryClient, event('project.created', { projectId: 'p1' }));
    expect(projects.invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    expect(projects.invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.detail('p1') });
    expect(projects.invalidate).not.toHaveBeenCalledWith({ queryKey: ['devices', 'list'] });
  });

  it('always refreshes notifications, whatever the event', () => {
    const { queryClient, invalidate } = harness();
    invalidateForEvent(queryClient, event('iot.device.online', { deviceId: 'd1' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });

  it('ignores an event family it knows nothing about', () => {
    const { queryClient, invalidate } = harness();
    invalidateForEvent(queryClient, event('auth.user_locked'));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });
});

describe('push instead of polling', () => {
  it('refreshes the queue console when the queue signals a change', async () => {
    const { invalidate } = setup();
    invalidate.mockClear();
    emit('queue:changed', { at: null });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.all }));
  });

  it('resyncs everything once when the socket comes back', async () => {
    const { invalidate } = setup();
    invalidate.mockClear();
    emit('ready', { userId: 'u1', admin: false, serverTime: 'now' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
  });
});
