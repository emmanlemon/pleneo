'use client';

import { useParams } from 'next/navigation';
import { UserDetail } from '@/components/access/user-detail';
import { PermissionGuard } from '@/components/admin/admin-guard';

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PermissionGuard permission="users:read">
      <UserDetail id={id} />
    </PermissionGuard>
  );
}
