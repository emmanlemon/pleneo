import { logger } from '#infra/logging/logger.js';
import * as repository from './audit.repository.js';

export async function audit({
  actorId = null,
  actorType = 'anonymous',
  action,
  targetType = null,
  targetId = null,
  ctx = {},
  metadata = {},
}) {
  try {
    await repository.insert({
      actorId,
      actorType,
      action,
      targetType,
      targetId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: { ...metadata, requestId: ctx.requestId },
    });
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
}

export const listAudit = (filters) => repository.list(filters);
