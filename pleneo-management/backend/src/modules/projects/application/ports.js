/**
 * Contracts the application layer depends on. Adapters in `infrastructure/` implement them;
 * nothing here may import a driver, a transport or `#infra/*`.
 *
 * @typedef {object} ProjectRepository
 * @property {(filter: { ownerId: string|null, status?: string, search?: string, cursor?: string, limit: number }) => Promise<object[]>} list
 * @property {(id: string) => Promise<object|null>} findById
 * @property {(project: object, tx?: object) => Promise<object>} insert
 * @property {(id: string, changes: object, actorId: string, tx?: object) => Promise<object|null>} update
 * @property {(id: string, actorId: string, tx?: object) => Promise<boolean>} softDelete
 *
 * @typedef {object} ProjectEvents
 * @property {(event: { type: string, project: object, auth: object, extra?: object, key: string }, tx: object) => Promise<void>} record
 *
 * @typedef {object} UnitOfWork
 * @property {<T>(work: (tx: object) => Promise<T>) => Promise<T>} run
 *
 * @typedef {{ repository: ProjectRepository, events: ProjectEvents, unitOfWork: UnitOfWork }} ProjectDeps
 */
export {};
