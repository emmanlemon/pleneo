import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OTHER_USER_ID, USER_ID } from '../../helpers/principal.js';

const tx = { query: vi.fn() };
vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((fn) => fn(tx)),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/security/crypto.js', async (importOriginal) => ({
  ...(await importOriginal()),
  hashPassword: vi.fn(async (p) => `hashed:${p}`),
}));
vi.mock('#infra/messaging/outbox.service.js');
vi.mock('#modules/audit/audit.service.js');
vi.mock('#modules/auth/repositories/token.repository.js');
vi.mock('#modules/users/role.repository.js');
vi.mock('#modules/users/user.repository.js');

const { accept, invite, resend } = await import('#modules/users/invitation.service.js');
const outbox = await import('#infra/messaging/outbox.service.js');
const auditService = await import('#modules/audit/audit.service.js');
const tokens = await import('#modules/auth/repositories/token.repository.js');
const roles = await import('#modules/users/role.repository.js');
const users = await import('#modules/users/user.repository.js');

const actor = { userId: USER_ID, email: 'admin@example.com' };
const ctx = { ip: '127.0.0.1', userAgent: 'test', requestId: 'r' };
const invited = { id: OTHER_USER_ID, email: 'new@example.com', name: 'New', status: 'invited' };

beforeEach(() => {
  outbox.publish.mockResolvedValue();
  auditService.audit.mockResolvedValue();
  tokens.issue.mockResolvedValue('invite-token');
  roles.listAll.mockResolvedValue([{ name: 'admin' }, { name: 'user' }]);
  roles.assign.mockResolvedValue();
  users.findByEmail.mockResolvedValue(null);
  users.create.mockResolvedValue(invited);
});

describe('invite', () => {
  it('creates an invited account, always with the user role, and emails a single-use link', async () => {
    const user = await invite({ email: 'new@example.com', name: 'New', roles: ['admin'] }, actor, ctx);

    expect(user).toBe(invited);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', status: 'invited', passwordHash: expect.any(String) }),
      tx,
    );
    expect(roles.assign.mock.calls.map((c) => c[1]).sort()).toEqual(['admin', 'user']);
    expect(tokens.issue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OTHER_USER_ID, purpose: 'invite' }),
      tx,
    );
    expect(outbox.publish).toHaveBeenCalledWith(
      'user.invited',
      expect.objectContaining({ email: 'new@example.com', inviteToken: 'invite-token', invitedBy: actor.email }),
      tx,
    );
  });

  it('refuses a taken email and an unknown role', async () => {
    users.findByEmail.mockResolvedValueOnce({ id: 'x' });
    await expect(invite({ email: 'new@example.com', roles: [] }, actor, ctx)).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
    await expect(invite({ email: 'new@example.com', roles: ['ghost'] }, actor, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(users.create).not.toHaveBeenCalled();
  });
});

describe('resend', () => {
  it('issues a fresh link only while the invitation is open', async () => {
    users.findById.mockResolvedValueOnce(invited);
    await resend(OTHER_USER_ID, actor, ctx);
    expect(outbox.publish).toHaveBeenCalledWith(
      'user.invited',
      expect.objectContaining({ inviteToken: 'invite-token' }),
    );

    users.findById.mockResolvedValueOnce({ ...invited, status: 'active' });
    await expect(resend(OTHER_USER_ID, actor, ctx)).rejects.toMatchObject({ code: 'INVITATION_ACCEPTED' });
  });
});

describe('accept', () => {
  it('activates the account with the chosen password', async () => {
    tokens.consume.mockResolvedValue(OTHER_USER_ID);
    users.findById.mockResolvedValue(invited);
    users.activateInvited.mockResolvedValue({ id: OTHER_USER_ID });

    await accept({ token: 't'.repeat(32), password: 'Welcome-Aboard-2026' }, ctx);

    expect(tokens.consume).toHaveBeenCalledWith({ token: 't'.repeat(32), purpose: 'invite' }, tx);
    expect(users.activateInvited).toHaveBeenCalledWith(OTHER_USER_ID, 'hashed:Welcome-Aboard-2026', tx);
    expect(outbox.publish).toHaveBeenCalledWith(
      'user.invitation_accepted',
      { userId: OTHER_USER_ID, email: invited.email },
      tx,
    );
  });

  it('rejects a spent token and a password derived from the email', async () => {
    tokens.consume.mockResolvedValueOnce(null);
    await expect(accept({ token: 'x'.repeat(32), password: 'Welcome-Aboard-2026' }, ctx)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });

    tokens.consume.mockResolvedValueOnce(OTHER_USER_ID);
    users.findById.mockResolvedValue({ ...invited, email: 'johnsmith@example.com' });
    await expect(accept({ token: 'x'.repeat(32), password: 'JohnSmith-2026-x' }, ctx)).rejects.toMatchObject({
      code: 'PASSWORD_CONTAINS_EMAIL',
    });
    expect(users.activateInvited).not.toHaveBeenCalled();
  });
});
