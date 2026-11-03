'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProjectForm } from '@/components/projects/project-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api/problem';
import { useProject, useUpdateProject } from '@/lib/projects/hooks';
import { toFormValues } from '@/lib/projects/schemas';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const project = useProject(id);
  const update = useUpdateProject(id);

  if (project.isPending) {
    return (
      <div className="max-w-xl space-y-4" role="status" aria-label="Loading project">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (project.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(project.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{project.data.name}</h1>
      <ProjectForm
        defaultValues={toFormValues(project.data)}
        submitLabel="Save changes"
        pending={update.isPending}
        onCancel={() => router.push('/projects')}
        onSubmit={(values) => update.mutateAsync(values)}
      />
    </div>
  );
}
