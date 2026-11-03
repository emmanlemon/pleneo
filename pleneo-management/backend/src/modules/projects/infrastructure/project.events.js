import * as outbox from '#infra/messaging/outbox.repository.js';
import { actorOf } from '../domain/project-access.js';

const payloadFor = (project, auth, extra) => ({
  projectId: project.id,
  ownerId: project.ownerId,
  name: project.name,
  status: project.status,
  actorId: actorOf(auth),
  actorEmail: auth.email ?? null,
  ...extra,
});

export const record = ({ type, project, auth, extra = {}, key }, client) =>
  outbox.add({ type, payload: payloadFor(project, auth, extra), idempotencyKey: key }, client);
