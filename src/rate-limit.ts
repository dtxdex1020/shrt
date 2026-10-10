import type { MiddlewareHandler } from 'hono';

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  key: (c: Parameters<MiddlewareHandler>[0]) => string;
  now?: () => number;
}

/** Fixed-window limiter kept in memory. Fine for a single instance. */
export function rateLimit({
  limit,
  windowMs,
  key,
  now = Date.now,
}: RateLimitOptions): MiddlewareHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  let lastSweep = now();

  return async (c, next) => {
    const t = now();
    if (t - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      lastSweep = t;
    }

    const k = key(c);
    let entry = hits.get(k);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(k, entry);
    }
    entry.count++;

    const remaining = Math.max(0, limit - entry.count);
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(remaining));
    c.header('RateLimit-Reset', String(Math.ceil((entry.reset - t) / 1000)));

    if (entry.count > limit) {
      c.header('Retry-After', String(Math.ceil((entry.reset - t) / 1000)));
      return c.json({ error: 'rate_limited', message: 'Too many requests, slow down.' }, 429);
    }
    await next();
  };
}
