import { query } from '#infra/database/pool.js';

const COLUMNS = `d.id, d.external_id, d.name, d.device_type_id, d.owner_id, d.owner_email, d.status, d.connection_status,
  d.firmware, d.site, d.metadata, d.last_seen_at, d.activated_at, d.created_by, d.updated_by, d.created_at, d.updated_at`;
const WITH_TYPE = `${COLUMNS}, t.key AS device_type_key, t.name AS device_type_name, t.metrics AS device_type_metrics`;
const JOIN = `FROM devices d JOIN device_types t ON t.id = d.device_type_id`;

export const findById = async (id, client = { query }) =>
  (await client.query(`SELECT ${WITH_TYPE} ${JOIN} WHERE d.id = $1 AND d.deleted_at IS NULL`, [id])).rows[0] ?? null;

export const findByClaimCodeHash = async (hash, client = { query }) =>
  (await client.query(`SELECT ${WITH_TYPE} ${JOIN} WHERE d.claim_code_hash = $1 AND d.deleted_at IS NULL`, [hash]))
    .rows[0] ?? null;

export async function list({ ownerId, status, connectionStatus, deviceTypeId, search, cursor, limit }) {
  const params = [limit];
  const conditions = ['d.deleted_at IS NULL'];
  if (ownerId) conditions.push(`d.owner_id = $${params.push(ownerId)}`);
  if (status) conditions.push(`d.status = $${params.push(status)}`);
  if (connectionStatus) conditions.push(`d.connection_status = $${params.push(connectionStatus)}`);
  if (deviceTypeId) conditions.push(`d.device_type_id = $${params.push(deviceTypeId)}`);
  if (search) conditions.push(`(d.name ILIKE $${params.push(`%${search}%`)} OR d.external_id ILIKE $${params.length})`);
  if (cursor) conditions.push(`d.id > $${params.push(cursor)}`);
  return (await query(`SELECT ${WITH_TYPE} ${JOIN} WHERE ${conditions.join(' AND ')} ORDER BY d.id LIMIT $1`, params))
    .rows;
}

export const create = async (
  { externalId, name, deviceTypeId, ownerId, ownerEmail, site, metadata, claimCodeHash, actorId },
  client = { query },
) =>
  (
    await client.query(
      `INSERT INTO devices (external_id, name, device_type_id, owner_id, owner_email, site, metadata, claim_code_hash, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
      [externalId, name, deviceTypeId, ownerId, ownerEmail ?? null, site ?? null, metadata, claimCodeHash, actorId],
    )
  ).rows[0];

export const update = async (id, { name, site, metadata, status, firmware, actorId }, client = { query }) =>
  (
    await client.query(
      `UPDATE devices
          SET name = COALESCE($2, name), site = COALESCE($3, site), metadata = COALESCE($4, metadata),
              status = COALESCE($5, status), firmware = COALESCE($6, firmware), updated_by = $7
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, name ?? null, site ?? null, metadata ?? null, status ?? null, firmware ?? null, actorId],
    )
  ).rows[0] ?? null;

export const activate = async (id, { firmware }, client = { query }) =>
  (
    await client.query(
      `UPDATE devices SET status = 'active', activated_at = now(), claim_code_hash = NULL,
              firmware = COALESCE($2, firmware), connection_status = 'online', last_seen_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, firmware ?? null],
    )
  ).rows[0] ?? null;

export const softDelete = async (id, actorId, client = { query }) =>
  (
    await client.query(`UPDATE devices SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`, [
      id,
      actorId,
    ])
  ).rowCount > 0;

export const touch = (id, client = { query }) =>
  client.query(
    `UPDATE devices SET last_seen_at = now(), connection_status = 'online' WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

export const markOnline = async (id, client = { query }) =>
  (
    await client.query(
      `UPDATE devices SET last_seen_at = now(), connection_status = 'online'
        WHERE id = $1 AND deleted_at IS NULL AND connection_status <> 'online' RETURNING id, external_id, name, owner_id, owner_email`,
      [id],
    )
  ).rows[0] ?? null;

export const markOffline = async (id, client = { query }) =>
  (
    await client.query(
      `UPDATE devices SET connection_status = 'offline'
        WHERE id = $1 AND deleted_at IS NULL AND connection_status = 'online'
        RETURNING id, external_id, name, owner_id, owner_email, last_seen_at`,
      [id],
    )
  ).rows[0] ?? null;

export const claimStale = async (client, offlineAfterSeconds, limit = 200) =>
  (
    await client.query(
      `UPDATE devices SET connection_status = 'offline'
        WHERE id IN (
          SELECT id FROM devices
           WHERE deleted_at IS NULL AND connection_status = 'online'
             AND last_seen_at < now() - ($1 || ' seconds')::interval
           ORDER BY last_seen_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id, external_id, name, owner_id, owner_email, last_seen_at`,
      [String(offlineAfterSeconds), limit],
    )
  ).rows;

export const stats = async (ownerId) => {
  const params = ownerId ? [ownerId] : [];
  const scope = ownerId ? 'AND owner_id = $1' : '';
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE connection_status = 'online')::int AS online,
            count(*) FILTER (WHERE connection_status = 'offline')::int AS offline,
            count(*) FILTER (WHERE status = 'provisioning')::int AS provisioning,
            count(*) FILTER (WHERE status = 'disabled')::int AS disabled
       FROM devices WHERE deleted_at IS NULL ${scope}`,
    params,
  );
  return rows[0];
};
