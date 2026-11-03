import { DomainErrors } from '#common/errors/domain-errors.js';
import { canTransition, isStatus } from './project-status.js';

const MUTABLE = ['name', 'description', 'status', 'startsOn', 'endsOn'];

function assertDateRange({ startsOn, endsOn }) {
  if (startsOn && endsOn && endsOn < startsOn) throw DomainErrors.invalidDateRange();
}

function assertStatus(status) {
  if (!isStatus(status)) throw DomainErrors.invalidStatus(status);
}

export function createProject({ ownerId, actorId, name, description, status, startsOn, endsOn }) {
  if (!ownerId) throw DomainErrors.ownerRequired();
  assertStatus(status);
  assertDateRange({ startsOn, endsOn });
  return Object.freeze({ ownerId, actorId, name, description, status, startsOn, endsOn });
}

export function applyChanges(project, changes) {
  const applied = Object.fromEntries(MUTABLE.filter((key) => key in changes).map((key) => [key, changes[key]]));
  if (!Object.keys(applied).length) throw DomainErrors.noChanges();

  if ('status' in applied) {
    assertStatus(applied.status);
    if (!canTransition(project.status, applied.status))
      throw DomainErrors.invalidStatusTransition(project.status, applied.status);
  }

  const next = Object.freeze({ ...project, ...applied });
  assertDateRange(next);
  return { project: next, changes: applied, statusChanged: next.status !== project.status };
}

export const isOwnedBy = (project, userId) => Boolean(userId) && project.ownerId === userId;

export const toResponse = (project) => ({
  id: project.id,
  owner_id: project.ownerId,
  name: project.name,
  description: project.description,
  status: project.status,
  starts_on: project.startsOn,
  ends_on: project.endsOn,
  created_by: project.createdBy,
  updated_by: project.updatedBy,
  created_at: project.createdAt,
  updated_at: project.updatedAt,
});
