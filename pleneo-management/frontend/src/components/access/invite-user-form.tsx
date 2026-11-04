'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { InvitePayload } from '@/lib/access/api';
import { useRoles } from '@/lib/access/hooks';
import { inviteSchema, type InviteFormValues } from '@/lib/access/schemas';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { BASE_ROLE, RolePicker } from './role-picker';

type Props = { pending: boolean; onSubmit: (values: InvitePayload) => Promise<unknown>; onCancel: () => void };

export function InviteUserForm({ pending, onSubmit, onCancel }: Props) {
  const roles = useRoles();
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', name: '', roles: [] },
  });

  const submit = form.handleSubmit(async ({ email, name, roles: picked }) => {
    try {
      await onSubmit({ email, name: name || undefined, roles: picked.filter((r) => r !== BASE_ROLE) });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'ALREADY_EXISTS')
        return form.setError('email', { message: 'An account with this email already exists' });
      if (!applyFieldErrors(apiError, form.setError, ['email', 'name', 'roles']))
        form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} noValidate className="max-w-xl space-y-5">
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>The invitation link is sent here and expires in a few days.</FormDescription>
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
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roles</FormLabel>
              {roles.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <RolePicker roles={roles.data ?? []} selected={field.value} onChange={field.onChange} />
              )}
              <FormDescription>Every account holds the base role. Role changes sign the user out.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Send invitation
          </Button>
        </div>
      </form>
    </Form>
  );
}
