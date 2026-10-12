# @ubean/server

**English | [中文](./README.zh-CN.md)**

Server-side runtime primitives for ubean: caching, database, queues, cron, realtime, storage, security, observability, email, analytics, static serving and platform drivers.

`@ubean/server` is ubean's server capability library. Every capability has a **semantic subpath** (`@ubean/server/cache`, `/db`, `/queue`, …); the main entry `.` is a convenience barrel that re-exports all of them. New code should import from the subpath — the barrel forces `tsc` and the IDE to resolve every submodule's types even for a single-symbol import.

```ts
import { defineHandler } from '@ubean/routes';
import { useCacheStore, createMemoryStore } from '@ubean/server/cache';
import { useDatabase } from '@ubean/server/db';

const store = useCacheStore(createMemoryStore(500));

export const GET = defineHandler(async c => {
  const { rows } = await useDatabase().sql`SELECT id, title FROM posts LIMIT 20`;
  return c.json({ posts: rows });
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Entry Points](#entry-points)
- [Cache](#cache)
- [Database](#database)
- [Queue](#queue)
- [Cron](#cron)
- [Realtime](#realtime)
- [Storage and KV](#storage-and-kv)
- [Email](#email)
- [Analytics and Feature Flags](#analytics-and-feature-flags)
- [Security](#security)
- [Middleware](#middleware)
- [Observability](#observability)
- [Static Serving](#static-serving)
- [Platform Drivers](#platform-drivers)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                      | Responsibility                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ubean/server` (this pkg) | Cross-request server primitives that do not depend on the router: cache, db, queue, cron, realtime, storage, email, analytics, flags, security, middleware, observability, static, drivers |
| `@ubean/app`               | Owns the Hono app and the request middleware chain — it _mounts_ the middleware factories from here                                                                                        |
| `@ubean/routes`            | Routing, route rules, ISR, Server Actions, OpenAPI                                                                                                                                         |
| `@ubean/build`             | Build-time concerns: prerendering, platform presets, config loading, Vite plugins                                                                                                          |

**Runtime dependency whitelist: `@ubean/shared`, `hono`, `hookable`, `pathe`.** Everything heavy (unstorage, db0, drizzle, crossws, nodemailer, the platform SDKs) is lazily imported or injected by the application through a driver — that is what keeps this package deployable to edge runtimes. The `vite` peer is optional and only used by the dev-time asset path. The `nodemailer` dev dependency backs the `smtp` email provider; without it that provider is unavailable while the others keep working.

## Install

```bash
pnpm add @ubean/server hono

# only if you use the matching feature:
pnpm add unstorage   # storage / KV backing stores
pnpm add db0         # database connectors
pnpm add nodemailer  # the smtp email provider
```

## Quick Start

```ts
import { defineScheduled, startCronScheduler } from '@ubean/server/cron';
import { useDatabase } from '@ubean/server/db';
// src/server.ts
import { defineQueue, sendMessage, startQueueWorkers } from '@ubean/server/queue';
import { useKV } from '@ubean/server/storage';

defineQueue({ name: 'emails' }, async message => {
  await sendEmail({ to: message.to, subject: 'Welcome', text: 'Hi!' });
});

defineScheduled({ name: 'cleanup', schedule: '0 3 * * *' }, async () => {
  await useDatabase().exec('DELETE FROM sessions WHERE expires_at < now()');
});

await startQueueWorkers();
startCronScheduler();
await useKV('flags').set('dark-mode', true);
```

## Entry Points

Each row is one subpath, and each row below gets its own section. Subpaths are **semantic aggregations**, not a 1:1 mirror of internal files — six of them merge several modules. The barrel stays fully supported and exports the same symbols; the subpaths exist to keep type resolution scoped. `./cdn-cache` has no subpath and is barrel-only.

| Subpath                         | What lives behind it                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@ubean/server/cache`           | Route-level HTTP cache + component cache (`cache` + `cache-directive`)                              |
| `@ubean/server/cache-directive` | Component/function cache only                                                                       |
| `@ubean/server/db`              | Database and migrations                                                                             |
| `@ubean/server/realtime`        | WebSockets and SSE (`websocket` + `sse`)                                                            |
| `@ubean/server/security`        | CSP / CSRF / Sessions (`security-headers` + `csrf` + `sessions`)                                    |
| `@ubean/server/queue`           | Message queues                                                                                      |
| `@ubean/server/cron`            | Scheduled tasks (`cron` + `cron-scheduler`)                                                         |
| `@ubean/server/storage`         | unstorage + KV namespaces                                                                           |
| `@ubean/server/observability`   | Request IDs, spans, tracing                                                                         |
| `@ubean/server/email`           | Email providers and transports                                                                      |
| `@ubean/server/analytics`       | Analytics and A/B experiments (`analytics` + `feature-flags`)                                       |
| `@ubean/server/static`          | Static file serving                                                                                 |
| `@ubean/server/drivers`         | Platform-native drivers                                                                             |
| `@ubean/server/middleware`      | Request lifecycle (`cors` + `rate-limit` + `after` + `fetch-memo` + `draft-mode` + `single-flight`) |

## Cache

```ts
import { createCacheMiddleware, useCacheStore, createMemoryStore } from '@ubean/server/cache';

app.use(
  createCacheMiddleware({
    store: useCacheStore(createMemoryStore(500)),
    rules: { '/api/products/**': { ttl: 60 }, '/api/feed': { ttl: 300, swr: true } },
    defaultTtl: 0
  })
);
```

`CacheStore` is the swappable backend — `get` / `set(key, entry, ttl)` / `delete` / `clear` plus an optional `peek(key)` that reads an entry **without** touching LRU recency and without deleting it when expired. `peek` is what enables stale-while-revalidate; without it ISR falls back to `get()`, which drops expired entries and disables stale serving. `createMemoryStore(maxEntries = 200)` evicts roughly 20% of the oldest entries when full; `createStorageCacheStore(storage, prefix = 'cache:')`, `createFsCacheStore(dir)` and `loadFsCacheStore(dir)` back it with storage or the Node filesystem.

`CacheRule` is `{ ttl, swr?, name? }`. Cacheability is enforced: only `GET`/`HEAD`, never with `Authorization`, cookie-carrying requests only when `Cache-Control: public` is sent, non-200 and `private`/`no-store` responses never stored, and `set-cookie` stripped before storing. `cachedEventHandler(handler, rule)` wraps a single handler; `invalidateRouteCache(keyPattern?)` clears by exact key, pattern, `RegExp`, or everything. This is a route-level HTTP cache, **not** a generic key/value client — for arbitrary application caching use `./storage`.

The component cache lives behind the same subpath:

```ts
import { defineCachedFunction, cacheLife, cacheTag, revalidateTag } from '@ubean/server/cache-directive';

export const getUserProfile = defineCachedFunction(
  async (userId: string) => {
    cacheLife(60);
    cacheTag('users', `user:${userId}`);
    return await db.query.users.findById(userId);
  },
  { name: 'getUserProfile' } // required — the cache key base
);
```

`cacheLife(seconds)` and `cacheTag(...tags)` only apply inside the wrapped function body; outside a cache scope they are no-ops. `revalidateTag(tag)` / `revalidateTags(...tags)` invalidate by tag and `revalidatePath(pattern)` by glob/regex, both returning the number of deleted entries. `useComponentCacheStore(store?)` reads or replaces the store and `createComponentMemoryStore(maxEntries = 500)` creates a memory backend with a tag reverse index.

## Database

```ts
import { defineDatabase, useDatabase, runMigrations, rawSql } from '@ubean/server/db';

const db = defineDatabase({ default: 'primary', connectors: { primary, replica } });

const { rows } = await useDatabase().sql<{ id: number; email: string }>`
  SELECT id, email FROM users WHERE id = ${userId}
`;
```

The layer sits on the `db0` connector abstraction and falls back to in-memory SQL when neither `connector` nor `connectors` is given, so the same code path works in tests and on edge runtimes. `Database` is `{ sql<T>(strings, ...values) => Promise<{ rows: T[] }>; exec(query); close() }`. Parameters are always bound — never interpolate user input into the tagged template. `rawSql(str)` (aliased `sqlRaw` and `raw`) marks fragments that cannot be bound, such as table or column names.

`migrateDatabase(db, statements)` runs raw SQL statements in order; `runMigrations(db, migrations, options)` tracks applied migrations in a `_migrations` table and runs only pending ones, returning `{ applied }` (`Migration` is `{ name, up, down? }`). There is no `defineMigration` or `defineSeed` API. Lifecycle hooks come from `getDatabaseHooks()` (`db:connect`, `db:disconnect`, `db:query`, `db:error`); `registerDb0Create(fn)` registers the db0 factory and `closeDatabases()` closes every registered database.

## Queue

```ts
import { defineQueue, sendMessage, startQueueWorkers } from '@ubean/server/queue';

defineQueue({ name: 'emails' }, async (message: { to: string }) => {
  await sendEmail({ to: message.to, subject: 'Welcome', text: 'Hi!' });
});

await startQueueWorkers();
await sendMessage('emails', { to: 'alice@example.com' });
```

`defineQueue(options, handler?)` declares a queue; `createMemoryQueueDriver()` is the default driver and `setQueueDriver` / `useQueueDriver` swap it (the platform drivers live in `./drivers`). `sendMessage(queueName, body, options?)` returns the message id and `sendMessages` a batch of ids. Workers are controlled with `startQueueWorkers()` / `stopQueueWorkers()`, and `getQueueStats(queueName)` / `getAllQueueStats()` report counters.

## Cron

```ts
import { defineScheduled, runScheduledTask, validateCron } from '@ubean/server/cron';
import { startCronScheduler } from '@ubean/server/cron';

defineScheduled({ name: 'cleanup', schedule: '0 3 * * *' }, async ctx => {
  await pruneExpiredSessions();
});

validateCron('0 3 * * *'); // true
startCronScheduler();
```

`defineScheduled(metaOrName, handler?)` returns a `ScheduledTask`; `getScheduledTasks()` / `clearScheduledTasks()` list or reset them and `runScheduledTask(name)` executes one directly (useful from a platform cron trigger). `parseCron(expr)` and `validateCron(expr)` handle expression parsing without scheduling anything, and `createCronContext(name, schedule)` builds the `CronContext` passed to handlers. On serverless and edge targets the framework does not start the in-process scheduler — use the platform's cron instead.

## Realtime

```ts
import { defineWebSocket, createRoom, broadcast } from '@ubean/server/realtime';

createRoom('chat');

defineWebSocket({
  path: '/ws/chat',
  hooks: {
    open: peer => peer.subscribe('lobby'),
    message: (peer, message) => broadcast('lobby', message)
  }
});
```

```ts
import { defineHandler } from '@ubean/routes';
import { createSSEStream } from '@ubean/server/realtime';

export const GET = defineHandler(c =>
  createSSEStream(c, {
    onConnect: connection => connection.sendData({ tick: 1 }, 'tick')
  })
);
```

WebSockets: `defineWebSocket(def)` / `defineRoom(name)` / `createRoom(name)` / `getRoom(name)` / `broadcast(topic, data)`, with the runtime entries `registerWebSocket(path, def)`, `handleUpgrade(c, options)`, `handleMessage(peer, message)`, `handleClose(peer, code = 1000, reason = '')`, `handleError(peer, error)` and `createWebSocketMiddleware()`. SSE: `createSSEStream(c, handler, options?)` / `defineSSE(handler, options?)` / `formatSSEMessage(msg)` / `broadcastSSE(event, data, filter?)` / `getSSEConnections()` / `sseHeaders()` / `closeAllSSE()`. Types: `Peer`, `WebSocketRoom`, `WebSocketHooks`, `WebSocketDefinition`, `UpgradeResult`, `SSEMessage`, `SSEConnection`, `SSEHandler`, `SSEOptions`.

## Storage and KV

```ts
import { useStorage, createStorage, useKV } from '@ubean/server/storage';

const storage = useStorage();
await storage.set('user:1', { name: 'John' });
const user = await storage.get<User>('user:1');

const flags = useKV<boolean>('flags');
await flags.set('dark-mode', true);
```

`useStorage(storage?)` reads or installs the global unstorage instance; `createStorage(options)` builds one, `createMemoryDriver()` is the default in-memory driver, and `clearGlobalStorage()` resets it. `useKV<T>(name = 'default', options?)` returns a namespaced `KVNamespace<T>` and `createKV<T>(options?)` builds one directly. This is the right layer for arbitrary key/value caching — the `./cache` store is specifically a route-level HTTP cache.

## Email

```ts
import { defineEmailProvider, sendEmail, renderEmailTemplate } from '@ubean/server/email';

defineEmailProvider({ type: 'log' }); // 'log' | 'smtp' | 'mock' | 'sendmail'

await sendEmail({
  to: 'alice@example.com',
  subject: 'Welcome',
  html: renderEmailTemplate('<p>Hi {{name}}</p>', { name: 'Alice' })
});
```

`defineEmailProvider(options)` registers a provider and `createEmailTransport(provider)` builds its transport; `setDefaultEmailProvider` / `useEmailProvider` / `getEmailProvider(name)` / `getEmailProviderNames()` manage the registry. `sendEmail(options)` returns an `EmailResult`, and `renderEmailTemplate(template, data)` interpolates `{{name}}` placeholders. `getSentEmails()` / `clearSentEmails()` expose the mock transport's outbox.

## Analytics and Feature Flags

```ts
import { createAnalyticsMiddleware, trackEvent, defineAnalyticsProvider } from '@ubean/server/analytics';
import { defineFeatureFlag, evaluateFlag, getVariant } from '@ubean/server/analytics';

defineAnalyticsProvider({ name: 'console', transport: 'log' });
app.use('*', createAnalyticsMiddleware());

await trackEvent(c, 'signup', { plan: 'pro' });

defineFeatureFlag('new-checkout', { kind: 'percentage', rollout: 25 });
const enabled = await evaluateFlag('new-checkout', { userId });
const variant = await getVariant('new-checkout', { userId });
```

Analytics: `defineAnalyticsProvider(options)`, the registry helpers `registerAnalyticsProvider` / `unregisterAnalyticsProvider` / `getAnalyticsProvider` / `listAnalyticsProviders` / `clearAnalyticsProviders`, the global setter `setGlobalAnalyticsProvider`, `extractAnalyticsContext(c)`, the trackers `trackPageView` / `trackEvent` / `trackRaw`, and `createAnalyticsMiddleware(options?)` (aliased `defineAnalytics(options)`). Built-in providers are `createLogAnalyticsProvider()`, `createMemoryAnalyticsProvider()` and `createMockAnalyticsProvider(impl?)`.

Feature flags: `defineFeatureFlag(name, options?)` and `defineExperiment(name, options)` register definitions; `evaluateFlag` / `evaluateFlagWithReason` / `getVariant` / `getVariantAssignment` evaluate them (`FlagKind` is `'boolean' | 'multivariate' | 'percentage'`); `useFlags(c)` / `useExperiments(c)` / `useFlagContext(c)` read request-scoped results. `createMemoryFeatureFlagStore()` backs everything by default, `extractFlagContext(c)` builds the evaluation context, and `listFlagNames` / `listExperimentNames` / `removeFeatureFlag` / `removeExperiment` inspect or prune the registry.

## Security

```ts
import { createCsrfMiddleware, createSecurityHeadersMiddleware } from '@ubean/server/security';
import { createSessionMiddleware, useSession } from '@ubean/server/security';

app.use('*', createSecurityHeadersMiddleware({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"] } } }));
app.use('*', createCsrfMiddleware());
app.use('*', createSessionMiddleware({ secret: process.env.SESSION_SECRET! }));
```

The middleware is installed once at startup; `useSession` is then called inside handlers. Security headers: `createSecurityHeadersMiddleware(options?)` (CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-*), with `serializeCsp(directives)` / `extendCspScriptSrc(directives, origins)` for CSP construction and `mergeSecurityHeadersOptions(base, override)` for layered defaults. CSRF: `createCsrfMiddleware(options?)` (double-submit cookie by default, plus origin-check and both modes) and `generateCsrfToken(length = 32)`. Sessions: `createSessionMiddleware(options?)`, `useSession<T>(c)` returning `Session<T> | null`, and `createStorageSessionStore(storage?, prefix = 'session:')` for storage-backed sessions. Each capability also has a declarative form: `defineSecurityHeaders` / `defineCsrf` / `defineSessionStore`.

## Middleware

```ts
import { after } from '@ubean/server/middleware';
import { createCorsMiddleware, createRateLimitMiddleware } from '@ubean/server/middleware';
import { createDataCacheMiddleware, createFetchMemoizationMiddleware } from '@ubean/server/middleware';
import { createSingleFlightMiddleware, defineDraftMode, defineRevalidation } from '@ubean/server/middleware';

app.use('*', createCorsMiddleware({ origin: 'https://example.com' }));
app.use('/api/*', createRateLimitMiddleware({ windowMs: 60_000, max: 100 }));

export const GET = defineHandler(async c => {
  after(() => analytics.flush()); // runs after the response, never blocks TTFB
  return c.json({ ok: true });
});
```

| Group             | API                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORS              | `createCorsMiddleware(options?)`, `defineCors(options)`                                                                                                                          |
| Rate limit        | `createRateLimitMiddleware(options?)`, `defineRateLimit(options)`, `createMemoryRateLimitStore()`                                                                                |
| `after`           | `after(callback)`, `createAfterMiddleware()`, `flushAfterCallbacks(c)`, `getAfterCallbackCount(c?)`                                                                              |
| Fetch memoization | `createFetchMemoizationMiddleware(options)`, `createMemoizedFetch(options)`                                                                                                      |
| Data Cache        | `createDataCacheMiddleware(options?)`, `revalidateDataCacheTag(tag)`, `revalidateDataCachePath(pattern)`, `clearFetchDataCache()`, `getDataCacheSize()`                          |
| Draft Mode        | `createDraftModeMiddleware(options)`, `defineDraftMode(options)`, `enableDraftMode(c)`, `disableDraftMode(c)`, `isDraftMode(c)`, `useDraftMode(c)`                               |
| Single flight     | `defineRevalidation(keys, fetcher, name?)`, `createSingleFlightMiddleware(options?)`, `runRevalidation(keys, c, parallel?)`, `defineSingleFlight(options)`, `invalidateKey(key)` |

`after(callback)` is fire-and-forget with an AsyncLocalStorage request scope: the callback runs after the response is sent. Fetch memoization dedupes identical `GET` URLs within one request; the Data Cache (`FetchCacheOptions`, `FetchInitWithNext extending RequestInit`) extends that across requests, honoring `next: { revalidate, tags, noStore }` and integrating with `revalidateTag` / `revalidatePath`. Draft Mode signs a cookie and injects a controller; when the middleware is not registered, `isDraftMode` returns `false` and `useDraftMode` returns a safe fallback at zero cost.

## Observability

```ts
import { createTracingMiddleware, createConsoleExporter, withSpan } from '@ubean/server/observability';

app.use('*', createTracingMiddleware({ exporter: createConsoleExporter() }));

await withSpan('db.query', async span => {
  span.setAttribute('table', 'users');
});
```

`createTracingMiddleware(options?)` wires tracing into the request path and `createObservabilityTracer(config?)` builds a standalone tracer (`ObservabilityTracer`); `setGlobalTracer` / `getGlobalTracer` manage the shared one. Manual instrumentation uses `startSpan(options | string)`, `withSpan(options | string, fn)`, `createSpan(options)` and `getSpan(c)`. Request IDs come from `generateRequestId()`, `getRequestId(c)` and the `REQUEST_ID_HEADER` constant. Exporters: `createConsoleExporter(options)` and `createOpenTelemetryExporter(options)`.

## Static Serving

```ts
import { serveStatic } from '@ubean/server/static';

app.use('/*', serveStatic({ publicDir: './dist/public' }));
```

`serveStatic(options)` serves files from a directory and skips API and `_`-prefixed paths. It reads from disk, so it is a Node-runtime feature — on Cloudflare Workers and similar targets, static assets are served by the platform layer (`@ubean/app` only registers it when `isNodeRuntime()`).

## Platform Drivers

```ts
import { createCloudflareD1Database, createCloudflareQueueDriver } from '@ubean/server/drivers';
import { createVercelPostgresDatabase, createVercelKvQueueDriver } from '@ubean/server/drivers';
import { createBunSqliteDatabase } from '@ubean/server/drivers';
import { createDenoKvStorage, createNetlifyBlobsStorage } from '@ubean/server/drivers';

const db = createCloudflareD1Database(env.DB);
const driver = createCloudflareQueueDriver(env.QUEUES);
```

Cloudflare gets `createCloudflareD1Database(db)` / `createCloudflareQueueDriver(queues, handlers?)` / `dispatchCloudflareQueueBatch(handlers, queueName, bodies)`; Vercel gets `createVercelPostgresDatabase(client)` / `createVercelKvQueueDriver(kv, prefix?)`; Bun gets `createBunSqliteDatabase(db)`; Deno gets `createDenoKvStorage(kv)`; Netlify gets `createNetlifyBlobsStorage(store)`. Each factory accepts a structural binding type (`D1DatabaseBinding`, `CloudflareQueueBinding`, `PostgresLike`, `KvListBinding`, `BunSqliteLike`, `DenoKvLike`, `NetlifyBlobsStore`), so no platform SDK is imported — you pass in the binding the runtime hands you. Runnables for each platform live in [`examples/platform-drivers`](../../examples/platform-drivers).

## Type Safety

- The environment and domain types (`UbeanEnv`, `UbeanContext`, `UbeanVariables`, `UbeanBindings`, `RouteRule`, `Span*`) are re-exported from `@ubean/shared`, so feature modules rarely need an extra type import.
- Storage and KV are generic: `useKV<T>(name?, options?)` returns `KVNamespace<T>`, and `defineCachedFunction<TArgs, TResult>` preserves the wrapped signature.
- Every driver factory takes a structural interface for the platform binding rather than a concrete SDK type, which is what allows the package to type-check without any platform SDK installed.

## Architecture Notes

- **Subpaths are semantic, not 1:1.** `./cache`, `./realtime`, `./security`, `./cron`, `./analytics` and `./middleware` each aggregate several internal modules; the barrel and the subpaths export the same symbols.
- **Prefer the subpath in new code.** The barrel is a convenience entry, not a bundle-size problem — the function re-exports tree-shake and the heavy dependencies are dynamically imported — but it does force `tsc` and the IDE to resolve every submodule's types even for a single-symbol import. That type-resolution cost is why the subpaths exist.
- **Heavy dependencies are lazy.** unstorage, db0, drizzle, crossws and the platform SDKs are either dynamically imported inside their module or supplied by the caller. `dependencies` lists only `@ubean/shared`, `hono`, `hookable` and `pathe`.
- **Two kinds of application caching, deliberately separated.** Route-level HTTP caching belongs in `./cache` behind `CacheStore`; anything else belongs in `./storage`. `useCache()` / `defineCache()` and cache groups / `remember()` do not exist here.
- **Node-only capabilities are gated.** `serveStatic` and the fs cache store read the filesystem, so they are only wired on Node runtimes; on workers the platform serves assets and stores state.
