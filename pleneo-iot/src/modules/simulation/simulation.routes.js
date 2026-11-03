import { Router } from 'express';
import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import { ok } from '#common/http/respond.js';
import { body, params, validate } from '#common/validation/validator.js';
import * as service from './simulation.service.js';

const idParams = z.object({ id: r.uuid });

export const startSimulationSchema = r.strictObject({
  intervalMs: z.coerce.number().int().min(250).max(60_000).optional(),
  spike: z.boolean().default(false),
});

export const simulationRouter = Router();

simulationRouter.get('/:id/simulation', params(idParams), h(async (req, res) => ok(res, await service.simulationStatus(req.auth, req.params.id))));

simulationRouter.post(
  '/:id/simulation',
  writeLimiter,
  validate({ params: idParams, body: startSimulationSchema }),
  h(async (req, res) => ok(res, await service.startSimulation(req.auth, req.params.id, req.body))),
);

simulationRouter.delete('/:id/simulation', writeLimiter, params(idParams), h(async (req, res) => ok(res, await service.stopSimulation(req.auth, req.params.id))));
