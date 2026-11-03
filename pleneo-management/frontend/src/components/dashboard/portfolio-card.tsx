'use client';

import Link from 'next/link';
import { useProjectSummary } from '@/lib/projects/hooks';
import { PROJECT_STATUSES, STATUS_LABELS } from '@/lib/projects/schemas';
import { errorMessage } from '@/lib/api/problem';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { SegmentedBar } from './segmented-bar';

const DAY_MS = 86_400_000;

export const daysUntil = (isoDate: string, now = new Date()) => {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) - today) / DAY_MS);
};

const dueLabel = (days: number) =>
  days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`;

export function PortfolioCard() {
  const summary = useProjectSummary();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Project portfolio</CardTitle>
        <CardDescription>
          {summary.data ? `${summary.data.total} projects across every stage` : 'Projects by lifecycle stage'}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">All projects</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary.isPending ? (
          <Skeleton className="h-32 w-full" role="status" aria-label="Loading portfolio" />
        ) : summary.isError ? (
          <p className="text-destructive text-sm">{errorMessage(summary.error)}</p>
        ) : (
          <>
            <SegmentedBar
              label="Projects by status"
              segments={PROJECT_STATUSES.map((status, i) => ({
                key: status,
                label: STATUS_LABELS[status],
                value: summary.data.byStatus[status],
                color: `var(--series-${i + 1})`,
              }))}
            />
            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-medium">Ending within {summary.data.horizonDays} days</h3>
              {summary.data.dueSoon.length === 0 ? (
                <p className="text-muted-foreground text-sm">No open project ends in this window.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.data.dueSoon.map((project) => {
                    const days = daysUntil(project.ends_on!);
                    return (
                      <li key={project.id} className="flex items-center gap-3 text-sm">
                        <Link href={`/projects/${project.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {project.name}
                        </Link>
                        <Badge variant="secondary">{STATUS_LABELS[project.status]}</Badge>
                        <Badge
                          variant={days < 0 ? 'destructive' : 'outline'}
                          className="w-24"
                          title={project.ends_on ?? undefined}
                        >
                          {dueLabel(days)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
