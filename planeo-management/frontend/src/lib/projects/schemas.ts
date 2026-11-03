import { z } from 'zod';

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

const dateField = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date');

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a project name').max(120, 'Use at most 120 characters'),
    description: z.string().trim().max(2000, 'Use at most 2000 characters'),
    status: z.enum(PROJECT_STATUSES),
    startsOn: dateField,
    endsOn: dateField,
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'End date must be on or after the start date',
    path: ['endsOn'],
  });

export type ProjectFormValues = z.infer<typeof projectSchema>;

export type ProjectPayload = Omit<ProjectFormValues, 'startsOn' | 'endsOn'> & {
  startsOn: string | null;
  endsOn: string | null;
};

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
};

export const toPayload = (values: ProjectFormValues): ProjectPayload => ({
  ...values,
  startsOn: values.startsOn || null,
  endsOn: values.endsOn || null,
});

export const toFormValues = (project?: Project): ProjectFormValues => ({
  name: project?.name ?? '',
  description: project?.description ?? '',
  status: project?.status ?? 'planning',
  startsOn: project?.starts_on ?? '',
  endsOn: project?.ends_on ?? '',
});
