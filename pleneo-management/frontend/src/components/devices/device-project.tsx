'use client';

import { FolderKanban, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { Device } from '@/lib/devices/api';
import { useUpdateDevice } from '@/lib/devices/hooks';
import { useProjectOptions } from '@/lib/projects/hooks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export function DeviceProject({ device }: { device: Pick<Device, 'id' | 'project_id'> }) {
  const projects = useProjectOptions();
  const update = useUpdateDevice(device.id);
  const current = projects.data?.find((p) => p.id === device.project_id);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <FolderKanban className="text-muted-foreground size-4" aria-hidden />
      {current ? (
        <Link href={`/projects/${current.id}`} className="font-medium hover:underline">
          {current.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">{device.project_id ? 'Project' : 'Unassigned'}</span>
      )}
      <Select
        value={device.project_id ?? ''}
        onValueChange={(projectId) => projectId !== device.project_id && update.mutate({ projectId })}
        disabled={update.isPending || projects.isPending}
      >
        <SelectTrigger size="sm" className="w-48" aria-label="Move to project">
          {update.isPending && <Loader2 className="animate-spin" />}
          <SelectValue placeholder="Move to project" />
        </SelectTrigger>
        <SelectContent>
          {projects.data?.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
