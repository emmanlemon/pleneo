import http from 'node:http';
import { config } from '#config';
import { closePool, healthCheck } from '#infra/database/pool.js';
import { closeEmailProvider } from '#infra/email/provider.js';
import { logger } from '#infra/logging/logger.js';
import { createWorker } from '#queue/worker.js';
import { startScheduler, stopScheduler } from '#scheduler/scheduler.js';
import { createApp } from './app.js';

async function main() {
  await healthCheck();
  const server = http.createServer(createApp());
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.listen(config.PORT, config.HOST, () =>
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'pleneo-events listening'),
  );

  const worker = config.WORKER_ENABLED ? createWorker() : null;
  worker?.start();
  if (config.SCHEDULER_ENABLED) startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => process.exit(1), 30_000).unref();
    stopScheduler();
    server.close();
    await worker?.stop();
    await closeEmailProvider();
    await closePool().catch(() => {});
    clearTimeout(forceExit);
    process.exit(0);
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
