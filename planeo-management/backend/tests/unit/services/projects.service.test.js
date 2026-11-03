import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, OTHER_USER_ID, PROJECT_ID, USER_ID } from '../../helpers/principal.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/messaging/outbox.repository.js');
vi.mock('#modules/projects/projects.repository.js');

const service = await import('#modules/projects/projects.service.js');
const repo = await import('#modules/projects/projects.repository.js');
const outbox = await import('#infra/messaging/outbox.repository.js');

const user = { type: 'user', userId: USER_ID, email: 'user@example.com', roles: ['user'], permissions: [], scopes: [] };
const admin = { type: 'user', userId: OTHER_USER_ID, roles: ['admin'], permissions: [], scopes: [] };
const reader = { type: 'client', clientId: CLIENT_ID, roles: [], permissions: [], scopes: ['projects:read'] };
const owned = {
  id: PROJECT_ID,
  owner_id: USER_ID,
  name: 'Launch',
  status: 'planning',
  starts_on: '2026-01-01',
  ends_on: '2026-02-01',
  updated_at: '2026-01-01T00:00:00.000Z',
};
const foreign = { ...owned, owner_id: OTHER_USER_ID };

beforeEach(() => {
  repo.create.mockImplementation(async (input) => ({ ...owned, ...input, owner_id: input.ownerId }));
  repo.update.mockImplementation(async (id, input) => ({
    ...owned,
    id,
    ...input,
    updated_at: '2026-01-02T00:00:00.000Z',
  }));
  repo.softDelete.mockResolvedValue(true);
  outbox.add.mockResolvedValue();
});

describe('listProjects', () => {
  it('scopes regular users to their own projects', async () => {
    repo.list.mockResolvedValue([owned]);
    await service.listProjects(user, { limit: 25 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ ownerId: USER_ID }));
  });

  it('lets admins and read-scoped clients see everything and paginates by cursor', async () => {
    repo.list.mockResolvedValue([owned, foreign]);
    const page = await service.listProjects(admin, { limit: 2 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null }));
    expect(page.nextCursor).toBe(PROJECT_ID);
    await service.listProjects(reader, { limit: 25 });
    expect(repo.list).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: null }));
  });
});

describe('access control', () => {
  it('hides foreign projects from regular users but not from admins', async () => {
    repo.findById.mockResolvedValue(foreign);
    await expect(service.getProject(user, PROJECT_ID)).rejects.toMatchObject({ code: 'NOT_RESOURCE_OWNER' });
    await expect(service.getProject(admin, PROJECT_ID)).resolves.toEqual(foreign);
  });

  it('read-only clients cannot write', async () => {
    repo.findById.mockResolvedValue(foreign);
    await expect(service.updateProject(reader, PROJECT_ID, { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_RESOURCE_OWNER',
    });
  });

  it('returns 404 for missing projects', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.deleteProject(user, PROJECT_ID)).rejects.toMatchObject({ status: 404 });
  });
});

describe('outbox integration', () => {
  it('writes project.created in the same transaction as the insert', async () => {
    await service.createProject(user, { name: 'Launch', ownerId: OTHER_USER_ID, startsOn: null, endsOn: null });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: USER_ID, actorId: USER_ID }), tx);
    expect(outbox.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project.created',
        idempotencyKey: `project.created:${PROJECT_ID}`,
        payload: expect.objectContaining({
          projectId: PROJECT_ID,
          ownerId: USER_ID,
          actorEmail: 'user@example.com',
          name: 'Launch',
        }),
      }),
      tx,
    );
  });

  it('emits project.status_changed only when the status actually changes', async () => {
    repo.findById.mockResolvedValue(owned);
    await service.updateProject(user, PROJECT_ID, { status: 'active' });
    expect(outbox.add).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'project.status_changed',
        payload: expect.objectContaining({
          previousStatus: 'planning',
          status: 'active',
          changes: { status: 'active' },
        }),
      }),
      tx,
    );
    await service.updateProject(user, PROJECT_ID, { name: 'Renamed' });
    expect(outbox.add).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'project.updated' }), tx);
  });

  it('emits project.deleted on soft delete', async () => {
    repo.findById.mockResolvedValue(owned);
    await service.deleteProject(user, PROJECT_ID);
    expect(repo.softDelete).toHaveBeenCalledWith(PROJECT_ID, USER_ID, tx);
    expect(outbox.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'project.deleted', idempotencyKey: `project.deleted:${PROJECT_ID}` }),
      tx,
    );
  });

  it('rejects an end date before the start date, including against stored values', async () => {
    await expect(
      service.createProject(user, { name: 'a', startsOn: '2026-03-01', endsOn: '2026-02-01' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    repo.findById.mockResolvedValue(owned);
    await expect(service.updateProject(user, PROJECT_ID, { endsOn: '2025-12-31' })).rejects.toMatchObject({
      code: 'INVALID_DATE_RANGE',
    });
    expect(outbox.add).not.toHaveBeenCalled();
  });
});
