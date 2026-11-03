import { describe, expect, it, vi } from 'vitest';
import { DEVICE_ID } from '../../helpers/fixtures.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/devices/credential.repository.js');

const credentials = await import('#modules/devices/credential.repository.js');
const { authenticateDevice } = await import('#common/middleware/authenticate-device.js');
const { deviceToken, parseDeviceToken, keyedHash } = await import('#common/security/crypto.js');

const TOKEN = deviceToken(DEVICE_ID);

const run = (authorization) =>
  new Promise((resolve) => {
    const req = { get: (h) => (h.toLowerCase() === 'authorization' ? authorization : undefined) };
    authenticateDevice(req, {}, (err) => resolve({ err, device: req.device }));
  });

const credential = (overrides = {}) => ({
  id: 'cred-1',
  device_id: DEVICE_ID,
  expires_at: null,
  external_id: 'sensor-001',
  owner_id: 'owner',
  device_type_id: 'type',
  device_status: 'active',
  ...overrides,
});

describe('device token format', () => {
  it('round-trips the device id and rejects malformed tokens', () => {
    expect(parseDeviceToken(TOKEN)).toMatchObject({ deviceId: DEVICE_ID });
    expect(parseDeviceToken('dev_short_x')).toBeNull();
    expect(parseDeviceToken('Bearer something')).toBeNull();
    expect(parseDeviceToken(undefined)).toBeNull();
  });
});

describe('authenticateDevice', () => {
  it('rejects a missing or malformed credential without hitting the database', async () => {
    expect((await run(undefined)).err.code).toBe('DEVICE_AUTH_REQUIRED');
    expect((await run('Bearer nonsense')).err.code).toBe('DEVICE_AUTH_REQUIRED');
    expect(credentials.findActiveByDevice).not.toHaveBeenCalled();
  });

  it('looks the credential up by device id and hashed token', async () => {
    credentials.findActiveByDevice.mockResolvedValue(credential());
    const { err, device } = await run(`Bearer ${TOKEN}`);
    expect(err).toBeUndefined();
    expect(device).toMatchObject({ id: DEVICE_ID, externalId: 'sensor-001', credentialId: 'cred-1' });
    expect(credentials.findActiveByDevice).toHaveBeenCalledWith(DEVICE_ID, keyedHash(TOKEN));
  });

  it('rejects unknown, expired and disabled credentials', async () => {
    credentials.findActiveByDevice.mockResolvedValueOnce(null);
    expect((await run(`Bearer ${TOKEN}`)).err.code).toBe('INVALID_DEVICE_CREDENTIAL');

    credentials.findActiveByDevice.mockResolvedValueOnce(
      credential({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    );
    expect((await run(`Bearer ${TOKEN}`)).err.code).toBe('DEVICE_CREDENTIAL_EXPIRED');

    credentials.findActiveByDevice.mockResolvedValueOnce(credential({ device_status: 'disabled' }));
    expect((await run(`Bearer ${TOKEN}`)).err.code).toBe('DEVICE_DISABLED');
  });

  it('does not accept a token issued for a different device', async () => {
    credentials.findActiveByDevice.mockResolvedValue(null);
    const otherToken = deviceToken('99999999-9999-4999-8999-999999999999');
    expect((await run(`Bearer ${otherToken}`)).err.code).toBe('INVALID_DEVICE_CREDENTIAL');
    expect(credentials.findActiveByDevice).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
      keyedHash(otherToken),
    );
  });
});
