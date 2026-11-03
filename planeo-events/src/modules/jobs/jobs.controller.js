import { ok } from '#common/http/respond.js';
import { actorOf } from '#common/middleware/authenticate.js';
import * as queue from '#queue/queue.service.js';

export const enqueue = async (req, res) => {
  const { job, duplicate } = await queue.enqueue({ ...req.body, createdBy: actorOf(req.auth) });
  res.status(duplicate ? 200 : 202).json({ jobId: job.id, status: job.status, runAt: job.run_at, duplicate });
};

export const list = async (req, res) => {
  const jobs = await queue.listJobs(req.query);
  ok(res, { jobs, nextBefore: jobs.length === req.query.limit ? jobs.at(-1).created_at : null });
};

export const get = async (req, res) => ok(res, await queue.getJob(req.params.id));
export const retry = async (req, res) => ok(res, await queue.retryJob(req.params.id));
export const cancel = async (req, res) => ok(res, await queue.cancelJob(req.params.id));
