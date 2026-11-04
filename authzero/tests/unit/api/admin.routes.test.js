import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asAdmin, asClient, asUser, OTHER_USER_ID, USER_ID } from '../../helpers/principal.js';

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
vi.mock('#modules/users/user.repository.js');
vi.mock('#modules/users/user-security.repository.js');
vi.mock('#modules/users/role.repository.js');
vi.mock('#modules/users/invitation.service.js');
vi.mock('#modules/auth/repositories/session.repository.js');
vi.mock('#modules/audit/audit.service.js');
vi.mock('#modules/clients/client.service.js');
vi.mock('#infra/security/signing-keys.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const users = await import('#modules/users/user.repository.js');
const security = await import('#modules/users/user-security.repository.js');
const roles = await import('#modules/users/role.repository.js');
const invitations = await import('#modules/users/invitation.service.js');
const sessions = await import('#modules/auth/repositories/session.repository.js');
const auditService = await import('#modules/audit/audit.service.js');
const clientService = await import('#modules/clients/client.service.js');
const keys = await import('#infra/security/signing-keys.js');

beforeEach(() => {
  asAdmin();
  auditService.audit.mockResolvedValue();
  sessions.revokeAllForUser.mockResolvedValue();
});

describe('admin authorization', () => {
  it('rejects anonymous, client and under-privileged principals', async () => {
    anonymous();
    expectProblem(await api().get('/v1/admin/users'), 401, 'AUTHENTICATION_REQUIRED');
    asClient(['users:read']);
    expectProblem(await api().get('/v1/admin/users'), 403, 'USER_TOKEN_REQUIRED');
    asUser({ permissions: ['users:read'] });
    expectProblem(await api().post('/v1/admin/keys/rotate'), 403, 'INSUFFICIENT_PERMISSIONS');
  });
});

describe('/v1/admin/users', () => {
  it('lists users with cursor pagination', async () => {
    users.list.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const res = await api().get('/v1/admin/users?limit=2&search=ex');
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBe('b');
    expect(users.list).toHaveBeenCalledWith({ limit: 2, search: 'ex' });
  });

  it('validates query parameters', async () => {
    expectProblem(await api().get('/v1/admin/users?limit=0'), 400, 'VALIDATION_FAILED');
    expectProblem(await api().get('/v1/admin/users?cursor=nope'), 400, 'VALIDATION_FAILED');
  });

  it('invites a user and returns the pending account', async () => {
    invitations.invite.mockResolvedValue({
      id: OTHER_USER_ID,
      email: 'new@example.com',
      name: 'New',
      status: 'invited',
    });
    const res = await api()
      .post('/v1/admin/users')
      .send({ email: 'New@Example.com', name: 'New', roles: ['admin'] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: OTHER_USER_ID, email: 'new@example.com', name: 'New', status: 'invited' });
    expect(invitations.invite).toHaveBeenCalledWith(
      { email: 'new@example.com', name: 'New', roles: ['admin'] },
      expect.objectContaining({ userId: USER_ID }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it('requires users:write to invite and validates the role names', async () => {
    asUser({ permissions: ['users:read'] });
    expectProblem(
      await api().post('/v1/admin/users').send({ email: 'new@example.com' }),
      403,
      'INSUFFICIENT_PERMISSIONS',
    );
    asAdmin();
    expectProblem(
      await api()
        .post('/v1/admin/users')
        .send({ email: 'new@example.com', roles: ['Not Valid'] }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('resends an open invitation', async () => {
    invitations.resend.mockResolvedValue();
    expect((await api().post(`/v1/admin/users/${OTHER_USER_ID}/invitations`)).status).toBe(204);
    expect(invitations.resend).toHaveBeenCalledWith(
      OTHER_USER_ID,
      expect.objectContaining({ userId: USER_ID }),
      expect.anything(),
    );
  });

  it('returns 404 for an unknown user', async () => {
    users.findAdminView.mockResolvedValue(null);
    expectProblem(await api().get(`/v1/admin/users/${OTHER_USER_ID}`), 404, 'NOT_FOUND');
  });

  it('returns the user with authorization and sessions', async () => {
    users.findAdminView.mockResolvedValue({ id: OTHER_USER_ID });
    roles.getAuthorization.mockResolvedValue({ roles: ['user'], permissions: [] });
    sessions.listActiveForUser.mockResolvedValue([]);
    const res = await api().get(`/v1/admin/users/${OTHER_USER_ID}`);
    expect(res.body).toMatchObject({ id: OTHER_USER_ID, roles: ['user'], sessions: [] });
  });

  it('prevents an admin from disabling themselves', async () => {
    expectProblem(
      await api().patch(`/v1/admin/users/${USER_ID}`).send({ status: 'disabled' }),
      403,
      'SELF_MODIFICATION_FORBIDDEN',
    );
    expect(security.setStatus).not.toHaveBeenCalled();
  });

  it('disables a user and revokes their sessions', async () => {
    security.setStatus.mockResolvedValue();
    const res = await api().patch(`/v1/admin/users/${OTHER_USER_ID}`).send({ status: 'disabled' });
    expect(res.status).toBe(204);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(OTHER_USER_ID, 'disabled_by_admin');
    expect(auditService.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user_status_changed' }));
  });

  it('rejects an unknown status value', async () => {
    expectProblem(
      await api().patch(`/v1/admin/users/${OTHER_USER_ID}`).send({ status: 'banned' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('grants a role only when it exists and invalidates sessions', async () => {
    roles.exists.mockResolvedValue(false);
    expectProblem(await api().post(`/v1/admin/users/${OTHER_USER_ID}/roles`).send({ role: 'ghost' }), 404, 'NOT_FOUND');
    roles.exists.mockResolvedValue(true);
    roles.assign.mockResolvedValue();
    const res = await api().post(`/v1/admin/users/${OTHER_USER_ID}/roles`).send({ role: 'admin' });
    expect(res.status).toBe(204);
    expect(roles.assign).toHaveBeenCalledWith(OTHER_USER_ID, 'admin', USER_ID);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(OTHER_USER_ID, 'roles_changed');
  });

  it('prevents removing own admin role', async () => {
    expectProblem(await api().delete(`/v1/admin/users/${USER_ID}/roles/admin`), 403, 'SELF_MODIFICATION_FORBIDDEN');
  });
});

describe('/admin platform', () => {
  it('creates a client and returns the secret once', async () => {
    clientService.createClient.mockResolvedValue({ id: 'c1', client_id: 'cid_x', clientSecret: 'sec' });
    const res = await api()
      .post('/v1/admin/clients')
      .send({ name: 'billing', scopes: ['projects:read'] });
    expect(res.status).toBe(201);
    expect(res.body.clientSecret).toBe('sec');
  });

  it('refuses a scope that is not in the catalogue', async () => {
    expectProblem(
      await api()
        .post('/v1/admin/clients')
        .send({ name: 'billing', scopes: ['billing:read'] }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rejects malformed scopes', async () => {
    expectProblem(
      await api()
        .post('/v1/admin/clients')
        .send({ name: 'x', scopes: ['Bad Scope'] }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rotates signing keys and audits it', async () => {
    keys.rotateSigningKey.mockResolvedValue('kid-new');
    const res = await api().post('/v1/admin/keys/rotate');
    expect(res.status).toBe(201);
    expect(res.body.kid).toBe('kid-new');
    expect(auditService.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.key_rotated', targetId: 'kid-new' }),
    );
  });

  it('pages the audit log', async () => {
    auditService.listAudit.mockResolvedValue([{ id: 10 }, { id: 9 }]);
    const res = await api().get('/v1/admin/audit?limit=2&action=auth.login');
    expect(res.body.nextBefore).toBe(9);
    expect(auditService.listAudit).toHaveBeenCalledWith({ limit: 2, action: 'auth.login' });
  });
});
