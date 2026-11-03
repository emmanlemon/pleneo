import { config } from '#config';
import { ok } from '#common/http/respond.js';
import { healthCheck } from '#infra/database/pool.js';
import { handlerTypes } from '#queue/handlers/index.js';
import { templateNames } from '#notifications/templates.js';
import { internalEventTypes } from '#modules/events/internal-handlers.js';

export const health = (_req, res) => ok(res, { status: 'ok' });

export const ready = async (_req, res) => {
  await healthCheck().then(
    () => ok(res, { status: 'ready' }),
    () => res.status(503).json({ status: 'unavailable' }),
  );
};

export const capabilities = (_req, res) =>
  ok(res, {
    jobTypes: handlerTypes(),
    emailTemplates: templateNames(),
    internalEventTypes: internalEventTypes(),
    emailProvider: config.EMAIL_PROVIDER,
    queues: config.WORKER_QUEUES,
  });
