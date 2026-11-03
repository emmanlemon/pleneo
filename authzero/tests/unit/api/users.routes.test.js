import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asUser, USER_ID } from '../../helpers/principal.js';

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

const { api, expectProblem } = await import('../../helpers/app.js');
const users = await import('#modules/users/user.repository.js');

beforeEach(() => asUser({ roles: ['user'], permissions: ['x:y'] }));

describe('/users/me', () => {
  it('requires authentication', async () => {
    anonymous();
    expectProblem(await api().get('/users/me'), 401, 'AUTHENTICATION_REQUIRED');
  });

  it('returns the profile merged with token authorization claims', async () => {
    users.findPublicById.mockResolvedValue({ id: USER_ID, email: 'user@example.com', name: 'U' });
    const res = await api().get('/users/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: USER_ID, roles: ['user'], permissions: ['x:y'] });
    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 404 when the user no longer exists', async () => {
    users.findPublicById.mockResolvedValue(null);
    expectProblem(await api().get('/users/me'), 404, 'NOT_FOUND');
  });

  it('rejects unknown profile fields', async () => {
    expectProblem(await api().patch('/users/me').send({ email: 'x@y.z' }), 400, 'VALIDATION_FAILED');
    expect(users.updateProfile).not.toHaveBeenCalled();
  });

  it('updates the display name', async () => {
    users.updateProfile.mockResolvedValue({ id: USER_ID, name: 'Renamed' });
    const res = await api().patch('/users/me').send({ name: '  Renamed ' });
    expect(res.status).toBe(200);
    expect(users.updateProfile).toHaveBeenCalledWith(USER_ID, { name: 'Renamed' });
  });
});
