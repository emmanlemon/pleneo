import { query } from '#infra/database/pool.js';
import { DomainErrors } from '#common/errors/domain-errors.js';
import { asyncHandler } from '#common/http/async-handler.js';
import { verifyAccessToken } from '#infra/security/jwt.js';

function extractBearer(req) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
}

async function resolveClientPrincipal(payload) {
  const { rows } = await query(`SELECT status FROM clients WHERE id = $1`, [payload.sub]);
  if (rows[0]?.status !== 'active') throw DomainErrors.invalidToken('Client revoked');
  return {
    type: 'client',
    clientId: payload.sub,
    scopes: payload.scope?.split(' ') ?? [],
    roles: [],
    permissions: [],
    jti: payload.jti,
  };
}

async function resolveUserPrincipal(payload) {
  const { rows } = await query(
    `SELECT s.revoked_at, s.expires_at, u.status, u.password_changed_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2`,
    [payload.sid, payload.sub],
  );
  const row = rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) throw DomainErrors.sessionRevoked();
  if (row.status !== 'active') throw DomainErrors.accountDisabled();
  if (Math.floor(new Date(row.password_changed_at).getTime() / 1000) > payload.iat)
    throw DomainErrors.credentialsChanged();

  return {
    type: 'user',
    userId: payload.sub,
    sessionId: payload.sid,
    email: payload.email,
    roles: payload.roles ?? [],
    permissions: payload.permissions ?? [],
    amr: payload.amr ?? [],
    scopes: [],
    jti: payload.jti,
  };
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw DomainErrors.missingToken();
  const payload = await verifyAccessToken(token);
  req.auth =
    payload.token_use === 'client' ? await resolveClientPrincipal(payload) : await resolveUserPrincipal(payload);
  next();
});
