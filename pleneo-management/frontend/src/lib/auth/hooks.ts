'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/problem';
import { authApi, type LoginResponse, type Session } from './api';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  MfaInput,
  RegisterInput,
  ResetPasswordInput,
} from './schemas';

export const sessionKey = ['session'] as const;

async function loadSession(): Promise<Session | null> {
  try {
    return await authApi.session();
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) return null;
    throw error;
  }
}

export const useSession = () =>
  useQuery({ queryKey: sessionKey, queryFn: loadSession, staleTime: 5 * 60_000, retry: false });

function useEstablishSession() {
  const queryClient = useQueryClient();
  return (user: Session) => {
    queryClient.setQueryData(sessionKey, user);
    return queryClient.invalidateQueries({ queryKey: sessionKey });
  };
}

export function useLogin() {
  const establish = useEstablishSession();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data: LoginResponse) => (data.mfaRequired ? undefined : establish(data.user)),
  });
}

export function useLoginMfa() {
  const establish = useEstablishSession();
  return useMutation({ mutationFn: (input: MfaInput) => authApi.loginMfa(input), onSuccess: (data) => establish(data.user) });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await authApi.logout().catch(() => undefined);
    },
    onSettled: () => {
      queryClient.setQueryData(sessionKey, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] });
    },
  });
}

export const useRegister = () => useMutation({ mutationFn: (input: RegisterInput) => authApi.register(input) });
export const useVerifyEmail = () => useMutation({ mutationFn: (token: string) => authApi.verifyEmail(token) });
export const useResendVerification = () => useMutation({ mutationFn: (email: string) => authApi.resendVerification(email) });
export const useForgotPassword = () => useMutation({ mutationFn: (input: ForgotPasswordInput) => authApi.forgotPassword(input) });
export const useResetPassword = () => useMutation({ mutationFn: (input: ResetPasswordInput) => authApi.resetPassword(input) });
export const useChangePassword = () => useMutation({ mutationFn: (input: ChangePasswordInput) => authApi.changePassword(input) });
