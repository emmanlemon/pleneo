import { DomainErrors } from '#common/errors/domain-errors.js';
import { created, noContent, ok } from '#common/http/respond.js';
import { actorOf } from '#common/middleware/authenticate.js';
import { hasHandler } from '#queue/handlers/index.js';
import { nextCronRun } from '#scheduler/cron.js';
import * as schedules from '#scheduler/schedule.repository.js';
import { triggerSchedule } from '#scheduler/scheduler.js';

const assertHandler = (type) => {
  if (type && !hasHandler(type)) throw DomainErrors.unknownJobType(type);
};

export const list = async (_req, res) => ok(res, { schedules: await schedules.listAll() });

export const create = async (req, res) => {
  assertHandler(req.body.jobType);
  const schedule = await schedules.create({
    ...req.body,
    nextRunAt: nextCronRun(req.body.cron, { timezone: req.body.timezone }),
    createdBy: actorOf(req.auth),
  });
  created(res, schedule);
};

export const update = async (req, res) => {
  assertHandler(req.body.jobType);
  const current = await schedules.findById(req.params.id);
  if (!current) throw DomainErrors.notFound('Schedule');
  const cronChanged = req.body.cron !== undefined || req.body.timezone !== undefined;
  const nextRunAt = cronChanged
    ? nextCronRun(req.body.cron ?? current.cron, { timezone: req.body.timezone ?? current.timezone })
    : undefined;
  ok(res, await schedules.update(req.params.id, { ...req.body, nextRunAt }));
};

export const remove = async (req, res) => {
  if (!(await schedules.remove(req.params.id))) throw DomainErrors.notFound('Schedule');
  noContent(res);
};

export const run = async (req, res) => {
  const schedule = await schedules.findById(req.params.id);
  if (!schedule) throw DomainErrors.notFound('Schedule');
  const job = await triggerSchedule(schedule, actorOf(req.auth));
  res.status(202).json({ jobId: job.id });
};
