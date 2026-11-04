import { bffHttp } from '@/lib/api/http';

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type UserRow = {
  id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  status: UserStatus;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  failed_login_attempts: number;
  locked_until: string | null;
};

export type UserSession = {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

export type UserDetail = UserRow & {
  password_changed_at: string;
  roles: string[];
  permissions: string[];
  sessions: UserSession[];
};

export type Role = { name: string; description: string | null; permissions: string[] };

export type ApiClient = {
  id: string;
  client_id: string;
  name: string;
  scopes: string[];
  status: 'active' | 'revoked';
  last_used_at: string | null;
  created_at: string;
};
export type CreatedClient = ApiClient & { clientSecret: string };

export type AuditEvent = {
  id: number;
  actor_id: string | null;
  actor_type: 'user' | 'client' | 'system' | 'anonymous';
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type UserListParams = { limit?: number; cursor?: string; search?: string };
export type AuditListParams = { limit?: number; before?: number; action?: string; actorId?: string; targetId?: string };
export type InvitePayload = { email: string; name?: string; roles: string[] };
export type ClientPayload = { name: string; scopes: string[] };
export type InvitedUser = Pick<UserRow, 'id' | 'email' | 'name' | 'status'>;

export const accessApi = {
  users: (params: UserListParams = {}) =>
    bffHttp.get<{ users: UserRow[]; nextCursor: string | null }>('/users', { params }).then((r) => r.data),
  user: (id: string) => bffHttp.get<UserDetail>(`/users/${id}`).then((r) => r.data),
  invite: (input: InvitePayload) => bffHttp.post<InvitedUser>('/users', input).then((r) => r.data),
  resendInvitation: (id: string) => bffHttp.post(`/users/${id}/invitations`).then(() => undefined),
  setStatus: (id: string, status: 'active' | 'disabled') =>
    bffHttp.patch(`/users/${id}`, { status }).then(() => undefined),
  unlock: (id: string) => bffHttp.post(`/users/${id}/unlock`).then(() => undefined),
  revokeSessions: (id: string) => bffHttp.post(`/users/${id}/revoke-sessions`).then(() => undefined),
  grantRole: (id: string, role: string) => bffHttp.post(`/users/${id}/roles`, { role }).then(() => undefined),
  revokeRole: (id: string, role: string) => bffHttp.delete(`/users/${id}/roles/${role}`).then(() => undefined),
  roles: () => bffHttp.get<{ roles: Role[] }>('/roles').then((r) => r.data.roles),
  clients: () => bffHttp.get<{ clients: ApiClient[] }>('/clients').then((r) => r.data.clients),
  createClient: (input: ClientPayload) => bffHttp.post<CreatedClient>('/clients', input).then((r) => r.data),
  revokeClient: (id: string) => bffHttp.delete(`/clients/${id}`).then(() => undefined),
  audit: (params: AuditListParams = {}) =>
    bffHttp.get<{ events: AuditEvent[]; nextBefore: number | null }>('/audit', { params }).then((r) => r.data),
};
