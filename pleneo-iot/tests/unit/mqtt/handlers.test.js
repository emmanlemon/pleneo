import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
}));
vi.mock('#infra/messaging/outbox.repository.js', () => ({ add: vi.fn() }));
vi.mock('#modules/devices/device.repository.js', () => ({
  findById: vi.fn(),
  markOnline: vi.fn(),
  markOffline: vi.fn(),
  touch: vi.fn(),
}));
vi.mock('#modules/devices/credential.repository.js', () => ({ touch: vi.fn().mockResolvedValue(undefined) }));
vi.mock('#modules/devices/state.repository.js', () => ({ setReported: vi.fn() }));
vi.mock('#modules/commands/commands.service.js', () => ({ acknowledge: vi.fn() }));
vi.mock('#modules/telemetry/telemetry.service.js', () => ({ ingest: vi.fn() }));

const { dispatch, onConnected, onDisconnected } = await import('#infra/mqtt/handlers.js');
const devices = await import('#modules/devices/device.repository.js');
const outbox = await import('#infra/messaging/outbox.repository.js');
const state = await import('#modules/devices/state.repository.js');
const commands = await import('#modules/commands/commands.service.js');
const telemetry = await import('#modules/telemetry/telemetry.service.js');

const DEVICE_ID = 'c0071c26-52a6-49ec-972d-f3515531faa5';
const COMMAND_ID = '11111111-1111-4111-8111-111111111111';

const deviceRow = {
  id: DEVICE_ID,
  external_id: 'sensor-001',
  name: 'Sensor 1',
  owner_id: 'owner-1',
  owner_email: 'owner@example.com',
  device_type_metrics: [{ key: 'temperature' }],
};

const client = () => ({
  device: { id: DEVICE_ID, externalId: 'sensor-001', ownerId: 'owner-1', credentialId: 'cred-1' },
  deviceRow,
});

const message = (topic, body) => ({ topic, payload: Buffer.from(JSON.stringify(body)) });

beforeEach(() => {
  devices.findById.mockResolvedValue(deviceRow);
  devices.markOnline.mockResolvedValue(null);
  devices.markOffline.mockResolvedValue(null);
  telemetry.ingest.mockResolvedValue({ accepted: 1, duplicates: 0, alerts: 0 });
  state.setReported.mockResolvedValue({});
  commands.acknowledge.mockResolvedValue({});
});

describe('telemetry over mqtt', () => {
  it('runs the same ingest the HTTP plane runs', async () => {
    await dispatch(client(), message('devices/sensor-001/telemetry', { metric: 'temperature', value: 21.5 }));
    expect(telemetry.ingest).toHaveBeenCalledWith(deviceRow, [{ metric: 'temperature', value: 21.5 }]);
  });

  it('accepts the batch and metrics-map shapes too', async () => {
    await dispatch(client(), message('devices/sensor-001/telemetry', { readings: [{ metric: 'temperature', value: 1 }] }));
    expect(telemetry.ingest.mock.calls[0][1]).toHaveLength(1);

    await dispatch(client(), message('devices/sensor-001/telemetry', { metrics: { temperature: 2 } }));
    expect(telemetry.ingest.mock.calls[1][1]).toEqual([{ metric: 'temperature', value: 2, ts: undefined }]);
  });

  it('drops a malformed message without killing the connection', async () => {
    await expect(
      dispatch(client(), { topic: 'devices/sensor-001/telemetry', payload: Buffer.from('not json') }),
    ).resolves.toBeUndefined();
    await dispatch(client(), message('devices/sensor-001/telemetry', { metric: 'temperature' }));
    expect(telemetry.ingest).not.toHaveBeenCalled();
  });

  it('ignores a topic with no handler', async () => {
    await dispatch(client(), message('devices/sensor-001/status', { status: 'online' }));
    expect(telemetry.ingest).not.toHaveBeenCalled();
  });
});

describe('state and command acknowledgement over mqtt', () => {
  it('records reported state', async () => {
    await dispatch(client(), message('devices/sensor-001/state/reported', { firmware: '1.4.2' }));
    expect(state.setReported).toHaveBeenCalledWith(DEVICE_ID, { firmware: '1.4.2' });
  });

  it('acknowledges a command for the authenticated device only', async () => {
    await dispatch(client(), message('devices/sensor-001/commands/ack', { id: COMMAND_ID, status: 'acknowledged' }));
    expect(commands.acknowledge).toHaveBeenCalledWith(DEVICE_ID, COMMAND_ID, { status: 'acknowledged' });
  });

  it('refuses an acknowledgement without a valid command id', async () => {
    await dispatch(client(), message('devices/sensor-001/commands/ack', { id: 'nope', status: 'acknowledged' }));
    expect(commands.acknowledge).not.toHaveBeenCalled();
  });
});

describe('presence', () => {
  it('marks the device online and emits once on a real transition', async () => {
    devices.markOnline.mockResolvedValue({ ...deviceRow, name: 'Sensor 1' });
    await onConnected(client());
    expect(outbox.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'iot.device.online', payload: expect.objectContaining({ deviceId: DEVICE_ID }) }),
      tx,
    );
  });

  it('only touches the device when it was already online', async () => {
    devices.markOnline.mockResolvedValue(null);
    await onConnected(client());
    expect(devices.touch).toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('marks the device offline the moment the connection drops', async () => {
    devices.markOffline.mockResolvedValue({ ...deviceRow, last_seen_at: '2026-11-02T00:00:00.000Z' });
    await onDisconnected(client());
    expect(devices.markOffline).toHaveBeenCalledWith(DEVICE_ID, tx);
    expect(outbox.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'iot.device.offline',
        payload: expect.objectContaining({ deviceName: 'Sensor 1', lastSeenAt: '2026-11-02T00:00:00.000Z' }),
      }),
      tx,
    );
  });

  it('stays quiet for a client that never authenticated', async () => {
    await onConnected({});
    await onDisconnected({});
    expect(devices.markOnline).not.toHaveBeenCalled();
    expect(devices.markOffline).not.toHaveBeenCalled();
  });
});
