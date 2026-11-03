import { bffHttp } from '@/lib/api/http';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  MfaInput,
  RegisterInput,
  ResetPasswordInput,
} from './schemas';

export type Session = {
  id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  mfa_enabled: boolean;
  roles: string[];
  permissions: string[];
};

export type SessionOpened = { mfaRequired: false; user: Session; csrfToken: string };
export type MfaChallenge = { mfaRequired: true; mfaToken: string; expiresIn: number };
export type LoginResponse = SessionOpened | MfaChallenge;

export const authApi = {
  login: (input: LoginInput) => bffHttp.post<LoginResponse>('/auth/login', input).then((r) => r.data),
  loginMfa: (input: MfaInput) => bffHttp.post<SessionOpened>('/auth/login/mfa', input).then((r) => r.data),
  register: (input: RegisterInput) => bffHttp.post<{ message: string }>('/auth/register', input).then((r) => r.data),
  verifyEmail: (token: string) => bffHttp.post<{ message: string }>('/auth/email/verify', { token }).then((r) => r.data),
  resendVerification: (email: string) => bffHttp.post('/auth/email/resend', { email }).then(() => undefined),
  forgotPassword: (input: ForgotPasswordInput) => bffHttp.post('/auth/password/forgot', input).then(() => undefined),
  resetPassword: (input: ResetPasswordInput) => bffHttp.post('/auth/password/reset', input).then(() => undefined),
  changePassword: (input: ChangePasswordInput) => bffHttp.post('/auth/password/change', input).then(() => undefined),
  logout: () => bffHttp.post('/auth/logout').then(() => undefined),
  session: () => bffHttp.get<{ user: Session }>('/auth/session').then((r) => r.data.user),
};
