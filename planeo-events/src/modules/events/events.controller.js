import { DomainErrors } from '#common/errors/domain-errors.js';
import { ok } from '#common/http/respond.js';
import { actorOf } from '#common/middleware/authenticate.js';
import * as service from './event.service.js';

export const publish = async (req, res) => {
  const source = req.auth.type === 'client' ? `client:${req.auth.clientId}` : `user:${req.auth.userId}`;
  const result = await service.publish({ ...req.body, source, createdBy: actorOf(req.auth) });
  res.status(result.duplicate ? 200 : 202).json({
    eventId: result.event.id,
    duplicate: result.duplicate,
    deliveries: result.deliveries,
    internal: result.internal ?? [],
  });
};

export const list = async (req, res) => {
  const events = await service.listEvents(req.query);
  ok(res, { events, nextBefore: events.length === req.query.limit ? events.at(-1).created_at : null });
};

export const get = async (req, res) => {
  const event = await service.getEvent(req.params.id);
  if (!event) throw DomainErrors.notFound('Event');
  ok(res, event);
};
