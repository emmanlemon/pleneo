import { DomainErrors } from '#common/errors/domain-errors.js';
import { actorOf, assertCanAccess, resolveOwnerId, visibleOwnerId } from '../domain/project-access.js';
import { applyChanges, createProject } from '../domain/project.js';

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
