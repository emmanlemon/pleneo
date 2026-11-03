import { beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymous, asClient, asUser, USER_ID } from '../../helpers/principal.js';

vi.mock('#common/middleware/authenticate.js', async () => {
  const { principal } = await import('../../helpers/principal.js');
  const { DomainErrors } = await import('#common/errors/domain-errors.js');
  return {
    authenticate: (req, _res, next) => {
      if (!principal.current) return next(DomainErrors.missingToken());
      req.auth = principal.current;
      next();
    },
  };
});
vi.mock('#modules/mfa/mfa.service.js');

const { api, expectProblem } = await import('../../helpers/app.js');
const mfa = await import('#modules/mfa/mfa.service.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

beforeEach(() => asUser());

describe('/auth/mfa', () => {
  it('requires a user principal', async () => {
    anonymous();
    expectProblem(await api().post('/auth/mfa/setup'), 401, 'AUTHENTICATION_REQUIRED');
    asClient();
    expectProblem(await api().post('/auth/mfa/setup'), 403, 'USER_TOKEN_REQUIRED');
  });

  it('starts setup and returns the provisioning secret', async () => {
    mfa.setup.mockResolvedValue({ secret: 'S', otpauthUrl: 'otpauth://totp/x' });
    const res = await api().post('/auth/mfa/setup');
    expect(res.status).toBe(200);
    expect(res.body.otpauthUrl).toMatch(/^otpauth:/);
    expect(mfa.setup).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), expect.any(Object));
  });

  it('rejects a non six-digit enable code before reaching the service', async () => {
    expectProblem(await api().post('/auth/mfa/enable').send({ code: 'abcdef' }), 400, 'VALIDATION_FAILED');
    expect(mfa.enable).not.toHaveBeenCalled();
  });

  it('enables and returns recovery codes', async () => {
    mfa.enable.mockResolvedValue({ recoveryCodes: Array(10).fill('abcde-fghij') });
    const res = await api().post('/auth/mfa/enable').send({ code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
  });

  it('maps a conflict when MFA is already enabled', async () => {
    mfa.enable.mockRejectedValue(DomainErrors.mfaAlreadyEnabled());
    expectProblem(await api().post('/auth/mfa/enable').send({ code: '123456' }), 409, 'MFA_ALREADY_ENABLED');
  });

  it('disable requires password and accepts a recovery code', async () => {
    expectProblem(await api().post('/auth/mfa/disable').send({ code: '123456' }), 400, 'VALIDATION_FAILED');
    mfa.disable.mockResolvedValue();
    const res = await api().post('/auth/mfa/disable').send({ password: 'pw', code: 'ABCDE-12345' });
    expect(res.status).toBe(204);
    expect(mfa.disable).toHaveBeenCalledWith(
      expect.anything(),
      { password: 'pw', code: 'abcde-12345' },
      expect.any(Object),
    );
  });

  it('regenerates recovery codes after re-authentication', async () => {
    mfa.regenerateRecoveryCodes.mockResolvedValue({ recoveryCodes: ['a-b'] });
    const res = await api().post('/auth/mfa/recovery-codes').send({ password: 'pw' });
    expect(res.status).toBe(200);
  });
});
