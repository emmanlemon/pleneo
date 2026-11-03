import { withTransaction } from '#infra/database/pool.js';
import { logger } from '#infra/logging/logger.js';
import { enqueue } from '#queue/queue.service.js';
import { nextCronRun } from './cron.js';
import * as schedules from './schedule.repository.js';

const TICK_MS = 15_000;
const log = logger.child({ component: 'scheduler' });

export async function runDueSchedules() {
  return withTransaction(async (client) => {
    const due = await schedules.claimDue(client);
    for (const schedule of due) {
      const slot = new Date(schedule.next_run_at).toISOString();
      const { job } = await enqueue(
        {
          queue: schedule.queue,
          type: schedule.job_type,
          payload: { ...schedule.payload, scheduledFor: slot },
          scheduleId: schedule.id,
          idempotencyKey: `schedule:${schedule.id}:${slot}`,
          createdBy: 'scheduler',
        },
        client,
      );
      await schedules.markRun(client, schedule.id, {
        nextRunAt: nextCronRun(schedule.cron, { timezone: schedule.timezone }),
        jobId: job?.id,
      });
      log.info({ schedule: schedule.name, jobId: job?.id, slot }, 'schedule fired');
    }
    return due.length;
  });
}

export async function triggerSchedule(schedule, actor) {
  const { job } = await enqueue({
    queue: schedule.queue,
    type: schedule.job_type,
    payload: { ...schedule.payload, triggeredBy: actor },
    scheduleId: schedule.id,
    priority: 10,
    createdBy: actor,
  });
  return job;
}

let timer = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await runDueSchedules();
  } catch (err) {
    log.error({ err }, 'scheduler tick failed');
  } finally {
    ticking = false;
  }
}

export function startScheduler() {
  timer = setInterval(tick, TICK_MS).unref();
  setTimeout(tick, 2_000).unref();
  log.info('scheduler started');
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}
