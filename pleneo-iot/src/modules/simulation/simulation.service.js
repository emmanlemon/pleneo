import { config } from '#config';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { loadAccessible } from '#modules/devices/access.js';
import * as simulator from './simulator.js';

function assertEnabled() {
  if (!config.SIMULATION_ENABLED) throw DomainErrors.simulationDisabled();
}

export async function startSimulation(auth, deviceId, { intervalMs, spike }) {
  assertEnabled();
  const device = await loadAccessible(deviceId, auth, { write: true });
  if (device.status !== 'active') throw DomainErrors.deviceNotActivated();

  const session = simulator.start(device, { intervalMs: intervalMs ?? config.SIMULATION_INTERVAL_MS, spike });
  if (!session) throw DomainErrors.simulationLimitReached(config.SIMULATION_MAX_CONCURRENT);
  return session;
}

export async function stopSimulation(auth, deviceId) {
  await loadAccessible(deviceId, auth, { write: true });
  return simulator.stop(deviceId, 'stopped by operator') ?? { running: false, deviceId };
}

export async function simulationStatus(auth, deviceId) {
  await loadAccessible(deviceId, auth);
  return simulator.statusOf(deviceId);
}
