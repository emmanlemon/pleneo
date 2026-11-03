'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { errorMessage } from '@/lib/api/problem';
import { useDeleteProject, useProjects } from '@/lib/projects/hooks';
import { PROJECT_STATUSES, STATUS_LABELS, type ProjectStatus } from '@/lib/projects/schemas';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';

const ALL = 'all';

export function ProjectList() {
  const [status, setStatus] = useState<ProjectStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const projects = useProjects({ limit: 50, status: status === ALL ? undefined : status, search: search || undefined });
  const remove = useDeleteProject();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Search projects"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus | typeof ALL)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild className="ml-auto">
          <Link href="/projects/new">
            <Plus /> New project
          </Link>
        </Button>
      </div>

      {projects.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(projects.error)}</AlertDescription>
        </Alert>
      )}
      {projects.isPending ? (
        <div className="space-y-2" role="status" aria-label="Loading projects">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : projects.data?.projects.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No projects yet.
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-md border">
          {projects.data?.projects.map((project) => (
            <li key={project.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                  {project.name}
                </Link>
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{STATUS_LABELS[project.status]}</Badge>
                  {project.starts_on && <span>{project.starts_on}</span>}
                  {project.ends_on && <span>→ {project.ends_on}</span>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${project.name}`}
                disabled={remove.isPending && remove.variables === project.id}
                onClick={() => window.confirm(`Delete "${project.name}"?`) && remove.mutate(project.id)}
              >
                {remove.isPending && remove.variables === project.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 className="text-destructive" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
