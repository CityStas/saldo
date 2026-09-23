import { describe, expect, it, vi } from 'vitest';

/**
 * When the key's daily window is spent, every free model answers 429 - for
 * hours. Treating that as "twenty broken models" is wrong on two counts: the
 * pool gets branded as dead, and the next probe round spends the budget of a
 * second key to learn nothing. Both are asserted here.
 */
const spy = vi.hoisted(() => ({ probes: 0 }));

const MODEL_IDS = ['a/one:free', 'a/two:free', 'a/three:free'];

vi.mock('./openrouter.js', () => ({
  listFreeModels: async () =>
    MODEL_IDS.map((id) => ({
      id,
      name: id,
      context_length: 4096,
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: [],
    })),
  fetchFreeQuota: async () => null,
  probeModel: async () => {
    spy.probes += 1;
    return 'rate_limited';
  },
}));

const { ensureDiscovered, probeAll, snapshot } = await import('./registry.js');

describe('probing against a spent key', () => {
  it('does not park a model that is merely rate limited', async () => {
    await ensureDiscovered(true);
    await probeAll(true);

    const models = snapshot().models;

    expect(models.every((model) => model.status === 'rate_limited')).toBe(true);
    expect(models.every((model) => model.cooldownUntil === 0)).toBe(true);
  });

  it('stops probing once every probe came back rate limited', async () => {
    await ensureDiscovered(true);
    await probeAll(true);

    const afterFirstRound = spy.probes;
    expect(afterFirstRound).toBeGreaterThan(0);

    await probeAll(true);

    expect(spy.probes).toBe(afterFirstRound);
  });
});
