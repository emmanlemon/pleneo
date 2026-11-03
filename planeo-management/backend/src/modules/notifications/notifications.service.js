import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { enqueueJob } from '#infra/messaging/events-client.js';
import { logger } from '#infra/logging/logger.js';
import { emitToUser } from '#infra/realtime/socket-server.js';
import * as notifications from './notification.repository.js';

export async function notify({ userId, type, title, body, data, email }, client) {
  const notification = await notifications.insert({ userId, type, title, body, data }, client);

  if (config.NOTIFY_EMAIL_ENABLED && email?.to && email?.template) {
    try {
      await enqueueJob({
        type: 'email.send',
        queue: 'email',
        payload: { to: email.to, template: email.template, data: email.data ?? data ?? {} },
        idempotencyKey: `notification:${notification.id}:email`,
      });
    } catch (err) {
      logger.warn(
        { err: err.message, notificationId: notification.id },
        'email enqueue failed, in-app notification kept',
      );
    }
  }

  emitToUser(userId, 'notification:new', { notification, unreadDelta: 1 });
  return notification;
}

export const listNotifications = async (auth, { limit, before, unread }) => {
  const rows = await notifications.listForUser(auth.userId, { limit, before, unreadOnly: unread });
  return { notifications: rows, nextBefore: rows.length === limit ? rows.at(-1).created_at : null };
};

export const unreadCount = (auth) => notifications.unreadCount(auth.userId);

export async function markRead(auth, id) {
  const notification = await notifications.markRead(auth.userId, id);
  if (!notification) throw DomainErrors.notFound('Notification');
  emitToUser(auth.userId, 'notification:read', { id, all: false });
  return notification;
}

export async function markAllRead(auth) {
  const updated = await notifications.markAllRead(auth.userId);
  emitToUser(auth.userId, 'notification:read', { all: true, updated });
  return updated;
}

export async function remove(auth, id) {
  if (!(await notifications.remove(auth.userId, id))) throw DomainErrors.notFound('Notification');
  emitToUser(auth.userId, 'notification:read', { id, all: false, removed: true });
}
