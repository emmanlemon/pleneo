import { requestContext } from '#common/http/request-context.js';
import { ok } from '#common/http/respond.js';
import * as oauth from './oauth.service.js';

export const token = async (req, res) => ok(res, await oauth.clientCredentialsGrant(req, requestContext(req)));
export const introspect = async (req, res) => ok(res, await oauth.introspect(req));
