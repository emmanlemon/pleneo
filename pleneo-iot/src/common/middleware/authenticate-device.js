import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler } from '#common/http/async-handler.js';
import { keyedHash, parseDeviceToken, safeEqual } from '#common/security/crypto.js';
import * as credentials from '#modules/devices/credential.repository.js';

const DUMMY_HASH = 'x'.repeat(64);

function extractToken(req) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token && !extra) return token;
  return req.get('x-device-token') ?? null;
}

export const authenticateDevice = asyncHandler(async (req, _res, next) => {
  const raw = extractToken(req);
  const parsed = parseDeviceToken(raw);
  if (!parsed) {
    safeEqual(DUMMY_HASH, keyedHash(raw ?? ''));
    throw DomainErrors.deviceAuthRequired();
  }

  const credential = await credentials.findActiveByDevice(parsed.deviceId, keyedHash(parsed.token));
  if (!credential) throw DomainErrors.invalidDeviceCredential();
  if (credential.expires_at && new Date(credential.expires_at) <= new Date())
    throw DomainErrors.deviceCredentialExpired();
  if (credential.device_status === 'disabled') throw DomainErrors.deviceDisabled();

  req.device = {
    id: credential.device_id,
    externalId: credential.external_id,
    ownerId: credential.owner_id,
    deviceTypeId: credential.device_type_id,
    status: credential.device_status,
    credentialId: credential.id,
  };
  next();
});
