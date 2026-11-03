export type Segment = { key: string; label: string; value: number; color: string };

const share = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);

export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const summary = segments.map((s) => `${s.label} ${s.value} (${share(s.value, total)}%)`).join(', ');

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`${label}: ${summary}`}
        className="bg-muted flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              title={`${s.label}: ${s.value} (${share(s.value, total)}%)`}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: s.value, backgroundColor: s.color }}
            />
          ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <dt className="text-muted-foreground truncate">{s.label}</dt>
            <dd className="ml-auto font-medium tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
