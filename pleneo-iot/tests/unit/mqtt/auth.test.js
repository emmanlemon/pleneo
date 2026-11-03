import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#modules/devices/credential.repository.js', () => ({ findActiveByDevice: vi.fn(), touch: vi.fn() }));

const { authenticate, canPublish, canSubscribe } = await import('#infra/mqtt/auth.js');
const credentials = await import('#modules/devices/credential.repository.js');
const { deviceToken } = await import('#common/security/crypto.js');
const { config } = await import('#config');

const DEVICE_ID = 'c0071c26-52a6-49ec-972d-f3515531faa5';
const TOKEN = deviceToken(DEVICE_ID);

const credential = (overrides = {}) => ({
  id: 'cred-1',
  device_id: DEVICE_ID,
  external_id: 'sensor-001',
  owner_id: 'owner-1',
  device_type_id: 'type-1',
  device_status: 'active',
  expires_at: null,
  ...overrides,
});

const connect = (token) => {
  const client = {};
  return authenticate(client, 'sensor-001', Buffer.from(token)).then(() => client);
};

const signedIn = () => ({ device: { externalId: 'sensor-001', id: DEVICE_ID } });
const packet = (topic, extra = {}) => ({ topic, payload: Buffer.from('{}'), ...extra });

beforeEach(() => {
  credentials.findActiveByDevice.mockResolvedValue(credential());
});

describe('mqtt authentication', () => {
  it('accepts the same device token the HTTP plane accepts', async () => {
    const client = await connect(TOKEN);
    expect(client.device).toMatchObject({ id: DEVICE_ID, externalId: 'sensor-001', credentialId: 'cred-1' });
  });

  it('never stores or compares the secret in the clear', async () => {
    await connect(TOKEN);
    const [, presentedHash] = credentials.findActiveByDevice.mock.calls[0];
    expect(presentedHash).toHaveLength(64);
    expect(TOKEN).not.toContain(presentedHash);
  });

  it('rejects a malformed token without hitting the database', async () => {
    await expect(connect('not-a-device-token')).rejects.toThrow();
    expect(credentials.findActiveByDevice).not.toHaveBeenCalled();
  });

  it('rejects an unknown, expired or disabled credential', async () => {
    credentials.findActiveByDevice.mockResolvedValueOnce(null);
    await expect(connect(TOKEN)).rejects.toThrow();

    credentials.findActiveByDevice.mockResolvedValueOnce(credential({ expires_at: new Date(Date.now() - 1000) }));
    await expect(connect(TOKEN)).rejects.toThrow();

    credentials.findActiveByDevice.mockResolvedValueOnce(credential({ device_status: 'disabled' }));
    await expect(connect(TOKEN)).rejects.toThrow();
  });
});

describe('topic authorization', () => {
  it('lets a device write only its own uplink topics', () => {
    const client = signedIn();
    expect(canPublish(client, packet('devices/sensor-001/telemetry'))).toBe(true);
    expect(canPublish(client, packet('devices/sensor-001/state/reported'))).toBe(true);
    expect(canPublish(client, packet('devices/sensor-001/commands/ack'))).toBe(true);
  });

  it('stops a device writing to another device', () => {
    const client = signedIn();
    expect(canPublish(client, packet('devices/sensor-002/telemetry'))).toBe(false);
    expect(canSubscribe(client, { topic: 'devices/sensor-002/commands' })).toBe(false);
  });

  it('stops a device writing its own downlink topics', () => {
    const client = signedIn();
    expect(canPublish(client, packet('devices/sensor-001/commands'))).toBe(false);
    expect(canPublish(client, packet('devices/sensor-001/state/desired'))).toBe(false);
  });

  it('refuses wildcards and foreign roots', () => {
    const client = signedIn();
    expect(canSubscribe(client, { topic: 'devices/+/commands' })).toBe(false);
    expect(canSubscribe(client, { topic: 'devices/#' })).toBe(false);
    expect(canPublish(client, packet('$SYS/broker/load'))).toBe(false);
    expect(canPublish(client, packet('telemetry'))).toBe(false);
  });

  it('lets a device subscribe only to its own downlink topics', () => {
    const client = signedIn();
    expect(canSubscribe(client, { topic: 'devices/sensor-001/commands' })).toBe(true);
    expect(canSubscribe(client, { topic: 'devices/sensor-001/state/desired' })).toBe(true);
    expect(canSubscribe(client, { topic: 'devices/sensor-001/telemetry' })).toBe(false);
  });

  it('rejects an oversized payload', () => {
    const client = signedIn();
    const huge = Buffer.alloc(config.MQTT_MAX_PAYLOAD_BYTES + 1);
    expect(canPublish(client, { topic: 'devices/sensor-001/telemetry', payload: huge })).toBe(false);
  });

  it('allows retain only on the status topic', () => {
    const client = signedIn();
    expect(canPublish(client, packet('devices/sensor-001/status', { retain: true }))).toBe(true);
    expect(canPublish(client, packet('devices/sensor-001/telemetry', { retain: true }))).toBe(false);
  });

  it('denies everything for a client that never authenticated', () => {
    expect(canPublish({}, packet('devices/sensor-001/telemetry'))).toBe(false);
    expect(canSubscribe({}, { topic: 'devices/sensor-001/commands' })).toBe(false);
  });
});
