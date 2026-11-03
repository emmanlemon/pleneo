import { created, noContent, ok } from '#common/http/respond.js';
import * as service from './devices.service.js';

export const list = async (req, res) => ok(res, await service.listDevices(req.auth, req.query));
export const stats = async (req, res) => ok(res, await service.deviceStats(req.auth));
export const get = async (req, res) => ok(res, await service.getDevice(req.auth, req.params.id));
export const register = async (req, res) => created(res, await service.registerDevice(req.auth, req.body));
export const update = async (req, res) => ok(res, await service.updateDevice(req.auth, req.params.id, req.body));

export const remove = async (req, res) => {
  await service.deleteDevice(req.auth, req.params.id);
  noContent(res);
};

export const rotateCredential = async (req, res) =>
  created(res, await service.rotateCredential(req.auth, req.params.id, req.body));

export const revokeCredential = async (req, res) => {
  await service.revokeCredential(req.auth, req.params.id, req.params.credentialId);
  noContent(res);
};

export const setDesiredState = async (req, res) =>
  ok(res, await service.setDesiredState(req.auth, req.params.id, req.body));

export const listTypes = async (_req, res) => ok(res, { deviceTypes: await service.listDeviceTypes() });
export const createType = async (req, res) => created(res, await service.createDeviceType(req.auth, req.body));
