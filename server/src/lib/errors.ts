import type { ChatErrorCode } from '../types/chat.js';

export type ErrorScope = 'global' | 'model';

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
    super(message);
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

/** Map an upstream HTTP failure to a typed error we can act on. */
export function fromUpstreamStatus(status: number, body: string): AppError {
  const detail = parseUpstream(body);

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

export function isRetryable(error: AppError): boolean {
  // AUTH, BAD_REQUEST and a key-wide rate limit are terminal: trying another
  // model cannot help, it only consumes more of the shared quota.
  if (error.code === 'RATE_LIMIT' && error.scope === 'global') return false;

  return (
    error.code === 'RATE_LIMIT' ||
    error.code === 'TIMEOUT' ||
    error.code === 'NETWORK' ||
    error.code === 'UPSTREAM_ERROR'
  );
}
