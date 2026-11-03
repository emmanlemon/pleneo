import { DomainErrors } from '#common/errors/domain-errors.js';
import { created, noContent, ok } from '#common/http/respond.js';
import { actorOf } from '#common/middleware/authenticate.js';
import { encrypt, randomToken } from '#infra/security/crypto.js';
import * as subscriptions from './subscription.repository.js';

export const list = async (_req, res) => {
  const [rows, stats] = await Promise.all([subscriptions.listAll(), subscriptions.deliveryStats()]);
  const byId = new Map();
  for (const s of stats) byId.set(s.subscription_id, { ...(byId.get(s.subscription_id) ?? {}), [s.status]: s.count });
  ok(res, { subscriptions: rows.map((s) => ({ ...s, deliveries24h: byId.get(s.id) ?? {} })) });
};

export const create = async (req, res) => {
  const secret = req.body.secret ?? randomToken(48);
  const subscription = await subscriptions.create({
    name: req.body.name,
    description: req.body.description,
    url: req.body.url,
    secretEnc: encrypt(secret),
    eventTypes: req.body.eventTypes,
    createdBy: actorOf(req.auth),
  });
  created(res, { ...subscription, secret });
};

export const update = async (req, res) => {
  const { secret, eventTypes, ...rest } = req.body;
  const subscription = await subscriptions.update(req.params.id, {
    ...rest,
    eventTypes,
    secretEnc: secret ? encrypt(secret) : undefined,
  });
  if (!subscription) throw DomainErrors.notFound('Subscription');
  ok(res, subscription);
};

export const remove = async (req, res) => {
  if (!(await subscriptions.remove(req.params.id))) throw DomainErrors.notFound('Subscription');
  noContent(res);
};
