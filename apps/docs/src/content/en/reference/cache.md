---
title: Cache
---

# Cache Operations

ubean ships a route-level HTTP cache built around a swappable `CacheStore`. It is not a generic key/value cache client — for arbitrary application caching use `unstorage` (re-exported as `useStorage`/`useKV`).

## useCacheStore()

Get or set the global cache store. Defaults to an in-memory store with LRU eviction.

```typescript
import { useCacheStore, createMemoryStore } from 'ubean';

// Use the default in-memory store
const store = useCacheStore();

// Replace the global store (e.g. with a Redis-backed implementation)
useCacheStore(createMemoryStore(500));
```

### CacheStore interface

```typescript
export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: Omit<CacheEntry, 'createdAt' | 'expiresAt'>, ttl: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /**
   * Read an entry WITHOUT updating recency or deleting expired entries.
   * Optional (P9-03): used by ISR SWR to serve stale content while revalidating.
   * Implementations that don't support peek should leave it undefined;
   * ISR falls back to `get()` (which deletes expired entries, disabling SWR).
   */
  peek?(key: string): Promise<CacheEntry | undefined>;
}
```

Implement this interface to back the cache with Redis, KV, or any other storage. The default `createMemoryStore(maxEntries = 200)` evicts ~20% of the oldest entries when full. The optional `peek()` method (added in P9-03) is required for ISR stale-while-revalidate — it returns the raw entry even if expired, without touching LRU recency or evicting it.

## createMemoryStore()

```typescript
import { createMemoryStore } from 'ubean';

const store = createMemoryStore(1000); // up to 1000 entries
```

## createCacheMiddleware()

Mount cache as a Hono middleware driven by route rules. Used internally by the ubean runtime when `routeRules` declares `cache`.

```typescript
import { createCacheMiddleware, useCacheStore } from 'ubean';

app.use(createCacheMiddleware({
  store: useCacheStore(),
  rules: {
    '/api/products/**': { ttl: 60 },         // 60s
    '/api/feed': { ttl: 300, swr: true }     // 5min, stale-while-revalidate
  },
  defaultTtl: 0
}));
```

| Option      | Type                          | Description                                  |
| ----------- | ----------------------------- | -------------------------------------------- |
| store       | CacheStore                    | Store implementation (defaults to global)    |
| rules       | Record<string, CacheRule>     | Path pattern → cache rule mapping            |
| defaultTtl  | number                        | TTL applied when no rule matches (0 disables) |

Path patterns support `*` (single segment) and `**` (multi-segment), matching the same semantics as `routeRules`.

### CacheRule

```typescript
export interface CacheRule {
  ttl: number;        // seconds; 0 disables caching
  swr?: boolean | number;  // serve stale while revalidating
  name?: string;      // explicit cache key (defaults to method + path + query)
}
```

## cachedEventHandler()

Wrap a single handler with caching. Useful for expensive endpoints that do not fit the path-pattern rule model.

```typescript
import { defineHandler, cachedEventHandler } from 'ubean';

export const GET = defineHandler(
  cachedEventHandler(
    async c => {
      const data = await expensiveCompute();
      return c.json(data);
    },
    { ttl: 300, name: 'expensive:endpoint' }
  )
);
```

Cacheability is enforced automatically:
- Only `GET`/`HEAD` requests are cached
- Requests with `Authorization` headers are never cached
- Requests with cookies are cached only if `Cache-Control: public` is sent
- Responses with `set-cookie` or non-200 status are never stored

## defineCachedFunction()

Wrap an arbitrary function with caching. This is the explicit, function-call replacement for the removed `"use cache"` string directive. Useful for memoizing expensive computations (DB queries, remote fetches, derived data) with TTL- and tag-based invalidation.

```typescript
import { defineCachedFunction } from 'ubean';

// Wrap a function with a 60s TTL and tags for targeted invalidation
export const getUserProfile = defineCachedFunction(
  async (userId: string) => {
    const user = await db.query.users.findById(userId);
    return user;
  },
  { ttl: 60, tags: (userId) => [`user:${userId}`] }
);

// Invalidate by tag (or pattern) from a mutation handler
import { revalidateTag } from 'ubean';
await revalidateTag('user:42');
```

| Option  | Type                          | Description                                                       |
| ------- | ----------------------------- | ----------------------------------------------------------------- |
| ttl     | number                        | Cache TTL in seconds (0 disables caching)                         |
| tags    | string[] \| (...args) => string[] | Tags attached to the entry for tag-based invalidation         |
| name    | string                        | Explicit cache key (defaults to function name + serialized args) |

> **Deprecated alias**: `wrapWithCache(fn, options)` is kept as a deprecated alias for `defineCachedFunction()`. Prefer `defineCachedFunction()` in new code.

### Migration from legacy syntax

The `"use cache"` string directive and its `ubeanCacheDirectivePlugin` Vite plugin (previously exported from `@ubean/server/vite`) have been **removed**. Migrate to the explicit `defineCachedFunction()` wrapper:

```typescript
// Before (removed): "use cache" string directive
async function getUserProfile(userId: string) {
  'use cache';
  return await db.query.users.findById(userId);
}

// After: explicit defineCachedFunction() wrapper
export const getUserProfile = defineCachedFunction(
  async (userId: string) => db.query.users.findById(userId),
  { ttl: 60 }
);
```

The `cacheLife(seconds)` / `cacheTag(...tags)` macros and the `revalidateTag()` / `revalidateTags()` / `revalidatePath()` invalidation APIs are unchanged.

## invalidateRouteCache()

Invalidate cached entries by key, pattern, or clear all.

```typescript
import { invalidateRouteCache } from 'ubean';

await invalidateRouteCache('GET:/api/users:1');   // exact key
await invalidateRouteCache(/^GET:\/api\/users:/); // regex match
await invalidateRouteCache();                      // clear all
```

## Route rules integration

Cache rules are usually declared in `ubean.config.ts` via `routeRules`. The runtime resolves them into `CacheRule`s automatically.

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routeRules: {
    '/api/products/**': { cache: { ttl: 60 } },
    '/api/feed': { cache: { ttl: 300, swr: true } },
    '/api/user/**': { headers: { 'cache-control': 'no-store' } }
  }
});
```

The middleware sets `X-Cache: HIT|MISS` and `Age` headers on cached responses for observability.

## ISR (Incremental Static Regeneration)

ISR (P9-03) caches the **rendered HTML** of page routes with a TTL, optionally serving stale content while revalidating in the background. Unlike `cache` rules (which cache HTTP responses at the middleware layer), ISR caches the output of the Vue SSR renderer and is configured per-route via `routeRules.isr`.

```typescript
// ubean.config.ts
export default defineConfig({
  routeRules: {
    // Regenerate /blog/** pages every 60s; serve stale while revalidating
    '/blog/**': { isr: { ttl: 60, swr: true } },
    // Simple form: ttl only (no SWR)
    '/news/**': { isr: 300 }
  }
});
```

| Form                           | Behavior                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `isr: 300`                     | Cache HTML for 300s. After expiry, the next request re-renders.     |
| `isr: { ttl: 60 }`             | Same as `isr: 60`.                                                  |
| `isr: { ttl: 60, swr: true }`  | Cache HTML for 60s; after expiry, serve stale + revalidate in background. |

### How it works

1. On a `GET` request to a page with an ISR rule, the router checks the cache store for the rendered HTML.
2. **HIT** (entry exists and not expired) → serve cached HTML with `X-ISR: HIT`.
3. **STALE** (entry exists but expired, `swr: true`) → serve stale HTML with `X-ISR: STALE`, trigger background revalidation (deduped per-path).
4. **MISS** (no entry, or `swr: false` and entry expired) → render HTML synchronously, cache it, serve with `X-ISR: MISS`.

The cache store is automatically initialized by the runtime when any `isr` rule is present. Custom stores should implement `peek()` to support SWR — otherwise ISR falls back to `get()` which deletes expired entries (disabling stale serving).

### Invalidation

Use `invalidateRouteCache()` to invalidate ISR entries (same API as HTTP cache):

```typescript
import { invalidateRouteCache } from 'ubean';

// After publishing a new blog post, invalidate all /blog/* ISR entries
await invalidateRouteCache(/^ISR:\/blog\//);
```

### Relationship to other rendering modes

| Feature                | When it runs                | Output           | Caching                       |
| ---------------------- | --------------------------- | ---------------- | ----------------------------- |
| `prerender: true`      | Build time                  | Static HTML file | Permanent (until next build)  |
| `isr`                  | First request / on expiry   | Cached HTML      | TTL-based + optional SWR      |
| `ssr: true` (default)  | Every request               | Fresh HTML       | None                          |
| `ssr: false`           | Client-side                 | Empty shell      | None                          |

ISR requires SSR to be enabled (either globally via `ssr: true`, or per-route via `ssr: true` / `ssr: 'streaming'`). A route with `ssr: false` and `isr` will skip ISR (no renderer available).

## Custom stores

Implement `CacheStore` for Redis, Cloudflare KV, or any durable backend:

```typescript
import { useCacheStore, type CacheStore } from 'ubean';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const redisStore: CacheStore = {
  async get(key) {
    const raw = await redis.get(`cache:${key}`);
    return raw ? JSON.parse(raw) : undefined;
  },
  async set(key, entry, ttl) {
    await redis.set(`cache:${key}`, JSON.stringify(entry), { EX: ttl });
  },
  async delete(key) {
    const count = await redis.del(`cache:${key}`);
    return count > 0;
  },
  async clear() {
    // implement carefully — usually scoped by prefix in production
  }
};

useCacheStore(redisStore);
```

## What ubean does NOT provide

ubean does **not** ship these APIs (common in other frameworks' cache modules):

- `useCache()` / `defineCache()` — use `useCacheStore()` + `cachedEventHandler` instead
- Tag-based invalidation, cache groups, `remember()`, `rememberForever()`
- Built-in Redis/Memcached/file drivers — implement `CacheStore` yourself or use `unstorage` (`useStorage`) for generic key/value caching

For arbitrary application-level key/value caching (not HTTP response caching), prefer `useStorage` / `useKV`:

```typescript
import { useStorage } from 'ubean';

const storage = useStorage();
await storage.setItem('user:1', { name: 'John' });
const user = await storage.getItem('user:1');
```

## Best Practices

1. **Cache at the route level** — prefer `routeRules` over per-handler caching for consistency.
2. **Scope custom stores** — namespace Redis keys to avoid collisions across deployments.
3. **Invalidate on mutation** — call `invalidateRouteCache(...)` from `POST`/`PATCH`/`DELETE` handlers.
4. **Never cache authed responses** — the middleware enforces this, but verify your `Cache-Control` headers.
5. **Use `swr` for high-traffic feeds** — keeps latency low while revalidating in the background.
