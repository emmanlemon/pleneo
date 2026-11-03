export function createBreaker({ failureThreshold = 5, resetMs = 15_000 } = {}) {
  let state = 'closed';
  let failures = 0;
  let openedAt = 0;
  let probing = false;

  const remainingMs = () => Math.max(0, resetMs - (Date.now() - openedAt));

  return {
    allow() {
      if (state === 'closed') return true;
      if (probing || remainingMs() > 0) return false;
      state = 'half-open';
      probing = true;
      return true;
    },
    success() {
      state = 'closed';
      failures = 0;
      probing = false;
    },
    failure() {
      const wasProbing = probing;
      probing = false;
      failures += 1;
      if (wasProbing || failures >= failureThreshold) {
        state = 'open';
        openedAt = Date.now();
      }
    },
    retryAfterSeconds: () => Math.max(1, Math.ceil(remainingMs() / 1000)),
    snapshot: () => ({ state, failures, openFor: state === 'open' ? remainingMs() : 0 }),
    reset() {
      state = 'closed';
      failures = 0;
      openedAt = 0;
      probing = false;
    },
  };
}
