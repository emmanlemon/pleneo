import { DomainErrors } from '#common/errors/domain-errors.js';
import { requestContext } from '#common/http/request-context.js';
import { accepted, noContent, ok } from '#common/http/respond.js';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './refresh-cookie.js';
import * as loginService from './services/login.service.js';
import * as passwordService from './services/password.service.js';
import * as registrationService from './services/registration.service.js';
import * as sessionService from './services/session.service.js';

function sendTokens(res, result) {
  setRefreshCookie(res, result.refreshToken);
  ok(res, result);
}

export const register = async (req, res) => {
  await registrationService.register(req.body, requestContext(req));
  accepted(res, 'If the email address is available, a verification email has been sent');
};

export const login = async (req, res) => {
  const result = await loginService.login(req.body, requestContext(req));
  result.mfaRequired ? ok(res, result) : sendTokens(res, result);
};

export const loginMfa = async (req, res) => sendTokens(res, await loginService.loginMfa(req.body, requestContext(req)));

export const refresh = async (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw DomainErrors.missingToken('Missing refresh token');
  try {
    sendTokens(res, await sessionService.refresh(token, requestContext(req)));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const logout = async (req, res) => {
  await sessionService.logout(req.auth, requestContext(req));
  clearRefreshCookie(res);
  noContent(res);
};

export const logoutAll = async (req, res) => {
  await sessionService.logoutAll(req.auth, requestContext(req));
  clearRefreshCookie(res);
  noContent(res);
};

export const verifyEmail = async (req, res) => {
  await registrationService.verifyEmail(req.body, requestContext(req));
  ok(res, { message: 'Email verified' });
};

export const resendVerification = async (req, res) => {
  await registrationService.resendVerification(req.body, requestContext(req));
  accepted(res, 'If the account exists and is unverified, a verification email has been sent');
};

export const forgotPassword = async (req, res) => {
  await passwordService.forgotPassword(req.body, requestContext(req));
  accepted(res, 'If the account exists, a password reset email has been sent');
};

export const resetPassword = async (req, res) => {
  await passwordService.resetPassword(req.body, requestContext(req));
  ok(res, { message: 'Password updated. Please sign in again.' });
};

export const changePassword = async (req, res) => {
  await passwordService.changePassword(req.auth, req.body, requestContext(req));
  ok(res, { message: 'Password updated. Other sessions were signed out.' });
};

export const listSessions = async (req, res) => ok(res, { sessions: await sessionService.listSessions(req.auth) });

export const revokeSession = async (req, res) => {
  await sessionService.revokeSession(req.auth, req.params.id, requestContext(req));
  noContent(res);
};
