# @ubean/shared

**English | [中文](./README.zh-CN.md)**

Shared protocol types, errors, environment handling and universal utilities for ubean.

`@ubean/shared` is the foundation leaf of the monorepo: every other `@ubean/*` package may depend on it, and it depends on **no** `@ubean/*` package. Its main entry stays browser-safe — Node-only helpers live behind the `/node` subpath, and the tslog-based logger behind `/logger`.

```ts
import { defineEnv, createError, matchGlob } from '@ubean/shared';
import { logger } from '@ubean/shared/logger';
import { findAvailablePort } from '@ubean/shared/node';
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Errors](#errors)
- [Route Rules & Shared Types](#route-rules--shared-types)
- [Server Actions Shared Types](#server-actions-shared-types)
- [Glob Matching](#glob-matching)
- [Path & String Utilities](#path--string-utilities)
- [Logging](#logging)
- [Node Utilities](#node-utilities)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| What this package is responsible for                                                                                                                                                                                                                                                                             | What it is not — owner instead                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Protocol **types** shared across packages: `PageHead`, `RouteMeta` / `BaseRouteMeta` / `RateLimitMeta` / `CacheMeta`, `RouteRule` / `IsrRule`, `Span*`, `UbeanEnv` / `UbeanContext` / `UbeanHandler` / `UbeanMiddleware` / `UbeanVariables` / `UbeanBindings` / `UbeanMiddlewareStep`, `GenericSchema` / `Input` | Page data protocol at runtime → `@ubean/pages`; handler runtime → `@ubean/routes`; SEO metadata construction → `@ubean/seo` |
| Dependency-free universal **utilities**: `normalizePath`, `getDirname`, `getBasename`, `getExtension`, `getStem`, `pathToTitle`, `capitalize`, `matchGlob`, `matchAnyGlob`                                                                                                                                       | Route scanning → `@ubean/scan`; prerender link discovery → `@ubean/builder`                                                 |
| **Error primitives**: `UbeanError`, `createError`, `isUbeanError`, `errorToResponse`                                                                                                                                                                                                                             | Hono `onError` wiring and the `handleError` hook → `@ubean/app`                                                             |
| **Environment** helpers: `defineEnv`, `setRuntimeEnv`, `useRuntimeEnv`, `isNodeRuntime` + the `EnvSchema` / `InferEnvOutput` / `EnvValidationError` types                                                                                                                                                        | `ubean.config.ts` loading and module resolution → `@ubean/config`                                                           |
| **Logging** facade (`/logger`, `/logger/hono`): `createUbeanLogger` / `logger` / `getLogger` / `setMinLevel` / `setDebugLogging` and the Hono request-logger middleware, wrapping tslog@5                                                                                                                        | Server-side request lifecycle, cache, and tracing → `@ubean/server`; DevTools log UI → `@ubean/devtools`                    |
| **Node-only** helpers (`/node`): port probing (`findAvailablePort`, `waitForPort`, `isPortReachable`, `sleep`), LAN address detection (`getLanAddresses`, `isLoopbackHost`, `isWildcardHost`), Vite config lookup (`findUserViteConfig`)                                                                         | Process lifecycle, dev server bootstrap and CLI output → `@ubean/cli` / `@ubean/builder`                                    |

**Runtime dependency whitelist (main entry): `@standard-schema/spec`, `hono` (type-only), `pathe`, `scule`** — no `tslog`, no `node:*`. The `/logger` subpath exists precisely so that tslog never enters the browser-safe main barrel; `/node` exists for the same reason with `node:net` / `node:os` / `node:fs`.

`@ubean/shared` declares **no peer dependencies** — nothing degrades when a peer is absent, because there is none.

## Install

```bash
pnpm add @ubean/shared
```

Transitively installed by every other `@ubean/*` package; add it directly when you only need the shared types or utilities.

## Quick Start

```ts
import { UbeanError, createError, errorToResponse, defineEnv, isNodeRuntime, matchGlob } from '@ubean/shared';

// Typed error with a status code
throw createError({ statusCode: 404, statusMessage: 'Not Found' });

// Turn it into a JSON Response (works for unknown errors too)
try {
  await handler();
} catch (err) {
  return errorToResponse(err);
}

// '**' matches any depth, '*' matches a single segment
matchGlob('/blog/a/b', '/blog/**'); // true
isNodeRuntime(); // false on Cloudflare Workers
```

## Environment Variables

`defineEnv(config)` validates a constructor-based schema and returns `{ env, validate }`. `server` keys are never exposed to the client; `public` keys are exposed via `import.meta.env`.

```ts
import { defineEnv } from '@ubean/shared';

export const { env, validate } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true },
    PORT: { type: Number, default: 9527 }
  },
  public: {
    APP_NAME: { type: String, default: 'ubean-app' }
  },
  mode: 'warn' // 'warn' logs; 'throw' rethrows on validation failure
});

env.PORT; // number
validate(); // { success, errors, data }
```

| API                                              | Description                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `defineEnv(config)`                              | Validate a schema and return `{ env, validate }` (`DefineEnvResult<S>`)               |
| `setRuntimeEnv(env)` / `useRuntimeEnv(key, def)` | Merge / read runtime environment values (worker bindings, injected secrets)           |
| `isNodeRuntime()`                                | True on Node / Bun / Deno (checked via `process.versions.node`, not `typeof process`) |
| `EnvSchema` / `InferEnvOutput<S>`                | Schema map type and its inferred output type                                          |
| `EnvValidationError`                             | `{ key, message, value }` for each failed entry                                       |

`isNodeRuntime()` exists to gate Node-only capabilities behind a **dynamic** `import()`: bundlers keep statically imported `node:*` modules in the artifact, and workerd fails at module instantiation (`No such module "node:fs/promises"`) before any branch is evaluated.

## Errors

```ts
import { UbeanError, createError, isUbeanError, errorToResponse } from '@ubean/shared';

try {
  throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { field: 'email' } });
} catch (err) {
  if (isUbeanError(err)) {
    err.statusCode; // 400
  }
  return errorToResponse(err); // JSON: { error, statusCode, data }
}
```

- `UbeanError extends Error` carries `statusCode` / `statusMessage` / `data`; the default message comes from a status-code table (400/401/403/404/405/408/409/422/429/500/501/502/503), falling back to `'Error'`.
- `isUbeanError(err)` accepts both real instances and errors crossing a module boundary (checks `err.name === 'UbeanError'` plus a numeric `statusCode`).
- `errorToResponse(err)` renders a `UbeanError` with its own status code; any other error becomes `500` with `{ error: 'Internal Server Error', message }`.

## Route Rules & Shared Types

These types are the shared vocabulary of the routing, caching, and prerender layers. They live here to break cycles — `@ubean/routes` and `@ubean/config` both need them, and neither may depend on the other.

| Type                                                                                                | Shape / meaning                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BaseRouteMeta`                                                                                     | `{ requiresAuth?: boolean; [key: string]: unknown }`                                                                     |
| `RateLimitMeta` / `CacheMeta`                                                                       | `{ maxRequests, windowSeconds }` / `{ ttl, swr? }`                                                                       |
| `RouteMeta extends BaseRouteMeta`                                                                   | Adds `rateLimit` and `cache`                                                                                             |
| `IsrRule`                                                                                           | `{ ttl: number; swr?: boolean }` — the object form of a `routeRules.isr` entry                                           |
| `RouteRule`                                                                                         | Per-route `redirect` / `rewrite` / `proxy` / `headers` / `cache` / `ssr` / `prerender` / `isr` / `ppr`                   |
| `PageHead`                                                                                          | Head metadata consumed by `@ubean/pages` and `@ubean/seo`                                                                |
| `Span`, `SpanOptions`, `SpanContext`, `SpanAttributes`, `SpanEvent`, `SpanEndOptions`, `SpanStatus` | Tracing primitives consumed by `@ubean/server` observability                                                             |
| `UbeanVariables` / `UbeanBindings` / `UbeanEnv`                                                     | Hono context variables, platform bindings, and the composed `UbeanEnv`                                                   |
| `UbeanContext` / `UbeanHandler` / `UbeanMiddleware` / `ComposedHandler` / `Input` / `GenericSchema` | Handler- and middleware-level types for `@ubean/routes`                                                                  |
| `UbeanMiddlewareStep`                                                                               | Union of middleware step names (`handle`, `requestId`, `securityHeaders`, `csrf`, `cacheStore`, `i18n`, `routeRules`, …) |

## Server Actions Shared Types

Server Actions are defined in `@ubean/routes`, but their wire types are shared so that the client runtime can consume them without importing server code.

```ts
import { ACTION_BRAND, ActionError, fail, isServerAction, isActionFailure } from '@ubean/shared';

fail(400, { email: 'Invalid email' }); // { status: 400, errors: { email: '…' } }
```

| API                                                | Description                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `ACTION_BRAND`                                     | Well-known symbol (`Symbol.for('ubean.action')`) marking a `ServerAction` |
| `ServerAction<TInput, TOutput>`                    | Action descriptor; `ActionHandler` is its implementation signature        |
| `ActionContext` / `ActionResult<T>`                | Handler context and success envelope                                      |
| `ActionFailure<T>`                                 | `{ status, errors }` field-level failure envelope                         |
| `fail(status, errors)`                             | Build an `ActionFailure`                                                  |
| `ActionError`                                      | User-readable error class with `code` / `status`, thrown from a handler   |
| `isServerAction(value)` / `isActionFailure(value)` | Type guards                                                               |
| `ActionSchema<TOutput>`                            | Standard-Schema / `safeParse` input contract                              |

## Glob Matching

```ts
import { matchGlob, matchAnyGlob } from '@ubean/shared';

matchGlob('/blog', '/blog/**'); // true  ('**' also matches the bare prefix)
matchGlob('/blog/a', '/blog/*'); // true  ('*' is a single segment)
matchGlob('/blog/a/b', '/blog/*'); // false
matchAnyGlob('/admin/x', ['/blog/**', '/admin/**']); // true
```

`matchGlob(route, pattern)` supports `**` (recursive), `*` (single segment), and literals; `pattern === '**'` or `'/**'` matches everything. It is the matcher behind SSR `exclude`, prerender `include`/`exclude`, and route-rule patterns.

## Path & String Utilities

```ts
import { normalizePath, getDirname, getBasename, getExtension, getStem, pathToTitle, capitalize } from '@ubean/shared';

normalizePath('//a\\b/c/'); // '/a/b/c'
getExtension('Post.MD'); // 'md'
getStem('Post.md'); // 'Post'
pathToTitle('blog/getting-started.md'); // 'Getting Started'
pathToTitle('blog/index.md'); // 'Blog'  (index resolves to the parent directory name)
```

`pathToTitle` delegates to `scule`'s `kebabCase` plus `capitalize` — the title-case rule used by `@ubean/content` when a document has no explicit `title`.

## Logging

`/logger` is the only public logging entry. It is a **separate subpath on purpose**: re-exporting it from the main entry would pull tslog into the browser-safe barrel.

```ts
import { logger, getLogger, createUbeanLogger, setMinLevel, setDebugLogging } from '@ubean/shared/logger';

logger.info('booted');
const http = getLogger('http'); // child logger named `ubean:http`

setMinLevel('debug'); // global level switch (affects existing and future instances)
```

| API                                                   | Description                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `logger`                                              | Default global tslog instance named `ubean`                                                                                    |
| `createUbeanLogger(options)`                          | Create a named instance; `options` are tslog v5 settings (`type` / `pretty` / `json` / `mask` / `stack` / `meta` / `minLevel`) |
| `getLogger(scope?, options?)`                         | Scope child logger; inherits settings and `minLevel` from the parent; no scope → global `logger`                               |
| `setMinLevel(level)`                                  | Global level: `silly` / `trace` / `debug` / `info` / `warn` / `error` / `fatal`                                                |
| `setDebugLogging(enabled)`                            | Convenience toggle for the debug level                                                                                         |
| `UbeanLogger` / `UbeanLoggerOptions` / `LogLevelName` | Logger instance type, settings, and level name union                                                                           |

The Hono request logger lives behind `/logger/hono`, again to keep Hono middleware out of the shared barrel:

```ts
import { createRequestLoggerMiddleware } from '@ubean/shared/logger/hono';

app.use('*', createRequestLoggerMiddleware({ slowThreshold: 1000, exclude: ['/_health', '/api/**'] }));
```

`RequestLoggerOptions`: `logger` (default `getLogger('http')`), `exclude` (glob strings, `RegExp`, or a `(path) => boolean` predicate), `slowThreshold` (ms, default `1000`), `logQuery` (log the full URL including the query string, default `false`). Errors captured by Hono's `onError` are detected through `c.error` and logged with their status.

## Node Utilities

`/node` bundles everything that imports `node:net`, `node:os`, or `node:fs`. It never enters the main entry.

```ts
import { findAvailablePort, waitForPort, isPortReachable, sleep } from '@ubean/shared/node';
import { getLanAddresses, isLoopbackHost, isWildcardHost } from '@ubean/shared/node';
import { findUserViteConfig } from '@ubean/shared/node';

const port = await findAvailablePort(3000, { strictPort: false }); // walks 3001, 3002… like Vite
await waitForPort(port, { timeout: 5000 });
getLanAddresses(); // ['192.168.1.20', …] — IPv4 only, interface-name sorted
findUserViteConfig(process.cwd()); // '/…/vite.config.ts' | null
```

| Group             | API                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port probing      | `findAvailablePort(port, options)`, `waitForPort(port, options)`, `isPortReachable(port, host)`, `sleep(ms)`; options types `FindPortOptions`, `WaitForPortOptions` |
| Network addresses | `isLoopbackHost(host)`, `isWildcardHost(host)`, `getLanAddresses()`                                                                                                 |
| Vite config       | `findUserViteConfig(cwd)` — scans `vite.config.ts` / `.mts` / `.js` / `.mjs`, returns the first hit or `null`                                                       |

## Type Safety

- The package is written in strict TypeScript and ships `dist/*.d.ts` for every subpath; `EnvSchema` + `InferEnvOutput<S>` make `defineEnv({...}).env` fully inferred — `PORT` is `number`, not `string`.
- `GenericSchema<O = unknown>` accepts Standard Schema objects; `validate()` is the async/sync-agnostic entry point, while only schemas with a sync `safeParse` work as direct schema entries.
- Error narrowing is type-safe through `isUbeanError` and `isActionFailure`, so `statusCode` / `errors` are only reachable after the guard.
- No global `declare module` augmentation is performed — the types are plain exports.

## Architecture Notes

- **Dependency direction.** `@ubean/shared` is the root leaf: it imports **no** `@ubean/*` package. Everything else may import it. Types that previously caused cycles (`BaseRouteMeta` from `@ubean/routing`, `Span*` from `@ubean/server`, `PageHead` from `@ubean/pages`) were deliberately pushed down here rather than duplicated.
- **Subpath split is a browser-safety boundary, not a convenience.** `tslog` lives behind `/logger`; `node:net` / `node:os` / `node:fs` behind `/node`; Hono middleware behind `/logger/hono`. The main barrel (`src/index.ts`) only re-exports `types` / `error` / `env` / `path` / `glob` / `string`, so client bundles never pick up a logger or a Node built-in.
- **No `globalThis` registry of its own.** The data and cache registries of sibling packages need cross-instance sharing, but `@ubean/shared` itself holds only `_runtimeEnv` — a module-level merge target set explicitly by `setRuntimeEnv`, which is also available through the app runtime.
- **No side effects on import.** Every module is a pure collection of exports; importing `@ubean/shared` installs nothing globally and binds no listeners.
