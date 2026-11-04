import { Server } from 'socket.io';
import { config } from '#config';
import { logger } from '#infra/logging/logger.js';
import { verifyAccessToken } from '#infra/auth/token-verifier.js';
import { resolve as resolveSession } from '#modules/bff/session.service.js';

const log = logger.child({ component: 'realtime' });

export const userRoom = (userId) => `user:${userId}`;
export const ADMIN_ROOM = 'operators';
const FLEET_PERMISSION = 'devices:read';

let io = null;

const handshakeToken = (socket) => {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
  const [scheme, token] = (socket.handshake.headers?.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

const sessionCookie = (socket) => {
  const raw = socket.handshake.headers?.cookie;
  if (!raw) return null;
  const match = raw.split(';').map((part) => part.trim().split('='));
  const found = match.find(([name]) => name === config.BFF_COOKIE_NAME);
  return found ? decodeURIComponent(found[1] ?? '') : null;
};

export async function authenticateSocket(socket, next) {
  const token = handshakeToken(socket);

  if (!token && config.BFF_ENABLED) {
    const resolved = await resolveSession(sessionCookie(socket)).catch(() => null);
    if (!resolved) return next(new Error('AUTHENTICATION_REQUIRED'));
    const payload = await verifyAccessToken(resolved.accessToken).catch(() => null);
    if (!payload) return next(new Error('INVALID_TOKEN'));
    socket.data.userId = resolved.session.user_id;
    socket.data.email = resolved.session.email;
    socket.data.permissions = payload.permissions ?? [];
    return next();
  }

  if (!token) return next(new Error('AUTHENTICATION_REQUIRED'));
  try {
    const payload = await verifyAccessToken(token);
    if (payload.token_use !== 'user') return next(new Error('USER_TOKEN_REQUIRED'));
    socket.data.userId = payload.sub;
    socket.data.email = payload.email;
    socket.data.permissions = payload.permissions ?? [];
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}

export function createSocketServer(httpServer) {
  if (!config.SOCKET_ENABLED) return null;

  io = new Server(httpServer, {
    path: config.SOCKET_PATH,
    pingInterval: config.SOCKET_PING_INTERVAL_MS,
    serveClient: false,
    cors: { origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false, credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const isAdmin = (socket.data.permissions ?? []).includes(FLEET_PERMISSION);
    socket.join(userRoom(socket.data.userId));
    if (isAdmin) socket.join(ADMIN_ROOM);
    log.info({ socketId: socket.id, userId: socket.data.userId, admin: isAdmin }, 'client connected');
    socket.emit('ready', { userId: socket.data.userId, admin: isAdmin, serverTime: new Date().toISOString() });
    socket.on('disconnect', (reason) => log.info({ socketId: socket.id, reason }, 'client disconnected'));
  });

  log.info({ path: config.SOCKET_PATH }, 'realtime server started');
  return io;
}

export function emitToUser(userId, event, payload) {
  if (!io || !userId) return false;
  io.to(userRoom(userId)).emit(event, payload);
  return true;
}

/** Owner plus every operator, deduplicated by Socket.IO when one socket is in both rooms. */
export function emitToOwnerAndAdmins(userId, event, payload) {
  if (!io) return false;
  const target = userId ? io.to(userRoom(userId)).to(ADMIN_ROOM) : io.to(ADMIN_ROOM);
  target.emit(event, payload);
  return true;
}

export function emitToAdmins(event, payload) {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(event, payload);
  return true;
}

export const connectionCount = () => io?.engine?.clientsCount ?? 0;

export async function closeSocketServer() {
  if (!io) return;
  await io.close();
  io = null;
}
