import { query } from '#infra/database/pool.js';

export const exists = async (roleName) =>
  (await query(`SELECT 1 FROM roles WHERE name = $1`, [roleName])).rows.length > 0;

export const assign = (userId, roleName, grantedBy = null, client = { query }) =>
  client.query(
    `INSERT INTO user_roles (user_id, role_id, granted_by)
     SELECT $1, id, $3 FROM roles WHERE name = $2
     ON CONFLICT DO NOTHING`,
    [userId, roleName, grantedBy],
  );

export const remove = (userId, roleName) =>
  query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2)`, [
    userId,
    roleName,
  ]);

export async function getAuthorization(userId, client = { query }) {
  const { rows } = await client.query(
    `SELECT r.name AS role, array_remove(array_agg(p.name), NULL) AS permissions
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      GROUP BY r.name`,
    [userId],
  );
  return {
    roles: rows.map((r) => r.role).sort(),
    permissions: [...new Set(rows.flatMap((r) => r.permissions))].sort(),
  };
}

export const listAll = async () =>
  (
    await query(
      `SELECT r.name, r.description, array_remove(array_agg(p.name ORDER BY p.name), NULL) AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        GROUP BY r.id ORDER BY r.name`,
    )
  ).rows;
