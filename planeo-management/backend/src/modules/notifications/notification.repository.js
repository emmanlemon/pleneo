import { query } from '#infra/database/pool.js';

const COLUMNS = `id, user_id, type, title, body, data, read_at, created_at`;

export const insert = async ({ userId, type, title, body = '', data = {} }, client = { query }) =>
  (
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [userId, type, title, body, data],
    )
  ).rows[0];

export async function listForUser(userId, { limit, before, unreadOnly }) {
  const params = [userId, limit];
  const conditions = ['user_id = $1'];
  if (unreadOnly) conditions.push('read_at IS NULL');
  if (before) conditions.push(`created_at < $${params.push(before)}`);
  return (
    await query(
      `SELECT ${COLUMNS} FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $2`,
      params,
    )
  ).rows;
}

export const unreadCount = async (userId) =>
  (await query(`SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]))
    .rows[0].count;

export const markRead = async (userId, id) =>
  (
    await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $2 AND user_id = $1 RETURNING ${COLUMNS}`,
      [userId, id],
    )
  ).rows[0] ?? null;

export const markAllRead = async (userId) =>
  (await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId])).rowCount;

export const remove = async (userId, id) =>
  (await query(`DELETE FROM notifications WHERE id = $2 AND user_id = $1`, [userId, id])).rowCount > 0;
