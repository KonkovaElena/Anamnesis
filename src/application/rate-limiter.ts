import type { NextFunction, Request, Response } from "express";

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  skipPaths?: Set<string>;
}

function normalizeClientIp(raw: string): string {
  if (raw.startsWith("::ffff:")) {
    return raw.slice(7);
  }
  return raw;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, skipPaths } = options;
  const hits = new Map<string, number[]>();

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, filtered);
      }
    }
  }, windowMs);
  cleanup.unref();

  return function rateLimiter(request: Request, response: Response, next: NextFunction) {
    if (skipPaths?.has(request.path)) {
      next();
      return;
    }

    const key = normalizeClientIp(request.ip ?? "unknown");
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0]!;
      const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        code: "rate_limited",
        message: "Too many requests. Try again later.",
        retryAfterSeconds,
      });
      return;
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}
