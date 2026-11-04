import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '@/lib/devices/api';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/lib/devices/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/devices/api')>()),
  devicesApi: { list: vi.fn(), stats: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/lib/projects/api', () => ({ projectsApi: { list: vi.fn() } }));

const { devicesApi } = await import('@/lib/devices/api');
const { projectsApi } = await import('@/lib/projects/api');
const { DeviceList } = await import('./device-list');

const PROJECT_ID = '99999999-9999-4999-8999-999999999999';

const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'device-1',
  external_id: 'sensor-001',
  name: 'Cold room sensor',
  device_type_id: 'type-1',
  device_type_key: 'environment-sensor',
  device_type_name: 'Environment sensor',
  device_type_metrics: [{ key: 'temperature', unit: 'C' }],
  project_id: PROJECT_ID,
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
      device({
        id: 'device-2',
        name: 'Freezer sensor',
        external_id: 'sensor-002',
        connection_status: 'offline',
        project_id: null,
      }),
    ],
    nextCursor: null,
  });
  vi.mocked(devicesApi.remove).mockResolvedValue(undefined);
  vi.mocked(projectsApi.list).mockResolvedValue({
    projects: [
      {
        id: PROJECT_ID,
        owner_id: 'owner',
        name: 'Cold chain',
        description: '',
        status: 'active',
        starts_on: null,
        ends_on: null,
        created_at: '',
        updated_at: '',
      },
    ],
    nextCursor: null,
  });
});

describe('DeviceList', () => {
  it('summarises the fleet and shows which project each device belongs to', async () => {
    renderWithProviders(<DeviceList />);
    const cold = (await screen.findByRole('link', { name: 'Cold room sensor' })).closest('tr')!;
    expect(screen.getByRole('link', { name: 'Cold room sensor' })).toHaveAttribute('href', '/devices/device-1');
    expect(await within(cold).findByRole('link', { name: 'Cold chain' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}`,
    );
    expect(within(screen.getByText('Freezer sensor').closest('tr')!).getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('scopes listing, counters and registration to the project it is embedded in', async () => {
    renderWithProviders(<DeviceList projectId={PROJECT_ID} />);
    await screen.findByText('Cold room sensor');
    expect(devicesApi.list).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }));
    expect(devicesApi.stats).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(screen.queryByLabelText(/filter by project/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register device/i })).toHaveAttribute(
      'href',
      `/devices/new?projectId=${PROJECT_ID}`,
    );
  });

  it('passes the search term to the API', async () => {
    renderWithProviders(<DeviceList />);
    await screen.findByText('Cold room sensor');
    await userEvent.type(screen.getByLabelText(/search devices/i), 'cold');
    await waitFor(() => expect(devicesApi.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'cold' })));
  });

  it('asks for confirmation in a dialog before decommissioning', async () => {
    renderWithProviders(<DeviceList />);
    await screen.findByText('Cold room sensor');
    await userEvent.click(screen.getByRole('button', { name: /delete cold room sensor/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/decommission "cold room sensor"/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(devicesApi.remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /delete cold room sensor/i }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Decommission' }));
    await waitFor(() => expect(devicesApi.remove).toHaveBeenCalledWith('device-1'));
  });
});
