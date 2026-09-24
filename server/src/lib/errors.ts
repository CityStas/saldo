import { config, isProxyConfigured, isRelayConfigured } from '../config.js';
import type { ChatErrorCode } from '../types/chat.js';

export type ErrorScope = 'global' | 'model';

/**
 * Anything that looks like an API key, out of text on its way to a client.
 *
 * Upstream error bodies are quoted back to the browser so that a failure
 * explains itself, and those bodies are written by somebody else. OpenRouter
 * does not echo the Authorization header today, but "today" is not a guarantee,
 * and the one place the key must never be readable is the browser: the
 * requirement is checked with the Network tab, where a key inside a response
 * body is exactly as visible as one inside a request header.
 *
 * The tail is long on purpose. A real key is 73 characters, so twelve word
 * characters after `sk-` cannot be a coincidence, while a word like `task-force`
 * is left alone.
 */
const KEY_LIKE = /sk-[A-Za-z0-9_-]{12,}/g;

export function redactSecrets(text: string): string {
  return text.replace(KEY_LIKE, '[redacted]');
}

/**
 * Single error type crossing the API boundary. `code` is what the client
 * switches on; `message` is a short technical string meant for logs, not for
 * the end user (the UI owns its own copy).
 */
export class AppError extends Error {
  readonly code: ChatErrorCode;
  readonly status: number;
  /** For RATE_LIMIT: does it apply to the whole key or just this model? */
  readonly scope: ErrorScope;
  /** For RATE_LIMIT: how long the client should wait before retrying. */
  readonly retryAfterMs?: number;

  constructor(
    code: ChatErrorCode,
    message: string,
    status = 500,
    options: { scope?: ErrorScope; retryAfterMs?: number } = {},
  ) {
    // Redacted at construction rather than at the response boundary, so the
    // message is clean everywhere it travels: the JSON error body, the SSE
    // event, the registry's stored `lastError`, and the server log.
    super(redactSecrets(message));
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.scope = options.scope ?? 'model';
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

interface UpstreamErrorPayload {
  error?: {
    message?: string;
    code?: number | string;
    metadata?: {
      limit_source?: string;
      remedy_hint?: string;
      headers?: Record<string, string>;
    };
  };
}

function parseUpstream(body: string): {
  message: string;
  limitSource: string;
  retryAfterMs?: number;
} {
  const fallback = body.slice(0, 400).replace(/\s+/g, ' ').trim();

  try {
    const parsed = JSON.parse(body) as UpstreamErrorPayload;
    const metadata = parsed.error?.metadata;
    const reset = metadata?.headers?.['X-RateLimit-Reset'];

    const resetAt = reset ? Number(reset) : Number.NaN;

    return {
      message: (parsed.error?.message ?? fallback).trim(),
      limitSource: metadata?.limit_source ?? '',
      retryAfterMs: Number.isFinite(resetAt)
        ? Math.max(0, resetAt - Date.now())
        : undefined,
    };
  } catch {
    return { message: fallback, limitSource: '' };
  }
}

/**
 * A 403 that is not OpenRouter's own error envelope.
 *
 * The two are identical by status code and mean opposite things. OpenRouter
 * rejects credentials with `{"error":{"message":...,"code":...}}`; an edge in
 * front of it answers in its own shape - measured 2026-09 from a Russian IP,
 * `{"success":false,"error":"Access denied by security policy."}`, where
 * `error` is a string rather than an object - or with an HTML page.
 *
 * Telling them apart matters because the remedy is different, and the wrong one
 * sends the reader to check keys that are fine. `AUTH` means "this key is not
 * accepted"; `UPSTREAM_BLOCKED` means "this address is not allowed in".
 */
function isEdgeBlock(status: number, body: string): boolean {
  if (status !== 403) return false;

  try {
    const parsed = JSON.parse(body) as UpstreamErrorPayload;
    return typeof parsed.error?.message !== 'string';
  } catch {
    return true;
  }
}

/**
 * What to do about a block, said where the person running the server will read it.
 *
 * The block is enforced on the address the request leaves from, which makes it
 * the one failure here that no key and no model can work around - and the edge's
 * own body, `Access denied by security policy.`, names neither the cause nor the
 * fix. Without this the reader is left with a 403 that looks like a bad key,
 * and the first thing they check is the one thing that is fine.
 *
 * The cases are worth separating because the remedy differs, and the wrong one
 * costs a round trip. The subtlety is that "a proxy is configured" and "the
 * request went through a proxy" are different statements: a configured port with
 * nothing behind it is treated as no proxy at all, and the request goes out
 * directly. The hint therefore points at the startup line that says which route
 * was actually taken rather than assuming it from the configuration.
 */
function blockedHint(): string {
  if (isRelayConfigured()) {
    return "Upstream calls go through the configured relay, so the block is on the relay's own address rather than on this machine.";
  }

  if (isProxyConfigured()) {
    return `OUTBOUND_PROXY is set to ${config.outboundProxy}. The startup line beginning "[api] upstream:" says which route was taken: "via proxy" means the block follows that exit and another exit node is needed, while "is not reachable" means the VPN client is not running and the request went out directly.`;
  }

  return 'This address is blocked upstream; the key is not the problem. Put the local HTTP port of your VPN client into OUTBOUND_PROXY in .env and restart - v2rayN listens on 10809, clash on 7890, sing-box on 2080. See README, "Если openrouter.ai недоступен".';
}

/** Map an upstream HTTP failure to a typed error we can act on. */
export function fromUpstreamStatus(status: number, body: string): AppError {
  const detail = parseUpstream(body);

  if (isEdgeBlock(status, body)) {
    return new AppError(
      'UPSTREAM_BLOCKED',
      `The request was refused before it reached a model (${status}). ${detail.message} ${blockedHint()}`,
      502,
    );
  }

  if (status === 401 || status === 403) {
    return new AppError(
      'AUTH',
      `OpenRouter rejected the credentials (${status}). ${detail.message}`,
      502,
    );
  }

  if (status === 429) {
    // The free tier has one shared per-minute bucket for every free model, so
    // switching models after this kind of 429 only burns more of the budget.
    const shared =
      detail.limitSource.includes('free_tier') ||
      detail.limitSource.includes('per_minute') ||
      detail.limitSource.includes('per_min');

    return new AppError(
      'RATE_LIMIT',
      `OpenRouter rate limit reached (${detail.limitSource || 'unknown source'}). ${detail.message}`,
      429,
      { scope: shared ? 'global' : 'model', retryAfterMs: detail.retryAfterMs },
    );
  }

  if (status === 402) {
    return new AppError(
      'UPSTREAM_ERROR',
      `OpenRouter requires credits for this model (402). ${detail.message}`,
      502,
    );
  }

  if (status >= 500) {
    return new AppError(
      'UPSTREAM_ERROR',
      `OpenRouter returned ${status}. ${detail.message}`,
      502,
    );
  }

  return new AppError(
    'UPSTREAM_ERROR',
    `OpenRouter returned ${status}. ${detail.message}`,
    502,
  );
}

/**
 * True when the failure is about the KEY rather than the model, and another key
 * might therefore do better.
 *
 * A model-scoped 429 means "this model is busy, try another" and rotating keys
 * would not help. An AUTH failure or a key-wide daily limit means every model
 * behind this key fails the same way, so the next key is worth trying.
 *
 * A block is deliberately NOT key-scoped: it is enforced on the address the
 * request comes from, so a second key behind the same address changes nothing.
 * Rotating on it would only cost the user another failed round trip.
 */
export function isKeyScoped(error: AppError): boolean {
  if (error.code === 'AUTH') return true;
  return error.code === 'RATE_LIMIT' && error.scope === 'global';
}

export function isRetryable(error: AppError): boolean {
  // AUTH, BAD_REQUEST, a key-wide rate limit and a block are terminal: trying
  // another model cannot help, it only consumes more of the shared quota.
  if (error.code === 'RATE_LIMIT' && error.scope === 'global') return false;

  return (
    error.code === 'RATE_LIMIT' ||
    error.code === 'TIMEOUT' ||
    error.code === 'NETWORK' ||
    error.code === 'UPSTREAM_ERROR'
  );
}
