import { apiHttp } from '@/lib/api/http';

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: { href?: string; projectId?: string; status?: string } & Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationPage = { notifications: Notification[]; nextBefore: string | null };
export type NotificationListParams = { limit?: number; before?: string; unread?: boolean };

export const notificationsApi = {
  list: (params: NotificationListParams = {}) =>
    apiHttp.get<NotificationPage>('/notifications', { params }).then((r) => r.data),
  unreadCount: () => apiHttp.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
  markRead: (id: string) => apiHttp.post<Notification>(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => apiHttp.post<{ updated: number }>('/notifications/read-all').then((r) => r.data.updated),
  remove: (id: string) => apiHttp.delete(`/notifications/${id}`).then(() => undefined),
};
