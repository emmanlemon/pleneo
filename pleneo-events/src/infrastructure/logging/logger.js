import pino from 'pino';
import { config } from '#config';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.token', '*.accessToken', '*.client_secret'],
    censor: '[REDACTED]',
  },
  base: { service: 'pleneo-events' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
