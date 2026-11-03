import { Router } from 'express';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { requireAny, requireRole, requireScope } from '#common/middleware/authorize.js';
import { writeLimiter } from '#common/middleware/rate-limit.js';
import * as c from './devices.controller.js';
import * as v from './devices.validators.js';

export const devicesRouter = Router();

const manageTypes = requireAny(requireRole('admin'), requireScope('devices:write'));

devicesRouter.get('/types', h(c.listTypes));
devicesRouter.post('/types', manageTypes, writeLimiter, v.validateCreateDeviceType, h(c.createType));

devicesRouter.get('/stats', h(c.stats));
devicesRouter.get('/', v.validateDeviceList, h(c.list));
devicesRouter.post('/', writeLimiter, v.validateRegister, h(c.register));
devicesRouter.get('/:id', v.validateId, h(c.get));
devicesRouter.patch('/:id', writeLimiter, v.validateUpdate, h(c.update));
devicesRouter.delete('/:id', writeLimiter, v.validateId, h(c.remove));

devicesRouter.post('/:id/credentials', writeLimiter, v.validateRotateCredential, h(c.rotateCredential));
devicesRouter.delete('/:id/credentials/:credentialId', writeLimiter, v.validateCredentialId, h(c.revokeCredential));
devicesRouter.put('/:id/state/desired', writeLimiter, v.validateDesiredState, h(c.setDesiredState));
