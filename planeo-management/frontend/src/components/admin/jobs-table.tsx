'use client';

import { Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/lib/api/problem';
import { JOB_STATUSES, type Job, type JobStatus } from '@/lib/events/api';
import { useCancelJob, useJob, useJobs, useRetryJob } from '@/lib/events/hooks';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { relativeTime } from '../notifications/notification-bell';

const STATUS_VARIANT: Record<JobStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  running: 'default',
  succeeded: 'secondary',
  failed: 'destructive',
  dead: 'destructive',
  cancelled: 'secondary',
};

const RETRYABLE = new Set<JobStatus>(['dead', 'failed', 'cancelled']);
const ALL = 'all';

export function JobsTable({ fixedStatus, queues = [] }: { fixedStatus?: JobStatus; queues?: string[] }) {
  const [status, setStatus] = useState<JobStatus | typeof ALL>(fixedStatus ?? ALL);
  const [queue, setQueue] = useState<string>(ALL);
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const jobs = useJobs({
    limit: 50,
    status: status === ALL ? undefined : status,
    queue: queue === ALL ? undefined : queue,
    type: type || undefined,
  });
  const retry = useRetryJob();
  const cancel = useCancelJob();
  const detail = useJob(expanded);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!fixedStatus && (
          <Select value={status} onValueChange={(v) => setStatus(v as JobStatus | typeof ALL)}>
            <SelectTrigger className="w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={queue} onValueChange={setQueue}>
          <SelectTrigger className="w-40" aria-label="Filter by queue">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All queues</SelectItem>
            {queues.map((q) => (
              <SelectItem key={q} value={q}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Job type, e.g. email.send"
          value={type}
          onChange={(e) => setType(e.target.value.trim())}
          className="max-w-xs"
          aria-label="Filter by job type"
        />
      </div>

      {jobs.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(jobs.error)}</AlertDescription>
        </Alert>
      )}
      {(retry.isError || cancel.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(retry.error ?? cancel.error)}</AlertDescription>
        </Alert>
      )}
      {jobs.isPending ? (
        <Skeleton className="h-40 w-full" role="status" aria-label="Loading jobs" />
      ) : (
        <div className="bg-card rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data?.jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                    No jobs match these filters.
                  </TableCell>
                </TableRow>
              )}
              {jobs.data?.jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  expanded={expanded === job.id}
                  onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
                  detail={expanded === job.id ? detail.data : undefined}
                  onRetry={() => retry.mutate(job.id)}
                  onCancel={() => cancel.mutate(job.id)}
                  busy={
                    (retry.isPending && retry.variables === job.id) || (cancel.isPending && cancel.variables === job.id)
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  job: Job;
  expanded: boolean;
  detail?: {
    payload: Record<string, unknown>;
    attempts_log: {
      attempt: number;
      status: string;
      error: string | null;
      duration_ms: number | null;
      created_at: string;
    }[];
  };
  busy: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onCancel: () => void;
};

function JobRow({ job, expanded, detail, busy, onToggle, onRetry, onCancel }: RowProps) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle} aria-expanded={expanded}>
        <TableCell className="font-medium">{job.type}</TableCell>
        <TableCell>{job.queue}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
        </TableCell>
        <TableCell>
          {job.attempts}/{job.max_attempts}
        </TableCell>
        <TableCell title={job.run_at}>{job.status === 'pending' ? relativeTime(job.run_at) : '—'}</TableCell>
        <TableCell className="text-muted-foreground max-w-xs truncate" title={job.last_error ?? ''}>
          {job.last_error ?? '—'}
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {RETRYABLE.has(job.status) && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onRetry} aria-label={`Retry job ${job.id}`}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry
            </Button>
          )}
          {job.status === 'pending' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel} aria-label={`Cancel job ${job.id}`}>
              <XCircle /> Cancel
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 whitespace-normal">
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase">Payload</p>
                <pre className="bg-background max-h-60 overflow-auto rounded border p-2 text-xs">
                  {JSON.stringify(detail?.payload ?? job.payload, null, 2)}
                </pre>
                <p className="text-muted-foreground mt-2 text-xs">
                  id {job.id} · created {relativeTime(job.created_at)} · by {job.created_by ?? 'unknown'}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase">Attempts</p>
                {detail ? (
                  detail.attempts_log.length ? (
                    <ul className="space-y-1 text-xs">
                      {detail.attempts_log.map((a) => (
                        <li key={a.attempt} className="flex gap-2">
                          <Badge variant={a.status === 'succeeded' ? 'secondary' : 'destructive'}>#{a.attempt}</Badge>
                          <span>{a.duration_ms != null ? `${a.duration_ms} ms` : ''}</span>
                          <span className="text-muted-foreground truncate">{a.error ?? 'ok'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-xs">Not attempted yet.</p>
                  )
                ) : (
                  <Skeleton className="h-10 w-full" />
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
