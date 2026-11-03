import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asClient, asUser, USER_ID } from '../../helpers/principal.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/principal.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
  };
});
vi.mock('#modules/notifications/notification.repository.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const repo = await import('#modules/notifications/notification.repository.js');

const NOTIFICATION_ID = '77777777-7777-4777-8777-777777777777';
const notification = {
  id: NOTIFICATION_ID,
  user_id: USER_ID,
  type: 'project.created',
  title: 'Project "Launch" created',
  read_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => asUser());

describe('/v1/notifications', () => {
  it('requires a user principal', async () => {
    anonymous();
    expectProblem(await api().get('/v1/notifications'), 401, 'AUTHENTICATION_REQUIRED');
    asClient(['projects:read']);
    expectProblem(await api().get('/v1/notifications'), 403, 'USER_TOKEN_REQUIRED');
  });

  it('lists the caller’s notifications with cursor and unread filter', async () => {
    repo.listForUser.mockResolvedValue([notification]);
    const res = await api().get('/v1/notifications?limit=1&unread=true');
    expect(res.status).toBe(200);
    expect(res.body.nextBefore).toBe(notification.created_at);
    expect(repo.listForUser).toHaveBeenCalledWith(USER_ID, { limit: 1, unreadOnly: true, before: undefined });
    expectProblem(await api().get('/v1/notifications?limit=500'), 400, 'VALIDATION_FAILED');
  });

  it('returns the unread count', async () => {
    repo.unreadCount.mockResolvedValue(3);
    expect((await api().get('/v1/notifications/unread-count')).body).toEqual({ count: 3 });
  });

  it('marks one or all as read scoped to the caller', async () => {
    repo.markRead.mockResolvedValue({ ...notification, read_at: '2026-01-02T00:00:00.000Z' });
    expect((await api().post(`/v1/notifications/${NOTIFICATION_ID}/read`)).body.read_at).toBeTruthy();
    expect(repo.markRead).toHaveBeenCalledWith(USER_ID, NOTIFICATION_ID);
    repo.markRead.mockResolvedValue(null);
    expectProblem(await api().post(`/v1/notifications/${NOTIFICATION_ID}/read`), 404, 'NOT_FOUND');
    repo.markAllRead.mockResolvedValue(4);
    expect((await api().post('/v1/notifications/read-all')).body).toEqual({ updated: 4 });
  });

  it('deletes own notifications only', async () => {
    repo.remove.mockResolvedValue(true);
    expect((await api().delete(`/v1/notifications/${NOTIFICATION_ID}`)).status).toBe(204);
    repo.remove.mockResolvedValue(false);
    expectProblem(await api().delete(`/v1/notifications/${NOTIFICATION_ID}`), 404, 'NOT_FOUND');
  });
});
