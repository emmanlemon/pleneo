import http from 'node:http';
import { createApp } from './app.js';
import { config } from '#config';
import { closePool, healthCheck } from '#infra/database/pool.js';
import { loadKeys } from '#infra/security/signing-keys.js';
import { logger } from '#infra/logging/logger.js';
import { startScheduler, stopScheduler } from '#infra/jobs/scheduler.js';

async function main() {
  await healthCheck();
  await loadKeys(true);

  const server = http.createServer(createApp());
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;

  server.listen(config.PORT, config.HOST, () => {
    logger.info({ port: config.PORT, host: config.HOST, env: config.NODE_ENV }, 'authzero listening');
  });

  startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
    stopScheduler();
    server.close(async () => {
      await closePool().catch(() => {});
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
