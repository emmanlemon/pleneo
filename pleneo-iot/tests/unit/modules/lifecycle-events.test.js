import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID, USER_ID, device } from '../../helpers/fixtures.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/messaging/outbox.repository.js');
vi.mock('#infra/messaging/outbox.relay.js', () => ({ startOutboxRelay: vi.fn(), stopOutboxRelay: vi.fn() }));
vi.mock('#modules/devices/device.repository.js');
vi.mock('#modules/commands/command.repository.js');
vi.mock('#modules/telemetry/telemetry.repository.js');
vi.mock('#modules/rules/rules.engine.js');
vi.mock('#modules/alerts/alerts.service.js');

const outbox = await import('#infra/messaging/outbox.repository.js');
const devices = await import('#modules/devices/device.repository.js');
const commands = await import('#modules/commands/command.repository.js');
const telemetryRepo = await import('#modules/telemetry/telemetry.repository.js');
const engine = await import('#modules/rules/rules.engine.js');
const alerts = await import('#modules/alerts/alerts.service.js');
const { sweepOfflineDevices, expireCommands } = await import('#infra/jobs/scheduler.js');
const { ingest } = await import('#modules/telemetry/telemetry.service.js');

const EVENT_CONTRACT = ['deviceId', 'externalId', 'deviceName', 'ownerId'];

beforeEach(() => {
  outbox.add.mockResolvedValue();
  engine.evaluate.mockResolvedValue([]);
  alerts.raiseAlerts.mockResolvedValue([]);
  telemetryRepo.insertBatch.mockImplementation(async (_id, readings) => readings);
});

describe('lifecycle event payloads', () => {
  it('iot.device.offline carries the shared contract and is keyed by last contact', async () => {
    devices.claimStale.mockResolvedValue([
      {
        id: DEVICE_ID,
        external_id: 'sensor-001',
        name: 'Cold room sensor',
        owner_id: USER_ID,
        owner_email: 'user@example.com',
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const count = await sweepOfflineDevices();

    expect(count).toBe(1);
    const [event] = outbox.add.mock.calls[0];
    expect(event.type).toBe('iot.device.offline');
    expect(Object.keys(event.payload)).toEqual(expect.arrayContaining(EVENT_CONTRACT));
    expect(event.payload.deviceName).toBe('Cold room sensor');
    expect(event.payload.ownerEmail).toBe('user@example.com');
    expect(event.idempotencyKey).toBe(`iot.device.offline:${DEVICE_ID}:2026-01-01T00:00:00.000Z`);
  });

  it('iot.device.online carries the same contract', async () => {
    devices.markOnline.mockResolvedValue({
      id: DEVICE_ID,
      external_id: 'sensor-001',
      name: 'Cold room sensor',
      owner_id: USER_ID,
      owner_email: 'user@example.com',
    });
    await ingest(device(), [{ metric: 'temperature', value: 4 }]);

    const [event] = outbox.add.mock.calls[0];
    expect(event.type).toBe('iot.device.online');
    expect(Object.keys(event.payload)).toEqual(expect.arrayContaining(EVENT_CONTRACT));
    expect(event.payload.deviceName).toBe('Cold room sensor');
  });

  it('emits nothing when no device went stale', async () => {
    devices.claimStale.mockResolvedValue([]);
    await expect(sweepOfflineDevices()).resolves.toBe(0);
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('expires overdue commands', async () => {
    commands.expireOverdue.mockResolvedValue([{ id: 'c1', device_id: DEVICE_ID, type: 'reboot' }]);
    await expect(expireCommands()).resolves.toBe(1);
    expect(commands.expireOverdue).toHaveBeenCalledWith(tx);
  });
});
