import { DomainErrors } from '#common/errors/domain-errors.js';

const deny = (req) =>
  req.auth?.type === 'client' ? DomainErrors.insufficientScope() : DomainErrors.insufficientPermissions();

export const requireUser = (req, _res, next) =>
  next(req.auth?.type === 'user' ? undefined : DomainErrors.userTokenRequired());

export const requirePermission =
  (...permissions) =>
  (req, _res, next) => {
    const granted = new Set(req.auth?.permissions ?? []);
    next(permissions.every((p) => granted.has(p)) ? undefined : deny(req));
  };
