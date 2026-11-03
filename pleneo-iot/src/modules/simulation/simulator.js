import { config } from '#config';
import { logger } from '#infra/logging/logger.js';
import * as devices from '#modules/devices/device.repository.js';
import { ingest } from '#modules/telemetry/telemetry.service.js';

const log = logger.child({ component: 'simulator' });
const running = new Map();

const span = (metric) => {
  const min = Number.isFinite(metric.min) ? metric.min : 0;
  const max = Number.isFinite(metric.max) ? metric.max : min + 100;
  return { min, max };
};

/** A slow random walk inside the metric's declared range, so a chart looks like a sensor. */
function nextValue(metric, previous, spike) {
  const { min, max } = span(metric);
  if (spike) return Number((max + (max - min) * 0.1).toFixed(3));
  const start = previous ?? min + (max - min) / 2;
  const drift = (max - min) * 0.04 * (Math.random() * 2 - 1);
  return Number(Math.min(max, Math.max(min, start + drift)).toFixed(3));
}

async function tick(session) {
  const device = await devices.findById(session.deviceId);
  if (!device || device.status === 'disabled') return stop(session.deviceId, 'device unavailable');

  const metrics = device.device_type_metrics ?? [];
  if (!metrics.length) return stop(session.deviceId, 'device type declares no metrics');

  const spiking = session.spike && session.ticks > 0 && session.ticks % 5 === 0;
  const readings = metrics.map((metric) => {
    const value = nextValue(metric, session.last.get(metric.key), spiking);
    session.last.set(metric.key, value);
    return { metric: metric.key, value };
  });

  try {
    const result = await ingest(device, readings);
    session.ticks += 1;
    session.lastReadingAt = new Date().toISOString();
    session.alerts += result.alerts;
  } catch (err) {
    session.errors += 1;
    log.warn({ deviceId: session.deviceId, err: err.message }, 'simulated reading rejected');
    if (session.errors >= 5) stop(session.deviceId, 'too many rejected readings');
  }
}

export function start(device, { intervalMs, spike = false }) {
  if (running.size >= config.SIMULATION_MAX_CONCURRENT && !running.has(device.id)) return null;
  stop(device.id, 'restarted');

  const session = {
    deviceId: device.id,
    externalId: device.external_id,
    intervalMs,
    spike,
    ticks: 0,
    alerts: 0,
    errors: 0,
    last: new Map(),
    startedAt: new Date().toISOString(),
    lastReadingAt: null,
    expiresAt: new Date(Date.now() + config.SIMULATION_MAX_DURATION_MS).toISOString(),
  };

  session.timer = setInterval(() => void tick(session), intervalMs).unref();
  session.deadline = setTimeout(() => stop(device.id, 'reached the maximum duration'), config.SIMULATION_MAX_DURATION_MS).unref();
  running.set(device.id, session);
  void tick(session);

  log.info({ deviceId: device.id, intervalMs, spike }, 'simulation started');
  return describe(session);
}

export function stop(deviceId, reason = 'stopped') {
  const session = running.get(deviceId);
  if (!session) return null;
  clearInterval(session.timer);
  clearTimeout(session.deadline);
  running.delete(deviceId);
  log.info({ deviceId, reason, ticks: session.ticks }, 'simulation stopped');
  return describe(session);
}

export const describe = (session) =>
  session && {
    running: running.has(session.deviceId),
    deviceId: session.deviceId,
    intervalMs: session.intervalMs,
    spike: session.spike,
    readings: session.ticks,
    alerts: session.alerts,
    startedAt: session.startedAt,
    lastReadingAt: session.lastReadingAt,
    expiresAt: session.expiresAt,
  };

export const statusOf = (deviceId) => describe(running.get(deviceId)) ?? { running: false, deviceId };
export const activeCount = () => running.size;
export const stopAll = () => [...running.keys()].forEach((id) => stop(id, 'shutting down'));
