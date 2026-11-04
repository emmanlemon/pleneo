import { DomainErrors } from '#common/errors/domain-errors.js';
import { requestContext } from '#common/http/request-context.js';
import { accepted, noContent, ok } from '#common/http/respond.js';
import * as upstream from './authzero.client.js';
import { clearSessionCookies, readSessionToken, setSessionCookies } from './session-cookie.js';
import { establish, destroy } from './session.service.js';

async function startSession(res, tokens, req) {
  const { sessionToken, csrfToken, profile } = await establish({ tokens, ctx: requestContext(req) });
  setSessionCookies(res, { sessionToken, csrfToken });
  return { user: profile, csrfToken };
}

export const login = async (req, res) => {
  const result = await upstream.login(req.body);
  if (result.mfaRequired) return ok(res, { mfaRequired: true, mfaToken: result.mfaToken, expiresIn: result.expiresIn });
  ok(res, { mfaRequired: false, ...(await startSession(res, result, req)) });
};

export const loginMfa = async (req, res) => {
  const tokens = await upstream.loginMfa(req.body);
  ok(res, { mfaRequired: false, ...(await startSession(res, tokens, req)) });
};

export const session = async (req, res) => {
  if (!req.auth) throw DomainErrors.sessionRequired();
  const profile = await upstream.profile(req.bff.accessToken);
  ok(res, { user: profile });
};

export const logout = async (req, res) => {
  await destroy(readSessionToken(req));
  clearSessionCookies(res);
  noContent(res);
};

export const register = async (req, res) => accepted(res, (await upstream.register(req.body)).message);
export const verifyEmail = async (req, res) => ok(res, await upstream.verifyEmail(req.body));
export const resendVerification = async (req, res) => {
  await upstream.resendVerification(req.body);
  accepted(res, 'If the account exists and is unverified, a verification email has been sent');
};
export const forgotPassword = async (req, res) => {
  await upstream.forgotPassword(req.body);
  accepted(res, 'If the account exists, a password reset email has been sent');
};
export const resetPassword = async (req, res) => ok(res, await upstream.resetPassword(req.body));
export const acceptInvitation = async (req, res) => ok(res, await upstream.acceptInvitation(req.body));

export const changePassword = async (req, res) => {
  const result = await upstream.changePassword(req.body, req.bff.accessToken);
  ok(res, result);
};
