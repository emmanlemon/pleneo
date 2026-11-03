import { query } from '#infra/database/pool.js';

export const PUBLIC_COLUMNS = `id, email, email_verified, name, status, mfa_enabled, last_login_at, created_at, updated_at`;

export const findByEmail = async (email, client = { query }) =>
  (await client.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email])).rows[0] ?? null;

export const findById = async (id, client = { query }) =>
  (await client.query(`SELECT * FROM users WHERE id = $1`, [id])).rows[0] ?? null;

export const findPublicById = async (id) =>
  (await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id])).rows[0] ?? null;

export const create = async ({ email, passwordHash, name }, client = { query }) =>
  (
    await client.query(`INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *`, [
      email,
      passwordHash,
      name ?? null,
    ])
  ).rows[0];

export const updateProfile = async (userId, { name }) =>
  (
    await query(`UPDATE users SET name = COALESCE($2, name) WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [
      userId,
      name ?? null,
    ])
  ).rows[0];

export const markEmailVerified = (userId, client = { query }) =>
  client.query(`UPDATE users SET email_verified = TRUE WHERE id = $1`, [userId]);

export async function list({ cursor, limit, search }) {
  const params = [limit];
  const conditions = [];
  if (cursor) conditions.push(`id > $${params.push(cursor)}`);
  if (search) conditions.push(`(email ILIKE $${params.push(`%${search}%`)} OR name ILIKE $${params.length})`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (
    await query(
      `SELECT ${PUBLIC_COLUMNS}, failed_login_attempts, locked_until FROM users ${where} ORDER BY id LIMIT $1`,
      params,
    )
  ).rows;
}

export const findAdminView = async (userId) =>
  (
    await query(
      `SELECT ${PUBLIC_COLUMNS}, failed_login_attempts, locked_until, password_changed_at FROM users WHERE id = $1`,
      [userId],
    )
  ).rows[0] ?? null;
