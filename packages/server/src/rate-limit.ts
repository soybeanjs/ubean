import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  keyGenerator?: (c: Context<UbeanEnv>) => string;
  handler?: (c: Context<UbeanEnv>, info: RateLimitInfo) => Response | Promise<Response>;
  skip?: (c: Context<UbeanEnv>) => boolean | Promise<boolean>;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  store?: RateLimitStore;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter: number;
}

export interface RateLimitStoreEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitStoreEntry | undefined>;
  set(key: string, entry: RateLimitStoreEntry, ttlMs: number): Promise<void>;
  increment(key: string, windowMs: number): Promise<RateLimitStoreEntry>;
  reset(key: string): Promise<void>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitStoreEntry & { expireAt: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => this._cleanup(), 60000);
  }

  private _cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expireAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<RateLimitStoreEntry | undefined> {
    const entry = this.store.get(key);
    if (!entry || entry.expireAt <= Date.now()) {
      if (entry) this.store.delete(key);
      return undefined;
    }
    return { count: entry.count, resetAt: entry.resetAt };
  }

  async set(key: string, entry: RateLimitStoreEntry, ttlMs: number): Promise<void> {
    this.store.set(key, { ...entry, expireAt: Date.now() + ttlMs });
  }

  async increment(key: string, windowMs: number): Promise<RateLimitStoreEntry> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      const entry = { count: 1, resetAt: now + windowMs, expireAt: now + windowMs };
      this.store.set(key, entry);
      return { count: 1, resetAt: entry.resetAt };
    }

    existing.count++;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.store.clear();
  }
}

function defaultKeyGenerator(c: Context<UbeanEnv>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  return c.req.raw.headers.get('cf-connecting-ip') || 'unknown';
}

function defaultHandler(c: Context<UbeanEnv>, info: RateLimitInfo): Response {
  c.header('Retry-After', String(Math.ceil(info.retryAfter / 1000)));
  return c.json(
    {
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(info.retryAfter / 1000)} seconds.`,
      limit: info.limit,
      remaining: info.remaining,
      reset: info.reset
    },
    429
  );
}

export function createRateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    maxRequests = 100,
    windowMs = 60000,
    keyGenerator = defaultKeyGenerator,
    handler = defaultHandler,
    skip,
    standardHeaders = true,
    legacyHeaders = false,
    store: customStore
  } = options;

  const store = customStore || new MemoryRateLimitStore();

  return async function rateLimitMiddleware(c: Context<UbeanEnv>, next: Next) {
    if (skip && (await skip(c))) {
      await next();
      return;
    }

    const key = keyGenerator(c);
    const result = await store.increment(key, windowMs);
    const now = Date.now();
    const remaining = Math.max(0, maxRequests - result.count);
    const reset = Math.ceil(result.resetAt / 1000);
    const retryAfter = Math.max(0, result.resetAt - now);

    if (standardHeaders) {
      c.header('RateLimit-Limit', String(maxRequests));
      c.header('RateLimit-Remaining', String(remaining));
      c.header('RateLimit-Reset', String(reset));
    }

    if (legacyHeaders) {
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(reset));
    }

    if (result.count > maxRequests) {
      return handler(c, { limit: maxRequests, remaining: 0, reset, retryAfter });
    }

    await next();
  };
}

export function defineRateLimit(options: RateLimitOptions): MiddlewareHandler<UbeanEnv> {
  return createRateLimitMiddleware(options);
}

export function createMemoryRateLimitStore(): RateLimitStore & { destroy(): void } {
  return new MemoryRateLimitStore();
}
