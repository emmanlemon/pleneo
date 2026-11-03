import { query } from '#infra/database/pool.js';

export async function overview() {
  const [{ rows: byQueue }, { rows: throughput }, { rows: oldest }, { rows: types }] = await Promise.all([
    query(`SELECT queue, status, count(*)::int AS count FROM jobs GROUP BY queue, status`),
    query(
      `SELECT date_trunc('minute', finished_at) AS minute,
              count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
              count(*) FILTER (WHERE status = 'dead')::int AS dead
         FROM jobs WHERE finished_at > now() - interval '60 minutes'
        GROUP BY 1 ORDER BY 1`,
    ),
    query(
      `SELECT queue, min(run_at) AS oldest_pending FROM jobs WHERE status = 'pending' AND run_at <= now() GROUP BY queue`,
    ),
    query(
      `SELECT type, status, count(*)::int AS count FROM jobs WHERE created_at > now() - interval '24 hours' GROUP BY type, status ORDER BY type`,
    ),
  ]);

  const queues = {};
  for (const row of byQueue) {
    queues[row.queue] ??= {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      cancelled: 0,
      oldestPending: null,
    };
    queues[row.queue][row.status] = row.count;
  }
  for (const row of oldest) if (queues[row.queue]) queues[row.queue].oldestPending = row.oldest_pending;

  return { queues, throughput, types, generatedAt: new Date().toISOString() };
}
