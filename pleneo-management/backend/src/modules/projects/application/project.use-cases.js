import { DomainErrors } from '#common/errors/domain-errors.js';
import { actorOf, assertCanAccess, resolveOwnerId, visibleOwnerId } from '../domain/project-access.js';
import { applyChanges, createProject } from '../domain/project.js';
import { OPEN_STATUSES, PROJECT_STATUSES } from '../domain/project-status.js';

const DUE_SOON_DAYS = 14;
const DUE_SOON_LIMIT = 5;

const EVENT_KEYS = {
  created: (project) => `project.created:${project.id}`,
  deleted: (project) => `project.deleted:${project.id}`,
  mutated: (type, project) => `${type}:${project.id}:${new Date(project.updatedAt).toISOString()}`,
};

async function load({ repository }, id, auth, { write }) {
  const project = await repository.findById(id);
  if (!project) throw DomainErrors.notFound('Project');
  assertCanAccess(project, auth, { write });
  return project;
}

export const makeUseCases = ({ repository, events, unitOfWork }) => {
  const deps = { repository, events, unitOfWork };

  return {
    async list(auth, { limit, cursor, status, search }) {
      const projects = await repository.list({ ownerId: visibleOwnerId(auth), status, search, cursor, limit });
      return { projects, nextCursor: projects.length === limit ? projects.at(-1).id : null };
    },

    async summary(auth) {
      const { counts, dueSoon } = await repository.summarize({
        ownerId: visibleOwnerId(auth),
        openStatuses: OPEN_STATUSES,
        horizonDays: DUE_SOON_DAYS,
        limit: DUE_SOON_LIMIT,
      });
      const byStatus = Object.fromEntries(PROJECT_STATUSES.map((status) => [status, counts[status]?.count ?? 0]));
      return {
        total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
        byStatus,
        overdue: Object.values(counts).reduce((sum, c) => sum + c.overdue, 0),
        horizonDays: DUE_SOON_DAYS,
        dueSoon,
      };
    },

    get: (auth, id) => load(deps, id, auth, { write: false }),

    async create(auth, input) {
      const draft = createProject({
        ownerId: resolveOwnerId(auth, input.ownerId),
        actorId: actorOf(auth),
        name: input.name,
        description: input.description,
        status: input.status,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      });

      return unitOfWork.run(async (tx) => {
        const project = await repository.insert(draft, tx);
        await events.record({ type: 'project.created', project, auth, key: EVENT_KEYS.created(project) }, tx);
        return project;
      });
    },

    async update(auth, id, input) {
      const current = await load(deps, id, auth, { write: true });
      const { changes, statusChanged } = applyChanges(current, input);

      return unitOfWork.run(async (tx) => {
        const project = await repository.update(id, changes, actorOf(auth), tx);
        if (!project) throw DomainErrors.notFound('Project');
        const type = statusChanged ? 'project.status_changed' : 'project.updated';
        await events.record(
          { type, project, auth, extra: { changes, previousStatus: current.status }, key: EVENT_KEYS.mutated(type, project) },
          tx,
        );
        return project;
      });
    },

    async remove(auth, id) {
      const project = await load(deps, id, auth, { write: true });
      await unitOfWork.run(async (tx) => {
        await repository.softDelete(id, actorOf(auth), tx);
        await events.record({ type: 'project.deleted', project, auth, key: EVENT_KEYS.deleted(project) }, tx);
      });
    },
  };
};
