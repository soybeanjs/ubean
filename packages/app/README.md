# @ubean/app

**English | [中文](./README.zh-CN.md)**

Hono app factory and server config for ubean: `createUbeanApp`, `defineServer`, and the global hooks layer.

`@ubean/app` owns the **server-side application**. `createUbeanApp(options)` builds the Hono app, installs the request middleware chain, and registers scanned routes, middleware, pages and Server Actions during `init()`. `defineServer({...})` is the config entry point written in `src/server.ts`; the global hooks layer (`handle` / `handleFetch` / `handleError`) wraps every request.

```ts
// src/server.ts
import { defineServer } from '@ubean/app';

export default defineServer({
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const start = Date.now();
      const response = await resolve(event);
      response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
      return response;
    }
  },
  onServerReady: async app => {
    console.log('routes registered');
  }
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [`createUbeanApp`](#createubeanapp)
- [`UbeanApp`](#ubeanapp)
- [`defineServer`](#defineserver)
- [Global Hooks](#global-hooks)
- [Pages and Rendering](#pages-and-rendering)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                   | Responsibility                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@ubean/app` (this pkg) | Hono app factory (`createUbeanApp`), the request middleware chain, server config (`defineServer`) and global hooks |
| `@ubean/routes`         | Routing runtime: `defineHandler`, route rules, ISR, Server Actions, OpenAPI — `@ubean/app` mounts what it produces |
| `@ubean/scan`           | Produces the `ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` / `ScannedLayout` inputs                 |
| `@ubean/server`         | Runtime primitives (cache / db / queue / cron / realtime / security / …), consumed through semantic subpaths       |
| `@ubean/client`         | The **Vue** app factory — `createUbeanClientApp` / `createUbeanSSRApp`. Not this package. See the note below       |

**Included:**

- `createUbeanApp` / `UbeanApp` (Hono) with the documented 13-step middleware chain
- `defineServer` / `createDefaultServerConfig` / `mergeServerConfigs` / `applyServerConfig`
- Global hooks: `setGlobalHooks` / `getGlobalHooks` / `clearGlobalHooks` plus `applyHandleHook` / `applyHandleFetchHook` / `applyHandleErrorHook` and the `HandleEvent` / `HandleInput` / `HandleFetchInput` / `HandleErrorInput` types
- Helpers: `createHandleEvent`, `extractErrorMessage`, `wrapResolve`
- App wiring for i18n, CSRF, security headers, data cache, route cache, WebSockets, `serveStatic` (Node only), Scalar/OpenAPI, `/_health`

**NOT included** (owned elsewhere):

- The Vue side of the app — `createUbeanClientApp` comes from `@ubean/client`. **`createUbeanApp` is always the Hono factory.** The two are deliberately separate names; mixing them up is the most common footgun in this ecosystem
- Route scanning — `@ubean/scan`; route registration internals — `@ubean/routes`
- Cache/db/queue/storage implementations — `@ubean/server`

**Runtime dependency whitelist: `@ubean/i18n`, `@ubean/islands`, `@ubean/routes`, `@ubean/scan`, `@ubean/server` (semantic subpaths only), `@ubean/shared`, `hono`, `hookable`, `pathe`.** Both peers are optional: without `@ubean/pages` the `pageRenderer` option degrades to `any` (no SSR page rendering), and without `@ubean/seo` the file-convention SEO registration is unavailable — everything else still works.

## Install

```bash
pnpm add @ubean/app hono

# peers — the app itself only needs the types, and only for the features you use:
pnpm add @ubean/pages   # PageRenderer / SSR wiring
pnpm add @ubean/seo     # file-convention SEO (sitemap.ts / robots.ts / …)
```

## Quick Start

```ts
// src/server.ts
import { createUbeanApp, defineServer, applyServerConfig } from '@ubean/app';

const app = createUbeanApp({
  rootDir: process.cwd(),
  routes,
  middleware,
  pages,
  layouts,
  routeRules: { '/api/feed': { cache: { ttl: 300, swr: true } } }
});

await applyServerConfig(app, defineServer({/* … */}));
await app.init();

export default app;
```

`applyServerConfig` must run **before** `app.init()` so that plugins, runtime hooks, global hooks and `onAppCreate` are all in place before routes are registered.

## `createUbeanApp`

```ts
function createUbeanApp(options?: UbeanAppOptions): UbeanApp;
```

Key `UbeanAppOptions` fields:

| Option                                                  | Meaning                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `rootDir`                                               | Project root, used to resolve `publicDir` and SEO conventions                                           |
| `routes` / `middleware` / `pages` / `layouts` / `crons` | Scanned inputs forwarded to `registerRoutes`                                                            |
| `routeRules`                                            | Declarative per-path rules (cache / redirect / rewrite / proxy / headers / ssr / isr / prerender / ppr) |
| `plugins`                                               | `UbeanAppPlugin[]` — `setup(app)` before registration, `ready(app)` after                               |
| `routeLoaders` / `middlewareLoaders` / `pageLoaders`    | Lazy loaders used during registration                                                                   |
| `pageRenderer`                                          | SSR renderer from `@ubean/client/ssr`; `null` disables page rendering                                   |
| `ssrExclude` / `streaming` / `botFallback`              | Rendering policy; crawlers are downgraded to buffered rendering when streaming (default `true`)         |
| `publicDir`                                             | Static file root — served before route handlers, **Node runtimes only**                                 |
| `healthEndpoint`                                        | Registers `/_health` (step ⑬ of the chain)                                                              |
| `openAPI`                                               | `boolean                                                                                                | { title, version, description, scalarPath, openAPIPath }` |
| `i18nConfig`                                            | `{ enabled, strategy, defaultLocale, locales, detectBrowserLanguage, fallbackLocale, baseUrl }`         |
| `notFoundPage`                                          | Scanned `pages/404` page registered as the Hono fallback handler                                        |
| `csrf` / `securityHeaders` / `dataCache`                | On by default; `false` disables each                                                                    |
| `cacheStore` / `cache`                                  | Cache backend — in-process memory by default, `{ store: 'fs', dir }` for a Node fs backend              |
| `seoConventions` / `seoConventionModules`               | File-convention SEO discovery (disk scan, or preloaded modules for serverless)                          |
| `colorModeScript` / `ipxHandler`                        | Prerendered no-FOUC script; production `/_ipx` image handler                                            |

## `UbeanApp`

```ts
class UbeanApp {
  readonly hono: Hono<UbeanEnv>;
  readonly hooks: Hookable<UbeanRuntimeHooks>;
  readonly plugins: UbeanAppPlugin[];
  readonly options: UbeanAppOptions;
  init(): Promise<this>;
}
```

`init()` is idempotent. It fires `app:created`, runs each plugin's `setup`, fires `app:before:register`, conditionally registers `serveStatic` **before** route handlers (only when `publicDir` is set and the runtime is Node — the `node:fs` import happens inside that branch so workerd never sees it), then registers routes/middleware/pages and finally the fallback.

The middleware chain is a **13-step contract**, in this order: ① `handle` ② requestId ③ actionContext ④ securityHeaders ⑤ csrf ⑥ dataCache ⑦ cacheStore ⑧ i18n ⑨ routeRules ⑩ routeCache ⑪ websocket ⑫ lifecycle ⑬ healthEndpoint. A step disabled by config is absent from the sequence rather than a no-op, and each middleware records its step name into a request-level record so the order can be asserted in tests.

Runtime hooks available on `app.hooks`: `app:created`, `app:before:register`, `app:after:register`, `request:start`, `request:end`, `request:error`, `route:register`, `middleware:register`, `error`.

## `defineServer`

```ts
interface DefineServerOptions {
  plugins?: UbeanAppPlugin[];
  hooks?: ServerHooks; // Partial<UbeanRuntimeHooks>
  globalHooks?: GlobalHooks; // handle / handleFetch / handleError
  onAppCreate?: (app: UbeanApp) => void | Promise<void>;
  onServerReady?: (app: UbeanApp) => void | Promise<void>;
}
```

`defineServer(options)` normalizes to a `ResolvedServerConfig`. `mergeServerConfigs(base, ...configs)` merges several of them — shared config plus a mode-specific one (`server.dev.ts` / `server.prod.ts`), with mode-specific values winning field by field. `createDefaultServerConfig()` is the fallback used when no `src/server.ts` exists. `applyServerConfig(app, config)` pushes plugins, registers hooks, calls `setGlobalHooks`, and awaits `onAppCreate`; **it deliberately does not call `onServerReady`** — the caller runs that after `init()`.

## Global Hooks

SvelteKit-style global hooks, registered through `defineServer({ globalHooks })`:

```ts
import { defineServer } from '@ubean/app';

export default defineServer({
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const response = await resolve(event);
      response.headers.set('X-Frame-Options', 'DENY');
      return response;
    },
    handleFetch: async ({ request, fetch }) => {
      request.headers.set('X-Internal-Auth', process.env.INTERNAL_TOKEN!);
      return fetch(request);
    },
    handleError: async ({ event, error, status, message }) => {
      console.error(`[${status}] ${message}`, event.request.url);
    }
  }
});
```

| Hook          | Scope                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`      | Wraps **every** request — all middleware, routes, static assets, 404s and error responses. It must call `resolve(event)` (or return its own `Response` to short-circuit). Registered first in the chain, so nothing escapes it. |
| `handleFetch` | Intercepts server-side `fetch()` calls, including `internalFetch` / `createInternalAdapter`. Modify the request (headers, URL, auth) then call `fetch(request)`.                                                                |
| `handleError` | Side-effect-only entry for uncaught errors (logging, reporting). It cannot change the response.                                                                                                                                 |

`HandleEvent` is `{ request: Request; context: Context<UbeanEnv>; clientAddress: string; requestId: string }`. Helpers: `createHandleEvent(c)` builds one, `wrapResolve(c, next)` adapts Hono's `next()` into the `resolve(event)` signature, and `extractErrorMessage(error, status)` produces a sanitized message (404 → `"Not Found"`, 5xx → `"Internal Server Error"`, 4xx → `error.message`).

The three `apply*` functions are the internal call sites (`applyHandleHook` as the outermost middleware, `applyHandleFetchHook` inside the internal fetcher, `applyHandleErrorHook` from `onError`). With no `handle` hook registered, `applyHandleHook` returns `false` and the request proceeds normally — zero cost.

## Pages and Rendering

- `pageRenderer` is a `@ubean/pages` `PageRenderer`; the type is aliased rather than imported by value so projects without the optional peer still type-check.
- `PageAssetTags` (`head` / `bodyAttrs` / `htmlAttrs` / `favicon`) lets the build inject per-page asset tags into the rendered HTML.
- `streaming: true` streams the shell and the app HTML; `botFallback` (default `true`) detects crawlers and switches them back to buffered rendering so dynamic `<head>` metadata is present in the initial response.
- `ssrExclude` takes glob patterns; matching pages skip SSR and get the CSR shell.
- `notFoundPage` is the `pages/404` scan result, registered as the Hono catch-all so unmatched browser navigations render the app's 404 component.

## Type Safety

- `UbeanAppOptions` is the single typed surface for app construction; `PageRenderer` / `PageAssetTags` / `UbeanAppPlugin` / `UbeanRuntimeHooks` are exported alongside it.
- The package re-exports the shared types it operates on — `RouteRule`, `RouteMeta`, `UbeanEnv`, `UbeanMiddleware`, `UbeanMiddlewareStep`, `ComposedHandler` (`@ubean/shared`), `ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` / `ScannedLayout` (`@ubean/scan`), `RouteRegistrar` / `RegisterOptions` (`@ubean/routes`) — so a `src/server.ts` usually needs no other type imports.
- `ResolvedServerConfig` is the normalized form `applyServerConfig` consumes, letting applications build config programmatically without going through `defineServer`.

## Architecture Notes

- **`createUbeanApp` is the Hono factory; the Vue factory is `createUbeanClientApp` from `@ubean/client`.** They are named differently on purpose — do not expect a `createUbeanApp` that returns a Vue app.
- **Config before `init()`.** `applyServerConfig` exists as a separate step precisely so plugins, hooks and `onAppCreate` land before route registration; calling it after `init()` silently loses all of them.
- **The semantic-subpath habit is enforced here too.** `@ubean/app` itself imports `@ubean/server/cache`, `/middleware`, `/realtime` and `/security` rather than the barrel, with a comment noting that the barrel would pull ~30 modules into type resolution for this package alone. Follow the same rule in application server code.
- **Runtime-gated Node imports.** `serveStatic` and the fs cache store are loaded by dynamic `import()` inside `isNodeRuntime()` branches. A static import would leave `node:fs` in a workerd bundle and fail at module instantiation, before any runtime check could run.
- **Middleware order is a testable contract**, not an artifact — the step names are recorded per request so regressions in the 13-step chain fail loudly.
