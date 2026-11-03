import { config } from '#config';
import { createGmailProvider } from './gmail.provider.js';
import { createLogProvider } from './log.provider.js';
import { createMailtrapProvider } from './mailtrap.provider.js';

const factories = { log: createLogProvider, gmail: createGmailProvider, mailtrap: createMailtrapProvider };

let instance;
export function getEmailProvider() {
  instance ??= factories[config.EMAIL_PROVIDER]();
  return instance;
}

export const closeEmailProvider = () => instance?.close?.();
