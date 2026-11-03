import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ForbiddenError } from '#common/errors/app-error.js';
import { errorHandler } from '#common/errors/error-handler.js';

function handle(err, { headersSent = false } = {}) {
  const res = { headersSent, headers: {}, setHeader: vi.fn((k, v) => (res.headers[k] = v)) };
  res.status = vi.fn(() => res);
  res.type = vi.fn(() => res);
  res.json = vi.fn(() => res);
  const log = { error: vi.fn(), warn: vi.fn() };
  errorHandler(err, { id: 'req-1', originalUrl: '/x', log }, res, () => {});
  return { res, log, body: res.json.mock.calls[0]?.[0] };
}

describe('errorHandler', () => {
  it('renders application errors as problem details', () => {
    const { res, body, log } = handle(new ForbiddenError('Nope', 'CUSTOM_FORBIDDEN'));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(body).toMatchObject({
      type: 'urn:authzero:error:custom-forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'CUSTOM_FORBIDDEN',
      detail: 'Nope',
      instance: '/x',
      requestId: 'req-1',
    });
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('converts zod errors into validation problems', () => {
    const zodError = z.object({ a: z.string() }).safeParse({}).error;
    const { body } = handle(zodError);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors[0].field).toBe('a');
  });

  it('maps body-parser and database failures', () => {
    expect(handle({ type: 'entity.parse.failed' }).body.code).toBe('MALFORMED_JSON');
    expect(handle({ type: 'entity.too.large' }).body.status).toBe(413);
    expect(handle({ code: '23505' }).body).toMatchObject({ status: 409, code: 'ALREADY_EXISTS' });
    expect(handle({ code: '23503' }).body.code).toBe('INVALID_REFERENCE');
    expect(handle({ code: '57014' }).body.status).toBe(503);
    expect(handle({ code: 'ECONNREFUSED' }).body.status).toBe(503);
  });

  it('hides internals for unexpected errors and logs them', () => {
    const { body, log } = handle(new Error('secret stack detail'));
    expect(body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(body)).not.toContain('secret stack detail');
    expect(log.error).toHaveBeenCalled();
  });

  it('adds WWW-Authenticate on 401 and stays silent once headers are sent', () => {
    const { res } = handle(Object.assign(new ForbiddenError(), { status: 401 }));
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    const sent = handle(new Error('x'), { headersSent: true });
    expect(sent.res.json).not.toHaveBeenCalled();
  });
});
