import { describe, expect, it } from 'vitest';
import {
  AppError,
  fromUpstreamStatus,
  isAbortError,
  isKeyScoped,
  isRetryable,
} from './errors.js';

/** OpenRouter's own error shape: a JSON envelope with a message inside. */
const ENVELOPE = JSON.stringify({
  error: { message: 'No auth credentials found', code: 401 },
});

/** The shape an edge in front of OpenRouter uses when it refuses outright. */
const EDGE_BLOCK = JSON.stringify({
  success: false,
  error: 'Access denied by security policy.',
});

describe('fromUpstreamStatus', () => {
  it('maps 429 to a rate limit error', () => {
    const error = fromUpstreamStatus(429, 'slow down');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.status).toBe(429);
    expect(isRetryable(error)).toBe(true);
  });

  it('maps 401 to a non-retryable credentials error', () => {
    const error = fromUpstreamStatus(401, ENVELOPE);
    expect(error.code).toBe('AUTH');
    expect(error.status).toBe(502);
    expect(isRetryable(error)).toBe(false);
    expect(isKeyScoped(error)).toBe(true);
  });

  it('maps a 403 envelope to a credentials error too', () => {
    const error = fromUpstreamStatus(403, ENVELOPE);
    expect(error.code).toBe('AUTH');
    expect(isKeyScoped(error)).toBe(true);
  });

  it('reads a 403 that is not OpenRouter as a block, not a bad key', () => {
    // Same status, opposite meaning, and the wrong reading sends the reader to
    // check keys that are fine. Measured 2026-09 from a Russian IP.
    const error = fromUpstreamStatus(403, EDGE_BLOCK);
    expect(error.code).toBe('UPSTREAM_BLOCKED');
    expect(error.message).toContain('Access denied by security policy');
    // A block is enforced on the address, so another key cannot help.
    expect(isKeyScoped(error)).toBe(false);
    expect(isRetryable(error)).toBe(false);
  });

  it('reads an HTML 403 as a block as well', () => {
    const error = fromUpstreamStatus(403, '<html><body>Forbidden</body></html>');
    expect(error.code).toBe('UPSTREAM_BLOCKED');
  });

  it('maps 5xx to a retryable upstream error', () => {
    const error = fromUpstreamStatus(503, 'unavailable');
    expect(error.code).toBe('UPSTREAM_ERROR');
    expect(isRetryable(error)).toBe(true);
  });

  it('truncates and flattens the upstream body', () => {
    const error = fromUpstreamStatus(500, 'a\n\nb'.repeat(300));
    expect(error.message.length).toBeLessThan(460);
    expect(error.message).not.toContain('\n');
  });
});

describe('isKeyScoped', () => {
  it('separates a key-wide limit from a model-scoped one', () => {
    const shared = fromUpstreamStatus(
      429,
      JSON.stringify({
        error: {
          message: 'rate limited',
          metadata: { limit_source: 'openrouter_free_tier_daily' },
        },
      }),
    );
    const perModel = fromUpstreamStatus(
      429,
      JSON.stringify({
        error: { message: 'busy', metadata: { limit_source: 'model' } },
      }),
    );

    expect(isKeyScoped(shared)).toBe(true);
    expect(isKeyScoped(perModel)).toBe(false);
  });

  it('does not treat a model failure as a key failure', () => {
    expect(isKeyScoped(new AppError('TIMEOUT', 'slow'))).toBe(false);
    expect(isKeyScoped(new AppError('UPSTREAM_ERROR', 'boom'))).toBe(false);
  });
});

describe('isAbortError', () => {
  it('recognises AbortError and TimeoutError', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('nope'))).toBe(false);
  });
});

describe('AppError', () => {
  it('defaults to status 500', () => {
    expect(new AppError('UNKNOWN', 'boom').status).toBe(500);
  });
});
