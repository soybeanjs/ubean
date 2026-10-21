# @ubean/build

**English | [中文](./README.zh-CN.md)**

Vite plugins, production build orchestration, SSG prerender, type codegen, and the Server Actions plugin for ubean.

```ts
// vite.config.ts — the single registration point of the whole toolchain
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Vite Plugin](#vite-plugin)
- [Vue Plugin](#vue-plugin)
- [Virtual Modules](#virtual-modules)
- [Macros](#macros)
- [Dev Server Bootstrap](#dev-server-bootstrap)
- [Preview](#preview)
- [Server Actions](#server-actions)
- [Production Build](#production-build)
- [Prerender](#prerender)
- [Static Render Path](#static-render-path)
- [Codegen](#codegen)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/build` is the **build-time package** of ubean: everything that runs inside Vite, plus the
production-build and SSG pipeline that Vite drives.

| Responsible for                                                                                                                 | NOT responsible for                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| The core Vite plugin (`ubeanPlugin` in `./vite`): environments, dev request routing, build orchestration, preview takeover      | The **composed** `ubeanPlugin()` — that is `ubean/vite` in the `ubean` aggregator package |
| The Vue-side plugin (`ubeanVite` in `./vue`): page/app/entry virtual modules, auto-imports, component resolvers, `.vue` compile | Vue **compiler** behaviour itself — `@vitejs/plugin-vue`                                  |
| Virtual-module registry, `definePage` macro extraction, component/CSS resolver registry                                         | Page scanning — `@ubean/vue` owns pages, `@ubean/scan` owns the aggregating scan          |
| Production orchestrations (`buildWithEnvironments`), preset build config, server/worker/handler entry generators                | Deployment platform definitions — `@ubean/preset`                                         |
| Prerender / SSG: route collection, route→file mapping, payload extraction, static-entry direct render                           | Runtime caching, ISR, PPR semantics — `@ubean/routes` / `@ubean/server`                   |
| Type codegen (`generateTypes` + the unplugin presets) and the config → Vite translation                                         | Config loading/resolution — `@ubean/config`                                               |
| Server Actions **source transform** (client stub / server `filePath` injection)                                                 | The `defineAction` runtime and the `POST /__actions` handler — `@ubean/routes`            |

**Runtime dependency whitelist (main entry `@ubean/build`):** macros, the virtual-module registry, the
component/CSS resolver registry, and the SSR singleton policy — no `vite`, no `@vitejs/plugin-vue`, no
Vue compiler. Every heavier capability sits behind a subpath; `./vite` and `./vue` are the only two
that import Vite, and `./production`, `./prerender`, `./static-render`, `./codegen`, `./actions` are
build-time only — never import them from runtime route code (see [Architecture Notes](#architecture-notes)).

`vite` is declared as an **optional peer dependency** (`peerDependenciesMeta.vite.optional`).

## Install

```bash
pnpm add -D @ubean/build vite
```

Most projects never install this package directly — the `ubean` aggregator depends on it and
re-exports the plugin through `ubean/vite`, `ubean/build`, and `ubean/ssr`.

## Quick Start

The supported entry point is the composed plugin from the aggregator:

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

Composition only — no `await` needed. Vite awaits promises found in the `plugins` array before any
hook runs, so `plugins: [ubeanPlugin()]` is correct even though the factory is async.

Framework-agnostic or fine-grained use imports the subpaths directly:

```ts
import { ubeanServerActionsPlugin } from '@ubean/build/actions';
import { prerender } from '@ubean/build/prerender';
import { createStaticSsgRenderer } from '@ubean/build/static-render';
import { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite'; // no Vue, no islands
import { ubeanVite } from '@ubean/build/vue'; // Vue pages + app entry + auto-imports
```

## Vite Plugin

Entry point: `@ubean/build/vite`.

`ubeanPlugin()` is the framework-agnostic core plugin (`name: 'ubean:core'`, `enforce: 'pre'`). Its
`config` hook registers the `client` and `ubean` environments plus `builder.buildApp` — so **bare
`vite dev | build | preview` is the full toolchain**, and `ubean dev | build | preview` are thin
aliases over it.

```ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from '@ubean/build/vite';

export default defineConfig({
  plugins: [ubeanPlugin()] // config is loaded from ubean.config.ts if not passed
});
```

```ts
// Explicit config (what `ubean dev` / `ubean build` do internally)
ubeanPlugin({ config: resolvedConfig, registry: createVirtualRegistry() });
```

| Hook                        | What it does                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                    | Loads `ubean.config.ts` if needed, runs the project dependency check, registers `environments` + `builder.buildApp`                            |
| `buildStart`                | Scans the project, primes the dev-scan baseline, applies the scan, runs codegen                                                                |
| `resolveId` / `load`        | Serves the virtual modules (`ubean:routes`, `ubean:pages`, `ubean:meta`, `ubean:app-config`, `ubean:locales`) + `virtual:ubean-asset-manifest` |
| `transform`                 | Extracts / strips `definePage` macros                                                                                                          |
| `configureServer`           | Registers the dev-scan coordinator and generates OpenAPI types on `listening`                                                                  |
| `renderChunk` / `resolveId` | Worker targets only: replaces `node:*` with throwing stubs, rewrites `import.meta.url`                                                         |
| `configurePreviewServer`    | Attaches the preview middleware                                                                                                                |

`UbeanPluginOptions`:

| Option     | Type                    | Description                                                                              |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `config`   | `UbeanResolvedConfig`   | Pre-resolved config; otherwise read from the global cache or loaded in `buildStart`      |
| `registry` | `VirtualModuleRegistry` | Virtual modules injected by the caller; the plugin creates its own instance when omitted |

**`experimental.viteBuilder` is gone.** The switch was deleted together with the two-`viteBuild`
legacy orchestration (ADR-0012). Writing it in `ubean.config.ts` is ignored as an unknown field —
there is no in-config escape hatch, only a version rollback.

**Worker targets.** When the active preset's `entryType` is `'worker'`, the plugin swaps `node:fs`
and friends for stubs that throw, and rewrites `import.meta.url` to `"file:///worker.mjs"` (workerd's
ESM leaves it `undefined`, which breaks bundler-generated `createRequire` interop shims at module
instantiation time). These only apply to the `ubean` environment.

## Vue Plugin

Entry point: `@ubean/build/vue` (also the subpath's default export).

`ubeanVite()` provides the Vue-specific half: the page/app/client-entry/server-entry virtual modules,
`unplugin-auto-import`, `unplugin-vue-components`, the Vue i18n plugin, and markdown pages.

```ts
import { ubeanVite } from '@ubean/build/vue';

ubeanVite({
  config,
  ssr: true, // optional
  vue: true, // default: register @vitejs/plugin-vue
  registry
});
```

| Option     | Type                    | Description                                                                                              |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `config`   | `UbeanResolvedConfig`   | Required — the resolved ubean config                                                                     |
| `ssr`      | `boolean`               | Optional SSR flag                                                                                        |
| `registry` | `VirtualModuleRegistry` | Same instance as `ubeanPlugin()`; without it `createVirtualRegistry()` usage is per-plugin               |
| `vue`      | `boolean`               | Register `@vitejs/plugin-vue` (default **true**). Pass `false` when you bring your own Vue plugin config |

`ubeanVite` owns the `@vitejs/plugin-vue` registration because it is the only entry point a plain
`vite dev` goes through — if the CLI registered it instead, the same plugin would compile `.vue`
files twice. `VUE_PLUGIN_INCLUDE` is exported alongside it (`[/\.vue$/, /\.md$/]`).

Module factory helpers, for tooling that builds its own plugin array:

```ts
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from '@ubean/build/vue';
```

## Virtual Modules

Entry point: `@ubean/build` (main).

Virtual modules are plain objects behind a registry, not globals. Framework paths build one with
`createVirtualRegistry()` and **inject** it into the plugins — a module-level singleton would leak
state across the environments of a single builder (ADR-0012 §6).

```ts
import { createVirtualRegistry, defineVirtualModule, defineVirtualModulePrefix } from '@ubean/build';

const registry = createVirtualRegistry([
  defineVirtualModule('virtual:ubean-app-config', () => 'export const config = { mode: "fullstack" };'),
  defineVirtualModulePrefix('virtual:ubean-page:', id => `export default {}; // ${id}`)
]);
```

| Export                                                                                     | Description                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `VirtualModuleRegistry`                                                                    | Registry class: `register` / `resolveId` / `load` / `getModules` / `invalidate` |
| `createVirtualRegistry(modules?)`                                                          | Build an independent instance (the recommended form)                            |
| `defineVirtualModule(id, loader)`                                                          | Exact-id module                                                                 |
| `defineVirtualModulePrefix(prefix, loader)`                                                | Prefix-matched module family                                                    |
| `useVirtualRegistry()` / `resetVirtualRegistry()`                                          | Deprecated module-level singleton — kept for existing tests only                |
| `VirtualModule`, `VirtualModuleResolver`, `VirtualModuleContext`, `VirtualModuleTransform` | Types                                                                           |

Framework-provided modules:

| Factory                                                                      | Virtual module               |
| ---------------------------------------------------------------------------- | ---------------------------- |
| `createRoutingVirtualModule(routes, middlewares, cwd)`                       | API routes + middleware      |
| `createPagesVirtualModule(pages, layouts, cwd)`                              | Page / layout records        |
| `createMetaVirtualModule()`                                                  | Route metadata               |
| `createAppVirtualModule(apiRoutes, middlewares, pages, srcDir)`              | App config                   |
| `createLocalesVirtualModule(locales, defaultLocale, srcDir, i18nConfigJson)` | Locale data + `loadLocale()` |

## Macros

Entry point: `@ubean/build` (main).

`definePage` is a compile-time macro. `transformMacros()` extracts and removes the call inside
`src/pages/`, `src/routes/`, and `src/middleware/`; `stripMacros()` is the plain stripper.

```ts
import { transformMacros, stripMacros } from '@ubean/build';

transformMacros('definePage({ cache: true })', '/app/src/pages/index.vue'); // → ''
stripMacros('definePage({ name: "Home" }); const a = 1;'); // → '; const a = 1;'
```

`MACRO_NAMES` contains **only** `definePage`. Adding `defineHandlerMeta` / `defineMiddleware` there
would strip runtime function calls and produce syntax errors — those are real runtime functions.

Vue SFCs keep an empty `<script setup>` block (as a comment) when stripping would leave it blank: a
page whose `definePage` was its only setup content, but which also has a plain `<script>` (the
documented shape for `loader` + `definePage`), would otherwise lose its default export and fail with
`MISSING_EXPORT "default"`.

## Dev Server Bootstrap

Entry point: `@ubean/build/vite`.

These exports own dev request routing and the host app, so `vite dev` works without the CLI.

```ts
import { bootstrapDevApp, ubeanDevRequestPlugin, ensureDevApp } from '@ubean/build/vite';
```

| Export                                                                   | Description                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `bootstrapDevApp(options)`                                               | Create the Hono dev app from a scan, wire it to the Vite SSR graph, prepare `ready`, expose `rebuild` |
| `createDevApp(options)`                                                  | Scan (optional) + create the host app — no Vite server needed                                         |
| `createDevAppReady(options)`                                             | Idempotent first-request initialisation: locales, `defineServer`, `app.init()`, `onServerReady`       |
| `ubeanDevRequestPlugin(options)`                                         | The request-routing plugin: pre-classification + post fallback                                        |
| `createUbeanRequestHandlers(server, options)`                            | The handlers used by the plugin                                                                       |
| `getDevApp(server)` / `ensureDevApp(server)`                             | Read / lazily bootstrap the dev app associated with a Vite server                                     |
| `enhanceDevApp(options)`                                                 | Attach the SSR-graph loaders and renderer to an existing Hono app                                     |
| `isFrameworkHtmlPage(url)`                                               | Framework-owned HTML pages (`/_devtools`, `/_scalar`, all `/__devframes/**`)                          |
| `isViteResourceRequest(url, headers)`                                    | Whether the request belongs to Vite                                                                   |
| `collectDevCssLinks(moduleGraph)` / `injectStylesheetLinks(html, hrefs)` | CSS link injection                                                                                    |
| `toWebRequest(req, host, protocol)` / `sendWebResponse(res, webRes)`     | Node ↔ Web adapters                                                                                   |

Dev-scan coordination (one watcher, one scan, one reload order):

| Export                                                                      | Description                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DEV_SCAN_DIRS`                                                             | `routes`, `middleware`, `pages`, `layouts`, `plugins`, `app`, `api`, `locales` |
| `createDevScanCoordinator(options)` / `getDevScanCoordinator(server, init)` | Coordinator lifecycle                                                          |
| `onDevScan(server, handler)`                                                | Subscribe to scan results                                                      |
| `peekDevScanCoordinator(server)`                                            | Non-initialising read                                                          |

`DEVTOOLS_PASS_THROUGH_PREFIXES` (`['/__devframes', '/__devtools', '/_devtools']`) is the single
declaration of the reserved dev namespace — matched by **bare string prefix**, not by path segment,
because segment matching misses sibling paths.

Dev security headers are mode-aware:

```ts
import { resolveDevSecurityHeaders } from '@ubean/build/vite';

// `ssg` mode defaults to OFF: static output ships no framework-injected headers.
resolveDevSecurityHeaders(config); // → boolean | Record<string, unknown>
```

The worker-based dev environment (`UbeanDevEnvironment`, `createUbeanDevEnvironmentFactory`,
`createEnvRunnerTransport`, `bridgeEnvRunnerInvokes`, `UBEAN_DEV_ENV_NAME`) and its generated entry
(`DEV_WORKER_FILE`, `getDevWorkerEntrySource`, `writeDevWorkerEntry`, `invalidateDevWorkerModules`)
are exported from the same subpath. They are a runnable capability, **not** the wired-up dev path:
`createEnvironment` currently has no registration point, and SSR executes in the main process.

## Preview

Entry point: `@ubean/build/vite`.

`ubeanPreviewPlugin()` / `attachPreviewMiddleware()` make `vite preview` serve **the artifact itself**:
fullstack / backend load `createFetchHandler()` from the built `dist/server/entry.mjs` in-process; spa /
ssg are served by a static resolver shared with the CLI's built-in server.

```ts
import { ubeanPreviewPlugin, resolvePreviewFile, previewMimeType } from '@ubean/build/vite';

ubeanPreviewPlugin();
```

| Export                                                                | Description                             |
| --------------------------------------------------------------------- | --------------------------------------- |
| `ubeanPreviewPlugin(options?)`                                        | The preview plugin                      |
| `attachPreviewMiddleware(server, config, host?)`                      | Attach to an existing preview server    |
| `createPreviewMiddleware(options)`                                    | The connect middleware                  |
| `resolvePreviewFile(root, pathname, mode)`                            | Static resolution for `'spa'` / `'ssg'` |
| `sendPreviewFile(res, path)` / `sendPreviewStatus(res, status, text)` | Response helpers                        |
| `previewMimeType(filePath)`                                           | MIME lookup                             |

Cloudflare artifacts preview through miniflare, which is an optional dependency:

```ts
import { createCloudflarePreviewRunner } from '@ubean/build/vite';

const result = await createCloudflarePreviewRunner({ cwd, outDir });
// → { ok: false, reason: 'miniflare-missing', hint: MINIFLARE_INSTALL_HINT }
```

`MINIFLARE_INSTALL_HINT` names the alternative: _Install it with `pnpm add -D miniflare`, or preview
with `wrangler dev` instead._

## Server Actions

Entry point: `@ubean/build/actions`.

The plugin detects `defineAction()` call expressions and splits them per environment: **server**
injects `filePath` (and the inferred `name`) so the action ID is stable across dev and build;
**client** replaces the call with `createActionStub('<id>')`, an RPC stub that POSTs to `/__actions`.

It is already part of the composed `ubeanPlugin()` from `ubean/vite` — you only add it manually when
composing your own plugin array.

```ts
import { ubeanServerActionsPlugin } from '@ubean/build/actions';

plugin: ubeanServerActionsPlugin({ root: process.cwd() });
```

| Export                                                      | Description                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `findDefineActionCalls(code)` / `hasDefineActionCall(code)` | Detection                                                            |
| `transformActionsForServer(code, filePath, root)`           | Inject `filePath` / `name`                                           |
| `transformActionsForClient(code, filePath, root)`           | Replace with `createActionStub(...)`                                 |
| `ServerActionsPluginOptions`                                | `{ root?: string }` — defaults to `process.cwd()` at plugin creation |

Name inference order: the `name` property in the options object → the variable/property the result is
assigned to (`export const login = defineAction(...)` → `'login'`) → `'anonymous'`.

## Production Build

Entry point: `@ubean/build/production`.

```ts
import { buildWithEnvironments, getPresetBuildConfig, generateNodeServerEntry } from '@ubean/build/production';

const manifest = await buildWithEnvironments({
  cwd,
  config,
  preset,
  scanResult,
  minify: true,
  sourcemap: false,
  contentSnapshot
});
```

| Export                                                                                                  | Description                                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `buildWithEnvironments(options)`                                                                        | One `createBuilder` for the whole build; returns a `BuildManifest`                           |
| `BuildOptions`                                                                                          | `cwd`, `config`, `preset`, `scanResult`, `minify?`, `sourcemap?`, `contentSnapshot?`         |
| `BuildManifest`                                                                                         | `assets`, `entry`, `clientDir`, `serverDir`, `preset`                                        |
| `getPresetBuildConfig(preset)`                                                                          | `{ format, target, entryType, external }` — `entryType` is `'node'` / `'worker'` / `'fetch'` |
| `generateNodeServerEntry()` / `generateStandardHandlerEntry()` / `generateCloudflareWorkerEntry()`      | Per-entry-type server bundles                                                                |
| `generateVirtualModulesToDisk(cwd, config, scanResult, virtualDir, preset, registry, contentSnapshot?)` | Build-time snapshot of the virtual modules                                                   |
| `serializePagesForEntry(pages)`                                                                         | Serialize scanned pages into the server entry                                                |
| `createIslandsSsrStubPlugin()`                                                                          | Non-functional islands registry for SSR                                                      |

**`serializePagesForEntry()` is a whitelist, and the whitelist is load-bearing.** It previously
serialized only `relativePath` / `name` / `route` / `layout` / `reuseTarget` / `pageKind` / `pageMeta`,
so `matchers` and `slot` **disappeared from production builds** — dev used the live scanned objects
and behaved correctly, while a `[id=numeric]` route returned 404 in dev and 200 in production. Add a
field to `ScannedPage` and you must add it here too; `packages/builder/test/page-metadata.test.ts`
locks the list field by field.

`buildWithEnvironments()` declares "the build is caller-driven" (`UBEAN_BUILD_DRIVEN_BY_CLI=1`) for
its duration so the plugin's `config` hook does **not** also register its own `buildApp` — otherwise
the plugin's return value would overwrite the inline `builder` field and the build would silently
produce nothing.

## Prerender

Entry point: `@ubean/build/prerender`.

`prerender()` drives a `fetcher` over a collected route list, writes HTML files, and can externalize
the page payload as `__data.json`.

```ts
import { prerender, collectPrerenderRoutes, routeToFilePath } from '@ubean/build/prerender';

const result = await prerender({
  cwd,
  outputDir: 'dist',
  pages,
  prerender: { all: true },
  fetcher: async url => ({ html: await render(url), statusCode: 200 }),
  expandRoutes: routes => routes, // i18n expansion hook
  notFoundRoute: true // static SSG: enqueue the 404 sentinel → 404.html
});
```

| Export                                                   | Description                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `prerender(options)`                                     | Full run → `PrerenderResult`                                                    |
| `collectPrerenderRoutes(pages, options)`                 | `{ routes, skipped }`; merges `include` + route-rule discovery + content routes |
| `extractPrerenderRoutesFromRules(routeRules)`            | Routes marked `prerender: true` or `ppr: true`                                  |
| `extractLinks(html, baseUrl?)`                           | Crawl support                                                                   |
| `routeToFilePath(route, outputDir)`                      | `/` → `index.html`, `404` sentinel → `404.html`, `/robots.txt` preserved        |
| `routeToDataFilePath(route, outputDir)`                  | `__data.json` path per route                                                    |
| `extractDataPayload(html, route)`                        | Pull `__UBEAN_DATA__` out of HTML → `ExtractedPayload`                          |
| `writePrerenderedFile(filePath, html)`                   | Write helper                                                                    |
| `resolvePrerenderStaticDir(cwd, buildOutputDir, config)` | Resolves `<outputDir>/public` — no longer a hardcoded `dist/public`             |
| `generatePrerenderManifest(result, baseUrl?)`            | Manifest for deployment tooling                                                 |

`PrerendererOptions.fetcher` is the isomorphism point: the fullstack path supplies `createSsrFetcher`
(imports the real server entry and drives the Hono pipeline per route), the SSG path supplies the
direct renderer from `./static-render`.

## Static Render Path

Entry point: `@ubean/build/static-render`.

`mode: 'ssg'` renders through a **minimal static entry** instead of the request pipeline (ADR-0011).
`createStaticSsgRenderer()` loads the built static entry and returns the same fetcher contract, so
`prerender()` needs no changes.

```ts
import { createStaticSsgRenderer, matchRoutePattern, expandRoutesForLocales } from '@ubean/build/static-render';

const renderer = await createStaticSsgRenderer(cwd, manifest, {
  pages,
  notFoundPage,
  i18n: { enabled: true, strategy: 'prefix_except_default', defaultLocale: 'en', locales: ['en', 'zh'] }
});

const result = await prerender({
  ...options,
  expandRoutes: renderer.expandRoutes,
  fetcher: renderer.fetcher
});
```

| Export                                         | Description                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createStaticSsgRenderer(cwd, manifest, init)` | Loads `dist/server/entry.mjs`; returns `StaticSsgRenderer` or `undefined` on failure                 |
| `StaticSsgRenderer`                            | `{ fetcher, expandRoutes, renderStaticPage }`                                                        |
| `StaticSsgRenderer.renderStaticPage`           | The function generated into the built static entry (built artifact, not an import from this subpath) |
| `compilePageRoute(page)`                       | Compile a scanned page into a matchable route                                                        |
| `matchRoutePattern(pages, path)`               | Match with specificity ordering; returns `StaticRouteMatch \| null`                                  |
| `expandRoutesForLocales(routes, i18n)`         | Per-strategy URL expansion                                                                           |
| `STATIC_NOT_FOUND_ROUTE`                       | `'/__ubean_404__'` — the 404 sentinel route                                                          |

**What the direct path does not have** (ADR-0011): no Hono app, no API routes, no middleware, no
crons, no IPX, no preset wrapper files. Page `loader` is **not executed** — exporting one logs a
one-time warning, and data must come from content collections, module constants, or client hydration.
Server actions, ISR / PPR / streaming, and route-rule redirect/rewrite have no execution point in
static output. The fullstack `prerender` path is the opposite: it drives the real server entry per
route, so loaders and middleware run.

`matchRoutePattern` understands both dialects: the scanner's (`:param`, `**:slug`, `:id?`) and
vue-router syntax coming from `definePage({ path })` (`:param(regex)`, `:param*`, `:param+`).
Parameters are `decodeURIComponent`-ed to match `c.req.param()`.

## Codegen

Entry point: `@ubean/build/codegen`.

```ts
import { generateTypes, CODEGEN_CONTRACT_VERSION, CODEGEN_FILES } from '@ubean/build/codegen';

const result = await generateTypes(scanResult, {
  cwd,
  srcDir: 'src',
  buildDir: '.ubean',
  autoImports: config.autoImports,
  components: config.components
});
```

| Export                                                                                   | Description                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `generateTypes(result, options)`                                                         | Writes all declarations, returns `CodegenResult` + `codegen.manifest.json` |
| `generateRouteTypes(result, options)`                                                    | `routes.d.ts` (`ubean:routes`: `ApiRouteMap`, `ApiRoutePath`, `ApiMethod`) |
| `generatePageTypes(result, options)`                                                     | `pages.d.ts` (`ubean:pages`: `RouteName`, `LayoutName`)                    |
| `generateI18nTypes(result, options)` / `messagesToTsType(value, indent?)`                | `i18n.d.ts` (`vue-i18n` `DefineLocaleMessage`)                             |
| `generateOpenApiTypes(schema, options)`                                                  | `openapi.d.ts` from an OpenAPI schema                                      |
| `generateOpenApiTypesFromServer(baseUrl, options)`                                       | Same, fetching `/_openapi.json` from a base URL                            |
| `generateAutoImports(scanResult, options)`                                               | Auto-import declarations from the scan                                     |
| `CODEGEN_CONTRACT_VERSION` / `CODEGEN_FILES` / `CodegenManifest` / `CodegenFileContract` | The emitted-file contract (versioned for studio / IDE consumers)           |

Auto-import preset resolution — shared by the runtime plugin and codegen:

```ts
import { resolveAutoImportsConfig, resolveComponentsConfig, getAutoImportPresets } from '@ubean/build/codegen';

const resolved = resolveAutoImportsConfig(config.autoImports);
const presets = getAutoImportPresets(resolved);
```

`ResolvedAutoImports` decomposes `boolean | AutoImportOptions` into per-library switches — `enabled`,
`ubean` (default `true`), `vue`, `vueRouter`, `vueI18n`, `honoOpenapi` (the rest default `false`) — plus
the raw `options` for pass-through. The preset constants are exported too: `VUE_PRESET`,
`VUE_MACROS_PRESET`, `UBEAN_CLIENT_PRESET`, `VUE_ROUTER_PRESET`, `VUE_I18N_PRESET`,
`UBEAN_SERVER_PRESET`, `HONO_OPENAPI_PRESET`, `BUILTIN_PRESETS`, alongside `toArray`,
`getBuiltinComposables`, `getUbeanAutoImportConfig`, `getUbeanComponentsConfig`, and
`generateImportsTransform`. The paired-component halves (`**/*.server.vue`, `**/*.client.vue`) are
detected during the component scan, so they are declared from the same codegen run.

**Where codegen runs is part of the contract.** Previously only the CLI ran it, so bare
`vite dev` / `vite build` produced no `.ubean/*.d.ts` at all and user type-checks failed. The plugin
now runs `generateTypes()` in `buildStart` and yields when `UBEAN_CODEGEN_BY_CLI=1` or
`UBEAN_BUILD_DRIVEN_BY_CLI=1` is set, so exactly one executor writes each artifact.

## Type Safety

- Every subpath ships `.d.ts` files (`types` is declared per export condition in `package.json`).
- `CodegenResult` returns the path of every artifact it wrote, so callers never guess at filenames.
- `CodegenManifest` + `CODEGEN_CONTRACT_VERSION` are the machine-readable contract for external
  consumers (studio, IDE plugins) — `codegen.manifest.json` records, per file, its virtual module,
  whether it is required, and whether it was actually generated this run.
- `PresetBuildConfig` is `ReturnType<typeof getPresetBuildConfig>`, so the server-environment
  external lists stay in sync with the preset implementation.
- `VirtualModuleRegistry` implements `VirtualModuleResolver`, the read-only view the plugins consume —
  plugin code cannot mutate the registry it was handed.
- Config typing flows through `@ubean/config`'s `ResolvedConfig`; every option in this package takes
  that type rather than redeclaring config shapes.

## Architecture Notes

- **Lifecycle ownership (ADR-0012).** The `config` hook registers `client` + `ubean` environments and
  `builder.buildApp`; `vite dev | build | preview` are therefore the complete toolchain. The legacy
  two-`viteBuild` orchestration and the `experimental.viteBuilder` switch **were deleted** — writing
  the field now is silently ignored. Rollback is a version rollback, deliberately: a switch that can
  change semantics silently costs more than a version rollback.
- **Three phases, two drivers.** `prepareBuild` → `runEnvBuilds` are shared; `buildWithEnvironments()`
  owns its builder, while the plugin path lets Vite create the builder and only calls the two phases.
  Calling `buildWithEnvironments()` from inside `buildApp` would recurse.
- **No `ssr` environment.** Deliberately not aligned with Nitro: ubean is Vue-only and the server
  entry already fuses the Hono app with the Vue renderer, so a third environment would buy a
  cross-environment singleton proxy and nothing else (ADR-0012 §2).
- **Output layout is `dist/{public,server}` + `dist/manifest.json`.** `.output/` is deliberately not
  adopted — the layout is promised by the docs, by preview takeover, and by `analyze`'s baseline
  reading (ADR-0012 §5).
- **Prerender stays after the server bundle.** Both render paths consume the built artifact, so
  prerender cannot move before packing (a second deliberate deviation from Nitro, ADR-0012 §4).
- **Asset tags are inlined at build time**, not read from `<public>/.vite/manifest.json` at runtime.
- **Never import this package from runtime route code.** It pulls the whole build toolchain into the
  server bundle: wasted size on Node, and a hard build failure on workers because the toolchain's
  optional dependencies (`velocityjs`, `atpl`, …) cannot be bundled. Static assets and caching go
  through the platform layer (ADR-0013).
- **`env-runner` must not become a dependency of this package** — it stays in `@ubean/cli`. Adding it
  here triggers pnpm peer-variant drift, which shows up as `Plugin` type identity mismatches. The dev
  environment code uses a local structural interface (`EnvRunnerLike`) instead.
- **Cross-instance shared state goes on `globalThis`, not in a module-level `Map`.** The dev SSR graph
  inlines `ubean` while externalising `@ubean/vue`, so two module instances coexist and read different
  registries with no error. The component/CSS resolver registry follows this rule.
