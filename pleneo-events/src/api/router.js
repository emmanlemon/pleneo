import { Router } from 'express';
import { adminRouter } from '#modules/admin/admin.routes.js';
import { eventsRouter } from '#modules/events/events.routes.js';
import { ingestRouter } from '#modules/ingest/authzero.routes.js';
import { jobsRouter } from '#modules/jobs/jobs.routes.js';
import { docsRouter } from './docs.routes.js';
import { systemRouter } from './system.routes.js';

export const router = Router();

router.use(docsRouter);
router.use(systemRouter);
router.use('/v1/events', eventsRouter);
router.use('/v1/jobs', jobsRouter);
router.use('/v1/ingest', ingestRouter);
router.use('/v1/admin', adminRouter);
