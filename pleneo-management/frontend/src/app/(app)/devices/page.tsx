import type { Metadata } from 'next';
import { DeviceList } from '@/components/devices/device-list';

export const metadata: Metadata = { title: 'Devices' };

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Devices</h1>
        <p className="text-muted-foreground text-sm">Registry, connectivity and telemetry for the fleet.</p>
      </div>
      <DeviceList />
    </div>
  );
}
