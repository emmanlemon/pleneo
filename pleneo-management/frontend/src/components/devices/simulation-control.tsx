'use client';

import { Loader2, Play, Square } from 'lucide-react';
import { toApiError } from '@/lib/api/problem';
import { useSimulation, useStartSimulation, useStopSimulation } from '@/lib/devices/hooks';
import { useState } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const relative = (iso?: string | null) => {
  if (!iso) return 'no readings yet';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return seconds < 60 ? `${Math.max(0, seconds)}s ago` : `${Math.round(seconds / 60)}m ago`;
};

export function SimulationControl({ deviceId, active }: { deviceId: string; active: boolean }) {
  const { data: simulation } = useSimulation(deviceId);
  const start = useStartSimulation(deviceId);
  const stop = useStopSimulation(deviceId);
  const [error, setError] = useState<string | null>(null);

  const running = Boolean(simulation?.running);
  const pending = start.isPending || stop.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(toApiError(cause).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={running ? 'outline' : 'default'}
          disabled={pending || (!running && !active)}
          onClick={() => run(() => (running ? stop.mutateAsync() : start.mutateAsync({ spike: true })))}
        >
          {pending ? <Loader2 className="animate-spin" /> : running ? <Square /> : <Play />}
          {running ? 'Stop simulation' : 'Start simulation'}
        </Button>

        {running ? (
          <Badge variant="secondary">
            {simulation?.readings ?? 0} readings · {relative(simulation?.lastReadingAt)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">
            {active ? 'Generates readings as if the hardware were connected.' : 'Activate the device first.'}
          </span>
        )}
      </div>

      {running && (simulation?.alerts ?? 0) > 0 && (
        <p className="text-muted-foreground text-sm">
          {simulation?.alerts} alert{simulation?.alerts === 1 ? '' : 's'} raised so far.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
