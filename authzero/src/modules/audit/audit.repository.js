import { query } from '#infra/database/pool.js';

export const insert = ({ actorId, actorType, action, targetType, targetId, ip, userAgent, metadata }) =>
  query(
    `INSERT INTO audit_logs (actor_id, actor_type, action, target_type, target_id, ip, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorId, actorType, action, targetType, targetId, ip, userAgent, metadata],
  );

export async function list({ actorId, targetId, action, before, limit }) {
  const params = [];
  const conditions = [];
  if (actorId) conditions.push(`actor_id = $${params.push(actorId)}`);
  if (targetId) conditions.push(`target_id = $${params.push(targetId)}`);
  if (action) conditions.push(`action = $${params.push(action)}`);
  if (before) conditions.push(`id < $${params.push(before)}`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT id, actor_id, actor_type, action, target_type, target_id, ip, user_agent, metadata, created_at
       FROM audit_logs ${where} ORDER BY id DESC LIMIT $${params.push(limit)}`,
    params,
  );
  return rows;
}
