import { describe, expect, it, vi } from 'vitest';

/**
 * Why the catalog is empty has to survive discovery.
 *
 * Two very different situations leave `models` empty - a provider that refuses
 * the request, and a provider that answered with nothing usable - and they used
 * to produce one answer for the caller: "no free models are available". The
 * second is a shortage; the first is a wall, and it was reported as a shortage
 * while being `NO_MODELS`, which key rotation ignores. So a rejected key left
 * the catalog empty on every attempt and was never rotated away.
 *
 * These tests pin the reason down, including the case where a block must NOT be
 * read as a bad key: rotating onto the next key cannot get past an address that
 * is not allowed in, and trying costs the user another round trip.
 */
const spy = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'block' | 'auth' | 'empty' }));

const MODEL_IDS = ['a/one:free', 'a/two:free'];

vi.mock('./openrouter.js', async () => {
  const { fromUpstreamStatus } = await import('../lib/errors.js');

  return {
    listFreeModels: async () => {
      if (spy.mode === 'block') {
        throw fromUpstreamStatus(
          403,
          JSON.stringify({
            success: false,
            error: 'Access denied by security policy.',
          }),
        );
      }

      if (spy.mode === 'auth') {
        throw fromUpstreamStatus(
          401,
          JSON.stringify({ error: { message: 'No auth credentials found' } }),
        );
      }

      if (spy.mode === 'empty') return [];

      return MODEL_IDS.map((id) => ({
        id,
        name: id,
        context_length: 4096,
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: [],
      }));
    },
    fetchFreeQuota: async () => null,
    probeModel: async () => 'working',
  };
});

const { ensureDiscovered, lastDiscoveryFailure, snapshot } = await import(
  './registry.js'
);

describe('an empty catalog remembers why', () => {
  it('reports a refused request as a block, not as a shortage', async () => {
    spy.mode = 'block';
    await ensureDiscovered(true);

    expect(snapshot().models).toEqual([]);

    const failure = lastDiscoveryFailure();
    expect(failure?.code).toBe('UPSTREAM_BLOCKED');
    expect(failure?.message).toContain('Access denied by security policy');
  });

  it('reports a rejected key as an auth failure', async () => {
    spy.mode = 'auth';
    await ensureDiscovered(true);

    expect(lastDiscoveryFailure()?.code).toBe('AUTH');
  });

  it('reports a catalog that came back empty as a shortage', async () => {
    spy.mode = 'empty';
    await ensureDiscovered(true);

    expect(lastDiscoveryFailure()?.code).toBe('NO_MODELS');
  });

  it('forgets the failure once a round succeeds', async () => {
    spy.mode = 'block';
    await ensureDiscovered(true);
    expect(lastDiscoveryFailure()).not.toBeNull();

    spy.mode = 'ok';
    await ensureDiscovered(true);

    expect(lastDiscoveryFailure()).toBeNull();
    expect(snapshot().models.length).toBe(MODEL_IDS.length);
    expect(snapshot().lastError).toBeNull();
  });
});
