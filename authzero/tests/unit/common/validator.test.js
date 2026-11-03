import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as rules from '#common/validation/rules.js';
import { formatZodIssues, validate } from '#common/validation/validator.js';

const run = (schemas, req) => new Promise((resolve) => validate(schemas)(req, {}, (err) => resolve({ err, req })));

describe('validate middleware', () => {
  it('replaces each source with parsed, transformed data', async () => {
    const { err, req } = await run(
      { body: z.object({ email: rules.email }), query: rules.pagination(50), params: z.object({ id: rules.uuid }) },
      { body: { email: ' A@B.CO ' }, query: {}, params: { id: '11111111-1111-4111-8111-111111111111' } },
    );
    expect(err).toBeUndefined();
    expect(req.body.email).toBe('a@b.co');
    expect(req.query.limit).toBe(50);
  });

  it('aggregates errors from every source into one ValidationError', async () => {
    const { err } = await run(
      { body: z.object({ email: rules.email }), params: z.object({ id: rules.uuid }) },
      { body: { email: 'x' }, params: { id: 'y' } },
    );
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.details.map((e) => e.source).sort()).toEqual(['body', 'params']);
  });

  it('reports the source name as the field for root-level issues', () => {
    const [issue] = formatZodIssues(
      z.object({ a: z.string() }).strict().safeParse({ a: 'x', b: 1 }).error.issues,
      'body',
    );
    expect(issue).toMatchObject({ field: 'body', code: 'UNRECOGNIZED_FIELD' });
  });
});

describe('rules', () => {
  it('enforces password composition and bounds', () => {
    expect(rules.password.safeParse('Short1A').success).toBe(false);
    expect(rules.password.safeParse(' Leading-Space-Pass1').success).toBe(false);
    expect(rules.password.safeParse('nouppercase-digits1').success).toBe(false);
    expect(rules.password.safeParse('Valid-Password-123').success).toBe(true);
  });

  it('normalises recovery codes and validates formats', () => {
    expect(rules.recoveryCode.parse(' ABCDE-12345 ')).toBe('abcde-12345');
    expect(rules.totpCode.safeParse('12345').success).toBe(false);
    expect(rules.scope.safeParse('billing:read').success).toBe(true);
    expect(rules.scope.safeParse('Billing Read').success).toBe(false);
    expect(rules.jwt.safeParse('not a jwt').success).toBe(false);
  });
});
