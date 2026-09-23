import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The probe pool is the part of model selection that is easy to get subtly
 * wrong: a `queue.shift()` loop can silently probe a model twice, or stop after
 * the first worker drains the queue, and nothing in the UI would show it. These
 * tests use a mocked upstream so the pool can be observed directly.
 *
 * Two things make the observations repeatable. Discovery fires a probe round in
 * the background without awaiting it, so the fixture drains that round first and
 * only then starts counting. And the counters are reset per test, because the
 * module keeps its state between tests in the same file.
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

/**
 * Run probe rounds until one of them finds nothing left to check.
 *
 * `probeAll` returns the round that is already running, and a fresh round is
 * capped by `config.probeLimit`, so a single call is not guaranteed to cover
 * the whole catalog. The loop makes the starting point of every test the same
 * regardless of how discovery timed its own background round.
 */
async function drain(): Promise<void> {
  for (let round = 0; round < MODEL_IDS.length + 1; round += 1) {
    const before = spy.probed.length;
    await probeAll();
    if (spy.probed.length === before) break;
  }
}

describe('probeAll', () => {
  beforeEach(async () => {
    await ensureDiscovered(true);
    await drain();
    spy.probed.length = 0;
    spy.maxInFlight = 0;
  });

  it('probes every discovered model exactly once', async () => {
    await probeAll(true);

    expect(new Set(spy.probed).size).toBe(MODEL_IDS.length);
    expect(spy.probed).toHaveLength(MODEL_IDS.length);
  });

  it('marks the models it probed as working', async () => {
    await probeAll(true);

    const working = snapshot().models.filter(
      (model) => model.status === 'working',
    );

    expect(working).toHaveLength(MODEL_IDS.length);
    expect(working.every((model) => model.cooldownUntil === 0)).toBe(true);
  });

  it('runs probes in parallel, not one at a time', async () => {
    await probeAll(true);

    expect(spy.maxInFlight).toBeGreaterThan(1);
  });

  it('does not spend a second round on models it just probed', async () => {
    // Catalog discovery re-runs every ten minutes, and every run asked for a
    // fresh probe round. With a five minute recheck window that cost up to six
    // requests per ten minutes of uptime - the whole daily budget of 50 in
    // about an hour and a half, spent on asking models to say "hi".
    await probeAll(true);
    const afterFirstRound = spy.probed.length;
    expect(afterFirstRound).toBe(MODEL_IDS.length);

    await probeAll();

    expect(spy.probed).toHaveLength(afterFirstRound);
  });
});
