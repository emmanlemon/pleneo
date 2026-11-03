import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { ok } from '#common/http/respond.js';
import * as service from './telemetry.service.js';
import * as v from './telemetry.validators.js';

export const telemetryRouter = Router();

telemetryRouter.get(
  '/:id/latest',
  v.validateLatest,
  h(async (req, res) => ok(res, await service.latestFor(req.auth, req.params.id))),
);

telemetryRouter.get(
  '/:id/series',
  v.validateSeries,
  h(async (req, res) => ok(res, await service.seriesFor(req.auth, req.params.id, req.query))),
);
