import http from 'node:http';
import { config } from '#config';
import { closePool, healthCheck } from '#infra/database/pool.js';
import { startScheduler, stopScheduler } from '#infra/jobs/scheduler.js';
import { logger } from '#infra/logging/logger.js';
import { startMqtt, stopMqtt } from '#infra/mqtt/broker.js';
import { createApp } from './app.js';

async function main() {
  await healthCheck();
  const server = http.createServer(createApp());
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.listen(config.PORT, config.HOST, () =>
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'pleneo-iot listening'),
  );
  startScheduler();
  await startMqtt();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => process.exit(1), 15_000).unref();
    stopScheduler();
    stopMqtt();
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
