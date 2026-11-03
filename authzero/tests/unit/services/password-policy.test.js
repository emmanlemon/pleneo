import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/users/user-security.repository.js');

const { assertNotEmailDerived, assertPasswordAllowed } = await import('#modules/auth/domain/password-policy.js');
const { hashPassword } = await import('#infra/security/crypto.js');
const security = await import('#modules/users/user-security.repository.js');

describe('password policy', () => {
  it('rejects passwords containing the email local part', () => {
    expect(() => assertNotEmailDerived('johnsmith@example.com', 'JohnSmith-2024-x')).toThrow(
      expect.objectContaining({ code: 'PASSWORD_CONTAINS_EMAIL' }),
    );
    expect(() => assertNotEmailDerived('jo@example.com', 'Jo-is-fine-123456')).not.toThrow();
  });

  describe('history', () => {
    let user;
    beforeEach(async () => {
      user = { id: 'u', email: 'user@example.com', password_hash: await hashPassword('Current-Pass-1') };
      security.getPasswordHistory.mockResolvedValue([{ password_hash: await hashPassword('Older-Pass-1') }]);
    });

    it('rejects the current and recent passwords', async () => {
      await expect(assertPasswordAllowed(user, 'Current-Pass-1', {})).rejects.toMatchObject({
        code: 'PASSWORD_REUSED',
      });
      await expect(assertPasswordAllowed(user, 'Older-Pass-1', {})).rejects.toMatchObject({ code: 'PASSWORD_REUSED' });
    });

    it('accepts a fresh password', async () => {
      await expect(assertPasswordAllowed(user, 'Brand-New-Pass-9', {})).resolves.toBeUndefined();
    });
  });
});
