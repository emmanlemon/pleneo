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
vi.mock('#modules/projects/projects.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const service = await import('#modules/projects/projects.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const project = { id: PROJECT_ID, owner_id: USER_ID, name: 'Launch', status: 'planning' };

beforeEach(() => asUser());

describe('/projects', () => {
  it('requires authentication', async () => {
    anonymous();
    const res = await api().get('/projects');
    expectProblem(res, 401, 'AUTHENTICATION_REQUIRED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('lists with validated pagination and filters', async () => {
    service.listProjects.mockResolvedValue({ projects: [project], nextCursor: null });
    const res = await api().get('/projects?limit=10&status=active&search=lau');
    expect(res.status).toBe(200);
    expect(service.listProjects).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), {
      limit: 10,
      status: 'active',
      search: 'lau',
    });
    expectProblem(await api().get('/projects?status=bogus'), 400, 'VALIDATION_FAILED');
  });

  it('creates with defaults applied and rejects unknown fields', async () => {
    service.createProject.mockResolvedValue(project);
    const res = await api().post('/projects').send({ name: '  Launch ' });
    expect(res.status).toBe(201);
    expect(service.createProject).toHaveBeenCalledWith(expect.anything(), {
      name: 'Launch',
      description: '',
      status: 'planning',
      startsOn: null,
      endsOn: null,
    });
    expectProblem(await api().post('/projects').send({ name: 'x', budget: 1 }), 400, 'VALIDATION_FAILED');
  });

  it('validates ISO dates', async () => {
    const res = await api().post('/projects').send({ name: 'x', startsOn: '2026/01/01' });
    expectProblem(res, 400, 'VALIDATION_FAILED');
    expect(res.body.errors[0]).toMatchObject({ field: 'startsOn', code: 'INVALID_FORMAT' });
  });

  it('maps service errors to problem details', async () => {
    service.getProject.mockRejectedValue(DomainErrors.notOwner());
    expectProblem(await api().get(`/projects/${PROJECT_ID}`), 403, 'NOT_RESOURCE_OWNER');
    service.getProject.mockRejectedValue(DomainErrors.notFound('Project'));
    expectProblem(await api().get(`/projects/${PROJECT_ID}`), 404, 'NOT_FOUND');
    expectProblem(await api().get('/projects/not-a-uuid'), 400, 'VALIDATION_FAILED');
  });

  it('rejects empty updates and applies partial ones', async () => {
    expectProblem(await api().patch(`/projects/${PROJECT_ID}`).send({}), 400, 'VALIDATION_FAILED');
    service.updateProject.mockResolvedValue({ ...project, status: 'active' });
    const res = await api().patch(`/projects/${PROJECT_ID}`).send({ status: 'active', endsOn: null });
    expect(res.status).toBe(200);
    expect(service.updateProject).toHaveBeenCalledWith(expect.anything(), PROJECT_ID, {
      status: 'active',
      endsOn: null,
    });
  });

  it('deletes with 204', async () => {
    service.deleteProject.mockResolvedValue();
    expect((await api().delete(`/projects/${PROJECT_ID}`)).status).toBe(204);
  });
});
