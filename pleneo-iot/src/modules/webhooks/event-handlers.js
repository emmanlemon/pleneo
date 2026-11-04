import { logger } from '#infra/logging/logger.js';
import * as devices from '#modules/devices/device.repository.js';

export const handlers = {
  'project.deleted': async (event, client) => {
    const released = await devices.releaseProject(event.payload.projectId, client);
    logger.info({ projectId: event.payload.projectId, released: released.length }, 'project released its devices');
  },
};

export const handleEvent = async (event, client) => {
  const handler = handlers[event.type];
  if (!handler) return false;
  await handler(event, client);
  return true;
};
