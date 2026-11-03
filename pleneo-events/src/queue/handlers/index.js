import { emailSendHandler } from './email-send.handler.js';
import { maintenanceHandler } from './maintenance.handler.js';
import { webhookDeliverHandler } from './webhook-deliver.handler.js';

const registry = new Map([
  ['webhook.deliver', webhookDeliverHandler],
  ['email.send', emailSendHandler],
  ['queue.maintenance', maintenanceHandler],
]);

export const registerHandler = (type, handler) => registry.set(type, handler);
export const hasHandler = (type) => registry.has(type);
export const getHandler = (type) => {
  const handler = registry.get(type);
  if (!handler) throw new Error(`no handler for job type ${type}`);
  return handler;
};
export const handlerTypes = () => [...registry.keys()];
