import { describe, expect, it } from 'vitest';
import { AppError, fromUpstreamStatus, isAbortError, isRetryable } from './errors.js';

describe('fromUpstreamStatus', () => {
  it('maps 429 to a rate limit error', () => {
    const error = fromUpstreamStatus(429, 'slow down');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.status).toBe(429);
    expect(isRetryable(error)).toBe(true);
  });

  it('maps 401/403 to a non-retryable credentials error', () => {
    const error = fromUpstreamStatus(403, 'no');
    expect(error.code).toBe('AUTH');
    expect(error.status).toBe(502);
    expect(isRetryable(error)).toBe(false);
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
