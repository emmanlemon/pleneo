import { withTransaction } from '#infra/database/pool.js';
import { makeUseCases } from './application/project.use-cases.js';
import * as events from './infrastructure/project.events.js';
import * as repository from './infrastructure/project.repository.js';
import { makeController } from './http/projects.controller.js';
import { makeProjectsRouter } from './http/projects.routes.js';

export const projectUseCases = makeUseCases({ repository, events, unitOfWork: { run: withTransaction } });

export const projectsRouter = makeProjectsRouter(makeController(projectUseCases));

export { PROJECT_STATUSES, allowedNextStatuses, canTransition } from './domain/project-status.js';
export { READ_ALL_SCOPE, WRITE_ALL_SCOPE } from './domain/project-access.js';
export {
  createProjectSchema,
  projectListQuery,
  updateProjectSchema,
} from './http/projects.validators.js';
