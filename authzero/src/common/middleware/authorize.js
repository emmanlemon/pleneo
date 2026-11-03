import { DomainErrors } from '#common/errors/domain-errors.js';

const isUser = (req) => req.auth?.type === 'user';
const isClient = (req) => req.auth?.type === 'client';

export const requireUser = (req, _res, next) => next(isUser(req) ? undefined : DomainErrors.userTokenRequired());

export const requirePermission =
  (...permissions) =>
  (req, _res, next) => {
    const granted = new Set(req.auth?.permissions ?? []);
    next(isUser(req) && permissions.every((p) => granted.has(p)) ? undefined : DomainErrors.insufficientPermissions());
  };

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    const held = new Set(req.auth?.roles ?? []);
    next(isUser(req) && roles.some((r) => held.has(r)) ? undefined : DomainErrors.insufficientPermissions());
  };

export const requireScope =
  (...scopes) =>
  (req, _res, next) => {
    const granted = new Set(req.auth?.scopes ?? []);
    next(isClient(req) && scopes.every((s) => granted.has(s)) ? undefined : DomainErrors.insufficientScope());
  };

export const requireMfa = (req, _res, next) =>
  next(isUser(req) && req.auth.amr.includes('otp') ? undefined : DomainErrors.mfaStepUpRequired());
