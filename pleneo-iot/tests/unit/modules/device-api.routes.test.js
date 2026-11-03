import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_ID, DEVICE_ID, device } from '../../helpers/fixtures.js';

vi.mock('#common/middleware/authenticate-device.js', () => ({
  authenticateDevice: (req, _res, next) => {
    if (!req.get('authorization')) {
      return import('#common/errors/domain-errors.js').then(({ DomainErrors }) =>
        next(DomainErrors.deviceAuthRequired()),
      );
    }
    req.device = {
      id: DEVICE_ID,
      externalId: 'sensor-001',
      ownerId: 'owner',
      deviceTypeId: 'type',
      status: 'active',
      credentialId: 'cred-1',
    };
    next();
  },
}));
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/devices/device.repository.js');
vi.mock('#modules/devices/credential.repository.js');
vi.mock('#modules/devices/state.repository.js');
vi.mock('#modules/devices/devices.service.js');
vi.mock('#modules/commands/commands.service.js');
vi.mock('#modules/telemetry/telemetry.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const devices = await import('#modules/devices/device.repository.js');
const credentials = await import('#modules/devices/credential.repository.js');
const state = await import('#modules/devices/state.repository.js');
const deviceService = await import('#modules/devices/devices.service.js');
const commands = await import('#modules/commands/commands.service.js');
const telemetry = await import('#modules/telemetry/telemetry.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const auth = (req) => req.set('authorization', 'Bearer dev_token');

beforeEach(() => {
  devices.findById.mockResolvedValue(device());
  devices.touch.mockResolvedValue();
  credentials.touch.mockResolvedValue();
  telemetry.ingest.mockResolvedValue({ accepted: 2, duplicates: 0, alerts: 0 });
});

describe('POST /v1/device/activate', () => {
  it('exchanges a claim code for a device token', async () => {
    deviceService.activate.mockResolvedValue({
      deviceId: DEVICE_ID,
      token: 'dev_x',
      ingestUrl: '/v1/device/telemetry',
    });
    const res = await api().post('/v1/device/activate').send({ externalId: 'sensor-001', claimCode: 'abcd-efgh-ijkl' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('dev_x');
    expect(deviceService.activate).toHaveBeenCalledWith(expect.objectContaining({ claimCode: 'ABCD-EFGH-IJKL' }));
  });

  it('validates the claim code shape and surfaces bad codes', async () => {
    expectProblem(
      await api().post('/v1/device/activate').send({ externalId: 'sensor-001', claimCode: 'nope' }),
      400,
      'VALIDATION_FAILED',
    );
    deviceService.activate.mockRejectedValue(DomainErrors.invalidDeviceCredential());
    expectProblem(
      await api().post('/v1/device/activate').send({ externalId: 'sensor-001', claimCode: 'ABCD-EFGH-IJKL' }),
      401,
      'INVALID_DEVICE_CREDENTIAL',
    );
  });
});

describe('POST /v1/device/telemetry', () => {
  it('requires device credentials', async () => {
    expectProblem(await api().post('/v1/device/telemetry').send({ readings: [] }), 401, 'DEVICE_AUTH_REQUIRED');
  });

  it('accepts a batch of readings', async () => {
    const res = await auth(api().post('/v1/device/telemetry')).send({
      readings: [
        { metric: 'temperature', value: 4.5 },
        { metric: 'humidity', value: 55, ts: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 2, duplicates: 0, alerts: 0 });
    expect(telemetry.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEVICE_ID }),
      expect.arrayContaining([expect.objectContaining({ metric: 'temperature' })]),
    );
  });

  it('accepts a single reading and a metrics map', async () => {
    await auth(api().post('/v1/device/telemetry')).send({ metric: 'temperature', value: 4.5 });
    expect(telemetry.ingest.mock.calls[0][1]).toEqual([{ metric: 'temperature', value: 4.5 }]);
    await auth(api().post('/v1/device/telemetry')).send({ metrics: { temperature: 4.5, humidity: 55 } });
    expect(telemetry.ingest.mock.calls[1][1]).toEqual([
      { metric: 'temperature', value: 4.5, ts: undefined },
      { metric: 'humidity', value: 55, ts: undefined },
    ]);
  });

  it('rejects malformed readings and non-finite values', async () => {
    expectProblem(
      await auth(api().post('/v1/device/telemetry')).send({ readings: [{ metric: 'Temp', value: 1 }] }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(
      await auth(api().post('/v1/device/telemetry')).send({ readings: [{ metric: 'temperature' }] }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(await auth(api().post('/v1/device/telemetry')).send({ readings: [] }), 400, 'VALIDATION_FAILED');
  });

  it('maps ingest rejections to problem details', async () => {
    telemetry.ingest.mockRejectedValue(DomainErrors.timestampSkew());
    expectProblem(
      await auth(api().post('/v1/device/telemetry')).send({ metric: 'temperature', value: 1 }),
      400,
      'TIMESTAMP_SKEW',
    );
  });
});

describe('device command and state surface', () => {
  it('claims pending commands and acknowledges one', async () => {
    commands.fetchForDevice.mockResolvedValue([{ id: COMMAND_ID, type: 'reboot', payload: {} }]);
    const fetched = await auth(api().get('/v1/device/commands?limit=5'));
    expect(fetched.body.commands).toHaveLength(1);
    expect(commands.fetchForDevice).toHaveBeenCalledWith(DEVICE_ID, 5);

    commands.acknowledge.mockResolvedValue({ id: COMMAND_ID, status: 'acknowledged' });
    const acked = await auth(api().post(`/v1/device/commands/${COMMAND_ID}/ack`)).send({
      status: 'acknowledged',
      result: { ok: true },
    });
    expect(acked.status).toBe(200);
    expect(commands.acknowledge).toHaveBeenCalledWith(DEVICE_ID, COMMAND_ID, {
      status: 'acknowledged',
      result: { ok: true },
    });
  });

  it('rejects an unknown ack status and a non-uuid command id', async () => {
    expectProblem(
      await auth(api().post(`/v1/device/commands/${COMMAND_ID}/ack`)).send({ status: 'done' }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(await auth(api().post('/v1/device/commands/not-a-uuid/ack')).send({}), 400, 'VALIDATION_FAILED');
  });

  it('serves desired state and stores reported state', async () => {
    state.get.mockResolvedValue({ desired: { interval: 30 }, desired_version: 3 });
    const desired = await auth(api().get('/v1/device/state'));
    expect(desired.body).toEqual({ desired: { interval: 30 }, desiredVersion: 3 });

    state.setReported.mockResolvedValue({ reported: { firmware: '1.2.0' } });
    const reported = await auth(api().put('/v1/device/state/reported')).send({ firmware: '1.2.0' });
    expect(reported.status).toBe(200);
    expect(state.setReported).toHaveBeenCalledWith(DEVICE_ID, { firmware: '1.2.0' });
  });

  it('reports identity and declared metrics', async () => {
    const res = await auth(api().get('/v1/device/me'));
    expect(res.body).toMatchObject({ deviceId: DEVICE_ID, deviceType: 'environment-sensor' });
    expect(res.body.metrics).toHaveLength(2);
  });
});
