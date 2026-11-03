import { config } from '#config';
import { keyedHash, parseDeviceToken, safeEqual } from '#common/security/crypto.js';
import * as credentials from '#modules/devices/credential.repository.js';
import { LEAF, PUBLISHABLE, SUBSCRIBABLE, parseTopic } from './topics.js';

const DUMMY_HASH = 'x'.repeat(64);
const UNAUTHORIZED = Object.assign(new Error('device credentials rejected'), { returnCode: 4 });

export async function authenticate(client, username, password) {
  const raw = password ? password.toString('utf8') : (username ?? '');
  const parsed = parseDeviceToken(raw);
  if (!parsed) {
    safeEqual(DUMMY_HASH, keyedHash(raw));
    throw UNAUTHORIZED;
  }

  const credential = await credentials.findActiveByDevice(parsed.deviceId, keyedHash(parsed.token));
  if (!credential) throw UNAUTHORIZED;
  if (credential.expires_at && new Date(credential.expires_at) <= new Date()) throw UNAUTHORIZED;
  if (credential.device_status === 'disabled') throw UNAUTHORIZED;

  client.device = {
    id: credential.device_id,
    externalId: credential.external_id,
    ownerId: credential.owner_id,
    deviceTypeId: credential.device_type_id,
    credentialId: credential.id,
  };
  return client.device;
}

const ownTopic = (client, topic, allowed) => {
  const parsed = parseTopic(topic);
  return Boolean(parsed && parsed.externalId === client.device?.externalId && allowed.has(parsed.leaf));
};

export const canPublish = (client, packet) => {
  if (packet.payload && packet.payload.length > config.MQTT_MAX_PAYLOAD_BYTES) return false;
  if (packet.retain && parseTopic(packet.topic)?.leaf !== LEAF.status) return false;
  return ownTopic(client, packet.topic, PUBLISHABLE);
};

export const canSubscribe = (client, subscription) => ownTopic(client, subscription.topic, SUBSCRIBABLE);
