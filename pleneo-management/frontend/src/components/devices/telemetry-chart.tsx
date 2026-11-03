'use client';

import { useMemo, useState } from 'react';
import type { Reading } from '@/lib/devices/api';

const VIEW = { w: 760, h: 240, left: 52, right: 16, top: 16, bottom: 28 };
const TICK_COUNT = 4;

type Props = { points: Reading[]; unit?: string; threshold?: { value: number; label: string } | null; label: string };

const niceDomain = (values: number[], threshold?: number) => {
  const all = threshold === undefined ? values : [...values, threshold];
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return [min - 1, max + 1] as const;
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad] as const;
};

const formatValue = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1));
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function TelemetryChart({ points, unit = '', threshold = null, label }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const [lo, hi] = niceDomain(
      points.map((p) => p.value),
      threshold?.value,
    );
    const innerW = VIEW.w - VIEW.left - VIEW.right;
    const innerH = VIEW.h - VIEW.top - VIEW.bottom;
    const x = (i: number) => VIEW.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (value: number) => VIEW.top + innerH - ((value - lo) / (hi - lo)) * innerH;
    const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => lo + ((hi - lo) * i) / TICK_COUNT);
    return {
      x,
      y,
      ticks,
      path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '),
    };
  }, [points, threshold?.value]);

  if (points.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        No readings in this window yet.
      </p>
    );
  }

  const active = hover === null ? null : points[hover];

  return (
    <div className="viz-root space-y-2">
      <style>{`
        .viz-root { --series-1: #2a78d6; --viz-threshold: #d03b3b; --viz-grid: #e4e4e1; --viz-ink: #52514e; --viz-surface: #ffffff; }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .viz-root { --series-1: #3987e5; --viz-threshold: #d03b3b; --viz-grid: #3a3a38; --viz-ink: #c3c2b7; --viz-surface: #2f2f2f; }
        }
        :root[data-theme="dark"] .viz-root { --series-1: #3987e5; --viz-threshold: #d03b3b; --viz-grid: #3a3a38; --viz-ink: #c3c2b7; --viz-surface: #2f2f2f; }
      `}</style>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="w-full"
          role="img"
          aria-label={`${label} over time, ${points.length} readings`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = ((event.clientX - rect.left) / rect.width) * VIEW.w;
            const innerW = VIEW.w - VIEW.left - VIEW.right;
            const index = Math.round(((ratio - VIEW.left) / innerW) * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, index)));
          }}
        >
          {geometry!.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={VIEW.left}
                x2={VIEW.w - VIEW.right}
                y1={geometry!.y(tick)}
                y2={geometry!.y(tick)}
                stroke="var(--viz-grid)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={VIEW.left - 8} y={geometry!.y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--viz-ink)">
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {threshold && (
            <g>
              <line
                x1={VIEW.left}
                x2={VIEW.w - VIEW.right}
                y1={geometry!.y(threshold.value)}
                y2={geometry!.y(threshold.value)}
                stroke="var(--viz-threshold)"
                strokeWidth="2"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={VIEW.w - VIEW.right}
                y={geometry!.y(threshold.value) - 6}
                textAnchor="end"
                fontSize="11"
                fill="var(--viz-threshold)"
              >
                {threshold.label}
              </text>
            </g>
          )}

          <path
            d={geometry!.path}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && (
            <g>
              <line
                x1={geometry!.x(hover)}
                x2={geometry!.x(hover)}
                y1={VIEW.top}
                y2={VIEW.h - VIEW.bottom}
                stroke="var(--viz-ink)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={geometry!.x(hover)}
                cy={geometry!.y(points[hover].value)}
                r="5"
                fill="var(--series-1)"
                stroke="var(--viz-surface)"
                strokeWidth="2"
              />
            </g>
          )}

          <text x={VIEW.left} y={VIEW.h - 8} fontSize="11" fill="var(--viz-ink)">
            {formatTime(points[0].ts)}
          </text>
          <text x={VIEW.w - VIEW.right} y={VIEW.h - 8} fontSize="11" textAnchor="end" fill="var(--viz-ink)">
            {formatTime(points.at(-1)!.ts)}
          </text>
        </svg>

        {active && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-2 rounded-md border px-2 py-1 text-xs shadow-sm"
            style={{ left: `calc(${(geometry!.x(hover!) / VIEW.w) * 100}% - 48px)` }}
            role="status"
          >
            <div className="font-medium">
              {formatValue(active.value)}
              {unit}
            </div>
            <div className="text-muted-foreground">{new Date(active.ts).toLocaleString()}</div>
          </div>
        )}
      </div>

      <button type="button" className="text-muted-foreground text-xs underline" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Hide' : 'Show'} readings table
      </button>

      {showTable && (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <caption className="sr-only">{label} readings</caption>
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Time</th>
                <th className="px-2 py-1 text-right font-medium">Value{unit ? ` (${unit})` : ''}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.ts} className="border-t">
                  <td className="px-2 py-1">{new Date(point.ts).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatValue(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
