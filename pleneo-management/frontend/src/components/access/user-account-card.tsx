'use client';

import { Ban, CheckCircle2, Loader2, LockOpen, LogOut, Send } from 'lucide-react';
import type { UserDetail } from '@/lib/access/api';
import { useUserAction, type UserAction } from '@/lib/access/hooks';
import { isLocked } from '@/lib/access/schemas';
import { useConfirm } from '../confirm-dialog';
import { relativeTime } from '../notifications/notification-bell';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

const when = (iso: string | null) => (iso ? `${relativeTime(iso)} · ${new Date(iso).toLocaleString()}` : 'never');

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function UserAccountCard({ user, self }: { user: UserDetail; self: boolean }) {
  const act = useUserAction(user.id);
  const confirm = useConfirm();
  const locked = isLocked(user.locked_until);
  const busy = (name: UserAction) => act.isPending && act.variables === name;

  const disable = async () => {
    const ok = await confirm({
      title: `Disable ${user.email}?`,
      description: 'Every session is revoked and the user cannot sign in until re-enabled.',
      confirmLabel: 'Disable',
      destructive: true,
    });
    if (ok) act.mutate('disable');
  };

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      description: `All ${user.sessions.length} active sessions for ${user.email} are revoked.`,
      confirmLabel: 'Sign out',
    });
    if (ok) act.mutate('revokeSessions');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Sign-in state and security controls.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Email verified" value={user.email_verified ? 'Yes' : 'No'} />
          <Field label="Multi-factor" value={user.mfa_enabled ? 'Enabled' : 'Not enrolled'} />
          <Field label="Last sign-in" value={when(user.last_login_at)} />
          <Field label="Password changed" value={when(user.password_changed_at)} />
          <Field label="Failed attempts" value={String(user.failed_login_attempts)} />
          <Field label="Lockout" value={locked ? `until ${new Date(user.locked_until!).toLocaleString()}` : 'none'} />
        </dl>
        <div className="flex flex-wrap gap-2">
          {user.status === 'invited' && (
            <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('resendInvitation')}>
              {busy('resendInvitation') ? <Loader2 className="animate-spin" /> : <Send />} Resend invitation
            </Button>
          )}
          {locked && (
            <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('unlock')}>
              {busy('unlock') ? <Loader2 className="animate-spin" /> : <LockOpen />} Unlock
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={act.isPending || user.sessions.length === 0}
            onClick={signOutEverywhere}
          >
            {busy('revokeSessions') ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out everywhere
          </Button>
          {!self && user.status === 'active' && (
            <Button variant="destructive" size="sm" disabled={act.isPending} onClick={disable}>
              {busy('disable') ? <Loader2 className="animate-spin" /> : <Ban />} Disable
            </Button>
          )}
          {!self && user.status === 'disabled' && (
            <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('enable')}>
              {busy('enable') ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Enable
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
