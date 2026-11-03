import { query } from '#infra/database/pool.js';

const COLUMNS = `id, owner_id, name, description, status, starts_on, ends_on, created_by, updated_by, created_at, updated_at`;

export async function list({ ownerId, status, search, cursor, limit }) {
  const params = [limit];
  const conditions = ['deleted_at IS NULL'];
  if (ownerId) conditions.push(`owner_id = $${params.push(ownerId)}`);
  if (status) conditions.push(`status = $${params.push(status)}`);
  if (search) conditions.push(`name ILIKE $${params.push(`%${search}%`)}`);
  if (cursor) conditions.push(`id > $${params.push(cursor)}`);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM projects WHERE ${conditions.join(' AND ')} ORDER BY id LIMIT $1`,
    params,
  );
  return rows;
}

export const findById = async (id) =>
  (await query(`SELECT ${COLUMNS} FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0] ?? null;

export const create = async ({ ownerId, name, description, status, startsOn, endsOn, actorId }, client = { query }) =>
  (
    await client.query(
      `INSERT INTO projects (owner_id, name, description, status, starts_on, ends_on, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING ${COLUMNS}`,
      [ownerId, name, description, status, startsOn, endsOn, actorId],
    )
  ).rows[0];

export const update = async (id, { name, description, status, startsOn, endsOn, actorId }, client = { query }) =>
  (
    await client.query(
      `UPDATE projects
          SET name = COALESCE($2, name),
              description = COALESCE($3, description),
              status = COALESCE($4, status),
              starts_on = CASE WHEN $7 THEN $5 ELSE starts_on END,
              ends_on = CASE WHEN $8 THEN $6 ELSE ends_on END,
              updated_by = $9
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${COLUMNS}`,
      [
        id,
        name ?? null,
        description ?? null,
        status ?? null,
        startsOn ?? null,
        endsOn ?? null,
        startsOn !== undefined,
        endsOn !== undefined,
        actorId,
      ],
    )
  ).rows[0] ?? null;

export const softDelete = async (id, actorId, client = { query }) =>
  (
    await client.query(`UPDATE projects SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`, [
      id,
      actorId,
    ])
  ).rowCount > 0;
