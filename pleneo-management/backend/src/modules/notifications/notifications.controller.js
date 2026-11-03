import { noContent, ok } from '#common/http/respond.js';
import * as service from './notifications.service.js';

export const list = async (req, res) => ok(res, await service.listNotifications(req.auth, req.query));
export const unreadCount = async (req, res) => ok(res, { count: await service.unreadCount(req.auth) });
export const markRead = async (req, res) => ok(res, await service.markRead(req.auth, req.params.id));
export const markAllRead = async (req, res) => ok(res, { updated: await service.markAllRead(req.auth) });
export const remove = async (req, res) => {
  await service.remove(req.auth, req.params.id);
  noContent(res);
};
