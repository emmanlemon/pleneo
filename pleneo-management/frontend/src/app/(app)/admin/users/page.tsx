'use client';

import { UsersTable } from '@/components/access/users-table';
import { PermissionGuard } from '@/components/admin/admin-guard';

export default function UsersPage() {
  return (
    <PermissionGuard permission="users:read">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-muted-foreground text-sm">Accounts, invitations, lockouts and role assignments.</p>
        </div>
        <UsersTable />
      </div>
    </PermissionGuard>
  );
}
