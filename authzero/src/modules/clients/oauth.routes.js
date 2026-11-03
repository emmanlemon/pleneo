import { Router, urlencoded } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { tokenLimiter } from '#common/middleware/rate-limit.js';
import * as c from './oauth.controller.js';
import * as v from './oauth.validators.js';

export const oauthRouter = Router();
oauthRouter.use(urlencoded({ extended: false, limit: '8kb' }), tokenLimiter);

oauthRouter.post('/token', v.validateTokenRequest, h(c.token));
oauthRouter.post('/introspect', v.validateIntrospect, h(c.introspect));
