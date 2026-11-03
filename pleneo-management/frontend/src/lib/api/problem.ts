import { isAxiosError } from 'axios';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export type FieldIssue = { field: string; source: 'body' | 'query' | 'params'; code: string; message: string };

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  requestId?: string;
  errors?: FieldIssue[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldIssue[];
  readonly requestId?: string;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.errors = problem.errors ?? [];
    this.requestId = problem.requestId;
  }
}

const problem = (status: number, code: string, detail: string): ProblemDetails => ({
  type: `urn:pleneo:error:${code.toLowerCase().replace(/_/g, '-')}`,
  title: code,
  status,
  code,
  detail,
});

const isProblem = (value: unknown): value is ProblemDetails =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ProblemDetails).code === 'string' &&
  typeof (value as ProblemDetails).status === 'number';

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (isProblem(error.response?.data)) return new ApiError(error.response.data);
    if (!error.response)
      return new ApiError(
        problem(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection and try again.'),
      );
    return new ApiError(problem(error.response.status, 'HTTP_ERROR', error.message));
  }
  return new ApiError(problem(0, 'UNKNOWN_ERROR', error instanceof Error ? error.message : 'Something went wrong'));
}

export function applyFieldErrors<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  let applied = false;
  for (const issue of error.errors) {
    if (issue.source !== 'body' || !(fields as readonly string[]).includes(issue.field)) continue;
    setError(issue.field as Path<T>, { type: issue.code, message: issue.message });
    applied = true;
  }
  return applied;
}

export const errorMessage = (error: unknown): string => toApiError(error).message;
