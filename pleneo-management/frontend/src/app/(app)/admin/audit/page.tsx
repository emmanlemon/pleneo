'use client';

import { AuditTable } from '@/components/access/audit-table';
import { PermissionGuard } from '@/components/admin/admin-guard';

export default function AuditPage() {
  return (
    <PermissionGuard permission="audit:read">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-muted-foreground text-sm">
            Sign-ins, credential changes, grants and administrative actions.
          </p>
        </div>
        <AuditTable />
      </div>
    </PermissionGuard>
  );
}
