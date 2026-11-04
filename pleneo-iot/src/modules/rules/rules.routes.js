import { Router } from 'express';
import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { created, noContent, ok } from '#common/http/respond.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import { body, params, query, validate } from '#common/validation/validator.js';
import { actorOf } from '#modules/devices/access.js';
import { metricKey } from '#modules/devices/devices.validators.js';
import * as rules from './rule.repository.js';
import { invalidateRuleCache } from './rules.engine.js';

const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const SEVERITIES = ['info', 'warning', 'critical'];
const idParams = z.object({ id: r.uuid });

const validateCreate = body(
  r
    .strictObject({
      name: r.name,
      description: r.description.default(''),
      deviceTypeId: r.uuid.optional(),
      deviceId: r.uuid.optional(),
      metric: metricKey,
      operator: z.enum(OPERATORS),
      threshold: z.number().refine(Number.isFinite, 'Must be a finite number'),
      severity: z.enum(SEVERITIES).default('warning'),
      cooldownSeconds: z.number().int().min(0).max(86_400).default(300),
      enabled: z.boolean().default(true),
    })
    .refine((v) => v.deviceTypeId || v.deviceId, {
      message: 'Provide deviceTypeId or deviceId',
      path: ['deviceTypeId'],
    }),
);

const validateUpdate = validate({
  params: idParams,
  body: r
    .strictObject({
      name: r.name.optional(),
      description: r.description.optional(),
      operator: z.enum(OPERATORS).optional(),
      threshold: z.number().optional(),
      severity: z.enum(SEVERITIES).optional(),
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
      enabled: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' }),
});

const validateList = query(
  z.object({ deviceId: r.uuid.optional(), deviceTypeId: r.uuid.optional(), metric: metricKey.optional() }),
);

export const rulesRouter = Router();
rulesRouter.use(requirePermission('rules:manage'));

rulesRouter.get(
  '/',
  validateList,
  h(async (req, res) => ok(res, { rules: await rules.listAll(req.query) })),
);

rulesRouter.post(
  '/',
  writeLimiter,
  validateCreate,
  h(async (req, res) => {
    const rule = await rules.create({ ...req.body, actorId: actorOf(req.auth) });
    invalidateRuleCache();
    created(res, rule);
  }),
);

rulesRouter.patch(
  '/:id',
  writeLimiter,
  validateUpdate,
  h(async (req, res) => {
    const rule = await rules.update(req.params.id, req.body);
    if (!rule) throw DomainErrors.notFound('Rule');
    invalidateRuleCache();
    ok(res, rule);
  }),
);

rulesRouter.delete(
  '/:id',
  writeLimiter,
  params(idParams),
  h(async (req, res) => {
    if (!(await rules.remove(req.params.id))) throw DomainErrors.notFound('Rule');
    invalidateRuleCache();
    noContent(res);
  }),
);
