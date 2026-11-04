'use client';

import { useRouter } from 'next/navigation';
import { InviteUserForm } from '@/components/access/invite-user-form';
import { PermissionGuard } from '@/components/admin/admin-guard';
import { useInviteUser } from '@/lib/access/hooks';

export default function InviteUserPage() {
  const router = useRouter();
  const invite = useInviteUser();

  return (
    <PermissionGuard permission="users:write">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Invite user</h1>
          <p className="text-muted-foreground text-sm">
            The account is created in the invited state and activates once the link is used.
          </p>
        </div>
        <InviteUserForm
          pending={invite.isPending}
          onCancel={() => router.push('/admin/users')}
          onSubmit={async (values) => {
            const user = await invite.mutateAsync(values);
            router.replace(`/admin/users/${user.id}`);
          }}
        />
      </div>
    </PermissionGuard>
  );
}
