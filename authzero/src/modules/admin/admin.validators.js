import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { isPermission } from '#modules/users/catalogue.js';
import { body, params, query, validate } from '#common/validation/validator.js';

const idParams = z.object({ id: r.uuid });

export const validateId = params(idParams);

export const validateUserList = query(
  r.pagination(200).extend({ cursor: r.uuid.optional(), search: r.searchTerm.optional() }),
);

export const validateUserStatus = validate({
  params: idParams,
  body: r.strictObject({ status: z.enum(['active', 'disabled']) }),
});

export const validateInviteUser = body(
  r.strictObject({ email: r.email, name: r.displayName.optional(), roles: z.array(r.roleName).max(10).default([]) }),
);

export const validateGrantRole = validate({ params: idParams, body: r.strictObject({ role: r.roleName }) });

export const validateRevokeRole = params(idParams.extend({ role: r.roleName }));

export const validateCreateClient = body(
  r.strictObject({
    name: r.displayName,
    scopes: z.array(r.scope.refine(isPermission, 'Unknown scope')).max(50).default([]),
  }),
);

export const validateAuditQuery = query(
  r.pagination(500).extend({
    actorId: z.string().max(128).optional(),
    targetId: z.string().max(128).optional(),
    action: z.string().max(128).optional(),
    before: z.coerce.number().int().positive().optional(),
  }),
);
