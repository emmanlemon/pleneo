import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID, DEVICE_TYPE_ID, device, rule } from '../../helpers/fixtures.js';

vi.mock('#infra/database/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  healthCheck: vi.fn(),
  closePool: vi.fn(),
  pool: {},
}));
vi.mock('#modules/rules/rule.repository.js');

const rules = await import('#modules/rules/rule.repository.js');
const engine = await import('#modules/rules/rules.engine.js');

beforeEach(() => engine.invalidateRuleCache());

describe('comparators', () => {
  it('evaluates every supported operator', () => {
    const cases = [
      ['gt', 10, 5, true],
      ['gt', 5, 5, false],
      ['gte', 5, 5, true],
      ['lt', 1, 5, true],
      ['lte', 5, 5, true],
      ['eq', 5, 5, true],
      ['neq', 4, 5, true],
      ['neq', 5, 5, false],
    ];
    for (const [operator, value, threshold, expected] of cases) {
      expect(engine.breaches(rule({ operator, threshold }), value)).toBe(expected);
    }
  });

  it('describes a breach for the alert message', () => {
    expect(engine.describeBreach(rule({ operator: 'gt', threshold: 8 }), 12.5, 'temperature')).toBe(
      'temperature is 12.5 (> 8)',
    );
  });
});

describe('rule targeting', () => {
  it('matches device-type rules and device-specific rules', () => {
    const target = device();
    expect(engine.matchesDevice(rule(), target)).toBe(true);
    expect(engine.matchesDevice(rule({ device_type_id: 'other-type' }), target)).toBe(false);
    expect(engine.matchesDevice(rule({ device_type_id: null, device_id: DEVICE_ID }), target)).toBe(true);
    expect(engine.matchesDevice(rule({ device_type_id: DEVICE_TYPE_ID, device_id: 'another-device' }), target)).toBe(
      false,
    );
  });
});

describe('evaluate', () => {
  it('returns only the readings that breach a matching rule', async () => {
    rules.listEnabled.mockResolvedValue([
      rule({ id: 'r1', metric: 'temperature', operator: 'gt', threshold: 8 }),
      rule({ id: 'r2', metric: 'humidity', operator: 'lt', threshold: 20 }),
      rule({ id: 'r3', metric: 'temperature', operator: 'gt', threshold: 8, device_type_id: 'different-type' }),
    ]);
    const breached = await engine.evaluate(device(), [
      { metric: 'temperature', value: 12 },
      { metric: 'humidity', value: 55 },
      { metric: 'battery', value: 5 },
    ]);
    expect(breached).toHaveLength(1);
    expect(breached[0].rule.id).toBe('r1');
    expect(breached[0].reading.value).toBe(12);
  });

  it('caches rules and reloads after invalidation', async () => {
    rules.listEnabled.mockResolvedValue([rule()]);
    await engine.evaluate(device(), [{ metric: 'temperature', value: 1 }]);
    await engine.evaluate(device(), [{ metric: 'temperature', value: 2 }]);
    expect(rules.listEnabled).toHaveBeenCalledTimes(1);
    engine.invalidateRuleCache();
    await engine.evaluate(device(), [{ metric: 'temperature', value: 3 }]);
    expect(rules.listEnabled).toHaveBeenCalledTimes(2);
  });

  it('ignores metrics with no rules', async () => {
    rules.listEnabled.mockResolvedValue([rule()]);
    await expect(engine.evaluate(device(), [{ metric: 'battery', value: 1 }])).resolves.toEqual([]);
  });
});
