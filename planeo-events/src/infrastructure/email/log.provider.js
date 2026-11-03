import { logger } from '#infra/logging/logger.js';

export const createLogProvider = () => ({
  name: 'log',
  async send(message) {
    logger.info({ email: { to: message.to, subject: message.subject, text: message.text } }, 'email (log provider)');
    return { id: `log-${Date.now()}` };
  },
});
