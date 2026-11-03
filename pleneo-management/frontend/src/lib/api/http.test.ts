import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiHttp, bffHttp, readCsrfToken } from './http';
import { ApiError } from './problem';

type Call = { url: string; csrf?: string; credentials?: boolean };
const calls: Call[] = [];
let behaviour: (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

const adapter: AxiosAdapter = async (config) => {
  calls.push({
    url: `${config.baseURL ?? ''}${config.url ?? ''}`,
    csrf: config.headers.get('X-CSRF-Token') as string | undefined,
    credentials: config.withCredentials,
  });
  const { status, data } = behaviour(config);
  const response = { status, data, statusText: '', headers: {}, config };
  if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, response);
  return response;
};

beforeEach(() => {
  calls.length = 0;
  bffHttp.defaults.adapter = adapter;
  apiHttp.defaults.adapter = adapter;
  behaviour = () => ({ status: 200, data: { ok: true } });
  document.cookie = 'pleneo_csrf=csrf-value';
});

afterEach(() => {
  document.cookie = 'pleneo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('gateway client', () => {
  it('sends every request to the BFF origin with credentials', async () => {
    await bffHttp.get('/auth/session');
    expect(calls[0].url).toBe('http://localhost:4100/v1/auth/session');
    expect(calls[0].credentials).toBe(true);
  });

  it('never targets the identity provider or upstream services directly', async () => {
    await bffHttp.get('/queues/stats');
    await bffHttp.get('/devices');
    for (const call of calls) {
      expect(call.url.startsWith('http://localhost:4100')).toBe(true);
      expect(call.url).not.toMatch(/:4000|:4200|:4300/);
    }
  });

  it('attaches the CSRF header to mutating requests only', async () => {
    await bffHttp.get('/auth/session');
    expect(calls[0].csrf).toBeUndefined();

    await bffHttp.post('/auth/logout');
    expect(calls[1].csrf).toBe('csrf-value');

    await apiHttp.patch('/projects/1', {});
    expect(calls[2].csrf).toBe('csrf-value');
  });

  it('reads the CSRF token from the readable cookie', () => {
    expect(readCsrfToken()).toBe('csrf-value');
  });

  it('maps problem responses onto ApiError', async () => {
    behaviour = () => ({
      status: 403,
      data: { type: 'x', title: 'Forbidden', status: 403, code: 'CSRF_FAILED', detail: 'Missing or invalid CSRF token' },
    });
    const error = await bffHttp.post('/auth/logout').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('CSRF_FAILED');
  });
});
