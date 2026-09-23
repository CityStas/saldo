import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// The single `.env` lives at the repository root, next to `.env.example`.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

loadEnv({ path: [path.join(repoRoot, '.env'), path.join(repoRoot, 'server', '.env')] });

function str(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(name: string): string[] {
  return str(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Outbound proxy for the upstream OpenRouter call. Useful behind a corporate
 * proxy or on networks where Cloudflare rejects non-browser TLS fingerprints.
 */
const proxyFromEnv =
  str('OUTBOUND_PROXY') ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  '';

/**
 * One or more API keys.
 *
 * The free tier allows 50 requests per day per key (`free-models-per-day`), and
 * when that is spent every model answers 429 until the window resets - hours
 * later. A single key therefore makes the app unusable for the rest of the day
 * through no fault of the code. `OPENROUTER_API_KEYS` takes a comma-separated
 * list and the server rotates through it when a key is rejected or its daily
 * window is spent, which is how the reference implementation stays alive.
 *
 * `OPENROUTER_API_KEY` alone still works and is treated as a list of one.
 */
const keyList = list('OPENROUTER_API_KEYS');
const singleKey = str('OPENROUTER_API_KEY');
const apiKeys = keyList.length > 0 ? keyList : singleKey ? [singleKey] : [];

export const config = {
  port: num('PORT', 3001),
  /** First key. Kept for callers that only need "is a key configured". */
  apiKey: apiKeys[0] ?? '',
  /** Every usable key, in order. */
  apiKeys,
  /** Preferred model. Tried first, everything else is a fallback. */
  preferredModel: str('OPENROUTER_MODEL', 'openrouter/free'),
  /** Optional hard allowlist. When set, only these models are used. */
  modelAllowlist: list('OPENROUTER_MODELS'),
  /** Model ids that are never used. */
  modelBlocklist: list('OPENROUTER_MODEL_BLOCKLIST'),
  outboundProxy: proxyFromEnv,
  upstreamTimeoutMs: num('UPSTREAM_TIMEOUT_MS', 60_000),
  /**
   * How long to wait for the first content token before giving up on a model
   * and failing over. Free "pro" models can otherwise keep the user staring at
   * a typing indicator for a minute.
   */
  firstTokenTimeoutMs: num('FIRST_TOKEN_TIMEOUT_MS', 30_000),
  probeTimeoutMs: num('PROBE_TIMEOUT_MS', 12_000),
  /**
   * How many free models are probed in the background at startup.
   *
   * On by default, because the first message of a session should not land on a
   * model that is dead right now. Kept deliberately tiny: a probe is a real
   * request against a budget of 50 per day per key, and the server is restarted
   * many times during development, so every restart spends this many requests.
   * Three is enough to have a proven candidate to prefer without turning
   * `npm run start` into a way to burn the day's budget.
   */
  probeLimit: num('PROBE_LIMIT', 3),
  /** Probes in flight at once. The reference implementation fans out all at once. */
  probeConcurrency: num('PROBE_CONCURRENCY', 4),
  /**
   * Budget for a probe. Small on purpose: a model that needs more than a couple
   * of dozen tokens to say "hi" is a model that spends everything on
   * chain-of-thought, and that is exactly the kind of model this chat cannot
   * use. Cheap probes also mean probing stays cheap.
   */
  probeMaxTokens: num('PROBE_MAX_TOKENS', 24),
  /** Stagger between two probes taken by the same worker. 0 = no stagger. */
  probeSpacingMs: num('PROBE_SPACING_MS', 0),
  /**
   * How long to stop probing after upstream reports a key-wide daily limit.
   * Probing while the window is spent cannot succeed and only burns the next
   * key's budget.
   */
  probeBackoffMs: num('PROBE_BACKOFF_MS', 10 * 60_000),
  /**
   * How long to wait for the configured outbound proxy to accept a TCP
   * connection at startup. A stale `OUTBOUND_PROXY` (VPN client not running)
   * used to make every request fail with a network error while a direct
   * connection would have worked.
   */
  proxyCheckTimeoutMs: num('PROXY_CHECK_TIMEOUT_MS', 1_500),
  /** How long a discovered model list stays fresh. */
  registryTtlMs: num('REGISTRY_TTL_MS', 10 * 60_000),
  /** Cooldown after a model returns 429/5xx. */
  modelCooldownMs: num('MODEL_COOLDOWN_MS', 60_000),
  maxMessages: num('MAX_MESSAGES', 60),
  maxMessageChars: num('MAX_MESSAGE_CHARS', 24_000),
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: num('RATE_LIMIT_MAX', 30),
  corsOrigins: list('CORS_ORIGIN'),
} as const;

export function assertConfig(): void {
  if (config.apiKeys.length === 0) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.',
    );
  }
}

export const isProxyConfigured = (): boolean => config.outboundProxy !== '';
