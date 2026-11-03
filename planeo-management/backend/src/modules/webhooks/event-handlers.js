import { notify } from '#modules/notifications/notifications.service.js';

const projectLink = (projectId) => ({ href: `/projects/${projectId}`, projectId });

const emailFor = (payload, template) =>
  payload.actorEmail ? { to: payload.actorEmail, template, data: payload } : undefined;

export const handlers = {
  'project.created': (event, client) =>
    notify(
      {
        userId: event.payload.ownerId,
        type: 'project.created',
        title: `Project "${event.payload.name}" created`,
        body: 'Your project is ready. Add details and a timeline to get started.',
        data: projectLink(event.payload.projectId),
        email: emailFor(event.payload, 'project.created'),
      },
      client,
    ),

  'project.status_changed': (event, client) =>
    notify(
      {
        userId: event.payload.ownerId,
        type: 'project.status_changed',
        title: `"${event.payload.name}" is now ${event.payload.status.replace('_', ' ')}`,
        body: `Status changed from ${event.payload.previousStatus} to ${event.payload.status}.`,
        data: { ...projectLink(event.payload.projectId), status: event.payload.status },
        email: emailFor(event.payload, 'project.status-changed'),
      },
      client,
    ),

  'iot.alert.raised': (event, client) =>
    notify(
      {
        userId: event.payload.ownerId,
        type: 'iot.alert.raised',
        title: `${event.payload.severity === 'critical' ? 'Critical' : 'Alert'}: ${event.payload.deviceName}`,
        body: event.payload.message,
        data: {
          href: `/devices/${event.payload.deviceId}`,
          deviceId: event.payload.deviceId,
          severity: event.payload.severity,
        },
        email:
          event.payload.severity === 'critical'
            ? { to: event.payload.ownerEmail, template: 'iot.alert-raised', data: event.payload }
            : undefined,
      },
      client,
    ),

  'iot.device.offline': (event, client) =>
    notify(
      {
        userId: event.payload.ownerId,
        type: 'iot.device.offline',
        title: `${event.payload.deviceName} stopped reporting`,
        body: `No telemetry for ${event.payload.offlineAfterSeconds} seconds. Last seen ${event.payload.lastSeenAt ?? 'unknown'}.`,
        data: { href: `/devices/${event.payload.deviceId}`, deviceId: event.payload.deviceId },
      },
      client,
    ),

  'project.deleted': (event, client) =>
    notify(
      {
        userId: event.payload.ownerId,
        type: 'project.deleted',
        title: `Project "${event.payload.name}" was deleted`,
        body: 'The project was removed and is no longer visible.',
        data: { projectId: event.payload.projectId },
      },
      client,
    ),
};

export const handleEvent = async (event, client) => {
  const handler = handlers[event.type];
  if (!handler) return false;
  await handler(event, client);
  return true;
};
