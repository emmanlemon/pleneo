import { created, noContent, ok } from '#common/http/respond.js';
import * as service from './projects.service.js';

export const list = async (req, res) => ok(res, await service.listProjects(req.auth, req.query));
export const get = async (req, res) => ok(res, await service.getProject(req.auth, req.params.id));
export const create = async (req, res) => created(res, await service.createProject(req.auth, req.body));
export const update = async (req, res) => ok(res, await service.updateProject(req.auth, req.params.id, req.body));
export const remove = async (req, res) => {
  await service.deleteProject(req.auth, req.params.id);
  noContent(res);
};
