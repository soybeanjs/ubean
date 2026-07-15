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
}
```

Implement this interface to back the cache with Redis, KV, or any other storage. The default `createMemoryStore(maxEntries = 200)` evicts ~20% of the oldest entries when full.

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
