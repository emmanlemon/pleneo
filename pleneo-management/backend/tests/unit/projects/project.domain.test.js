import { describe, expect, it } from 'vitest';
import { ADMIN_PERMISSIONS } from '../../helpers/principal.js';
import { allowedNextStatuses, canTransition, PROJECT_STATUSES } from '#modules/projects/domain/project-status.js';
import { applyChanges, createProject, isOwnedBy, toResponse } from '#modules/projects/domain/project.js';
import { assertCanAccess, resolveOwnerId } from '#modules/projects/domain/project-access.js';

const OWNER = 'owner-1';
const draft = (overrides = {}) => ({
  ownerId: OWNER,
  actorId: OWNER,
  name: 'Launch',
  description: '',
  status: 'planning',
  startsOn: null,
  endsOn: null,
  ...overrides,
});
const stored = (overrides = {}) => ({ id: 'p1', ...draft(), ...overrides });

const user = (overrides = {}) => ({ type: 'user', userId: OWNER, roles: ['user'], permissions: [], ...overrides });
const admin = () => user({ roles: ['admin', 'user'], permissions: ADMIN_PERMISSIONS });
const client = (scopes = []) => ({ type: 'client', clientId: 'c1', roles: [], scopes, permissions: scopes });

describe('creation invariants', () => {
  it('accepts a well formed draft', () => {
    expect(createProject(draft())).toMatchObject({ ownerId: OWNER, status: 'planning' });
  });

  it('refuses an unknown status', () => {
    expect(() => createProject(draft({ status: 'nope' }))).toThrow(/Unknown status/);
  });

  it('refuses an end date before the start date', () => {
    expect(() => createProject(draft({ startsOn: '2026-05-01', endsOn: '2026-04-01' }))).toThrow(/End date/);
  });

  it('allows an open ended range', () => {
    expect(createProject(draft({ startsOn: '2026-05-01' })).endsOn).toBeNull();
  });

  it('refuses a draft with no owner', () => {
    expect(() => createProject(draft({ ownerId: null }))).toThrow(/owner must be named/i);
  });
});

describe('status transitions', () => {
  it('enumerates where a project may go next, including staying put', () => {
    expect(allowedNextStatuses('planning')).toEqual(['planning', 'active', 'on_hold', 'archived']);
    expect(allowedNextStatuses('completed')).toEqual(['completed', 'active', 'archived']);
  });

  it('treats an unchanged status as allowed', () => {
    for (const status of PROJECT_STATUSES) expect(canTransition(status, status)).toBe(true);
  });

  it('forbids skipping straight from completed back to on_hold', () => {
    expect(canTransition('completed', 'on_hold')).toBe(false);
    expect(() => applyChanges(stored({ status: 'completed' }), { status: 'on_hold' })).toThrow(/cannot move/);
  });

  it('lets an archived project be revived rather than trapping it', () => {
    expect(canTransition('archived', 'active')).toBe(true);
    expect(canTransition('archived', 'planning')).toBe(true);
  });

  it('reports whether the status actually moved', () => {
    expect(applyChanges(stored(), { status: 'active' }).statusChanged).toBe(true);
    expect(applyChanges(stored(), { status: 'planning' }).statusChanged).toBe(false);
    expect(applyChanges(stored(), { name: 'Renamed' }).statusChanged).toBe(false);
  });
});

describe('applying changes', () => {
  it('keeps only the mutable fields', () => {
    const { changes } = applyChanges(stored(), { name: 'Renamed', ownerId: 'someone-else', id: 'hacked' });
    expect(changes).toEqual({ name: 'Renamed' });
  });

  it('validates a partial date change against the stored value', () => {
    expect(() => applyChanges(stored({ startsOn: '2026-05-01' }), { endsOn: '2026-04-01' })).toThrow(/End date/);
  });

  it('refuses a change set that touches nothing', () => {
    expect(() => applyChanges(stored(), { nothing: true })).toThrow(/At least one field/);
  });

  it('does not mutate the project it was given', () => {
    const current = stored();
    applyChanges(current, { name: 'Renamed' });
    expect(current.name).toBe('Launch');
  });
});

describe('access policy', () => {
  it('lets an owner read and write their own project', () => {
    expect(isOwnedBy(stored(), OWNER)).toBe(true);
    expect(() => assertCanAccess(stored(), user(), { write: true })).not.toThrow();
  });

  it('refuses a stranger', () => {
    expect(() => assertCanAccess(stored(), user({ userId: 'other' }), { write: false })).toThrow(/do not have access/);
  });

  it('lets an admin through either way', () => {
    expect(() => assertCanAccess(stored(), admin(), { write: true })).not.toThrow();
  });

  it('separates a read scope from a write scope', () => {
    const reader = client(['projects:read']);
    expect(() => assertCanAccess(stored(), reader, { write: false })).not.toThrow();
    expect(() => assertCanAccess(stored(), reader, { write: true })).toThrow(/do not have access/);
  });

  it('makes a client name an owner instead of silently producing none', () => {
    expect(() => resolveOwnerId(client(['projects:write']), undefined)).toThrow(/owner must be named/i);
    expect(resolveOwnerId(client(['projects:write']), 'target')).toBe('target');
  });

  it('refuses an unprivileged caller trying to create for someone else', () => {
    expect(() => resolveOwnerId(user(), 'someone-else')).toThrow(/do not have access/);
    expect(resolveOwnerId(user(), OWNER)).toBe(OWNER);
  });
});

describe('serialisation', () => {
  it('presents the snake_case wire shape the API has always returned', () => {
    const body = toResponse({ ...stored(), createdBy: OWNER, updatedBy: OWNER, createdAt: 'a', updatedAt: 'b' });
    expect(Object.keys(body)).toEqual([
      'id',
      'owner_id',
      'name',
      'description',
      'status',
      'starts_on',
      'ends_on',
      'created_by',
      'updated_by',
      'created_at',
      'updated_at',
    ]);
  });
});
