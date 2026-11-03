import * as rules from './rule.repository.js';

const CACHE_TTL_MS = 30_000;

const COMPARATORS = {
  gt: (value, threshold) => value > threshold,
  gte: (value, threshold) => value >= threshold,
  lt: (value, threshold) => value < threshold,
  lte: (value, threshold) => value <= threshold,
  eq: (value, threshold) => value === threshold,
  neq: (value, threshold) => value !== threshold,
};

const SYMBOLS = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '==', neq: '!=' };

let cache = { byMetric: new Map(), loadedAt: 0 };

export const breaches = (rule, value) => COMPARATORS[rule.operator](value, rule.threshold);

export const describeBreach = (rule, value, metric) =>
  `${metric} is ${value} (${SYMBOLS[rule.operator]} ${rule.threshold})`;

export const invalidateRuleCache = () => {
  cache = { byMetric: new Map(), loadedAt: 0 };
};

export async function loadRules(force = false) {
  if (!force && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.byMetric;
  const byMetric = new Map();
  for (const rule of await rules.listEnabled()) {
    if (!byMetric.has(rule.metric)) byMetric.set(rule.metric, []);
    byMetric.get(rule.metric).push(rule);
  }
  cache = { byMetric, loadedAt: Date.now() };
  return byMetric;
}

export const matchesDevice = (rule, device) =>
  rule.device_id ? rule.device_id === device.id : rule.device_type_id === device.device_type_id;

export async function evaluate(device, readings) {
  const byMetric = await loadRules();
  const breached = [];
  for (const reading of readings) {
    for (const rule of byMetric.get(reading.metric) ?? []) {
      if (matchesDevice(rule, device) && breaches(rule, reading.value)) breached.push({ rule, reading });
    }
  }
  return breached;
}
