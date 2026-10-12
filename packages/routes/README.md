# @ubean/routes

**English | [中文](./README.zh-CN.md)**

Server routes runtime for ubean: handler wrappers, the rou3 server router, route rules, ISR, Server Actions and OpenAPI registration.

`@ubean/routes` is the layer between a scanned project and a Hono app. It owns `defineHandler` / `defineHandlerMeta` / `defineMiddleware`, the route registration pipeline (`registerRoutes`, `registerApiRoutes`, `registerPageRoutes`), declarative route rules (redirect / rewrite / proxy / headers / cache / ssr / isr / prerender / ppr), Incremental Static Regeneration, Server Actions (`POST /__actions`), the internal-fetch bridge, and the OpenAPI/Scalar routes. The `./runtime` subpath is the browser-safe fragment consumed by client code.

```ts
import { defineHandler, defineHandlerMeta } from '@ubean/routes';

export const GET = defineHandler(defineHandlerMeta({ cache: { ttl: 60 } }), async c => {
  const { rows } = await db.sql`SELECT id, title FROM posts LIMIT 20`;
  return c.json({ posts: rows });
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Route Handlers](#route-handlers)
- [Server Router](#server-router)
- [Route Registration](#route-registration)
- [Route Rules](#route-rules)
- [ISR (Incremental Static Regeneration)](#isr-incremental-static-regeneration)
- [Rendering Mode Selection](#rendering-mode-selection)
- [Server Actions](#server-actions)
- [OpenAPI](#openapi)
- [Internal Fetch](#internal-fetch)
- [Bot Detection](#bot-detection)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                         | Responsibility                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/routes` (this pkg)    | Server routing runtime: handler wrappers, rou3 router, registration pipeline, route rules, ISR, Server Actions, internal fetch, OpenAPI                           |
| `@ubean/scan` (optional peer) | Scans `src/routes`, `src/middleware`, `src/pages` and produces the `ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` structures this package registers |
| `@ubean/app`                  | Hono app factory (`createUbeanApp`) — owns the request middleware chain and calls `registerRoutes` with the scan result                                           |
| `@ubean/server`               | Server runtime primitives (cache / db / queue / cron / storage / …); ISR only needs a `CacheStore`-shaped object, not a dependency on that package                |
| `@ubean/vue`                  | Page-routing kernel — owns client-side route scanning, matchers and layout chain; **not** a dependency of this package                                            |

**Included:**

- `defineHandler` / `defineHandlerMeta` / `defineMiddleware` and the handler-chain helpers (`isHandlerChain`, `extractRouteMeta`)
- `UbeanRouter` (rou3-backed) plus `createServerRouter` / `useRouter`
- Registration pipeline: `registerRoutes`, `registerApiRoutes`, `registerPageRoutes`, `createRouteLoader`, `sortPagesForRegistration`, `sortApiRoutesForRegistration`, `apiPathSpecificity`, `convertUbeanRoutePath`
- Route rules: `compileRouteRules`, `matchRouteRules`, `createRouteRulesMiddleware`, `applyPathTransform`, `normalizeIsrRule`
- ISR: `serveIsr`, `getIsrCache`, `getStaleIsrCache`, `setIsrCache`, `invalidateIsrCache`, `invalidateIsrCachePattern`, `isIsrEntryStale`, `buildIsrCacheKey`, `getIsrRuleFromContext`
- Rendering-mode resolution: `resolveSelectSsr`, `ssrModeHeader`
- Server Actions: `defineAction` / `defineServerFn`, `fail` / `ActionError`, the action registry, `createActionsMiddleware`, `POST /__actions`, form-action helpers
- Client-safe action runtime in the `./runtime` subpath: `createActionStub`, `callAction`, `useAction`, `useFormAction`, `invokeServerFn`
- `createInternalAdapter` / `setInternalFetcher` (in-process dispatch), `isBotUserAgent`, `registerOpenAPIRoutes`

**NOT included** (owned elsewhere):

- Route **scanning** (filesystem → `Scanned*` structures) — `@ubean/scan`
- App construction, middleware ordering, `/_health`, CSRF/CSP wiring — `@ubean/app`
- HTTP cache stores, component cache, database, queues — `@ubean/server` (the router accepts any `CacheStore`-shaped object)
- Vue-side routing and the `definePage` macro — `@ubean/vue`

**Runtime dependency whitelist (main entry): `@ubean/shared`, `@ubean/i18n`, `hono`, `hono-openapi`, `rou3`, `@soybeanjs/fetch`.** All three peers are optional and only needed by the integration they power — absent `@ubean/scan` you must build the `Scanned*` inputs yourself; absent `@ubean/pages` the page-renderer types degrade to `any`; absent `vue` the `./runtime` subpath (and only it) cannot be imported.

## Install

```bash
pnpm add @ubean/routes hono

# optional peers — only for the integrations you actually use:
pnpm add @ubean/scan @ubean/pages   # scanned route/page structures + page renderer types
pnpm add vue                        # client-side actions runtime (`./runtime`)
```

## Quick Start

**1. Define an API route** with a named export per HTTP method (`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` / `HEAD`):

```ts
// src/routes/api/posts.ts
import { defineHandler } from '@ubean/routes';
import { validator } from 'hono-openapi';
import { z } from 'zod';

export const GET = defineHandler(validator('query', z.object({ limit: z.coerce.number().max(100) })), c =>
  c.json({ limit: c.req.valid('query').limit })
);

export const POST = defineHandler(async c => {
  const body = await c.req.json<{ title: string }>();
  return c.json({ created: true, title: body.title }, 201);
});
```

**2. Mount the scanned result** on a Hono app:

```ts
// src/server.ts
import { registerRoutes } from '@ubean/routes';
import type { RegisterOptions } from '@ubean/routes';
import { Hono } from 'hono';

const app = new Hono();
const scan: RegisterOptions = { routes, middleware, pages, layouts, routeLoaders, middlewareLoaders };

await registerRoutes(app, scan);
```

In a ubean project both steps are wired for you: `ubean build` injects the scan result into `createUbeanApp` (from `@ubean/app`), which calls `registerRoutes` during `init()`.

## Route Handlers

`defineHandler(...handlers)` accepts one to five Hono handlers and returns a `MiddlewareChain` array — the metadata-carrying chain the registrar understands. Handlers before the last one are middlewares; a handler may also return a plain object or string instead of a `Response`, which is converted to `application/json` (object) or `text/plain` (string).

```ts
import { defineHandler } from '@ubean/routes';

export const GET = defineHandler(async c => ({ ok: true })); // → application/json
```

`defineHandlerMeta(meta)` is a pass-through middleware that attaches ubean-specific route metadata without changing the response. It carries only ubean's own keys plus custom extensions:

```ts
import { defineHandler, defineHandlerMeta } from '@ubean/routes';

export const GET = defineHandler(defineHandlerMeta({ requiresAuth: true, cache: { ttl: 300 } }), c =>
  c.json({ ok: true })
);
```

`defineMiddleware(handler)` is an identity wrapper that tags a Hono `MiddlewareHandler<UbeanEnv>` as a route-level middleware for scanning and typing.

## Server Router

`UbeanRouter` is a rou3-backed router over compiled scan artifacts. `createServerRouter()` returns a fresh instance; `useRouter()` returns the shared one.

```ts
import { createServerRouter } from '@ubean/routes';

const router = createServerRouter();
router.addApiRoute({ method: 'GET', route: '/api/posts', fullPath: 'src/routes/api/posts.ts' });
router.addMiddleware({ fullPath: 'src/middleware/auth.ts', order: 1, global: false });
router.addPage({ name: 'PostsIndex', route: '/posts', fullPath: 'src/pages/posts/index.vue' });
router.addLayout({ name: 'default', fullPath: 'src/layouts/default.vue', isDefault: true });
```

Compiled shapes: `CompiledRoute { method, path, id, filePath, meta? }`, `CompiledMiddleware { path, filePath, order, global }`, `CompiledPage { name, path, filePath, layout?, reuseTarget? }`, `CompiledLayout { name, filePath, isDefault }`.

## Route Registration

`registerRoutes(app, options)` is the single entry point and registers, in order: middleware → API routes → page routes. The narrower `registerApiRoutes` / `registerPageRoutes` are exported for callers that need only one half.

Registration order is a correctness concern, so it is a contract rather than an implementation detail: `sortApiRoutesForRegistration` and `apiPathSpecificity` push literal paths ahead of `:param` siblings (Hono's `TrieRouter` is first-match-wins), and catch-all routes go last. `convertUbeanRoutePath` translates the scanner's path dialect into Hono's.

```ts
import { registerApiRoutes, sortApiRoutesForRegistration, apiPathSpecificity } from '@ubean/routes';

await registerApiRoutes(app, scan);
```

`createRouteLoader(importMetaGlob)` turns an `import.meta.glob` map into a loader function the registrar can call lazily.

## Route Rules

Route rules are declarative per-path overrides matched by glob pattern (`*` = one segment, `**` = recursive). `compileRouteRules` pre-compiles a rules object, `matchRouteRules` matches a request path, and `createRouteRulesMiddleware` does both and exposes the merged result as `c.get('routeRule')`.

```ts
import { createRouteRulesMiddleware } from '@ubean/routes';

app.use(
  '*',
  createRouteRulesMiddleware({
    '/legacy/**': { redirect: { to: '/new/**', statusCode: 301 } },
    '/api/proxy/**': { proxy: 'https://upstream.example.com/**' },
    '/blog/**': { isr: { ttl: 60, swr: true } }
  })
);
```

Resolution order inside the middleware: `redirect` > `rewrite` (re-dispatched) > `proxy` > `headers` (merged) > `cache`. The render fields (`ssr` / `isr` / `prerender` / `ppr`) are consumed later by the page request path, not by this middleware. `applyPathTransform(requestPath, rulePath, target)` is the `*` / `**` placeholder substitution used by redirect/rewrite/proxy rules.

## ISR (Incremental Static Regeneration)

ISR caches the **rendered HTML** of a page route with a TTL, optionally serving stale content while revalidating in the background. `serveIsr(c, options)` returns a `Response` on a hit (or when it re-rendered synchronously) and `undefined` when the caller should render.

```ts
import { serveIsr, buildIsrCacheKey } from '@ubean/routes';

const response = await serveIsr(c, {
  pathname: c.req.path,
  rule: { ttl: 60, swr: true },
  render: () => renderPage(c),
  store: cacheStore
});
```

Flow and headers:

| Case                        | Result                                              |
| --------------------------- | --------------------------------------------------- |
| Entry present and fresh     | Cached HTML, `X-ISR: HIT`                           |
| Entry expired, `swr: true`  | Stale HTML, `X-ISR: STALE`, background revalidation |
| Entry expired, `swr: false` | Synchronous re-render, `X-ISR: MISS`                |
| No entry                    | Render, cache, `X-ISR: MISS`                        |

Keys are prefixed `isr:` (`buildIsrCacheKey(pathname)` → `` `isr:${pathname}` ``), so ISR entries never collide with `RouteRule.cache` responses. Background regeneration is deduplicated per path. `normalizeIsrRule` accepts the shorthand forms (`60`, `{ ttl: 60 }`, `{ ttl: 60, swr: true }`); `getIsrRuleFromContext(c)` reads the rule the route-rules middleware attached. The store must be **injected** — `IsrCacheStore` is structurally compatible with `@ubean/server`'s `CacheStore`, but this package does not depend on it. Implement the optional `peek()` to support SWR; without it ISR falls back to `get()`, which drops expired entries and disables stale serving.

## Rendering Mode Selection

`resolveSelectSsr(input)` picks the effective mode from the per-page declaration, the matched route rule, and the global settings, returning a `ResolvedSelectSsr`; `ssrModeHeader(mode)` renders the response header value for it. Modes are `'ssr' | 'streaming' | 'data-only' | 'csr'` (`SelectSsrValue` is `boolean | 'streaming' | 'data-only'` on the config side).

## Server Actions

Server Actions are type-safe server functions callable from the client, with progressive-enhancement form support. Aligned with the Next.js / SvelteKit / SolidStart pattern.

### Defining actions

```ts
// src/actions/auth.ts
import { defineAction, fail, ActionError } from '@ubean/routes';
import * as v from 'valibot';

const schema = v.object({ email: v.pipe(v.string(), v.email()), password: v.pipe(v.string(), v.minLength(8)) });

export const login = defineAction(schema, async input => {
  if (input.password === 'wrong') return fail(400, { password: 'incorrect' });
  const user = await authenticate(input.email, input.password);
  if (!user) throw new ActionError('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  return { user };
});
```

`defineAction(handlerOrSchema, handler?, options?)` accepts any Standard Schema v1 library (valibot / zod / arktype) or an object with `safeParse` / `parse`. `defineServerFn` is an alias — same ID, same endpoint — for functions that are also used as loaders. `fail(status, errors)` returns field-level errors; `ActionError` is a user-readable error class carrying `code` / `status`. IDs are `createActionId(filePath, exportName)` (`isValidActionId` validates them), and `registerAction` / `getAction` / `hasAction` / `listActions` / `clearActions` expose the registry.

The endpoint is `ACTIONS_ENDPOINT` (`/__actions`), served by `createActionsMiddleware()`; action responses carry `ACTION_RESPONSE_HEADER` (`x-ubean-action`), which `isActionResponse` / `isActionsRequest` check. `dispatchAction(id, c, preParsedInput?)`, `runAction(action, c, preParsedInput?)` and `runPageAction(actions, actionName, c)` are the server-side entry points, and `parseActionInput` / `validateActionInput` / `normalizeActionResult` / `buildActionContext` are the pieces they are built from.

### Client runtime (`./runtime`)

`@ubean/routes/runtime` is the client-safe fragment: it holds the actions RPC and form-action runtime and **must not** import Node.js APIs or server-only types. The Vite plugin (`ubeanServerActionsPlugin`, included in `ubeanPlugin()`) replaces `defineAction()` calls in client builds with `createActionStub(id)`; `useAction` / `useFormAction` are re-exported by `ubean/client`.

```ts
import { callAction, useAction, useFormAction } from '@ubean/routes/runtime';

const { submit, pending, data, error, errors, status, result, reset } = useAction(login);

const form = useFormAction('login'); // → { action, pending, onSubmit, data, errors }
```

`callAction(id, args)` is the low-level RPC — a JSON `POST` to `/__actions` with `x-ubean-action: true`. `invokeServerFn(fn, input?)` is the isomorphic call (server: direct handler + schema; client: RPC stub); `unwrapActionResult` / `unwrapServerFnResult` unwrap a result or rethrow. The split exists so that a client bundle can import the action RPC without dragging in the router, ISR, the action registry, or `hono`.

### Form actions

A page module can export an `actions` record; forms post to `?/<actionName>` (SvelteKit style) and work without JavaScript. `parseFormActionName(url)` reads the name from a URL, `buildFormActionUrl(actionName = 'default')` builds one, and `hasFormAction(url)` tests for it.

## OpenAPI

`registerOpenAPIRoutes(app, options)` mounts `/_openapi.json` (default `openAPIPath`) and a Scalar UI at `/_scalar` (default `scalarPath`). It generates the spec from `describeRoute` metadata with hono-openapi and merges in the Server Actions fragment from `describeActionsOpenApi()`.

```ts
import { registerOpenAPIRoutes } from '@ubean/routes';

registerOpenAPIRoutes(app, { title: 'My API', version: '1.0.0' });
```

`SCALAR_SCRIPT_ORIGIN` is the CDN origin the Scalar page loads its script from — add it to your CSP `script-src` (the ubean runtime does this per-response for that page only).

## Internal Fetch

`createInternalAdapter(c?, options?)` returns a fetch adapter that dispatches through an injected framework handler instead of the network; `setInternalFetcher` / `getInternalFetcher` / `clearInternalFetcher` manage the injection. This is what `createInternalFetch` (`@ubean/pages`) and `@ubean/app`'s `handleFetch` plumbing sit on.

```ts
import { createInternalAdapter, setInternalFetcher } from '@ubean/routes';

setInternalFetcher(request => app.fetch(request));
const adapter = createInternalAdapter();
```

## Bot Detection

`isBotUserAgent(ua)` detects crawler and social-preview user agents (accepts `string | undefined | null`). The framework uses it to downgrade streamed SSR to buffered rendering for crawlers so dynamic `<head>` metadata lands in the initial response.

## Type Safety

- The `UbeanApp`-shaped environment types (`UbeanEnv`, `UbeanContext`, `UbeanVariables`, `UbeanBindings`, `UbeanHandler`, `UbeanMiddleware`, `ComposedHandler`, `Input`, `GenericSchema`, `RouteMeta`, `Span*`) are re-exported from `@ubean/shared`, so handlers need no extra type imports.
- `defineHandler` is overloaded for one to five handlers and accumulates the input types across the chain (`H<UbeanEnv, any, I & I2, …>`), so `c.req.valid(...)` narrows after each `validator`.
- `RegisterOptions` (`routes` / `middleware` / `pages` / `layouts` / `routeLoaders` / `middlewareLoaders` / `pageLoaders` / `i18nConfig` / `ssrExclude` / `streaming` / …) is the typed contract between `@ubean/scan` and this package.

## Architecture Notes

- **Two entries by design.** `.` is the server runtime; `./runtime` is the browser fragment. The split exists because a client bundle must be able to `import { useAction }` without pulling in `hono`, the rou3 router, ISR, or the action registry.
- **Registration order is a contract.** `sortApiRoutesForRegistration` / `apiPathSpecificity` are exported so the ordering rule can be tested and reused; catch-all routes are always registered last.
- **ISR is store-agnostic.** `IsrCacheStore` is a structural type; `serveIsr` never imports a cache implementation. `peek()` is optional and its absence is a documented degradation to synchronous regeneration.
- **Action IDs are content-addressed.** `createActionId` derives the ID from `filePath` + `exportName`, which is what keeps the client stub and the server registration in sync without a manifest.
- **OpenAPI is opt-in per route.** `describeRoute` / `validator` come from `hono-openapi`; nothing is generated unless the route declares metadata and the app registers `registerOpenAPIRoutes`.
