import { apiHttp } from '@/lib/api/http';

export type TestEmailInput = { to: string; note?: string };
export type TestEmailResult = { jobId: string; status: string; to: string; queuedAt: string };

export const emailApi = {
  sendTest: (input: TestEmailInput) =>
    apiHttp.post<TestEmailResult>('/admin/email/test', input).then((r) => r.data),
};
