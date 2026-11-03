'use client';

import { useRouter } from 'next/navigation';
import { ProjectForm } from '@/components/projects/project-form';
import { useCreateProject } from '@/lib/projects/hooks';
import { toFormValues } from '@/lib/projects/schemas';

export default function NewProjectPage() {
  const router = useRouter();
  const create = useCreateProject();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New project</h1>
      <ProjectForm
        defaultValues={toFormValues()}
        submitLabel="Create project"
        pending={create.isPending}
        onCancel={() => router.push('/projects')}
        onSubmit={async (values) => {
          const project = await create.mutateAsync(values);
          router.replace(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
