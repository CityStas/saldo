import { describe, expect, it, vi } from 'vitest';

/**
 * The probe pool is the part of model selection that is easy to get subtly
 * wrong: a `queue.shift()` loop can silently probe a model twice, or stop after
 * the first worker drains the queue, and nothing in the UI would show it. These
 * tests use a mocked upstream so the pool can be observed directly.
 */
const spy = vi.hoisted(() => ({
  probed: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
}));

const MODEL_IDS = [
  'a/one:free',
  'a/two:free',
  'a/three:free',
  'a/four:free',
  'a/five:free',
  'a/six:free',
];

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
  probeModel: async (id: string) => {
    spy.probed.push(id);
    spy.inFlight += 1;
    spy.maxInFlight = Math.max(spy.maxInFlight, spy.inFlight);

    await new Promise((resolve) => setTimeout(resolve, 5));

    spy.inFlight -= 1;
    return 'working';
  },
}));

const { ensureDiscovered, probeAll, snapshot } = await import('./registry.js');

describe('probeAll', () => {
  it('probes every discovered model exactly once', async () => {
    spy.probed.length = 0;

    await ensureDiscovered(true);
    await probeAll(true);

    expect(new Set(spy.probed).size).toBe(MODEL_IDS.length);
    expect(spy.probed).toHaveLength(MODEL_IDS.length);
  });

  it('marks the models it probed as working', async () => {
    await ensureDiscovered(true);
    await probeAll(true);

    const working = snapshot().models.filter(
      (model) => model.status === 'working',
    );

    expect(working).toHaveLength(MODEL_IDS.length);
    expect(working.every((model) => model.cooldownUntil === 0)).toBe(true);
  });

  it('runs probes in parallel, not one at a time', async () => {
    spy.maxInFlight = 0;

    await ensureDiscovered(true);
    await probeAll(true);

    expect(spy.maxInFlight).toBeGreaterThan(1);
  });
});
