'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectListParams } from './api';
import type { ProjectPayload } from './schemas';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params: ProjectListParams) => ['projects', 'list', params] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  summary: ['projects', 'summary'] as const,
};

export const useProjectSummary = () => useQuery({ queryKey: projectKeys.summary, queryFn: projectsApi.summary });

export const useProjects = (params: ProjectListParams = {}) =>
  useQuery({ queryKey: projectKeys.list(params), queryFn: () => projectsApi.list(params) });

export const useProject = (id: string) =>
  useQuery({ queryKey: projectKeys.detail(id), queryFn: () => projectsApi.get(id), enabled: Boolean(id) });

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectPayload) => projectsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ProjectPayload>) => projectsApi.update(id, input),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      return queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
