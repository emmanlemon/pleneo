import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_ID,
  anonymous,
  asAdmin,
  asClient,
  asUser,
  DEVICE_ID,
  DEVICE_TYPE_ID,
  RULE_ID,
  USER_ID,
} from '../../helpers/fixtures.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/fixtures.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
  };
});
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/devices/devices.service.js');
vi.mock('#modules/telemetry/telemetry.service.js');
vi.mock('#modules/commands/commands.service.js');
vi.mock('#modules/alerts/alerts.service.js');
vi.mock('#modules/rules/rule.repository.js');
vi.mock('#modules/rules/rules.engine.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const devices = await import('#modules/devices/devices.service.js');
const telemetry = await import('#modules/telemetry/telemetry.service.js');
const commands = await import('#modules/commands/commands.service.js');
const alerts = await import('#modules/alerts/alerts.service.js');
const rules = await import('#modules/rules/rule.repository.js');
const engine = await import('#modules/rules/rules.engine.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

beforeEach(() => asUser());

describe('authentication boundary', () => {
  it('rejects anonymous access to every management surface', async () => {
    anonymous();
    for (const path of ['/devices', '/devices/stats', '/alerts', '/rules']) {
      expectProblem(await api().get(path), 401, 'AUTHENTICATION_REQUIRED');
    }
  });
});

describe('/devices', () => {
  it('lists with validated filters and cursor pagination', async () => {
    devices.listDevices.mockResolvedValue({ devices: [{ id: DEVICE_ID }], nextCursor: DEVICE_ID });
    const res = await api().get('/devices?limit=1&connectionStatus=online&search=cold');
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBe(DEVICE_ID);
    expect(devices.listDevices).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), {
      limit: 1,
      connectionStatus: 'online',
      search: 'cold',
    });
    expectProblem(await api().get('/devices?connectionStatus=flaky'), 400, 'VALIDATION_FAILED');
  });

  it('registers a device and returns the one-time claim code', async () => {
    devices.registerDevice.mockResolvedValue({ id: DEVICE_ID, claimCode: 'ABCD-EFGH-IJKL' });
    const res = await api()
      .post('/devices')
      .send({ externalId: 'sensor-001', name: 'Cold room', deviceTypeId: DEVICE_TYPE_ID });
    expect(res.status).toBe(201);
    expect(res.body.claimCode).toBe('ABCD-EFGH-IJKL');
    expect(devices.registerDevice).toHaveBeenCalledWith(expect.anything(), {
      externalId: 'sensor-001',
      name: 'Cold room',
      deviceTypeId: DEVICE_TYPE_ID,
      metadata: {},
    });
  });

  it('validates the external id and rejects unknown fields', async () => {
    expectProblem(
      await api().post('/devices').send({ externalId: 'a', name: 'x', deviceTypeId: DEVICE_TYPE_ID }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(
      await api()
        .post('/devices')
        .send({ externalId: 'sensor-001', name: 'x', deviceTypeId: DEVICE_TYPE_ID, secret: 'nope' }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('surfaces ownership and duplicate failures', async () => {
    devices.getDevice.mockRejectedValue(DomainErrors.notOwner());
    expectProblem(await api().get(`/devices/${DEVICE_ID}`), 403, 'NOT_DEVICE_OWNER');
    devices.registerDevice.mockRejectedValue(DomainErrors.duplicateExternalId());
    expectProblem(
      await api().post('/devices').send({ externalId: 'sensor-001', name: 'x', deviceTypeId: DEVICE_TYPE_ID }),
      409,
      'DUPLICATE_EXTERNAL_ID',
    );
  });

  it('rotates and revokes credentials', async () => {
    devices.rotateCredential.mockResolvedValue({ id: 'cred-2', token: 'dev_new' });
    const rotated = await api().post(`/devices/${DEVICE_ID}/credentials`).send({ label: 'field-swap' });
    expect(rotated.status).toBe(201);
    expect(rotated.body.token).toBe('dev_new');
    expect(devices.rotateCredential).toHaveBeenCalledWith(expect.anything(), DEVICE_ID, {
      label: 'field-swap',
      revokeExisting: true,
    });

    devices.revokeCredential.mockResolvedValue();
    expect((await api().delete(`/devices/${DEVICE_ID}/credentials/${RULE_ID}`)).status).toBe(204);
  });

  it('restricts device type creation to admins and scoped clients', async () => {
    devices.listDeviceTypes.mockResolvedValue([]);
    expect((await api().get('/devices/types')).status).toBe(200);
    expectProblem(
      await api()
        .post('/devices/types')
        .send({ key: 'x', name: 'X', metrics: [{ key: 'a' }] }),
      403,
      'INSUFFICIENT_SCOPE',
    );
    asAdmin();
    devices.createDeviceType.mockResolvedValue({ id: DEVICE_TYPE_ID });
    expect(
      (
        await api()
          .post('/devices/types')
          .send({ key: 'valve', name: 'Valve', metrics: [{ key: 'position' }] })
      ).status,
    ).toBe(201);
  });
});

describe('telemetry and command surfaces', () => {
  it('serves latest readings and a series', async () => {
    telemetry.latestFor.mockResolvedValue({ latest: [{ metric: 'temperature', value: 4 }] });
    expect((await api().get(`/devices/${DEVICE_ID}/latest`)).body.latest).toHaveLength(1);

    telemetry.seriesFor.mockResolvedValue({ metric: 'temperature', points: [] });
    const res = await api().get(`/devices/${DEVICE_ID}/series?metric=temperature&limit=10`);
    expect(res.status).toBe(200);
    expect(telemetry.seriesFor).toHaveBeenCalledWith(
      expect.anything(),
      DEVICE_ID,
      expect.objectContaining({ metric: 'temperature', limit: 10 }),
    );
    expectProblem(await api().get(`/devices/${DEVICE_ID}/series`), 400, 'VALIDATION_FAILED');
  });

  it('issues and cancels commands', async () => {
    commands.issueCommand.mockResolvedValue({ id: 'cmd', status: 'pending' });
    const issued = await api()
      .post(`/devices/${DEVICE_ID}/commands`)
      .send({ type: 'reboot', payload: { delay: 5 } });
    expect(issued.status).toBe(201);
    expect(commands.issueCommand).toHaveBeenCalledWith(expect.anything(), DEVICE_ID, {
      type: 'reboot',
      payload: { delay: 5 },
    });

    commands.listCommands.mockResolvedValue({ commands: [] });
    expect((await api().get(`/devices/${DEVICE_ID}/commands?status=pending`)).status).toBe(200);

    commands.cancelCommand.mockRejectedValue(DomainErrors.invalidCommandTransition('acknowledged', 'cancelled'));
    expectProblem(await api().post(`/commands/${DEVICE_ID}/cancel`), 409, 'INVALID_COMMAND_TRANSITION');
  });
});

describe('/alerts and /rules', () => {
  it('lists alerts and transitions them', async () => {
    alerts.listAlerts.mockResolvedValue({ alerts: [], nextBefore: null });
    expect((await api().get('/alerts?status=open&severity=critical')).status).toBe(200);
    expectProblem(await api().get('/alerts?severity=urgent'), 400, 'VALIDATION_FAILED');

    alerts.acknowledgeAlert.mockResolvedValue({ id: ALERT_ID, status: 'acknowledged' });
    expect((await api().post(`/alerts/${ALERT_ID}/acknowledge`)).body.status).toBe('acknowledged');

    alerts.resolveAlert.mockRejectedValue(DomainErrors.invalidAlertTransition('resolved', 'resolved'));
    expectProblem(await api().post(`/alerts/${ALERT_ID}/resolve`), 409, 'INVALID_ALERT_TRANSITION');
  });

  it('restricts rule management and invalidates the cache on write', async () => {
    expectProblem(await api().get('/rules'), 403, 'INSUFFICIENT_SCOPE');
    asClient(['devices:write']);
    rules.listAll.mockResolvedValue([]);
    expect((await api().get('/rules')).status).toBe(200);

    rules.create.mockResolvedValue({ id: RULE_ID });
    const created = await api()
      .post('/rules')
      .send({ name: 'Too warm', deviceTypeId: DEVICE_TYPE_ID, metric: 'temperature', operator: 'gt', threshold: 8 });
    expect(created.status).toBe(201);
    expect(engine.invalidateRuleCache).toHaveBeenCalled();
  });

  it('requires a target and a known operator on rules', async () => {
    asAdmin();
    expectProblem(
      await api().post('/rules').send({ name: 'x', metric: 'temperature', operator: 'gt', threshold: 1 }),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(
      await api()
        .post('/rules')
        .send({ name: 'x', deviceId: DEVICE_ID, metric: 'temperature', operator: 'between', threshold: 1 }),
      400,
      'VALIDATION_FAILED',
    );
  });
});
