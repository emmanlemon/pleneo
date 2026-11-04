'use client';

import { ClientsTable } from '@/components/access/clients-table';
import { CreateClientForm } from '@/components/access/create-client-form';
import { PermissionGuard } from '@/components/admin/admin-guard';

export default function ClientsPage() {
  return (
    <PermissionGuard permission="clients:manage">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">API clients</h1>
          <p className="text-muted-foreground text-sm">Service credentials and the scopes each one may request.</p>
        </div>
        <ClientsTable />
        <CreateClientForm />
      </div>
    </PermissionGuard>
  );
}
