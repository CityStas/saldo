import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The free tier allows 50 requests per day per key. When the window is spent
 * every model behind that key answers 429 for hours, so key rotation is the
 * only thing that keeps the chat alive past its first fifty questions.
 *
 * `config` reads the environment at import time, hence the module reset.
 */
async function loadWithKeys(keys: string) {
  vi.resetModules();
  vi.stubEnv('OPENROUTER_API_KEYS', keys);
  vi.stubEnv('OPENROUTER_API_KEY', '');
  return import('./openrouter.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('api key rotation', () => {
  it('treats a single key as a list of one and never rotates', async () => {
    vi.resetModules();
    vi.stubEnv('OPENROUTER_API_KEYS', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'solo');

    const keys = await import('./openrouter.js');

    expect(keys.apiKeyCount()).toBe(1);
    expect(keys.currentApiKey()).toBe('solo');
    expect(keys.rotateApiKey(60_000)).toBe(false);
    expect(keys.currentApiKey()).toBe('solo');
  });

  /*
   * Two keys pasted into the singular variable is the obvious mistake to make -
   * it already holds a key, so it looks like the place for another one. Read as
   * one string, the whole value went out as a bearer token and OpenRouter
   * answered `401 User not found`, which reads as "both keys are bad" when both
   * were fine. The space after the comma is here on purpose: that is how it gets
   * typed, and it must not survive into the key.
   */
  it('reads a comma-separated OPENROUTER_API_KEY as a list too', async () => {
    vi.resetModules();
    vi.stubEnv('OPENROUTER_API_KEYS', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'k1, k2');

    const keys = await import('./openrouter.js');

    expect(keys.apiKeyCount()).toBe(2);
    expect(keys.currentApiKey()).toBe('k1');
    expect(keys.rotateApiKey()).toBe(true);
    expect(keys.currentApiKey()).toBe('k2');
  });

  it('walks the list and reports which key is in use', async () => {
    const keys = await loadWithKeys('k1,k2,k3');

    expect(keys.apiKeyCount()).toBe(3);
    expect(keys.currentApiKey()).toBe('k1');
    expect(keys.currentKeyNumber()).toBe(1);

    expect(keys.rotateApiKey()).toBe(true);
    expect(keys.currentApiKey()).toBe('k2');
    expect(keys.currentKeyNumber()).toBe(2);

    expect(keys.rotateApiKey()).toBe(true);
    expect(keys.currentApiKey()).toBe('k3');
  });

  it('skips a key that is inside its daily window', async () => {
    const keys = await loadWithKeys('k1,k2,k3');

    // k1 hits the daily limit and is parked for an hour.
    expect(keys.rotateApiKey(3_600_000)).toBe(true);
    expect(keys.currentApiKey()).toBe('k2');

    // k2 fails for an unrelated reason: rotate forward, and k1 must be skipped.
    expect(keys.rotateApiKey()).toBe(true);
    expect(keys.currentApiKey()).toBe('k3');

    expect(keys.rotateApiKey()).toBe(true);
    expect(keys.currentApiKey()).toBe('k2');
  });

  it('refuses to rotate when every other key is spent', async () => {
    const keys = await loadWithKeys('k1,k2');

    expect(keys.rotateApiKey(3_600_000)).toBe(true);
    expect(keys.currentApiKey()).toBe('k2');

    // Only k1 is left and it is parked for an hour.
    expect(keys.rotateApiKey(3_600_000)).toBe(false);
    expect(keys.currentApiKey()).toBe('k2');
  });

  it('never reports a rotation that lands on the same key', async () => {
    const keys = await loadWithKeys('k1,k2');

    expect(keys.rotateApiKey(3_600_000)).toBe(true);
    expect(keys.rotateApiKey(3_600_000)).toBe(false);
    expect(keys.currentKeyNumber()).toBe(2);
  });
});
