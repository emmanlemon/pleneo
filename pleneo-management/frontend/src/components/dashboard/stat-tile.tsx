import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

export type Tone = 'neutral' | 'good' | 'warning' | 'critical';

const TONE = {
  neutral: { icon: null, className: 'text-muted-foreground' },
  good: { icon: CircleCheck, className: 'text-muted-foreground [&>svg]:text-status-good' },
  warning: { icon: TriangleAlert, className: 'text-foreground [&>svg]:text-status-warning' },
  critical: { icon: OctagonAlert, className: 'text-status-critical' },
} as const;

type Props = {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: Tone;
  href?: string;
  loading?: boolean;
};

export function StatTile({ label, value, detail, tone = 'neutral', href, loading }: Props) {
  const { icon: Icon, className } = TONE[tone];
  const body = (
    <Card className={cn('h-full gap-3', href && 'hover:border-foreground/20 transition-colors')}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold">{loading ? <Skeleton className="h-8 w-20" /> : value}</CardTitle>
      </CardHeader>
      <CardContent className={cn('flex items-center gap-1.5 text-xs [&>svg]:size-3.5', className)}>
        {loading ? (
          <Skeleton className="h-3 w-28" />
        ) : (
          <>
            {Icon && <Icon aria-hidden />}
            {detail}
          </>
        )}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]">
      {body}
    </Link>
  ) : (
    body
  );
}
