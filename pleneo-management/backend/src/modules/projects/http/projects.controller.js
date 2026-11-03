import { created, noContent, ok } from '#common/http/respond.js';
import { allowedNextStatuses } from '../domain/project-status.js';
import { toResponse } from '../domain/project.js';

const present = (project) => ({ ...toResponse(project), allowed_transitions: allowedNextStatuses(project.status) });

export const makeController = (useCases) => ({
  list: async (req, res) => {
    const { projects, nextCursor } = await useCases.list(req.auth, req.query);
    ok(res, { projects: projects.map(present), nextCursor });
  },
  summary: async (req, res) => {
    const summary = await useCases.summary(req.auth);
    ok(res, { ...summary, dueSoon: summary.dueSoon.map(present) });
  },
  get: async (req, res) => ok(res, present(await useCases.get(req.auth, req.params.id))),
  create: async (req, res) => created(res, present(await useCases.create(req.auth, req.body))),
  update: async (req, res) => ok(res, present(await useCases.update(req.auth, req.params.id, req.body))),
  remove: async (req, res) => {
    await useCases.remove(req.auth, req.params.id);
    noContent(res);
  },
});
