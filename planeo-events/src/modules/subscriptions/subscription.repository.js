import { query } from '#infra/database/pool.js';

const PUBLIC = `id, name, description, url, event_types, status, created_by, created_at, updated_at`;

export const listAll = async () => (await query(`SELECT ${PUBLIC} FROM subscriptions ORDER BY name`)).rows;

export const listActive = async (client = { query }) =>
  (await client.query(`SELECT id, name, url, event_types FROM subscriptions WHERE status = 'active'`)).rows;

export const findById = async (id) =>
  (await query(`SELECT ${PUBLIC}, secret_enc FROM subscriptions WHERE id = $1`, [id])).rows[0] ?? null;

export const findByName = async (name) =>
  (await query(`SELECT ${PUBLIC} FROM subscriptions WHERE name = $1`, [name])).rows[0] ?? null;

export const create = async ({ name, description, url, secretEnc, eventTypes, createdBy }) =>
  (
    await query(
      `INSERT INTO subscriptions (name, description, url, secret_enc, event_types, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PUBLIC}`,
      [name, description, url, secretEnc, eventTypes, createdBy ?? null],
    )
  ).rows[0];

export const update = async (id, { description, url, secretEnc, eventTypes, status }) =>
  (
    await query(
      `UPDATE subscriptions
          SET description = COALESCE($2, description), url = COALESCE($3, url), secret_enc = COALESCE($4, secret_enc),
              event_types = COALESCE($5, event_types), status = COALESCE($6, status)
        WHERE id = $1 RETURNING ${PUBLIC}`,
      [id, description ?? null, url ?? null, secretEnc ?? null, eventTypes ?? null, status ?? null],
    )
  ).rows[0] ?? null;

export const setStatus = (id, status) => query(`UPDATE subscriptions SET status = $2 WHERE id = $1`, [id, status]);

export const remove = async (id) => (await query(`DELETE FROM subscriptions WHERE id = $1`, [id])).rowCount > 0;

export const deliveryStats = async () =>
  (
    await query(
      `SELECT subscription_id, status, count(*)::int AS count FROM jobs
        WHERE type = 'webhook.deliver' AND created_at > now() - interval '24 hours' GROUP BY subscription_id, status`,
    )
  ).rows;
