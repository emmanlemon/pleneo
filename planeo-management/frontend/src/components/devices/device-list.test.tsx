import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '@/lib/devices/api';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/devices/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/devices/api')>()),
  devicesApi: { list: vi.fn(), stats: vi.fn(), remove: vi.fn() },
}));

const { devicesApi } = await import('@/lib/devices/api');
const { DeviceList } = await import('./device-list');

const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'device-1',
  external_id: 'sensor-001',
  name: 'Cold room sensor',
  device_type_id: 'type-1',
  device_type_key: 'environment-sensor',
  device_type_name: 'Environment sensor',
  device_type_metrics: [{ key: 'temperature', unit: 'C' }],
  owner_id: 'owner',
  status: 'active',
  connection_status: 'online',
  site: 'Warehouse A',
  firmware: '1.4.2',
  metadata: {},
  last_seen_at: new Date(Date.now() - 60_000).toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.mocked(devicesApi.stats).mockResolvedValue({ total: 2, online: 1, offline: 1, provisioning: 0, disabled: 0 });
  vi.mocked(devicesApi.list).mockResolvedValue({
    devices: [
      device(),
      device({ id: 'device-2', name: 'Freezer sensor', external_id: 'sensor-002', connection_status: 'offline' }),
    ],
    nextCursor: null,
  });
  vi.mocked(devicesApi.remove).mockResolvedValue(undefined);
});

describe('DeviceList', () => {
  it('summarises the fleet and lists devices with connection badges', async () => {
    renderWithProviders(<DeviceList />);
    expect(await screen.findByRole('link', { name: 'Cold room sensor' })).toHaveAttribute('href', '/devices/device-1');
    expect(screen.getByText('Freezer sensor')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('passes the search term and connection filter to the API', async () => {
    renderWithProviders(<DeviceList />);
    await screen.findByText('Cold room sensor');
    await userEvent.type(screen.getByLabelText(/search devices/i), 'cold');
    await waitFor(() => expect(devicesApi.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'cold' })));
  });

  it('asks for confirmation before decommissioning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<DeviceList />);
    await screen.findByText('Cold room sensor');
    await userEvent.click(screen.getByRole('button', { name: /delete cold room sensor/i }));
    expect(confirm).toHaveBeenCalled();
    expect(devicesApi.remove).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /delete cold room sensor/i }));
    await waitFor(() => expect(devicesApi.remove).toHaveBeenCalledWith('device-1'));
  });
});
