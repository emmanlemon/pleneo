import { ok } from '#common/http/respond.js';
import { healthCheck } from '#infra/database/pool.js';

export const health = (_req, res) => ok(res, { status: 'ok' });

export const ready = async (_req, res) => {
  await healthCheck().then(
    () => ok(res, { status: 'ready' }),
    () => res.status(503).json({ status: 'unavailable' }),
  );
};
