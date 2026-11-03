import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { alertsRouter } from '#modules/alerts/alerts.routes.js';
import { commandsRouter, deviceCommandsRouter } from '#modules/commands/commands.routes.js';
import { deviceApiRouter } from '#modules/device-api/device.routes.js';
import { devicesRouter } from '#modules/devices/devices.routes.js';
import { rulesRouter } from '#modules/rules/rules.routes.js';
import { telemetryRouter } from '#modules/telemetry/telemetry.routes.js';
import { docsRouter } from './docs.routes.js';
import * as system from './system.controller.js';

export const router = Router();

router.use(docsRouter);
router.get('/health', system.health);
router.get('/ready', h(system.ready));
router.get('/capabilities', system.capabilities);

router.use('/v1/device', deviceApiRouter);

router.use('/v1/devices', authenticate, deviceCommandsRouter, telemetryRouter, devicesRouter);
router.use('/v1/commands', authenticate, commandsRouter);
router.use('/v1/rules', authenticate, rulesRouter);
router.use('/v1/alerts', authenticate, alertsRouter);
