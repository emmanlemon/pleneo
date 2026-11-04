'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import type { RegisteredDevice } from '@/lib/devices/api';
import { useDeviceTypes, useRegisterDevice } from '@/lib/devices/hooks';
import { useProjectOptions } from '@/lib/projects/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const schema = z.object({
  projectId: z.string().uuid('Choose a project'),
  externalId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/, 'Use 3-64 letters, digits, dots, colons, dashes or underscores'),
  name: z.string().trim().min(1, 'Enter a device name').max(120),
  deviceTypeId: z.string().uuid('Choose a device type'),
  site: z.string().trim().max(120),
});

type Values = z.infer<typeof schema>;
const FIELDS = ['projectId', 'externalId', 'name', 'deviceTypeId', 'site'] as const;

type Props = { defaultProjectId?: string; onRegistered: (device: RegisteredDevice) => void };

export function RegisterDeviceForm({ defaultProjectId, onRegistered }: Props) {
  const types = useDeviceTypes();
  const projects = useProjectOptions();
  const register = useRegisterDevice();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { projectId: defaultProjectId ?? '', externalId: '', name: '', deviceTypeId: '', site: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      onRegistered(await register.mutateAsync({ ...values, site: values.site || undefined }));
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'DUPLICATE_EXTERNAL_ID')
        return form.setError('externalId', { message: 'That device id is already registered' });
      if (!applyFieldErrors(apiError, form.setError, FIELDS)) form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full" aria-label="Project">
                    <SelectValue placeholder={projects.isPending ? 'Loading projects…' : 'Select a project'} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {projects.data?.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Every device belongs to one project.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Cold room sensor" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="externalId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Device id</FormLabel>
              <FormControl>
                <Input placeholder="sensor-001" {...field} />
              </FormControl>
              <FormDescription>
                The identifier burned into the hardware. It is used with the claim code to activate.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deviceTypeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Device type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full" aria-label="Device type">
                    <SelectValue placeholder={types.isPending ? 'Loading types…' : 'Select a device type'} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {types.data?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} ({type.metrics.map((m) => m.key).join(', ')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="site"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Site</FormLabel>
              <FormControl>
                <Input placeholder="Warehouse A" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={defaultProjectId ? `/projects/${defaultProjectId}` : '/devices'}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={register.isPending}>
            {register.isPending && <Loader2 className="animate-spin" />}
            Register device
          </Button>
        </div>
      </form>
    </Form>
  );
}
