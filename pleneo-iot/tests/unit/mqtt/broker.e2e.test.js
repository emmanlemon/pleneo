import net from 'node:net';
import mqtt from 'mqtt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
}));
vi.mock('#infra/messaging/outbox.repository.js', () => ({ add: vi.fn() }));
vi.mock('#modules/devices/credential.repository.js', () => ({
  findActiveByDevice: vi.fn(),
  touch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('#modules/devices/device.repository.js', () => ({
  findById: vi.fn(),
  markOnline: vi.fn().mockResolvedValue(null),
  markOffline: vi.fn().mockResolvedValue(null),
  touch: vi.fn(),
}));
vi.mock('#modules/devices/state.repository.js', () => ({ setReported: vi.fn() }));
vi.mock('#modules/commands/commands.service.js', () => ({ acknowledge: vi.fn() }));
vi.mock('#modules/telemetry/telemetry.service.js', () => ({ ingest: vi.fn() }));

const { createBroker } = await import('#infra/mqtt/broker.js');
const { setPublisher, publishCommand } = await import('#infra/mqtt/bus.js');
const credentials = await import('#modules/devices/credential.repository.js');
const devices = await import('#modules/devices/device.repository.js');
const telemetry = await import('#modules/telemetry/telemetry.service.js');
const { deviceToken } = await import('#common/security/crypto.js');

const DEVICE_ID = 'c0071c26-52a6-49ec-972d-f3515531faa5';
const TOKEN = deviceToken(DEVICE_ID);
const deviceRow = {
  id: DEVICE_ID,
  external_id: 'sensor-001',
  name: 'Sensor 1',
  owner_id: 'owner-1',
  owner_email: 'owner@example.com',
  device_type_metrics: [{ key: 'temperature' }],
};

let broker;
let server;
let url;

const connect = (password = TOKEN, options = {}) =>
  mqtt.connectAsync(url, { username: 'sensor-001', password, reconnectPeriod: 0, ...options });

const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

beforeAll(async () => {
  broker = await createBroker();
  setPublisher((topic, payload, options = {}) => {
    broker.publish({ topic, payload, qos: 1, retain: false, cmd: 'publish', ...options }, () => {});
    return true;
  });
  server = net.createServer(broker.handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `mqtt://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  setPublisher(null);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => broker.close(resolve));
});

beforeEach(() => {
  credentials.findActiveByDevice.mockResolvedValue({
    id: 'cred-1',
    device_id: DEVICE_ID,
    external_id: 'sensor-001',
    owner_id: 'owner-1',
    device_type_id: 'type-1',
    device_status: 'active',
    expires_at: null,
  });
  devices.findById.mockResolvedValue(deviceRow);
  telemetry.ingest.mockResolvedValue({ accepted: 1, duplicates: 0, alerts: 0 });
});

describe('mqtt broker end to end', () => {
  it('refuses a connection with no valid device credential', async () => {
    await expect(connect('garbage')).rejects.toThrow();
  });

  it('accepts a device and ingests what it publishes', async () => {
    const client = await connect();
    client.publish('devices/sensor-001/telemetry', JSON.stringify({ metric: 'temperature', value: 21.5 }), { qos: 1 });

    expect(await waitFor(() => telemetry.ingest.mock.calls.length > 0)).toBe(true);
    expect(telemetry.ingest).toHaveBeenCalledWith(deviceRow, [{ metric: 'temperature', value: 21.5 }]);
    await client.endAsync();
  });

  it('delivers a command to a subscribed device', async () => {
    const client = await connect();
    const received = [];
    client.on('message', (topic, payload) => received.push({ topic, body: JSON.parse(payload.toString()) }));
    await client.subscribeAsync('devices/sensor-001/commands', { qos: 1 });

    publishCommand('sensor-001', {
      id: 'cmd-1',
      type: 'reboot',
      payload: { delay: 5 },
      expires_at: '2026-11-02T00:05:00.000Z',
    });

    expect(await waitFor(() => received.length > 0)).toBe(true);
    expect(received[0]).toMatchObject({
      topic: 'devices/sensor-001/commands',
      body: { id: 'cmd-1', type: 'reboot', payload: { delay: 5 } },
    });
    await client.endAsync();
  });

  it('never delivers a command addressed to a different device', async () => {
    const client = await connect();
    const received = [];
    client.on('message', (_topic, payload) => received.push(payload));
    await client.subscribeAsync('devices/sensor-001/commands', { qos: 1 });

    publishCommand('sensor-002', { id: 'cmd-2', type: 'reboot', payload: {}, expires_at: null });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(0);
    await client.endAsync();
  });

  it('marks the device offline when the connection drops', async () => {
    devices.markOffline.mockResolvedValue({ ...deviceRow, last_seen_at: '2026-11-02T00:00:00.000Z' });
    const client = await connect();
    await client.endAsync();
    expect(await waitFor(() => devices.markOffline.mock.calls.length > 0)).toBe(true);
  });
});
