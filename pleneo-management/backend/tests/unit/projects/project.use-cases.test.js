import { beforeEach, describe, expect, it } from 'vitest';
import { makeUseCases } from '#modules/projects/application/project.use-cases.js';
import { ADMIN_PERMISSIONS, OTHER_USER_ID, PROJECT_ID, USER_ID } from '../../helpers/principal.js';

const user = { type: 'user', userId: USER_ID, email: 'user@example.com', roles: ['user'], permissions: [] };
const admin = { ...user, roles: ['admin', 'user'], permissions: ADMIN_PERMISSIONS };
const client = (scopes) => ({ type: 'client', clientId: 'c1', roles: [], scopes, permissions: scopes });
const reader = client(['projects:read']);
const writer = client(['projects:write']);
const publisher = client(['events:publish']);

const seed = (overrides = {}) => ({
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
  ...overrides,
});

/** In-memory stand-ins for the two ports. No module mocking, no database. */
function harness(rows = [seed()]) {
  const store = new Map(rows.map((row) => [row.id, row]));
  const published = [];
  const calls = { list: [], summarize: [], update: [], softDelete: [] };

  const repository = {
    list: async (filter) => {
      calls.list.push(filter);
      return [...store.values()].filter((p) => !filter.ownerId || p.ownerId === filter.ownerId);
    },
    summarize: async (filter) => {
      calls.summarize.push(filter);
      return {
        counts: {
          active: { count: 3, overdue: 1 },
          on_hold: { count: 1, overdue: 1 },
          completed: { count: 2, overdue: 0 },
        },
        dueSoon: [...store.values()],
      };
    },
    findById: async (id) => store.get(id) ?? null,
    insert: async (project) => {
      const row = seed({ ...project, id: 'new-id' });
      store.set(row.id, row);
      return row;
    },
    update: async (id, changes, actorId) => {
      calls.update.push({ id, changes, actorId });
      const row = { ...store.get(id), ...changes, updatedBy: actorId, updatedAt: '2026-02-02T00:00:00.000Z' };
      store.set(id, row);
      return row;
    },
    softDelete: async (id, actorId) => {
      calls.softDelete.push({ id, actorId });
      return store.delete(id);
    },
  };

  const events = { record: async (event) => void published.push(event) };
  const unitOfWork = { run: (work) => work({ transaction: true }) };

  return { useCases: makeUseCases({ repository, events, unitOfWork }), published, calls, store };
}

let h;
beforeEach(() => {
  h = harness();
});

describe('listing', () => {
  it('scopes a plain user to their own projects', async () => {
    await h.useCases.list(user, { limit: 25 });
    expect(h.calls.list[0]).toMatchObject({ ownerId: USER_ID });
  });

  it('lets an admin and a read-scoped client see everything', async () => {
    await h.useCases.list(admin, { limit: 25 });
    await h.useCases.list(reader, { limit: 25 });
    expect(h.calls.list.map((c) => c.ownerId)).toEqual([null, null]);
  });

  it('refuses a client that holds no read scope instead of listing everything', async () => {
    await expect(h.useCases.list(publisher, { limit: 25 })).rejects.toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
    await expect(h.useCases.summary(publisher)).rejects.toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
    expect(h.calls.list).toHaveLength(0);
    expect(h.calls.summarize).toHaveLength(0);
  });

  it('returns a cursor only when the page is full', async () => {
    expect((await h.useCases.list(user, { limit: 1 })).nextCursor).toBe(PROJECT_ID);
    expect((await h.useCases.list(user, { limit: 25 })).nextCursor).toBeNull();
  });
});

describe('summary', () => {
  it('reports every status, including those with no projects', async () => {
    const summary = await h.useCases.summary(user);
    expect(summary.byStatus).toEqual({ planning: 0, active: 3, on_hold: 1, completed: 2, archived: 0 });
    expect(summary).toMatchObject({ total: 6, overdue: 2, horizonDays: 14 });
  });

  it('asks only about open work and scopes it like listing', async () => {
    await h.useCases.summary(user);
    await h.useCases.summary(admin);
    expect(h.calls.summarize[0]).toMatchObject({ ownerId: USER_ID, openStatuses: ['planning', 'active', 'on_hold'] });
    expect(h.calls.summarize[1].ownerId).toBeNull();
  });
});

describe('creation', () => {
  it('records the project and its event in one unit of work', async () => {
    const project = await h.useCases.create(user, { name: 'New', description: '', status: 'planning' });
    expect(project.name).toBe('New');
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ type: 'project.created', key: 'project.created:new-id' });
  });

  it('refuses a client that names no owner, instead of writing a null one', async () => {
    await expect(h.useCases.create(writer, { name: 'New', status: 'planning' })).rejects.toMatchObject({
      code: 'OWNER_REQUIRED',
    });
    expect(h.published).toHaveLength(0);
  });

  it('lets a write-scoped client create on behalf of a user', async () => {
    const project = await h.useCases.create(writer, { name: 'New', status: 'planning', ownerId: OTHER_USER_ID });
    expect(project.ownerId).toBe(OTHER_USER_ID);
  });

  it('refuses a plain user creating for somebody else', async () => {
    await expect(
      h.useCases.create(user, { name: 'New', status: 'planning', ownerId: OTHER_USER_ID }),
    ).rejects.toMatchObject({ code: 'NOT_RESOURCE_OWNER' });
  });

  it('rejects an invalid date range before anything is written', async () => {
    await expect(
      h.useCases.create(user, { name: 'New', status: 'planning', startsOn: '2026-05-01', endsOn: '2026-04-01' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(h.published).toHaveLength(0);
  });
});

describe('updating', () => {
  it('publishes status_changed only when the status actually moves', async () => {
    await h.useCases.update(user, PROJECT_ID, { status: 'active' });
    expect(h.published.at(-1).type).toBe('project.status_changed');

    await h.useCases.update(user, PROJECT_ID, { name: 'Renamed' });
    expect(h.published.at(-1).type).toBe('project.updated');
  });

  it('carries the previous status on the event', async () => {
    await h.useCases.update(user, PROJECT_ID, { status: 'active' });
    expect(h.published.at(-1).extra).toMatchObject({ previousStatus: 'planning', changes: { status: 'active' } });
  });

  it('refuses a transition the domain forbids and writes nothing', async () => {
    h = harness([seed({ status: 'completed' })]);
    await expect(h.useCases.update(user, PROJECT_ID, { status: 'on_hold' })).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
    expect(h.calls.update).toHaveLength(0);
    expect(h.published).toHaveLength(0);
  });

  it('validates a partial date change against the stored row', async () => {
    h = harness([seed({ startsOn: '2026-05-01' })]);
    await expect(h.useCases.update(user, PROJECT_ID, { endsOn: '2026-04-01' })).rejects.toMatchObject({
      code: 'INVALID_DATE_RANGE',
    });
    expect(h.calls.update).toHaveLength(0);
  });

  it('passes only the changed fields to the repository', async () => {
    await h.useCases.update(user, PROJECT_ID, { name: 'Renamed' });
    expect(h.calls.update[0]).toMatchObject({ changes: { name: 'Renamed' }, actorId: USER_ID });
  });
});

describe('access control', () => {
  it('hides a foreign project behind 403 for a plain user', async () => {
    h = harness([seed({ ownerId: OTHER_USER_ID })]);
    await expect(h.useCases.get(user, PROJECT_ID)).rejects.toMatchObject({ code: 'NOT_RESOURCE_OWNER' });
  });

  it('lets an admin through', async () => {
    h = harness([seed({ ownerId: OTHER_USER_ID })]);
    await expect(h.useCases.get(admin, PROJECT_ID)).resolves.toMatchObject({ id: PROJECT_ID });
  });

  it('stops a read-only client writing', async () => {
    await expect(h.useCases.update(reader, PROJECT_ID, { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_RESOURCE_OWNER',
    });
  });

  it('answers 404 for a project that is not there', async () => {
    await expect(h.useCases.get(user, 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deletion', () => {
  it('soft deletes and publishes the pre-delete snapshot', async () => {
    await h.useCases.remove(user, PROJECT_ID);
    expect(h.calls.softDelete[0]).toMatchObject({ id: PROJECT_ID, actorId: USER_ID });
    expect(h.published.at(-1)).toMatchObject({ type: 'project.deleted', key: `project.deleted:${PROJECT_ID}` });
    expect(h.published.at(-1).project.name).toBe('Launch');
  });
});
