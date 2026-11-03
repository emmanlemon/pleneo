import axios from 'axios';
import { env } from '@/lib/env';
import { toApiError } from './problem';

const CSRF_COOKIE = 'pleneo_csrf';
const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map((part) => part.trim().split('='));
  const found = match.find(([name]) => name === CSRF_COOKIE);
  return found?.[1] ? decodeURIComponent(found[1]) : null;
}

function createClient(baseURL: string, timeout: number) {
  const instance = axios.create({ baseURL, timeout, withCredentials: true });

  instance.interceptors.request.use((config) => {
    if (MUTATING.has((config.method ?? 'get').toLowerCase())) {
      const csrf = readCsrfToken();
      if (csrf) config.headers.set('X-CSRF-Token', csrf);
    }
    return config;
  });

  instance.interceptors.response.use(undefined, (error: unknown) => {
    throw toApiError(error);
  });

  return instance;
}

export const bffHttp = createClient(`${env.bffUrl}/bff`, 15_000);
export const apiHttp = createClient(env.bffUrl, 10_000);
