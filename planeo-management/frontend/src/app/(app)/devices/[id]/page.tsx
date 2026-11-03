'use client';

import { useParams } from 'next/navigation';
import { DeviceDetail } from '@/components/devices/device-detail';

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DeviceDetail id={id} />;
}
