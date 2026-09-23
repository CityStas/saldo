import { describe, expect, it } from 'vitest';
import { detectQueryType, orderCandidates } from './registry.js';
import type { ModelInfo } from '../types/chat.js';

function model(id: string, overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id,
    name: id,
    contextLength: 1000,
    status: 'unknown',
    checkedAt: 0,
    cooldownUntil: 0,
    supportsReasoning: false,
    latencyMs: null,
    okCount: 0,
    failCount: 0,
    ...overrides,
  };
}

const pool = [
  model('alpha/first:free'),
  model('cohere/north-mini-code:free'),
  model('beta/second:free'),
  model('openrouter/free'),
];

const ids = (models: ModelInfo[]): string[] => models.map((entry) => entry.id);

describe('detectQueryType', () => {
  it('detects code questions', () => {
    expect(detectQueryType('Напиши компонент на React')).toBe('code');
    expect(detectQueryType('refactor this function')).toBe('code');
  });

  it('detects math questions', () => {
    expect(detectQueryType('посчитай интеграл')).toBe('math');
  });

  it('falls back to text', () => {
    expect(detectQueryType('привет, как дела?')).toBe('text');
  });
});

describe('orderCandidates', () => {
  it('puts an explicit model request first', () => {
    const ordered = orderCandidates(pool, 'привет', 'beta/second:free', 0);
    expect(ordered[0]?.id).toBe('beta/second:free');
  });

  it('prefers a code model for code questions', () => {
    const ordered = orderCandidates(pool, 'напиши код на python', undefined, 1);
    expect(ordered[0]?.id).toBe('cohere/north-mini-code:free');
  });

  it('always keeps the router last', () => {
    const ordered = orderCandidates(pool, 'привет', undefined, 0);
    expect(ordered.at(-1)?.id).toBe('openrouter/free');
  });

  it('rotates the starting point', () => {
    const first = orderCandidates(pool, 'привет', undefined, 0);
    const second = orderCandidates(pool, 'привет', undefined, 1);
    expect(ids(first)).not.toEqual(ids(second));
  });

  it('never repeats a model', () => {
    const ordered = orderCandidates(pool, 'привет', 'alpha/first:free', 2);
    expect(new Set(ids(ordered)).size).toBe(ordered.length);
    expect(ordered).toHaveLength(pool.length);
  });

  it('prefers models that already answered, fastest first', () => {
    const withHistory = [
      model('slow/model:free', { okCount: 3, latencyMs: 9000 }),
      model('fast/model:free', { okCount: 1, latencyMs: 700 }),
      model('fresh/model:free'),
    ];

    const ordered = orderCandidates(withHistory, 'привет', undefined, 0);
    expect(ids(ordered).slice(0, 2)).toEqual([
      'fast/model:free',
      'slow/model:free',
    ]);
  });

  it('returns nothing for an empty pool', () => {
    expect(orderCandidates([], 'привет', undefined, 0)).toEqual([]);
  });
});
