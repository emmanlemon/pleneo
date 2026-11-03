import { config } from '#config';
import { query } from '#infra/database/pool.js';
import * as jobs from '#queue/job.repository.js';

export async function maintenanceHandler(_job, { logger }) {
  const recovered = await jobs.recoverStale(config.JOB_LOCK_TIMEOUT_SECONDS);
  const pruned = await jobs.prune(config.JOB_RETENTION_DAYS);
  const { rowCount: prunedEvents } = await query(
    `DELETE FROM events e WHERE e.created_at < now() - ($1 || ' days')::interval AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.event_id = e.id AND j.status IN ('pending', 'running'))`,
    [String(config.JOB_RETENTION_DAYS * 2)],
  );
  logger.info({ recovered, pruned, prunedEvents }, 'maintenance completed');
}
