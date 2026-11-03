import { readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { Aedes } from 'aedes';
import { config } from '#config';
import { logger } from '#infra/logging/logger.js';
import { authenticate, canPublish, canSubscribe } from './auth.js';
import { setPublisher } from './bus.js';
import { dispatch, onConnected, onDisconnected } from './handlers.js';

const log = logger.child({ component: 'mqtt' });
const denied = (reason) => Object.assign(new Error(reason), { returnCode: 5 });

let broker = null;
let server = null;

function createServer(handle) {
  if (!config.MQTT_TLS_KEY_PATH) return net.createServer(handle);
  return tls.createServer(
    { key: readFileSync(config.MQTT_TLS_KEY_PATH), cert: readFileSync(config.MQTT_TLS_CERT_PATH), minVersion: 'TLSv1.2' },
    handle,
  );
}

export async function createBroker() {
  const instance = await Aedes.createBroker({
    concurrency: 100,
    connectTimeout: config.MQTT_CONNECT_TIMEOUT_MS,
    authenticate: (client, username, password, done) =>
      authenticate(client, username, password).then(
        () => done(null, true),
        (err) => done(err, false),
      ),
    authorizePublish: (client, packet, done) =>
      done(canPublish(client, packet) ? null : denied('publish denied')),
    authorizeSubscribe: (client, subscription, done) =>
      canSubscribe(client, subscription) ? done(null, subscription) : done(denied('subscribe denied')),
  });

  instance.on('clientReady', (client) => void onConnected(client).catch((err) => log.error({ err }, 'connect failed')));
  instance.on('clientDisconnect', (client) => void onDisconnected(client).catch((err) => log.error({ err }, 'disconnect failed')));
  instance.on('publish', (packet, client) => {
    if (client) void dispatch(client, packet);
  });
  instance.on('clientError', (client, err) =>
    log.warn({ deviceId: client?.device?.id, err: err.message }, 'client error'),
  );
  instance.on('connectionError', (_client, err) => log.warn({ err: err.message }, 'connection error'));

  return instance;
}

export async function startMqtt() {
  if (!config.MQTT_ENABLED) return null;

  broker = await createBroker();
  setPublisher((topic, payload, options = {}) => {
    broker.publish({ topic, payload, qos: 1, retain: false, cmd: 'publish', ...options }, () => {});
    return true;
  });

  server = createServer(broker.handle);
  server.maxConnections = 10_000;
  server.listen(config.MQTT_PORT, config.MQTT_HOST, () =>
    log.info({ port: config.MQTT_PORT, tls: Boolean(config.MQTT_TLS_KEY_PATH) }, 'mqtt broker listening'),
  );
  return broker;
}

export function stopMqtt() {
  setPublisher(null);
  server?.close();
  broker?.close();
  server = null;
  broker = null;
}

export const connectedDevices = () => (broker ? Object.keys(broker.clients).length : 0);
