import pg from 'pg';
import { config } from '#config';
import { logger } from '#infra/logging/logger.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  application_name: 'authzero',
});

pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  await pool.query('SELECT 1');
}

export const closePool = () => pool.end();
