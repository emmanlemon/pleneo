import { requestContext } from '#common/http/request-context.js';
import { noContent, ok } from '#common/http/respond.js';
import * as mfa from './mfa.service.js';

export const setup = async (req, res) => ok(res, await mfa.setup(req.auth, requestContext(req)));
export const enable = async (req, res) => ok(res, await mfa.enable(req.auth, req.body, requestContext(req)));
export const regenerateRecoveryCodes = async (req, res) =>
  ok(res, await mfa.regenerateRecoveryCodes(req.auth, req.body, requestContext(req)));
export const disable = async (req, res) => {
  await mfa.disable(req.auth, req.body, requestContext(req));
  noContent(res);
};
