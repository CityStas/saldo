import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Tiny fixed-window limiter. The upstream key is free-tier and shared, so an
 * accidental request loop from the client would burn the daily quota in
 * seconds. Not a substitute for a real limiter, just a cheap seatbelt.
 */
export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
    next();
    return;
  }

  bucket.count += 1;

  if (bucket.count > config.rateLimitMax) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT',
        message: `Too many requests from this client. Retry in ${retryAfter}s.`,
      },
    });
    return;
  }

  next();
}

// Keep the map from growing without bound in a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
