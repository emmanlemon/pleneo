import { config } from '#config';
import { signAccessToken } from '#infra/security/jwt.js';
import * as roles from '#modules/users/role.repository.js';
import * as sessions from '../repositories/session.repository.js';

export async function issueSession(user, ctx, client, { familyId, amr } = {}) {
  const session = await sessions.create({ userId: user.id, familyId, ctx }, client);
  const authorization = await roles.getAuthorization(user.id, client);
  const accessToken = await signAccessToken({
    subject: user.id,
    claims: {
      token_use: 'user',
      sid: session.id,
      email: user.email,
      email_verified: user.email_verified,
      ...authorization,
      amr: amr ?? (user.mfa_enabled ? ['pwd', 'otp'] : ['pwd']),
    },
  });
  return {
    tokenType: 'Bearer',
    accessToken,
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.expires_at,
    sessionId: session.id,
  };
}
