import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, applyFieldErrors, errorMessage, toApiError } from './problem';

const axiosError = (status?: number, data?: unknown) => {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    'Request failed',
    status ? 'ERR_BAD_REQUEST' : 'ERR_NETWORK',
    config,
    undefined,
    status ? { status, data, statusText: '', headers: {}, config } : undefined,
  );
};

const problem = {
  type: 'urn:planeo:error:validation-failed',
  title: 'Bad Request',
  status: 400,
  code: 'VALIDATION_FAILED',
  detail: 'One or more validation errors occurred',
  requestId: 'r-1',
  errors: [
    { field: 'email', source: 'body' as const, code: 'INVALID_FORMAT', message: 'Invalid email' },
    { field: 'limit', source: 'query' as const, code: 'TOO_LONG', message: 'Too big' },
  ],
};

describe('toApiError', () => {
  it('maps problem+json responses to ApiError', () => {
    const error = toApiError(axiosError(400, problem));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', requestId: 'r-1', message: problem.detail });
    expect(error.errors).toHaveLength(2);
  });

  it('maps network failures and unknown payloads', () => {
    expect(toApiError(axiosError())).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(toApiError(axiosError(502, '<html>'))).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
    expect(toApiError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN_ERROR', message: 'boom' });
    expect(errorMessage('x')).toBe('Something went wrong');
  });

  it('passes through existing ApiErrors', () => {
    const existing = new ApiError(problem);
    expect(toApiError(existing)).toBe(existing);
  });
});

describe('applyFieldErrors', () => {
  it('sets only body issues for known fields and reports whether anything applied', () => {
    const setError = vi.fn();
    const applied = applyFieldErrors(new ApiError(problem), setError, ['email', 'password']);
    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', { type: 'INVALID_FORMAT', message: 'Invalid email' });
    expect(applyFieldErrors(new ApiError(problem), setError, ['password'])).toBe(false);
  });
});
