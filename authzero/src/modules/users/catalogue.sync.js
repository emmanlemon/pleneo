import { query } from '#infra/database/pool.js';
import { PERMISSIONS, PLATFORM_ROLES } from './catalogue.js';

export async function syncCatalogue(client = { query }) {
  await client.query(`INSERT INTO permissions (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`, [
    [...PERMISSIONS],
  ]);

  for (const [role, permissions] of Object.entries(PLATFORM_ROLES)) {
    await client.query(`INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [role]);
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r JOIN permissions p ON p.name = ANY($2::text[])
        WHERE r.name = $1
       ON CONFLICT DO NOTHING`,
      [role, [...permissions]],
    );
    await client.query(
      `DELETE FROM role_permissions rp USING roles r
        WHERE rp.role_id = r.id AND r.name = $1
          AND rp.permission_id NOT IN (SELECT id FROM permissions WHERE name = ANY($2::text[]))`,
      [role, [...permissions]],
    );
  }
}
