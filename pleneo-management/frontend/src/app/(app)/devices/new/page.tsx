'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { RegisterDeviceForm } from '@/components/devices/register-device-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { RegisteredDevice } from '@/lib/devices/api';

function NewDevice() {
  const projectId = useSearchParams().get('projectId') ?? undefined;
  const [registered, setRegistered] = useState<RegisteredDevice | null>(null);

  if (registered) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">{registered.name} is registered</h1>
        <Alert>
          <AlertDescription className="space-y-2">
            <span>
              Give the device its id <code className="bg-muted rounded px-1">{registered.external_id}</code> and this
              claim code. It is shown once and is exchanged for a device token on first connection.
            </span>
            <code className="bg-muted block rounded px-2 py-2 text-center text-lg tracking-widest">
              {registered.claimCode}
            </code>
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/devices/${registered.id}`}>Open device</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={projectId ? `/projects/${projectId}` : '/devices'}>
              {projectId ? 'Back to project' : 'Back to devices'}
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setRegistered(null)}>
            Register another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Register device</h1>
        <p className="text-muted-foreground text-sm">
          Registration returns a one-time claim code the device exchanges for its own credentials.
        </p>
      </div>
      <RegisterDeviceForm defaultProjectId={projectId} onRegistered={setRegistered} />
    </div>
  );
}

export default function NewDevicePage() {
  return (
    <Suspense>
      <NewDevice />
    </Suspense>
  );
}
