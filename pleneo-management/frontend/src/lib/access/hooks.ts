'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/toast';
import { accessApi, type AuditListParams, type ClientPayload, type InvitePayload, type UserListParams } from './api';

export const accessKeys = {
  all: ['access'] as const,
  users: (params: UserListParams) => ['access', 'users', params] as const,
  user: (id: string) => ['access', 'user', id] as const,
  roles: ['access', 'roles'] as const,
  clients: ['access', 'clients'] as const,
  audit: (params: AuditListParams) => ['access', 'audit', params] as const,
};

export type UserAction = 'unlock' | 'revokeSessions' | 'resendInvitation' | 'enable' | 'disable';

const ACTION_DONE: Record<UserAction, string> = {
  unlock: 'Account unlocked',
  revokeSessions: 'Every session was signed out',
  resendInvitation: 'A fresh invitation link was sent',
  enable: 'Account enabled',
  disable: 'Account disabled',
};

export const useUsers = (params: UserListParams = {}) =>
  useQuery({ queryKey: accessKeys.users(params), queryFn: () => accessApi.users(params) });

export const useUser = (id: string) =>
  useQuery({ queryKey: accessKeys.user(id), queryFn: () => accessApi.user(id), enabled: Boolean(id) });

export const useRoles = () => useQuery({ queryKey: accessKeys.roles, queryFn: accessApi.roles, staleTime: 5 * 60_000 });

export const useClients = () => useQuery({ queryKey: accessKeys.clients, queryFn: accessApi.clients });

export const useAuditLog = (params: AuditListParams = {}) =>
  useQuery({ queryKey: accessKeys.audit(params), queryFn: () => accessApi.audit(params) });

function useInvalidateAccess() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: accessKeys.all });
}

export function useInviteUser() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: InvitePayload) => accessApi.invite(input),
    onSuccess: (user) => {
      notify.success(`Invitation sent to ${user.email}`);
      return invalidate();
    },
  });
}

export function useUserAction(id: string) {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (action: UserAction) => {
      if (action === 'enable') return accessApi.setStatus(id, 'active');
      if (action === 'disable') return accessApi.setStatus(id, 'disabled');
      return accessApi[action](id);
    },
    onSuccess: (_result, action) => {
      notify.success(ACTION_DONE[action]);
      return invalidate();
    },
    onError: notify.error,
  });
}

export function useRoleAssignment(id: string) {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: ({ role, granted }: { role: string; granted: boolean }) =>
      granted ? accessApi.grantRole(id, role) : accessApi.revokeRole(id, role),
    onSuccess: (_result, { role, granted }) => {
      notify.success(granted ? `Role ${role} granted` : `Role ${role} revoked`);
      return invalidate();
    },
    onError: notify.error,
  });
}

export function useCreateClient() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: ClientPayload) => accessApi.createClient(input),
    onSuccess: (client) => {
      notify.success(`API client "${client.name}" created`);
      return invalidate();
    },
  });
}

export function useRevokeClient() {
  const invalidate = useInvalidateAccess();
  return useMutation({
    mutationFn: (id: string) => accessApi.revokeClient(id),
    onSuccess: () => {
      notify.success('API client revoked');
      return invalidate();
    },
    onError: notify.error,
  });
}
