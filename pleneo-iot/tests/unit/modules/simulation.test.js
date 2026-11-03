import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID, asAdmin, asUser, principal } from '../../helpers/fixtures.js';

vi.mock('#modules/devices/device.repository.js', () => ({ findById: vi.fn() }));
vi.mock('#modules/telemetry/telemetry.service.js', () => ({ ingest: vi.fn() }));

const service = await import('#modules/simulation/simulation.service.js');
const simulator = await import('#modules/simulation/simulator.js');
const devices = await import('#modules/devices/device.repository.js');
const telemetry = await import('#modules/telemetry/telemetry.service.js');
const { config } = await import('#config');

const device = (overrides = {}) => ({
  id: DEVICE_ID,
  external_id: 'sim-1',
  owner_id: principal.current?.userId ?? 'owner',
  status: 'active',
  device_type_metrics: [
    { key: 'temperature', unit: 'C', min: 0, max: 40 },
    { key: 'humidity', unit: '%', min: 20, max: 80 },
  ],
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  asAdmin();
  devices.findById.mockImplementation(async () => device());
  telemetry.ingest.mockResolvedValue({ accepted: 2, duplicates: 0, alerts: 0 });
});

afterEach(() => simulator.stopAll());

describe('starting a simulation', () => {
  it('produces a reading for every declared metric, inside its range', async () => {
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    await flush();

    const [, readings] = telemetry.ingest.mock.calls[0];
    expect(readings.map((r) => r.metric).sort()).toEqual(['humidity', 'temperature']);
    for (const reading of readings) {
      const metric = device().device_type_metrics.find((m) => m.key === reading.metric);
      expect(reading.value).toBeGreaterThanOrEqual(metric.min);
      expect(reading.value).toBeLessThanOrEqual(metric.max);
    }
  });

  it('feeds the same ingest path a real device uses, so rules still run', async () => {
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    await flush();
    expect(telemetry.ingest).toHaveBeenCalledWith(expect.objectContaining({ id: DEVICE_ID }), expect.any(Array));
  });

  it('reports itself as running', async () => {
    const session = await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    expect(session).toMatchObject({ running: true, deviceId: DEVICE_ID, intervalMs: 10_000 });
    expect(await service.simulationStatus(principal.current, DEVICE_ID)).toMatchObject({ running: true });
  });

  it('refuses a device that was never activated', async () => {
    devices.findById.mockResolvedValue(device({ status: 'provisioning' }));
    await expect(service.startSimulation(principal.current, DEVICE_ID, {})).rejects.toMatchObject({
      code: 'DEVICE_NOT_ACTIVATED',
    });
  });

  it('refuses a caller who cannot write the device', async () => {
    asUser();
    devices.findById.mockResolvedValue(device({ owner_id: 'someone-else' }));
    await expect(service.startSimulation(principal.current, DEVICE_ID, {})).rejects.toMatchObject({
      code: 'NOT_DEVICE_OWNER',
    });
  });

  it('caps how many devices run at once', async () => {
    const ids = Array.from({ length: config.SIMULATION_MAX_CONCURRENT }, (_, i) => `device-${i}`);
    for (const id of ids) {
      devices.findById.mockResolvedValue(device({ id }));
      simulator.start(device({ id }), { intervalMs: 10_000 });
    }
    devices.findById.mockResolvedValue(device({ id: 'one-too-many' }));
    await expect(service.startSimulation(principal.current, 'one-too-many', {})).rejects.toMatchObject({
      code: 'SIMULATION_LIMIT_REACHED',
    });
  });

  it('replaces an existing session rather than stacking timers', async () => {
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 20_000 });
    expect(simulator.activeCount()).toBe(1);
    expect(simulator.statusOf(DEVICE_ID).intervalMs).toBe(20_000);
  });
});

describe('stopping', () => {
  it('stops on request and reports it', async () => {
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    const stopped = await service.stopSimulation(principal.current, DEVICE_ID);
    expect(stopped.running).toBe(false);
    expect(simulator.activeCount()).toBe(0);
  });

  it('is harmless when nothing is running', async () => {
    expect(await service.stopSimulation(principal.current, DEVICE_ID)).toMatchObject({ running: false });
  });

  it('gives up on a device that keeps rejecting readings', async () => {
    telemetry.ingest.mockRejectedValue(new Error('unknown metric'));
    simulator.start(device(), { intervalMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(simulator.activeCount()).toBe(0);
  });

  it('stops everything on shutdown', async () => {
    await service.startSimulation(principal.current, DEVICE_ID, { intervalMs: 10_000 });
    simulator.stopAll();
    expect(simulator.activeCount()).toBe(0);
  });
});
