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

export const config = {
  port: num('PORT', 3001),
  apiKey: str('OPENROUTER_API_KEY'),
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
   * How many free models are probed in the background. 0 by default: the free
   * tier shares a small per-minute request budget, so spending it on probes
   * would starve real conversations. Model health is learned from real traffic
   * instead, and `/api/models/refresh` triggers an explicit probe.
   */
  probeLimit: num('PROBE_LIMIT', 0),
  probeSpacingMs: num('PROBE_SPACING_MS', 2_500),
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
  if (!config.apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.',
    );
  }
}

export const isProxyConfigured = (): boolean => config.outboundProxy !== '';
