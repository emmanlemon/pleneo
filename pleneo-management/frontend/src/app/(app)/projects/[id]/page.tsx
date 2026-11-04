'use client';

import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm-dialog';
import { DeviceList } from '@/components/devices/device-list';
import { ProjectForm } from '@/components/projects/project-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api/problem';
import { useDeleteProject, useProject, useUpdateProject } from '@/lib/projects/hooks';
import { STATUS_LABELS, toFormValues } from '@/lib/projects/schemas';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const project = useProject(id);
  const update = useUpdateProject(id);
  const remove = useDeleteProject();

  if (project.isPending) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading project">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
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

  const p = project.data;
  const destroy = async () => {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      description: 'Devices assigned to this project are kept and become unassigned.',
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!ok) return;
    await remove.mutateAsync(p.id);
    router.replace('/projects');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to projects">
          <Link href="/projects">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {p.name}
            <Badge variant="secondary">{STATUS_LABELS[p.status]}</Badge>
          </h1>
          {p.description && <p className="text-muted-foreground line-clamp-2 text-sm">{p.description}</p>}
        </div>
        <Button variant="outline" size="sm" disabled={remove.isPending} onClick={destroy}>
          {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
          Delete
        </Button>
      </div>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="devices" className="pt-2">
          <DeviceList projectId={p.id} />
        </TabsContent>
        <TabsContent value="settings" className="pt-2">
          <ProjectForm
            defaultValues={toFormValues(p)}
            submitLabel="Save changes"
            pending={update.isPending}
            onCancel={() => router.push('/projects')}
            onSubmit={(values) => update.mutateAsync(values)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
