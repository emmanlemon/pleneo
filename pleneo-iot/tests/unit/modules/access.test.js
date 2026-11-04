import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asAdmin, asClient, asUser, device, DEVICE_ID, OTHER_USER_ID, principal, USER_ID } from '../../helpers/fixtures.js';

vi.mock('#infra/database/pool.js', () => ({ query: vi.fn(), withTransaction: vi.fn(), pool: {} }));
vi.mock('#modules/devices/device.repository.js');

const devices = await import('#modules/devices/device.repository.js');
const access = await import('#modules/devices/access.js');

beforeEach(() => {
  vi.resetAllMocks();
  asUser();
});

describe('ownerScope', () => {
  it('narrows a user to their own devices and opens the fleet to a platform permission', () => {
    expect(access.ownerScope(principal.current)).toBe(USER_ID);
    asAdmin();
    expect(access.ownerScope(principal.current)).toBeNull();
    asClient(['devices:read']);
    expect(access.ownerScope(principal.current)).toBeNull();
  });

  it('refuses a client that holds no read scope rather than returning an unfiltered scope', () => {
    asClient(['events:publish']);
    expect(() => access.ownerScope(principal.current)).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }));
  });
});

describe('loadAccessible', () => {
  it('lets the owner read and write, a stranger neither', async () => {
    devices.findById.mockResolvedValue(device());
    await expect(access.loadAccessible(DEVICE_ID, principal.current, { write: true })).resolves.toBeTruthy();
    devices.findById.mockResolvedValue(device({ owner_id: OTHER_USER_ID }));
    await expect(access.loadAccessible(DEVICE_ID, principal.current)).rejects.toMatchObject({
      code: 'NOT_RESOURCE_OWNER',
    });
  });

  it('separates a read scope from a write scope for clients', async () => {
    devices.findById.mockResolvedValue(device());
    asClient(['devices:read']);
    await expect(access.loadAccessible(DEVICE_ID, principal.current)).resolves.toBeTruthy();
    await expect(access.loadAccessible(DEVICE_ID, principal.current, { write: true })).rejects.toMatchObject({
      code: 'NOT_RESOURCE_OWNER',
    });
  });
});

describe('resolveOwnerId', () => {
  it('defaults to the caller and refuses a client that names nobody', () => {
    expect(access.resolveOwnerId(principal.current, undefined)).toBe(USER_ID);
    asClient(['devices:write']);
    expect(() => access.resolveOwnerId(principal.current, undefined)).toThrow(
      expect.objectContaining({ code: 'OWNER_REQUIRED' }),
    );
    expect(access.resolveOwnerId(principal.current, OTHER_USER_ID)).toBe(OTHER_USER_ID);
  });

  it('refuses a plain user registering for someone else', () => {
    expect(() => access.resolveOwnerId(principal.current, OTHER_USER_ID)).toThrow(
      expect.objectContaining({ code: 'NOT_RESOURCE_OWNER' }),
    );
  });
});
