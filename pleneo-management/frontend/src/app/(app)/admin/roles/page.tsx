'use client';

import { RolesMatrix } from '@/components/access/roles-matrix';
import { PermissionGuard } from '@/components/admin/admin-guard';

export default function RolesPage() {
  return (
    <PermissionGuard permission="users:read">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Roles</h1>
          <p className="text-muted-foreground text-sm">
            Platform roles are defined in code and seeded by the identity service. API clients hold the same permissions
            as scopes.
          </p>
        </div>
        <RolesMatrix />
      </div>
    </PermissionGuard>
  );
}
