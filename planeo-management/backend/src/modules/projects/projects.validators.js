import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { body, params, query } from '#common/validation/validator.js';

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'];
const status = z.enum(PROJECT_STATUSES);

export const projectListQuery = r
  .pagination(100)
  .extend({ status: status.optional(), search: r.searchTerm.optional() });

export const createProjectSchema = r.strictObject({
  name: r.name,
  description: r.description.default(''),
  status: status.default('planning'),
  startsOn: r.isoDate.nullable().default(null),
  endsOn: r.isoDate.nullable().default(null),
  ownerId: r.uuid.optional(),
});

export const updateProjectSchema = r
  .strictObject({
    name: r.name.optional(),
    description: r.description.optional(),
    status: status.optional(),
    startsOn: r.isoDate.nullable().optional(),
    endsOn: r.isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const validateId = params(z.object({ id: r.uuid }));
export const validateList = query(projectListQuery);
export const validateCreate = body(createProjectSchema);
export const validateUpdate = body(updateProjectSchema);
