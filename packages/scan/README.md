# @ubean/scan

**English | [中文](./README.zh-CN.md)**

Project scanner & route metadata for ubean: server-side directory scanning (API routes, middleware, plugins, crons, queues, locales, entries) plus page-scan aggregation.

`@ubean/scan` walks `src/` once and returns a normalized descriptor of everything route-shaped, so the Vite plugin, the router, and the CLI all read the same data instead of each reimplementing globbing.

```ts
import { scanProject } from '@ubean/scan';

const result = await scanProject({ cwd: process.cwd(), srcDir: 'src' });

result.apiRoutes; // ScannedApiRoute[] — route, http methods, matchers, meta
result.middlewares; // ScannedMiddleware[]
result.pages; // ScannedPage[]
result.layouts; // ScannedLayout[]
result.defaultLocale; // string | undefined
result.appEntry; // { shared, server, client, root? }
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Scanning a Project](#scanning-a-project)
- [Server-Side Scanning](#server-side-scanning)
- [Page Scanning (Owned by @ubean/vue)](#page-scanning-owned-by-ubeanvue)
- [Route Metadata Extraction](#route-metadata-extraction)
- [Route Path Helpers and Matchers](#route-path-helpers-and-matchers)
- [Route File Generation](#route-file-generation)
- [Subpath Exports](#subpath-exports)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| This package owns                                                                                           | Owned elsewhere                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Server-side directory scanning: API routes, middleware, plugins, crons, queues, locales, app/server entries | **Page scanning — `@ubean/vue`** (the page-route owner; `scanPages` lives in `@ubean/vue/vite`) |
| Aggregation of page scan output into `ScanResult`                                                           | Page-route semantics themselves — `@ubean/vue`                                                  |
| `detectHttpExports` / `detectHttpExportsFromCode` (void-style named exports → HTTP methods)                 | Request handling for those routes — `@ubean/routes`                                             |
| `generateApiRouteId` and `defineHandlerMeta` extraction (server-side route meta)                            | `definePage` extraction, which is a re-export — `@ubean/vue/vite`                               |
| The `matchers` registry entry point for server consumers                                                    | The registry implementation — `@ubean/vue` (`matchers.ts`)                                      |

**Runtime dependency whitelist (main entry): `@ubean/shared`, `@ubean/vue`, `pathe`, `tinyglobby`.** No `@ubean/build`, no `@ubean/config`, no `hono` — scanning runs at build time, and `@ubean/scan` does not depend on Vue itself (it depends on `@ubean/vue`, whose scanning module is Vue-agnostic).

Optional peer — `vue-router` (`^4.0.0`, `peerDependenciesMeta.optional`). It types `RouteLocation` / `RouteLocationRaw` re-exported from the page-scanning side; a pure server consumer that never touches page routes can omit it.

## Install

```bash
pnpm add -D @ubean/scan
# optional peer, only when you consume page-route types:
pnpm add vue-router
```

## Quick Start

```ts
import { scanProject, detectHttpExports } from '@ubean/scan';

const { apiRoutes, middlewares, defaultLocale } = await scanProject({
  cwd: process.cwd(),
  srcDir: 'src',
  dirs: { routes: ['routes', 'api'], locales: 'locales' },
  ignore: ['**/*.test.*']
});

for (const route of apiRoutes) {
  route.route; // '/api/users/:id'
  route.exports; // ['GET', 'POST']
  route.method; // 'GET' | … (undefined → registered for every method)
  route.hasMeta; // boolean
  route.matchers; // { id: 'numeric' } from [id=numeric].ts
}

await detectHttpExports('/abs/path/src/routes/users.ts');
// { exports: ['GET'], httpMethods: ['get'], hasMeta: false }
```

## Scanning a Project

```ts
import { scanProject } from '@ubean/scan';
import type { ScanOptions, ScanResult } from '@ubean/scan';
```

| `ScanOptions` field | Default                                                                                                                                                        | Notes                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `cwd`               | required                                                                                                                                                       | Project root; `srcDir` is resolved against it                                       |
| `srcDir`            | required                                                                                                                                                       | Absolute or relative                                                                |
| `dirs`              | `{ routes: 'routes', middleware: 'middleware', pages: 'pages', layouts: 'layouts', plugins: 'plugins', crons: 'crons', queues: 'queues', locales: 'locales' }` | Each entry accepts `string \| string[]`                                             |
| `ignore`            | `['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts']`                                                                                                         | Underscore-prefixed files/dirs are private by convention                            |
| `markdown`          | `true` in framework mode (`.md` + `.mdx`)                                                                                                                      | `'md'` / `'mdx'` to narrow; the lean `@ubean/vue/vite` kernel defaults this **off** |
| `head`              | `true` in framework mode                                                                                                                                       | Enables the `pageObj.head` chain; the lean kernel defaults it **off**               |

All nine directory scans plus entry detection run concurrently (`Promise.all`): `apiRoutes`, `middlewares`, `pages`, `layouts`, `plugins`, `crons`, `queues`, `locales`, `appEntry`, `serverEntry`.

Numeric-prefix ordering (`/^(\d+)\.(.+)$/`) applies to **middleware** and **plugins** — `01.auth.ts` sorts before `02.i18n.ts` and reports that integer as `order`. Note that middleware **mount order is not path-sorted**; `sortApiRoutesForRegistration` / `apiPathSpecificity` in `@ubean/routes` own route registration order.

`ScanResult` is a single flat object:

| Field           | Type                                | Notes                                                              |
| --------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `apiRoutes`     | `ScannedApiRoute[]`                 | `route`, `method?`, `exports`, `hasMeta`, `fileMeta?`, `matchers?` |
| `middlewares`   | `ScannedMiddleware[]`               | `order`, `global`                                                  |
| `pages`         | `ScannedPage[]` (from `@ubean/vue`) | Page scanning result                                               |
| `layouts`       | `ScannedLayout[]`                   | —                                                                  |
| `plugins`       | `ScannedPlugin[]`                   | `order`                                                            |
| `crons`         | `ScannedCronTask[]`                 | `name`                                                             |
| `queues`        | `ScannedQueue[]`                    | `name`                                                             |
| `locales`       | `ScannedLocale[]`                   | `code`, `namespace?`, `isDefault?`, `name?`, `dir?`                |
| `defaultLocale` | `string \| undefined`               | First locale with `isDefault`                                      |
| `appEntry`      | `ScannedAppEntry`                   | `{ shared, server, client, root? }`                                |
| `serverEntry`   | `ScannedServerEntry`                | `{ shared, dev, prod }`                                            |
| `notFoundPage`  | `ScannedPage \| undefined`          | `pages/404.vue` (or `.ts`/`.md`)                                   |
| `loadingPage`   | `ScannedPage \| undefined`          | `pages/loading.vue`                                                |
| `errorPage`     | `ScannedPage \| undefined`          | `pages/error.vue`                                                  |

`appEntry.root` prefers lowercase `src/app.vue` over `src/App.vue` and only accepts `.vue` — the `.ts` names are taken by the `defineApp` config entries (`app.ts` / `app.server.ts` / `app.client.ts`).

## Server-Side Scanning

API routes use void-style named exports — one file may export several methods:

```ts
// src/routes/api/users.ts
export const GET = defineHandler(c => c.json([]));
export const POST = defineHandler(c => c.json({ ok: true }, 201));
```

```ts
import { detectHttpExports, detectHttpExportsFromCode, generateApiRouteId, HTTP_METHODS } from '@ubean/scan';

HTTP_METHODS; // ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] — no TRACE

const fromCode = detectHttpExportsFromCode(
  `export const GET = defineHandler(h); export const POST = defineHandler(h);`
);
// { exports: ['GET', 'POST'], httpMethods: ['get', 'post'], hasMeta: false }

generateApiRouteId('GET', '/api/users/:id'); // 'get' + generateRouteName('/api/users/:id')
```

`detectHttpExports(filePath)` is the async file-reading counterpart. Both return `DetectExportsResult` (`exports`, `httpMethods` as lowercase, `hasMeta`, `fileMeta?`). Detection reads `export` declarations, `export { … }` lists, `defineHandlerMeta(` calls, and `export const meta = { … }` blocks (from which `requiresAuth` is picked up).

A file that exports **no** HTTP method is registered for **every** method (`route.method` stays `undefined`), which keeps plain handler modules working. Matchers parsed from the filename land in `route.matchers` — `routes/api/users/[id=numeric].ts` becomes `{ id: 'numeric' }`; the runtime router validates them and treats a rejection as "no match" so Hono falls through to the next candidate.

## Page Scanning (Owned by @ubean/vue)

`@ubean/scan` does **not** scan pages. `scanProject` forwards `{ cwd, srcDir, pagesDir, layoutsDir, ignore, markdown, head }` to `scanPages` from `@ubean/vue/vite` and re-exports the result types.

```ts
// Still supported for compatibility, but this is a re-export:
import type { ScannedPage, ScannedLayout, ScanPagesOptions, ScanPagesResult } from '@ubean/scan';
// Preferred for page routes — the owner's own subpath:
import { scanPages } from '@ubean/vue/vite';
```

The `dir` defaults differ on purpose: `@ubean/vue/vite` is the lean kernel and leaves `markdown` and `head` **off**; `@ubean/scan` runs in framework mode and defaults both **on**, because SSR needs the `pageObj.head` chain.

## Route Metadata Extraction

```ts
import {
  extractDefinePage,
  extractDefinePageFromCode,
  extractDefineMeta,
  extractDefineMetaFromCode
} from '@ubean/scan';

await extractDefineMeta('/abs/path/src/routes/users.ts');
// { meta?: Record<string, unknown>, requiresAuth?: boolean } | null

const meta = extractDefineMetaFromCode(`export const meta = { requiresAuth: true };`);
// { meta: { requiresAuth: true }, requiresAuth: true }
```

The split is ownership, not naming: `extractDefinePage*` parse the **client-side** `definePage({ … })` macro and are re-exports from `@ubean/vue/vite`; `extractDefineMeta*` parse the **server-side** `defineHandlerMeta({ … })` and live in this package. Both parse by extracting the call's object literal (via `extractCallObject`), never by executing the module.

## Route Path Helpers and Matchers

Pure path helpers, re-exported so existing consumers keep their import paths:

```ts
import {
  filePathToRoute,
  stripRouteGroups,
  parseMatchers,
  extractSlotFromPath,
  generateRouteName,
  generateLayoutName,
  defineMatcher,
  getMatcher,
  hasMatcher,
  listMatcherNames,
  clearMatchers,
  validateParams,
  createMatcherGuard
} from '@ubean/scan';

filePathToRoute('pages/(admin)/users/[id].vue'); // '/(admin)/users/:id' → groups stripped downstream
stripRouteGroups('/(admin)/users/:id'); // '/users/:id'
parseMatchers('users/[id=numeric]'); // { id: 'numeric' }
extractSlotFromPath('pages/@dialog/photo.vue'); // 'dialog'
generateRouteName('/users/:id'); // 'UsersId'
```

Ownership: `filePathToRoute` / `stripRouteGroups` / `parseMatchers` / `extractSlotFromPath` / `generateRouteName` / `generateLayoutName` come from `@ubean/vue/vite`; the matcher registry (`defineMatcher` / `getMatcher` / `hasMatcher` / `listMatcherNames` / `clearMatchers` / `validateParams` / `createMatcherGuard`) comes from `@ubean/vue`. `@ubean/scan` only aggregates them. The matcher registry is deliberately stored on `globalThis` so the server (`src/server.ts`) and the client (`src/app.ts`) share one instance even when the dev SSR graph inlines `ubean` while externalising `@ubean/vue`.

## Route File Generation

```ts
// Backwards-compatible alias with identical exports:
import { RouteFileGenerator, generateRouteFiles, DEFAULT_HEADER_COMMENT } from '@ubean/scan/generator';
// Preferred: the owner's subpath
import { RouteFileGenerator, generateRouteFiles, DEFAULT_HEADER_COMMENT } from '@ubean/vue/generator';
```

`@ubean/scan/generator` is a straight re-export of `@ubean/vue/generator`; new code should import the owner's subpath directly. `GeneratorOptions` / `GeneratorResult` / `GeneratorScanInput` type the invocation, and `DEFAULT_HEADER_COMMENT` marks generated files.

## Subpath Exports

| Subpath                 | Re-exports                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@ubean/scan`           | Everything below, aggregated                                                                                                         |
| `@ubean/scan/types`     | `ScanOptions` / `ScanResult` / `Scanned*` / `HttpMethod` / `HTTP_METHODS` / the three `GLOB_*` patterns, plus re-exported page types |
| `@ubean/scan/generator` | `RouteFileGenerator`, `generateRouteFiles`, `DEFAULT_HEADER_COMMENT` (from `@ubean/vue/generator`)                                   |

The `GLOB_*` constants name the file sets each scan matches: `GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}'`, `GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}'`, `GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}'`.

## Type Safety

- `HTTP_METHODS` is `as const`, so `HttpMethod` is the literal union `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'` — and `ScannedApiRoute.method` also accepts `Lowercase<HttpMethod>` to match the runtime router.
- Every `Scanned*` interface extends `ScannedFile` (`fullPath`, `relativePath`, `dirname`, `basename`), so a scan result carries enough information to read, re-write, or compare the file.
- `ScannedApiRoute.fileMeta` is typed as `RouteMeta` from `@ubean/shared` — scanning and routing agree on the metadata shape instead of each declaring its own.
- `PageMeta` / `PageHead` / `ScannedPage` / `ScannedLayout` / `ScanPagesOptions` / `ScanPagesResult` are re-exported from `@ubean/vue`; `ScannedPageRoute` is kept as a backwards-compatible alias of `ScannedPage` so the eventual removal is a deprecation, not a break.
- `DefineMetaResult` (`{ meta?, requiresAuth? }`) and `DetectExportsResult` describe extraction output.
- `vue-router` stays an **optional** peer: the page-route types re-exported here only need it when you actually consume them.

## Architecture Notes

- **One scan, many consumers.** `scanProject` runs its nine scans concurrently and returns a flat `ScanResult`; the Vite plugin, the router, and the CLI read that object instead of globbing independently, which is what keeps virtual and file routing modes consistent.
- **Page scanning has exactly one owner.** `@ubean/vue` owns page routes and their scanner (`@ubean/vue/vite`); `@ubean/scan` aggregates. The re-exports exist purely so the many existing consumers (`packages/vite`, `api-routes`, `builder`, `cli`) do not have to change import paths during the move.
- **Extraction is static.** `extractDefinePage*` / `extractDefineMeta*` parse source text and call arguments; they never import the module under scan, so a route file with top-level side effects is safe to scan.
- **Convention over configuration.** `_`-prefixed files/dirs are private (`**/_*` in the default ignore list), numeric prefixes order middleware/plugins, and `@slotName/` directories mark parallel-route slots. Intercepted routes (`(.)` / `(..)` / `(...)`) are deliberately **not** implemented — the scanner throws on those marker segments rather than silently degrading them into literal paths.
- **Build-time only.** Server-only, Node-only; never import from client code (see AGENTS.md pitfall #23 on worker targets).
