import { Router } from 'express';
import { z } from 'zod';
import * as r from '#common/validation/rules.js';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticateDevice } from '#common/middleware/authenticate-device.js';
import { deviceLimiter, provisioningLimiter } from '#common/middleware/rate-limit.js';
import { body, params } from '#common/validation/validator.js';
import { validateActivate } from '#modules/devices/devices.validators.js';
import { validateIngest, validateReportedState } from '#modules/telemetry/telemetry.validators.js';
import * as c from './device.controller.js';

export const ackSchema = r.strictObject({
  status: z.enum(['acknowledged', 'failed']).default('acknowledged'),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().trim().max(500).optional(),
});

const validateAck = body(ackSchema);

export const deviceApiRouter = Router();

deviceApiRouter.post('/activate', provisioningLimiter, validateActivate, h(c.activate));

deviceApiRouter.use(authenticateDevice, deviceLimiter);

deviceApiRouter.get('/me', h(c.whoami));
deviceApiRouter.post('/telemetry', validateIngest, h(c.ingestTelemetry));
deviceApiRouter.post('/heartbeat', h(c.heartbeat));
deviceApiRouter.get('/commands', h(c.fetchCommands));
deviceApiRouter.post('/commands/:id/ack', params(z.object({ id: r.uuid })), validateAck, h(c.acknowledgeCommand));
deviceApiRouter.get('/state', h(c.getState));
deviceApiRouter.put('/state/reported', validateReportedState, h(c.reportState));
deviceApiRouter.delete('/me', h(c.deregister));
