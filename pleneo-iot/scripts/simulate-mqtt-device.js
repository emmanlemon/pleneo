import { setTimeout as sleep } from 'node:timers/promises';
import mqtt from 'mqtt';

const HTTP_BASE = (process.env.IOT_URL ?? 'http://localhost:4300').replace(/\/$/, '');
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const EXTERNAL_ID = process.env.DEVICE_EXTERNAL_ID;
const CLAIM_CODE = process.env.DEVICE_CLAIM_CODE;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5000);
const ITERATIONS = Number(process.env.ITERATIONS ?? 0);
const SPIKE_AT = Number(process.env.SPIKE_AT ?? 0);

let token = process.env.DEVICE_TOKEN;
let externalId = EXTERNAL_ID;

const reading = (iteration) => ({
  temperature: SPIKE_AT && iteration >= SPIKE_AT ? 14 + Math.random() : 4 + Math.random(),
  humidity: 45 + Math.random() * 10,
  battery: Math.max(5, 100 - iteration),
});

async function activate() {
  if (token) return;
  if (!EXTERNAL_ID || !CLAIM_CODE)
    throw new Error('Set DEVICE_TOKEN, or DEVICE_EXTERNAL_ID and DEVICE_CLAIM_CODE to activate');

  const res = await fetch(`${HTTP_BASE}/v1/device/activate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ externalId: EXTERNAL_ID, claimCode: CLAIM_CODE, firmware: '1.4.2' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`activate -> ${res.status} ${data?.code ?? ''} ${data?.detail ?? ''}`);
  token = data.token;
  externalId = data.externalId;
  process.stdout.write(`activated ${externalId}\nDEVICE_TOKEN=${token}\n`);
}

async function main() {
  await activate();
  if (!externalId) throw new Error('Set DEVICE_EXTERNAL_ID so the simulator knows its topic prefix');

  const topic = (leaf) => `devices/${externalId}/${leaf}`;
  const client = await mqtt.connectAsync(MQTT_URL, {
    username: externalId,
    password: token,
    will: { topic: topic('status'), payload: JSON.stringify({ status: 'offline' }), qos: 1, retain: true },
  });
  process.stdout.write(`connected to ${MQTT_URL} as ${externalId}\n`);

  client.on('message', (received, payload) => {
    const body = JSON.parse(payload.toString());
    if (received === topic('commands')) {
      process.stdout.write(`command ${body.type} received\n`);
      client.publish(
        topic('commands/ack'),
        JSON.stringify({ id: body.id, status: 'acknowledged', result: { applied: true } }),
        { qos: 1 },
      );
      return;
    }
    process.stdout.write(`desired state v${body.version} received\n`);
    client.publish(topic('state/reported'), JSON.stringify({ ...body.desired, firmware: '1.4.2' }), { qos: 1 });
  });

  await client.subscribeAsync([topic('commands'), topic('state/desired')], { qos: 1 });
  client.publish(topic('status'), JSON.stringify({ status: 'online' }), { qos: 1, retain: true });

  for (let i = 1; ITERATIONS === 0 || i <= ITERATIONS; i += 1) {
    await client.publishAsync(topic('telemetry'), JSON.stringify({ metrics: reading(i) }), { qos: 1 });
    process.stdout.write(`tick ${i}: published ${Object.keys(reading(i)).length} metrics\n`);
    if (ITERATIONS === 0 || i < ITERATIONS) await sleep(INTERVAL_MS);
  }

  await sleep(500);
  await client.endAsync();
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
