import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID, device } from '../../helpers/fixtures.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/messaging/outbox.repository.js');
vi.mock('#modules/telemetry/telemetry.repository.js');
vi.mock('#modules/devices/device.repository.js');
vi.mock('#modules/rules/rules.engine.js');
vi.mock('#modules/alerts/alerts.service.js');

const telemetry = await import('#modules/telemetry/telemetry.repository.js');
const devices = await import('#modules/devices/device.repository.js');
const engine = await import('#modules/rules/rules.engine.js');
const alerts = await import('#modules/alerts/alerts.service.js');
const outbox = await import('#infra/messaging/outbox.repository.js');
const { ingest, normaliseReadings } = await import('#modules/telemetry/telemetry.service.js');

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

beforeEach(() => {
  telemetry.insertBatch.mockImplementation(async (_id, readings) => readings);
  devices.markOnline.mockResolvedValue(null);
  devices.touch.mockResolvedValue();
  engine.evaluate.mockResolvedValue([]);
  alerts.raiseAlerts.mockResolvedValue([]);
  outbox.add.mockResolvedValue();
});

describe('normaliseReadings', () => {
  it('defaults the timestamp to now and keeps declared metrics', () => {
    const [reading] = normaliseReadings(device(), [{ metric: 'temperature', value: 4.5 }]);
    expect(reading.metric).toBe('temperature');
    expect(Date.parse(reading.ts)).toBeCloseTo(Date.now(), -3);
  });

  it('rejects metrics the device type does not declare', () => {
    expect(() => normaliseReadings(device(), [{ metric: 'pressure', value: 1 }])).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_METRIC' }),
    );
  });

  it('accepts any metric when the device type declares none', () => {
    expect(() =>
      normaliseReadings(device({ device_type_metrics: [] }), [{ metric: 'pressure', value: 1 }]),
    ).not.toThrow();
  });

  it('rejects timestamps beyond the skew and backfill windows', () => {
    expect(() => normaliseReadings(device(), [{ metric: 'temperature', value: 1, ts: iso(2 * 3_600_000) }])).toThrow(
      expect.objectContaining({ code: 'TIMESTAMP_SKEW' }),
    );
    expect(() => normaliseReadings(device(), [{ metric: 'temperature', value: 1, ts: iso(-40 * 86_400_000) }])).toThrow(
      expect.objectContaining({ code: 'TIMESTAMP_TOO_OLD' }),
    );
    expect(() => normaliseReadings(device(), [{ metric: 'temperature', value: 1, ts: iso(-60_000) }])).not.toThrow();
  });

  it('rejects oversized batches', () => {
    const readings = Array.from({ length: 501 }, () => ({ metric: 'temperature', value: 1 }));
    expect(() => normaliseReadings(device(), readings)).toThrow(expect.objectContaining({ code: 'BATCH_TOO_LARGE' }));
  });
});

describe('ingest', () => {
  it('stores readings, reports duplicates and evaluates rules', async () => {
    telemetry.insertBatch.mockResolvedValue([{ metric: 'temperature', value: 12, ts: iso(0) }]);
    engine.evaluate.mockResolvedValue([{ rule: { id: 'r1' }, reading: { metric: 'temperature', value: 12 } }]);
    alerts.raiseAlerts.mockResolvedValue([{ id: 'a1' }]);

    const result = await ingest(device(), [
      { metric: 'temperature', value: 12 },
      { metric: 'humidity', value: 40 },
    ]);

    expect(result).toEqual({ accepted: 1, duplicates: 1, alerts: 1 });
    expect(telemetry.insertBatch).toHaveBeenCalledWith(DEVICE_ID, expect.any(Array), tx);
    expect(alerts.raiseAlerts).toHaveBeenCalledWith(expect.objectContaining({ id: DEVICE_ID }), expect.any(Array), tx);
  });

  it('touches the device without an event when it was already online', async () => {
    await ingest(device(), [{ metric: 'temperature', value: 4 }]);
    expect(devices.touch).toHaveBeenCalledWith(DEVICE_ID, tx);
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('emits iot.device.online when the device comes back', async () => {
    devices.markOnline.mockResolvedValue({
      id: DEVICE_ID,
      external_id: 'sensor-001',
      name: 'Cold room sensor',
      owner_id: 'owner',
    });
    await ingest(device(), [{ metric: 'temperature', value: 4 }]);
    expect(outbox.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'iot.device.online', payload: expect.objectContaining({ deviceId: DEVICE_ID }) }),
      tx,
    );
    expect(devices.touch).not.toHaveBeenCalled();
  });

  it('rejects the whole batch before writing when one reading is invalid', async () => {
    await expect(
      ingest(device(), [
        { metric: 'temperature', value: 4 },
        { metric: 'pressure', value: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'UNKNOWN_METRIC' });
    expect(telemetry.insertBatch).not.toHaveBeenCalled();
  });
});
