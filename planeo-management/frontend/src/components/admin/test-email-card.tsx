'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { applyFieldErrors, toApiError } from '@/lib/api/problem';
import { useSendTestEmail } from '@/lib/email/hooks';
import { testEmailSchema, type TestEmailInput } from '@/lib/email/schemas';
import { useJobProgress, useQueueStats } from '@/lib/events/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Input } from '../ui/input';

const TERMINAL: Record<string, 'ok' | 'bad'> = { succeeded: 'ok', failed: 'bad', dead: 'bad', cancelled: 'bad' };

function Outcome({ jobId }: { jobId: string }) {
  const { data: job } = useJobProgress(jobId);
  const outcome = job ? TERMINAL[job.status] : undefined;

  if (!job || !outcome) {
    return (
      <Alert role="status">
        <Loader2 className="animate-spin" />
        <AlertDescription>
          Queued as job <code className="text-xs">{jobId.slice(0, 8)}</code>. Waiting for the worker to deliver it.
        </AlertDescription>
      </Alert>
    );
  }

  const failure = job.attempts_log?.find((a) => a.error)?.error ?? job.last_error;
  return (
    <Alert variant={outcome === 'ok' ? 'default' : 'destructive'} role="status">
      {outcome === 'ok' ? <CheckCircle2 /> : <XCircle />}
      <AlertDescription>
        {outcome === 'ok'
          ? `Delivered to the provider after ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}. Open your Mailtrap inbox to read it.`
          : `Delivery ${job.status} after ${job.attempts} attempts. ${failure ?? ''}`}
      </AlertDescription>
    </Alert>
  );
}

export function TestEmailCard() {
  const stats = useQueueStats();
  const send = useSendTestEmail();
  const [jobId, setJobId] = useState<string | null>(null);
  const provider = stats.data?.email?.provider;

  const form = useForm<TestEmailInput>({
    resolver: zodResolver(testEmailSchema),
    defaultValues: { to: '', note: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setJobId(null);
    try {
      const result = await send.mutateAsync({ ...values, note: values.note || undefined });
      setJobId(result.jobId);
    } catch (error) {
      const apiError = toApiError(error);
      if (applyFieldErrors(apiError, form.setError, ['to', 'note'])) return;
      form.setError('root', { message: apiError.message });
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Send a test email</CardTitle>
            <CardDescription>
              Goes through the management API, the events queue and the configured provider, exactly as a real
              notification does.
            </CardDescription>
          </div>
          {provider && <Badge variant="secondary">{provider}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    With the Mailtrap sandbox the message is captured in your inbox and never reaches this address.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional, shown in the subject and body" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send test email
            </Button>
          </form>
        </Form>
        {jobId && <Outcome jobId={jobId} />}
      </CardContent>
    </Card>
  );
}
