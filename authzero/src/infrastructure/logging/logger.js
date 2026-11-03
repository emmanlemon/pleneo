import pino from 'pino';
import { config } from '#config';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.mfaToken',
      '*.clientSecret',
      '*.client_secret',
      '*.secret',
      '*.code',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'authzero' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
