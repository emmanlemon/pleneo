'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { CreatedClient } from '@/lib/access/api';
import { useCreateClient, useRoles } from '@/lib/access/hooks';
import { clientSchema, type ClientFormValues } from '@/lib/access/schemas';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';

function SecretReveal({ client, onDone }: { client: CreatedClient; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(client.clientSecret);
    setCopied(true);
  };
  return (
    <Alert>
      <AlertTitle>Credentials for {client.name}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Store the secret now. It is shown once and cannot be recovered.</p>
        <dl className="grid gap-1 text-xs">
          <div>
            <dt className="text-muted-foreground">Client id</dt>
            <dd>
              <code>{client.client_id}</code>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Client secret</dt>
            <dd className="flex items-center gap-2">
              <code className="break-all">{client.clientSecret}</code>
              <Button type="button" variant="ghost" size="icon" aria-label="Copy secret" onClick={copy}>
                {copied ? <Check /> : <Copy />}
              </Button>
            </dd>
          </div>
        </dl>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Done
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function CreateClientForm() {
  const roles = useRoles();
  const create = useCreateClient();
  const [issued, setIssued] = useState<CreatedClient | null>(null);
  const catalogue = [...new Set((roles.data ?? []).flatMap((r) => r.permissions))].sort();
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: '', scopes: [] },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      setIssued(await create.mutateAsync(values));
      form.reset();
    } catch (error) {
      const apiError = toApiError(error);
      if (!applyFieldErrors(apiError, form.setError, ['name', 'scopes']))
        form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New API client</CardTitle>
        <CardDescription>
          Machine credentials for the client-credentials grant, limited to the scopes picked here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {issued ? (
          <SecretReveal client={issued} onDone={() => setIssued(null)} />
        ) : (
          <Form {...form}>
            <form onSubmit={submit} noValidate className="space-y-4">
              {form.formState.errors.root && (
                <Alert variant="destructive">
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              )}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. billing-sync" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scopes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scopes</FormLabel>
                    {roles.isPending ? (
                      <Skeleton className="h-24 w-full" />
                    ) : (
                      <div
                        className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2"
                        role="group"
                        aria-label="Scopes"
                      >
                        {catalogue.map((scope) => (
                          <label key={scope} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer"
                              checked={field.value.includes(scope)}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.checked
                                    ? [...field.value, scope]
                                    : field.value.filter((s: string) => s !== scope),
                                )
                              }
                            />
                            <code className="text-xs">{scope}</code>
                          </label>
                        ))}
                      </div>
                    )}
                    <FormDescription>
                      Scopes are the same permission catalogue users hold through roles.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="animate-spin" />}
                  Create client
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
