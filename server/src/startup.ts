import { config, isProxyConfigured, isRelayConfigured } from './config.js';
import { checkProxy } from './services/openrouter.js';
import { ensureDiscovered, probeAll, snapshot } from './services/registry.js';

/**
 * The work the process does once, at boot, before it is useful.
 *
 * It lives here rather than in `index.ts` so that file stays what it reads as:
 * middleware, routes, error handling, shutdown. This is the noisy half - the
 * logging and the background warm-up - and it is the half that changes when
 * the registry's behaviour changes.
 */

/**
 * Which route upstream calls take, said out loud once at startup.
 *
 * There are three possibilities and they are easy to confuse from the outside:
 * straight to OpenRouter, through a local proxy, or through a relay. The one
 * that is configured but NOT in use is the interesting case - a leftover
 * `OUTBOUND_PROXY` next to a fresh relay - so it is named rather than silently
 * ignored.
 */
export async function reportOutboundRoute(): Promise<void> {
  if (isRelayConfigured()) {
    console.log(`[api] upstream: relay at ${config.openrouterBaseUrl}`);
    if (config.outboundProxy) {
      console.log('[api] OUTBOUND_PROXY is set but not used: the relay replaces it');
    }
    return;
  }

  if (!isProxyConfigured()) {
    console.log('[api] upstream: openrouter.ai, direct');
    return;
  }

  const reachable = await checkProxy();
  console.log(
    reachable
      ? `[api] upstream: openrouter.ai via proxy ${config.outboundProxy}`
      : `[api] upstream: openrouter.ai direct - proxy ${config.outboundProxy} is not reachable`,
  );
}

/**
 * Warm the model registry in the background: the first user request should not
 * pay for catalog discovery, and it should not be the one that finds out every
 * candidate is rate limited.
 *
 * Failures are logged and swallowed. A registry that could not be filled yet
 * still answers - discovery runs again on demand - and a boot that refuses to
 * start because OpenRouter was slow would be worse than a slow first answer.
 */
export async function warmRegistry(): Promise<void> {
  try {
    await ensureDiscovered();

    const { models } = snapshot();
    console.log(`[api] ${models.length} free models discovered`);

    if (config.probeLimit <= 0) {
      console.log('[api] background probing disabled (PROBE_LIMIT=0)');
      return;
    }

    console.log(
      `[api] probing up to ${config.probeLimit} models, ${config.probeConcurrency} at a time...`,
    );

    await probeAll();

    const working = snapshot().models.filter((model) => model.status === 'working').length;
    console.log(`[api] probes done: ${working} working`);
  } catch (error: unknown) {
    console.error(
      '[api] model discovery failed:',
      error instanceof Error ? error.message : error,
    );
  }
}
