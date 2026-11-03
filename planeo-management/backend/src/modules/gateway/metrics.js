const blank = () => ({
  requests: 0,
  retries: 0,
  failures: 0,
  shortCircuited: 0,
  blocked: 0,
  totalMs: 0,
  maxMs: 0,
  statuses: {},
});

const counters = new Map();

const of = (name) => {
  if (!counters.has(name)) counters.set(name, blank());
  return counters.get(name);
};

export function record(name, { status, durationMs, attempts }) {
  const c = of(name);
  c.requests += 1;
  c.retries += Math.max(0, attempts - 1);
  if (status >= 500) c.failures += 1;
  c.totalMs += durationMs;
  c.maxMs = Math.max(c.maxMs, durationMs);
  const bucket = `${Math.floor(status / 100)}xx`;
  c.statuses[bucket] = (c.statuses[bucket] ?? 0) + 1;
}

export const shortCircuited = (name) => {
  of(name).shortCircuited += 1;
};

export const blocked = (name) => {
  of(name).blocked += 1;
};

export function snapshot(breakers) {
  const upstreams = {};
  for (const [name, c] of counters) {
    upstreams[name] = {
      ...c,
      avgMs: c.requests ? Math.round(c.totalMs / c.requests) : 0,
      breaker: breakers.get(name)?.snapshot() ?? null,
    };
    delete upstreams[name].totalMs;
  }
  for (const [name, breaker] of breakers) {
    upstreams[name] ??= { ...blank(), avgMs: 0, breaker: breaker.snapshot() };
  }
  return { upstreams, generatedAt: new Date().toISOString() };
}

export const resetMetrics = () => counters.clear();
