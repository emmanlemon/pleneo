import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ID } from '../../helpers/principal.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#infra/auth/token-verifier.js');

const verifier = await import('#infra/auth/token-verifier.js');
const { authenticateSocket, closeSocketServer, connectionCount, createSocketServer, emitToUser, userRoom } =
  await import('#infra/realtime/socket-server.js');
const { DomainErrors } = await import('#common/errors/domain-errors.js');

const userToken = { sub: USER_ID, token_use: 'user', email: 'user@example.com' };

const fakeSocket = (auth, headers = {}) => ({ handshake: { auth, headers }, data: {} });
const runMiddleware = (socket) => new Promise((resolve) => authenticateSocket(socket, resolve));

describe('socket handshake authentication', () => {
  it('accepts a user token from auth or the Authorization header', async () => {
    verifier.verifyAccessToken.mockResolvedValue(userToken);

    const viaAuth = fakeSocket({ token: 'abc' });
    expect(await runMiddleware(viaAuth)).toBeUndefined();
    expect(viaAuth.data.userId).toBe(USER_ID);

    const viaHeader = fakeSocket({}, { authorization: 'Bearer abc' });
    expect(await runMiddleware(viaHeader)).toBeUndefined();
    expect(viaHeader.data.userId).toBe(USER_ID);
  });

  it('rejects a missing token without calling the verifier', async () => {
    const error = await runMiddleware(fakeSocket({}));
    expect(error.message).toBe('AUTHENTICATION_REQUIRED');
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token and a client-credentials token', async () => {
    verifier.verifyAccessToken.mockRejectedValueOnce(DomainErrors.invalidToken());
    expect((await runMiddleware(fakeSocket({ token: 'bad' }))).message).toBe('INVALID_TOKEN');

    verifier.verifyAccessToken.mockResolvedValueOnce({ sub: 'client-1', token_use: 'client' });
    expect((await runMiddleware(fakeSocket({ token: 'svc' }))).message).toBe('USER_TOKEN_REQUIRED');
  });

  it('namespaces rooms by user', () => {
    expect(userRoom(USER_ID)).toBe(`user:${USER_ID}`);
  });
});

describe('push delivery', () => {
  let server;
  let url;

  beforeEach(async () => {
    verifier.verifyAccessToken.mockResolvedValue(userToken);
    server = http.createServer();
    createSocketServer(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await closeSocketServer();
    await new Promise((resolve) => server.close(resolve));
  });

  const client = (auth) => connect(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });

  it('delivers an event to the connected user and reports the connection', async () => {
    const socket = client({ token: 'abc' });
    await new Promise((resolve, reject) => {
      socket.on('ready', resolve);
      socket.on('connect_error', reject);
    });
    expect(connectionCount()).toBe(1);

    const received = new Promise((resolve) => socket.on('notification:new', resolve));
    expect(emitToUser(USER_ID, 'notification:new', { notification: { id: 'n1' }, unreadDelta: 1 })).toBe(true);
    await expect(received).resolves.toMatchObject({ notification: { id: 'n1' } });

    socket.disconnect();
  });

  it('does not deliver another user’s events', async () => {
    const socket = client({ token: 'abc' });
    await new Promise((resolve, reject) => {
      socket.on('ready', resolve);
      socket.on('connect_error', reject);
    });

    const leaked = vi.fn();
    socket.on('notification:new', leaked);
    emitToUser('99999999-9999-4999-8999-999999999999', 'notification:new', { notification: { id: 'other' } });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(leaked).not.toHaveBeenCalled();

    socket.disconnect();
  });

  it('refuses a connection without a valid token', async () => {
    verifier.verifyAccessToken.mockRejectedValue(DomainErrors.invalidToken());
    const socket = client({ token: 'bad' });
    const error = await new Promise((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('INVALID_TOKEN');
    expect(socket.connected).toBe(false);
    socket.disconnect();
  });
});

describe('without a running server', () => {
  it('emitToUser is a safe no-op', () => {
    expect(emitToUser(USER_ID, 'notification:new', {})).toBe(false);
  });
});
