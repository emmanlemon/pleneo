import { Router } from 'express';
import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { created, ok } from '#common/http/respond.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import { params, validate } from '#common/validation/validator.js';
import { jsonObject } from '#modules/devices/devices.validators.js';
import * as service from './commands.service.js';

export const COMMAND_STATUSES = ['pending', 'dispatched', 'acknowledged', 'failed', 'expired', 'cancelled'];
export const commandType = z
  .string()
  .regex(/^[a-z][a-z0-9_.-]{1,47}$/, 'Use lower-case letters, digits, dots, dashes or underscores');

const idParams = z.object({ id: r.uuid });

const validateIssue = validate({
  params: idParams,
  body: r.strictObject({
    type: commandType,
    payload: jsonObject.default({}),
    ttlSeconds: z.number().int().min(10).max(86_400).optional(),
  }),
});

const validateList = validate({
  params: idParams,
  query: z.object({
    status: z.enum(COMMAND_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
});

export const deviceCommandsRouter = Router();

deviceCommandsRouter.get(
  '/:id/commands',
  validateList,
  h(async (req, res) => ok(res, await service.listCommands(req.auth, req.params.id, req.query))),
);

deviceCommandsRouter.post(
  '/:id/commands',
  writeLimiter,
  validateIssue,
  h(async (req, res) => created(res, await service.issueCommand(req.auth, req.params.id, req.body))),
);

export const commandsRouter = Router();

commandsRouter.post(
  '/:id/cancel',
  writeLimiter,
  params(idParams),
  h(async (req, res) => ok(res, await service.cancelCommand(req.auth, req.params.id))),
);
