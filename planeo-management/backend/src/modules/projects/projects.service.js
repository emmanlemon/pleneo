import { DomainErrors } from '#common/errors/domain-errors.js';
import { withTransaction } from '#infra/database/pool.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import * as projects from './projects.repository.js';

export const READ_ALL_SCOPE = 'projects:read';
export const WRITE_ALL_SCOPE = 'projects:write';

const isAdmin = (auth) => auth.type === 'user' && auth.roles.includes('admin');
const canReadAll = (auth) => isAdmin(auth) || (auth.type === 'client' && auth.scopes.includes(READ_ALL_SCOPE));
const canWriteAll = (auth) => isAdmin(auth) || (auth.type === 'client' && auth.scopes.includes(WRITE_ALL_SCOPE));
const actorId = (auth) => (auth.type === 'user' ? auth.userId : auth.clientId);

const eventPayload = (project, auth, extra = {}) => ({
  projectId: project.id,
  ownerId: project.owner_id,
  name: project.name,
  status: project.status,
  actorId: actorId(auth),
  actorEmail: auth.email ?? null,
  ...extra,
});

function assertDateRange({ startsOn, endsOn }) {
  if (startsOn && endsOn && endsOn < startsOn) throw DomainErrors.invalidDateRange();
}

async function loadAccessible(id, auth, { write }) {
  const project = await projects.findById(id);
  if (!project) throw DomainErrors.notFound('Project');
  const allowed = write ? canWriteAll(auth) : canReadAll(auth);
  if (!allowed && project.owner_id !== auth.userId) throw DomainErrors.notOwner();
  return project;
}

export async function listProjects(auth, { limit, cursor, status, search }) {
  const rows = await projects.list({ ownerId: canReadAll(auth) ? null : auth.userId, status, search, cursor, limit });
  return { projects: rows, nextCursor: rows.length === limit ? rows.at(-1).id : null };
}

export const getProject = (auth, id) => loadAccessible(id, auth, { write: false });

export async function createProject(auth, input) {
  if (auth.type !== 'user' && !input.ownerId) throw DomainErrors.notOwner();
  assertDateRange(input);
  const ownerId = input.ownerId && canWriteAll(auth) ? input.ownerId : auth.userId;
  return withTransaction(async (client) => {
    const project = await projects.create({ ...input, ownerId, actorId: actorId(auth) }, client);
    await outbox.add(
      {
        type: 'project.created',
        payload: eventPayload(project, auth),
        idempotencyKey: `project.created:${project.id}`,
      },
      client,
    );
    return project;
  });
}

export async function updateProject(auth, id, input) {
  const current = await loadAccessible(id, auth, { write: true });
  assertDateRange({ startsOn: input.startsOn ?? current.starts_on, endsOn: input.endsOn ?? current.ends_on });
  return withTransaction(async (client) => {
    const project = await projects.update(id, { ...input, actorId: actorId(auth) }, client);
    const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'actorId'));
    const type = input.status && input.status !== current.status ? 'project.status_changed' : 'project.updated';
    await outbox.add(
      {
        type,
        payload: eventPayload(project, auth, { changes, previousStatus: current.status }),
        idempotencyKey: `${type}:${project.id}:${new Date(project.updated_at).toISOString()}`,
      },
      client,
    );
    return project;
  });
}

export async function deleteProject(auth, id) {
  const project = await loadAccessible(id, auth, { write: true });
  await withTransaction(async (client) => {
    await projects.softDelete(id, actorId(auth), client);
    await outbox.add(
      {
        type: 'project.deleted',
        payload: eventPayload(project, auth),
        idempotencyKey: `project.deleted:${project.id}`,
      },
      client,
    );
  });
}
