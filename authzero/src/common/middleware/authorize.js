import { DomainErrors } from '#common/errors/domain-errors.js';

const isUser = (req) => req.auth?.type === 'user';
const deny = (req) =>
  req.auth?.type === 'client' ? DomainErrors.insufficientScope() : DomainErrors.insufficientPermissions();

export const requireUser = (req, _res, next) => next(isUser(req) ? undefined : DomainErrors.userTokenRequired());

export const requirePermission =
  (...permissions) =>
  (req, _res, next) => {
    const granted = new Set(req.auth?.permissions ?? []);
    next(permissions.every((p) => granted.has(p)) ? undefined : deny(req));
  };

export const requireMfa = (req, _res, next) =>
  next(isUser(req) && req.auth.amr.includes('otp') ? undefined : DomainErrors.mfaStepUpRequired());
