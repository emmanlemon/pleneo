import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asUser, PROJECT_ID, USER_ID } from '../../helpers/principal.js';

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
vi.mock('#modules/projects/infrastructure/project.repository.js');
vi.mock('#modules/projects/infrastructure/project.events.js', () => ({ record: vi.fn() }));
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn({ query: vi.fn() })),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));

const { api, expectProblem } = await import('../../helpers/app.js');
const repository = await import('#modules/projects/infrastructure/project.repository.js');

const project = {
  id: PROJECT_ID,
  ownerId: USER_ID,
  name: 'Launch',
  description: '',
  status: 'planning',
  startsOn: null,
  endsOn: null,
  createdBy: USER_ID,
  updatedBy: USER_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  asUser();
  repository.findById.mockResolvedValue(project);
  repository.list.mockResolvedValue([project]);
  repository.insert.mockResolvedValue(project);
  repository.update.mockResolvedValue({ ...project, status: 'active' });
  repository.softDelete.mockResolvedValue(true);
});

describe('/v1/projects', () => {
  it('requires authentication', async () => {
    anonymous();
    const res = await api().get('/v1/projects');
    expectProblem(res, 401, 'AUTHENTICATION_REQUIRED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('lists with validated pagination and filters', async () => {
    const res = await api().get('/v1/projects?limit=10&status=active&search=lau');
    expect(res.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith({
      ownerId: USER_ID,
      limit: 10,
      status: 'active',
      search: 'lau',
      cursor: undefined,
    });
    expectProblem(await api().get('/v1/projects?status=bogus'), 400, 'VALIDATION_FAILED');
  });

  it('answers in the documented wire shape', async () => {
    const res = await api().get(`/v1/projects/${PROJECT_ID}`);
    expect(res.body).toMatchObject({
      id: PROJECT_ID,
      owner_id: USER_ID,
      starts_on: null,
      ends_on: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(res.body.ownerId).toBeUndefined();
  });

  it('creates with defaults applied and rejects unknown fields', async () => {
    const res = await api().post('/v1/projects').send({ name: '  Launch ' });
    expect(res.status).toBe(201);
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Launch', description: '', status: 'planning', ownerId: USER_ID }),
      expect.anything(),
    );
    expectProblem(await api().post('/v1/projects').send({ name: 'x', budget: 1 }), 400, 'VALIDATION_FAILED');
  });

  it('validates ISO dates', async () => {
    const res = await api().post('/v1/projects').send({ name: 'x', startsOn: '2026/01/01' });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0]).toMatchObject({ field: 'startsOn', code: 'INVALID_FORMAT' });
  });

  it('maps domain errors to problem details', async () => {
    repository.findById.mockResolvedValue({ ...project, ownerId: 'someone-else' });
    expectProblem(await api().get(`/v1/projects/${PROJECT_ID}`), 403, 'NOT_RESOURCE_OWNER');

    repository.findById.mockResolvedValue(null);
    expectProblem(await api().get(`/v1/projects/${PROJECT_ID}`), 404, 'NOT_FOUND');
    expectProblem(await api().get('/v1/projects/not-a-uuid'), 400, 'VALIDATION_FAILED');
  });

  it('rejects empty updates and applies partial ones', async () => {
    expectProblem(await api().patch(`/v1/projects/${PROJECT_ID}`).send({}), 400, 'VALIDATION_FAILED');
    const res = await api().patch(`/v1/projects/${PROJECT_ID}`).send({ status: 'active', endsOn: null });
    expect(res.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(
      PROJECT_ID,
      { status: 'active', endsOn: null },
      USER_ID,
      expect.anything(),
    );
  });

  it('refuses a status move the domain forbids', async () => {
    repository.findById.mockResolvedValue({ ...project, status: 'completed' });
    const res = await api().patch(`/v1/projects/${PROJECT_ID}`).send({ status: 'on_hold' });
    expectProblem(res, 409, 'INVALID_STATUS_TRANSITION');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('tells the client which statuses it may move to next', async () => {
    const res = await api().get(`/v1/projects/${PROJECT_ID}`);
    expect(res.body.allowed_transitions).toEqual(['planning', 'active', 'on_hold', 'archived']);
  });

  it('summarises the portfolio without treating "summary" as an id', async () => {
    repository.summarize.mockResolvedValue({ counts: { active: { count: 1, overdue: 1 } }, dueSoon: [project] });
    const res = await api().get('/v1/projects/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, overdue: 1, byStatus: { active: 1, planning: 0 } });
    expect(res.body.dueSoon[0]).toMatchObject({ id: PROJECT_ID, allowed_transitions: expect.any(Array) });
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('deletes with 204', async () => {
    expect((await api().delete(`/v1/projects/${PROJECT_ID}`)).status).toBe(204);
    expect(repository.softDelete).toHaveBeenCalledWith(PROJECT_ID, USER_ID, expect.anything());
  });
});
