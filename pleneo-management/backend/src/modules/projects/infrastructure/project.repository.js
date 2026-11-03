import { query } from '#infra/database/pool.js';

const COLUMNS = `id, owner_id, name, description, status, starts_on, ends_on, created_by, updated_by, created_at, updated_at`;

const toEntity = (row) =>
  row
    ? Object.freeze({
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        description: row.description,
        status: row.status,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    : null;

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
  return rows.map(toEntity);
}

export async function summarize({ ownerId, openStatuses, horizonDays, limit }) {
  const scoped = (params) => (ownerId ? ` AND owner_id = $${params.push(ownerId)}` : '');
  const countParams = [openStatuses];
  const dueParams = [openStatuses, horizonDays, limit];
  const [counts, due] = await Promise.all([
    query(
      `SELECT status, count(*)::int AS count,
              count(*) FILTER (WHERE status = ANY($1) AND ends_on < current_date)::int AS overdue
         FROM projects WHERE deleted_at IS NULL${scoped(countParams)} GROUP BY status`,
      countParams,
    ),
    query(
      `SELECT ${COLUMNS} FROM projects
        WHERE deleted_at IS NULL AND status = ANY($1) AND ends_on <= current_date + $2::int${scoped(dueParams)}
        ORDER BY ends_on, id LIMIT $3`,
      dueParams,
    ),
  ]);
  return {
    counts: Object.fromEntries(counts.rows.map((row) => [row.status, { count: row.count, overdue: row.overdue }])),
    dueSoon: due.rows.map(toEntity),
  };
}

export const findById = async (id) =>
  toEntity((await query(`SELECT ${COLUMNS} FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0]);

export const insert = async (project, client = { query }) =>
  toEntity(
    (
      await client.query(
        `INSERT INTO projects (owner_id, name, description, status, starts_on, ends_on, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING ${COLUMNS}`,
        [
          project.ownerId,
          project.name,
          project.description,
          project.status,
          project.startsOn,
          project.endsOn,
          project.actorId,
        ],
      )
    ).rows[0],
  );

export const update = async (id, changes, actorId, client = { query }) =>
  toEntity(
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
          changes.name ?? null,
          changes.description ?? null,
          changes.status ?? null,
          changes.startsOn ?? null,
          changes.endsOn ?? null,
          'startsOn' in changes,
          'endsOn' in changes,
          actorId,
        ],
      )
    ).rows[0],
  );

export const softDelete = async (id, actorId, client = { query }) =>
  (
    await client.query(`UPDATE projects SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`, [
      id,
      actorId,
    ])
  ).rowCount > 0;
