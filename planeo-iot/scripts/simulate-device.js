import { setTimeout as sleep } from 'node:timers/promises';

const BASE = (process.env.IOT_URL ?? 'http://localhost:4300').replace(/\/$/, '');
const EXTERNAL_ID = process.env.DEVICE_EXTERNAL_ID;
const CLAIM_CODE = process.env.DEVICE_CLAIM_CODE;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5000);
const ITERATIONS = Number(process.env.ITERATIONS ?? 0);
const SPIKE_AT = Number(process.env.SPIKE_AT ?? 0);

let token = process.env.DEVICE_TOKEN;

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.code ?? ''} ${data?.detail ?? ''}`);
  return data;
}

const reading = (iteration) => ({
  temperature: SPIKE_AT && iteration >= SPIKE_AT ? 14 + Math.random() : 4 + Math.random(),
  humidity: 45 + Math.random() * 10,
  battery: Math.max(5, 100 - iteration),
});

async function main() {
  if (!token) {
    if (!EXTERNAL_ID || !CLAIM_CODE)
      throw new Error('Set DEVICE_TOKEN, or DEVICE_EXTERNAL_ID and DEVICE_CLAIM_CODE to activate');
    const activation = await call('/v1/device/activate', {
      method: 'POST',
      auth: false,
      body: { externalId: EXTERNAL_ID, claimCode: CLAIM_CODE, firmware: '1.4.2' },
    });
    token = activation.token;
    process.stdout.write(`activated ${activation.externalId} (${activation.deviceId})\nDEVICE_TOKEN=${token}\n`);
  }

  const identity = await call('/v1/device/me');
  process.stdout.write(
    `device ${identity.externalId} reporting metrics: ${identity.metrics.map((m) => m.key).join(', ')}\n`,
  );

  for (let i = 1; ITERATIONS === 0 || i <= ITERATIONS; i++) {
    const result = await call('/v1/device/telemetry', { method: 'POST', body: { metrics: reading(i) } });
    const { commands } = await call('/v1/device/commands');
    for (const command of commands) {
      process.stdout.write(`command ${command.type} received\n`);
      await call(`/v1/device/commands/${command.id}/ack`, {
        method: 'POST',
        body: { status: 'acknowledged', result: { applied: true } },
      });
    }
    const { desired } = await call('/v1/device/state');
    if (Object.keys(desired).length)
      await call('/v1/device/state/reported', { method: 'PUT', body: { ...desired, firmware: '1.4.2' } });

    process.stdout.write(
      `tick ${i}: accepted=${result.accepted} duplicates=${result.duplicates} alerts=${result.alerts} commands=${commands.length}\n`,
    );
    if (ITERATIONS === 0 || i < ITERATIONS) await sleep(INTERVAL_MS);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
