import { apiHttp } from '@/lib/api/http';
import type { Project, ProjectPayload, ProjectStatus } from './schemas';

export type ProjectListParams = { limit?: number; cursor?: string; status?: ProjectStatus; search?: string };
export type ProjectPage = { projects: Project[]; nextCursor: string | null };

export const projectsApi = {
  list: (params: ProjectListParams = {}) => apiHttp.get<ProjectPage>('/projects', { params }).then((r) => r.data),
  get: (id: string) => apiHttp.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (input: ProjectPayload) => apiHttp.post<Project>('/projects', input).then((r) => r.data),
  update: (id: string, input: Partial<ProjectPayload>) =>
    apiHttp.patch<Project>(`/projects/${id}`, input).then((r) => r.data),
  remove: (id: string) => apiHttp.delete(`/projects/${id}`).then(() => undefined),
};
