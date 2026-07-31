---
title: Roadmap
---

# Roadmap

## 9.1 Vertical Delivery Milestones

Phases are organized by module, but release decisions follow vertical milestones; subsequent capabilities must not skip the acceptance gate of the previous milestone.

| Milestone | Deliverable Capability | Acceptance Criteria |
| --- | --- | --- |
| M0: Routing Contract | Config loading, routing IR, file scanning, error model and Node fixture | Path normalization, conflict detection, `404/405/OPTIONS` unit and integration tests |
| M1: API beta | Hono, named-export API, validation, OpenAPI, Fetch client, Node `dev/build/preview` | Real Node fixture, type tests, `pnpm pack` install test |
| M2: Vue SSR beta | Pages, single-layer layout, loader/action data protocol, hydrate, page error boundary | SSR hydration, navigation reuse, invalidation and streaming fallback browser tests |
| M3: Node v0.1 | Static assets, basic route rules, observability, SEO metadata and release docs | CI green, Node deployment smoke test, public API audit |
| M4: Second Preset | One experimental preset upgraded to officially supported | Capability matrix, target-platform smoke test and degraded diagnostics |
| M5: Ecosystem Extensions | DevTools, database, queues, WebSocket, i18n and other optional capabilities | Independent fixture per capability, permission audit and stability assessment |
| M6: Meta-framework Alignment | Streaming SSR, Server Actions, ISR/per-route rules, PPR, file-convention SEO, platform preset completion | Render streaming TTFB benchmark, Actions end-to-end, ISR invalidation, SEO convention file smoke test |

> M6 corresponds to Phase 9; see [Framework Comparison and Gap Analysis](framework-comparison.md) for the basis.

---

## 10. Differences from Reference Projects

### 10.1 Changes Relative to void

1. **Removed Void Cloud dependency**: No login, no deployment platform binding, no proprietary cloud services
2. **Vue-specific**: Removed React/Svelte/Solid adapters, deeply optimized for Vue
3. **Multi-platform support**: Expanded from Cloudflare-only to nitro-level multi-platform (Node/Bun/Deno/Cloudflare/Vercel/Netlify, etc.)
4. **Generic deployment**: Removed the `void deploy` command, replaced with standard deployment per platform
5. **Removed built-in Auth**: Better Auth is not built in; users can freely choose their auth solution, implemented via middleware + `meta.public`
6. **Cron Jobs retained and enhanced**: void's `defineScheduled`/`crons` directory retained, with config-based mapping added referencing nitro's `scheduledTasks`
7. **Named-export routing convention**: Adopted void's `export const GET`/`POST` single-file multi-method pattern (instead of nitro's filename suffix)
8. **Enhanced Hooks system**: Adopted nitro's hookable full lifecycle
9. **Preset system**: Complete platform preset mechanism
10. **Runtime plugins**: Added nitro-style runtime plugin system
11. **Build tool**: Kept vite-plus, also supports rolldown builds
12. **Enhanced defineHandler**: Reused void's middleware chain composition, extended `meta` to support custom fields (public/rateLimit/cache)
13. **Type-safe client**: Strongly typed client based on ofetch, consuming auto-generated OpenAPI paths types; browser upload progress provided via XHR adapter

### 10.2 void Platform Feature Integration Assessment

| Feature | void Implementation | Integration Decision | Reason |
| --- | --- | --- | --- |
| **Cron Jobs** | `crons/` directory + `defineScheduled()` + `export const cron` | ✅ **Core integration** | Common need; nitro also has scheduledTasks; cross-platform via platform cron triggers or built-in scheduler |
| **Queues** | `queues/` directory + `defineQueue()` + Cloudflare Queues binding | ⚠️ **Preset-optional** | Strongly coupled to Cloudflare Queues/queue infrastructure; provided as preset extensions for Cloudflare/Vercel etc., not in core |
| **AI (Workers AI)** | `env.AI` binding + `ai.run()`/`ai.stream()` + AI Gateway | ❌ **Not in core** | Cloudflare-specific; users can inject bindings themselves via plugin; not a general meta-framework feature |
| **Sandboxes** | `@cloudflare/sandbox` Durable Object + `env.SANDBOX` | ❌ **Not integrated** | Cloudflare Labs experimental, not a stable API, platform-bound, not suitable for core |
| **WebSocket Rooms** | `defineRoom()`/`defineWebSocket()` + `.ws.ts` files | ✅ **Core integration** | WebSocket is a common need; crossws already supports cross-platform; void's defineRoom pattern is elegant |
| **KV Storage** | `env.KV` + `kv.get()/put()/list()` | ✅ **Via unstorage** | Not bound to Cloudflare KV; uses unstorage to unify the KV interface; each platform preset injects its own driver |
| **D1/Database** | `env.DB` Drizzle integration | ✅ **Core integration (abstracted)** | Uses db0 to abstract the database interface; Drizzle as a first-class ORM, but not bound to Cloudflare D1 |
| **Basic Auth** | Built-in `basicAuth()` middleware | ✅ **Retained as built-in middleware** | Common need; exported as an optional middleware |
| **Better Auth built-in** | Built-in Better Auth integration | ❌ **Removed** | Auth solutions vary (Better Auth/Auth.js/custom); no specific solution built in; middleware auth supported via `meta.public` |

### 10.3 Changes Relative to nitro

1. **Hono replaces h3**: Uses Hono as the HTTP framework
2. **Inertia-style Pages**: Built-in SSR page routing, no extra renderer needed
3. **Deep Vue integration**: First-class Vue support, auto-configures Vue SSR
4. **Simplified API**: Simpler API oriented toward app developers
5. **vite-plus first**: Uses vite-plus instead of plain Vite
6. **File convention optimization**: Adopts void-style directory conventions (routes/ pages/ middleware/)
7. **Environment variable Schema**: void-style defineEnv type-safe validation
8. **Skills built-in**: Built-in Agent Skills system
9. **Client type generation**: Auto-generates type-safe fetch client
10. **Built-in Vue components**: Link, Head, ClientOnly and other Vue components
11. **Auto OpenAPI docs**: nitro-style OpenAPI auto-generation + Scalar UI integration
12. **defineApp customization**: Replaces hardcoded entry, supports the full Vue plugin ecosystem

---

## 11. Key Technical Decisions

| Decision Point | Choice | Reason |
| --- | --- | --- |
| HTTP Framework | Hono | Lightweight, modern, edge-friendly, type-safe, elegant API |
| Build Tool | vite-plus | Proven by void, high performance, built-in config management |
| Package Manager | pnpm\@11 | Good monorepo support, catalog feature, excellent performance |
| CLI Framework | citty | unjs ecosystem, lightweight, type-safe |
| Config Loading | c12 | unjs ecosystem, supports ts config, watch mode |
| Route Matching | rou3 | Used by nitro, high performance, supports compile-time optimization |
| Hooks System | hookable | unjs ecosystem, type-safe, supports sync and async |
| Storage Abstraction | unstorage | Used by nitro, multi-driver support |
| Database Abstraction | db0 + Drizzle | db0 unified interface + Drizzle type-safe ORM |
| WebSocket | crossws | Used by nitro, cross-platform compatible |
| Test Framework | vitest (vite-plus) | Native Vite integration, high performance |
| Runner | env-runner | Used by nitro, supports multi-runtime workers |
| Node Compatibility | unenv | Used by nitro, Cloudflare/Edge environment Node API compatibility |
| Auto-imports | unimport | unjs ecosystem, on-demand auto-import |
| Logging | consola | unjs ecosystem, beautiful, configurable |
| OpenAPI Types | @scalar/openapi-types | OpenAPI 3.1 types maintained by Scalar, proven by nitro |
| OpenAPI UI | @scalar/api-reference (CDN) | Modern API docs UI, zero build dependency |
| HTTP Client | ofetch + middleware; browser XHR upload adapter | Consistent across runtimes by default; only upload progress switches to browser XHR transport |

---

## 12. Risks and Notes

1. **Vite-Plus version alignment**: The catalog must lock compatible versions of vite-plus, vite and vitest; upgrades may only be merged after passing an independent compatibility CI
2. **Preset test complexity**: Multi-platform testing requires different environments; some can be simulated with miniflare and similar tools
3. **Vue SSR performance**: Pay attention to SSR streaming render and hydration optimization
4. **Type inference complexity**: Type inference for Pages loader/action needs careful design
5. **Rolldown stability**: Rolldown is still evolving; Rollup is the stable fallback
6. **Hono vs h3 ecosystem**: h3 is more deeply bound to the nitro ecosystem; Hono requires some adaptation work
7. **env-runner integration**: Worker dev runtime needs to handle HMR and restart logic well
8. **defineApp type compatibility**: Must ensure the async return value and app instance types of defineApp are consistent on both SSR and Client sides
9. **OpenAPI meta extraction**: AST parsing of `defineHandlerMeta()` calls and file-level `export const meta` must handle various forms (variable references, spreads, etc.); initially the void approach of only supporting literal objects can be used; OpenAPI Operation definitions have been migrated to hono-openapi's `describeRoute` middleware for automatic collection
10. **Type chain integrity**: ~~defineValidator multi-overload~~ has been migrated to hono-openapi's validator middleware; types are handled automatically by hono-openapi; custom middleware stays type-chain-intact via the `defineMiddleware` wrapper
11. **definePage macro transform**: The `definePage()` compile-time macro inside `<script setup>` must be intercepted and extracted by a Vite plugin during the Vue SFC compilation stage, avoiding residual runtime calls
12. **Reuse route type closure**: The type of the `reuse` field must reference the already-generated `RouteName` union, creating a chicken-and-egg problem; a two-phase generation is required (generate the RouteName type first, then validate reuse references)
13. **CLI AST operation safety**: When the CLI uses ts-morph to modify generated files, backups must be taken to avoid losing user hand-edited content
14. **SSR serialization and hydration safety**: Page data must use an XSS-safe serialization format, with coverage of `</script>`, Unicode separators, circular references and hydration mismatch tests
15. **Routing protocol compatibility**: The Pages protocol, virtual modules and generated types must all carry a version; when the client and server versions are incompatible, navigation must be diagnosed and refused
16. **Platform capability semantic differences**: Before any new preset enters experimental or official support, the semantic differences and degradation behavior for cache, cron, WebSocket, Queue, filesystem and Node compatibility must be documented
17. **DevTools security boundary**: Must test cross-origin message rejection, token invalidation, path traversal, sensitive file access and AI write-operation confirmation; cannot only verify the normal RPC path
18. **Public API evolution**: Changes to exports, config schema and generated types must declare a stability level, migration notes and deprecation period; internal entry points must not become de-facto public APIs
19. **Upload progress transport differences**: `onUploadProgress` triggers a dual transport path of XHR and ofetch; must ensure auth headers, cookies, timeout, cancellation, error and response parsing are consistent; SSR, edge and internalFetch must explicitly reject this option

---

## 13. Task Tracking Status

> Status legend: ⬜ Not started | 🔄 In progress | ✅ Completed

### Completed Phases Overview

| Phase | Status | Core Deliverables |
| --- | --- | --- |
| Phase 1: Project Skeleton | ✅ | monorepo + catalog, tsconfig, vitest, CLI entry (citty), c12 config loading, consola logging |
| Phase 2: Build Core | ✅ | File scanning (routes/pages/layouts/middleware/plugins/queues/locales), rou3 route matching, virtual module framework, Vite plugin skeleton, preset system (standard/node), defineHandlerMeta/definePage AST extraction, code generation (routes.d.ts/pages.d.ts) |
| Phase 3: Runtime Core | ✅ | Hono integration, defineHandler/defineMiddleware/defineHandlerMeta, middleware system, hookable plugins, static assets, defineEnv, OpenAPI (`/_openapi.json` + Scalar), Cron runtime, type-safe client (ofetch + XHR upload adapter), i18n runtime, observability, SEO metadata |
| Phase 4: Vue Pages System | ✅ | Pages protocol (Inertia style), definePage macro, Layout system (nested), Reuse routes, route groups, virtual modules, Vue SSR renderer, defineApp, client runtime (router/Link/usePage), Head management, Loader/Action, View Transitions, Prefetch, CLI page/api/layout/env/config commands, Shared Layer |
| Phase 5: Experimental Preset | ✅ | Capability matrix (19 items), Cloudflare Workers preset, DevRunner abstraction + fs.watch hot reload, preset auto-detection, wrangler.toml generation |
| Phase 6: Advanced Features | ✅ | Cache (CacheStore + LRU + middleware), SSG prerender, Route Rules (headers/redirects/rewrites/cache), Storage (unstorage wrapper + KV), Database (db0 + in-memory driver + migrations), WebSocket (Peer/Room/hooks), SSE, internalFetch, auto-imports (unimport), DevTools infrastructure + built-in Tabs + CRUD + Hooks + API Playground + AI Assistant + custom Tabs, Markdown/MDX pages, Islands (client:* directives), i18n enhancements (reactive/auto-load/SSR hydration/plural/Intl formatting), Queues, Better Auth plugin, Link component, CodeMirror editor, Icon/Image/Content/Fonts/PWA extension packages |
| Phase 6b: Vite Modular Architecture Refactor | ✅ | Dev Server migrated to Vite Middleware Mode, Module system (`modules` config + `resolveModules` + `ModuleKit` + topological sort + Hooks), Vite SSR production build Pipeline (dual build + preset adaptation), top-level config shortcuts for official extensions (icon/pwa/auth/image/fonts), inter-module dependency and Hooks integration |
| Phase 7: Skills & Docs | ✅ | Skills system (SKILL.md routing), built-in docs (guide/reference/integrations, 14 docs total), AGENT_PROMPT.md, ubean init interactive initialization, example projects (hello-world/api-routes/pages-basic) |
| Phase 8: Release Auth & Test Completion | ✅ | Unit test completion (35 files, 811 cases), DevTools unit tests (32 cases), integration and browser e2e tests (7 integration + 1 e2e), preset test matrix, CI/CD (GitHub Actions), npm scripts validation |
| Phase 9: Meta-framework Alignment Completion | ✅ | Per [Framework Comparison and Gap Analysis](framework-comparison.md), closed key gaps with Next.js/Nuxt/SvelteKit/SolidStart/Astro: streaming SSR, Server Actions, ISR/per-route rules, PPR, file-convention SEO, platform preset completion, etc. (P9-01 ~ P9-28) |

### Phase 9: Meta-framework Alignment Completion

> Basis: [Framework Comparison and Gap Analysis](framework-comparison.md)
> Goal: Close key gaps with Next.js 16 / Nuxt 4 / SvelteKit 2 / SolidStart / Astro 5 while preserving ubean's unique advantages.
> Status legend same as above: ⬜ Not started | 🔄 In progress | ✅ Completed

#### P0 Strategic (rendering and mutation layers, affecting core competitiveness)

| ID | Task | Status | Dependency | Notes |
| --- | --- | --- | --- | --- |
| P9-01 | Streaming SSR | ✅ | - | `@ubean/ssr` uses `renderToNodeStream` + `ReadableStream` for chunked output; `SsrOptions.streaming` config; `renderPageToStream` + fallback logic; 13 unit tests |
| P9-02 | Server Actions / Form Actions | ✅ | - | `@ubean/actions` package: `defineAction` + `'use server'` directive transform (Vite plugin, dual server/client transform) + stable action ID (base32(SHA-1)) + global registry + `/__actions` RPC middleware + SvelteKit-style `?/<name>` form action (`handlePageRequest` inlines `mod.actions` dispatch) + client runtime (`callAction`/`useAction`/`useFormAction`) + `form-actions.ts` testable helpers (`parseFormActionName`/`handleActionResponse`/`runServerAction`); 49 + 29 unit/integration tests |
| P9-03 | per-route render rules + ISR | ✅ | - | Extended `RouteRule` to support `ssr`/`prerender`/`isr` per-route fields; `route-rules` middleware sorts and merges by rule + path specificity and exposes via `c.get('routeRule')`; router overrides global settings per-route via `ssr` (`false`/`true`/`'streaming'`) and runs ISR on GET requests (TTL + SWR, `peek` keeps stale entries for stale revalidation); `CacheStore` extended with optional `peek`; `prerender` auto-discovers routes from `routeRules` with `prerender: true`; `app.ts` auto-initializes `cacheStore`; CLI build passes `routeRules` to prerender; added `route-rules.test.ts`/`isr.test.ts`/`prerender.test.ts` (routeRules auto-discovery) |
| P9-04 | Partial Prerendering / Server Islands | ✅ | P9-01 | Extended `RouteRule` to support `ppr: true` (implies `prerender: true` + forces streaming SSR, equivalent to `ssr: 'streaming'`); `route-rules` middleware matches `ppr` field (first-match wins, participates in specificity sorting); router forces streaming output for PPR routes and adds `X-PPR: true` response header; `prerender` auto-discovers `ppr: true` routes to generate the static shell; `@ubean/islands` Vite plugin adds `server:defer` directive transform: at compile time wraps the component in `<Suspense>`, extracts the `#fallback` slot as Suspense fallback (injects `<ubean-defer-fallback>` placeholder when no fallback); during prerender only the fallback (static shell) is rendered, during streaming SSR the resolved async component (`async setup()`/`defineAsyncComponent`) is streamed out via the Suspense boundary; added `route-rules.test.ts` (ppr field matching/specificity/merge), `islands-registry.test.ts` (server:defer transform + fallback extraction), `ssr/test/ppr.test.ts` (Suspense streaming integration), `prerender.test.ts` (ppr route auto-discovery); aligns with Next.js 16 PPR / Astro 5 `server:defer` |

#### P1 Important (SEO and cache alignment)

| ID | Task | Status | Dependency | Notes |
| --- | --- | --- | --- | --- |
| P9-05 | File-convention SEO | ✅ | - | `@ubean/seo/conventions`: `SEO_CONVENTIONS` descriptor table (`sitemap`/`robots`/`manifest`/`opengraph-image`/`icon`/`apple-icon`) + `discoverSeoConventions()`/`registerSeoConventions(app,{srcDir})`/`listSeoConventions()` runtime scanner (`fs.access` + dynamic `import`); sitemap/robots/manifest wrapped with `create*Response`, image-convention handlers return `Response` directly; `enabled`/`disabled` filter + multi-extension candidates (`.ts/.js/.mjs/.mts/.cjs`); 20 unit tests |
| P9-06 | Dynamic OG Image generation | ✅ | - | `@ubean/seo/og-image`: `ImageResponse` class (aligns with Next.js, uses `ReadableStream` for lazy rendering) + `renderOgImage(input,options)`/`renderArticleOgImage(input,options)` one-step rendering + `renderToImage(node,options)` low-level rendering + `defaultTemplate(input)`/`articleTemplate(input)` Satori VDOM templates (gradient background/adaptive title font-size/optional description/site name/logo/author date) + `shadeColor(hex,percent)` color lighten/darken + `loadDefaultFont()`/`loadFontFromUrl(url,name,weight,style)`/`loadFontFromFile(path,name,weight,style)` font loading helpers + `isOgImageSupported()` capability detection; `satori`/`@resvg/resvg-js` are optional peer deps, loaded via runtime dynamic `import()`, friendly guidance error when not installed; 35 unit tests |
| P9-07 | JSON-LD / Schema.org structured data | ✅ | - | `@ubean/seo/json-ld`: `defineJsonLd(schema)` pure-function definition + `useSchemaOrg(schema)` Vue composable (injects head via `globalThis.__UBEAN_HEAD__`, silently degrades outside Vue context) + `renderJsonLdScript(schema)`/`renderJsonLdScripts(schemas)` serializes to `<script type="application/ld+json">` tags (auto-escapes `<`/`>`/U+2028/U+2029) + `mergeJsonLd(schemas)` merges into a `@graph` array (same `@context` auto-hoist) + `schemaOrg.{organization,website,article,breadcrumb,product}` factory functions; 18 unit tests |
| P9-08 | Component-level cache directives | ✅ | - | `@ubean/server/cache-directive`: `cacheLife(seconds)`/`cacheTag(...tags)` macros (pass scope via `AsyncLocalStorage`, no-op outside cache context) + `wrapWithCache(fn,options)` cache wrapper (Vite plugin injected) + `revalidateTag(tag)`/`revalidateTags(...tags)`/`revalidatePath(pattern)` invalidation API + `useComponentCacheStore(store?)`/`createComponentMemoryStore(maxEntries)` standalone `ComponentCacheStore` (stores JSON-serializable values, with tag reverse index, decoupled from HTTP response `CacheStore`); `@ubean/server/vite`: `ubeanCacheDirectivePlugin()` Vite plugin detects `"use cache"` directive (first line of async function body), AST-transforms to `wrapWithCache()` call (supports function declarations/arrow functions/exports, multi-function, custom cache keys); not transformed on client (browser-side `cacheLife`/`cacheTag` are no-ops); integrated into the default `ubean/vite` plugin composition; 56 unit tests |
| P9-09 | Global Hooks (handle/handleFetch/handleError) | ✅ | - | `@ubean/app/hooks`: `Handle`/`HandleFetch`/`HandleError` types + `HandleEvent`/`HandleInput`/`HandleFetchInput`/`HandleErrorInput` contexts + global registry (`setGlobalHooks`/`getGlobalHooks`/`clearGlobalHooks`) + `createHandleEvent` (extracts request/clientAddress/requestId from Hono Context) + `extractErrorMessage` (404→"Not Found"/5xx→"Internal Server Error"/4xx→error.message, sanitized) + `wrapResolve` (wraps Hono `next()` as `resolve(event)`) + `applyHandleHook` (registered first in the middleware chain, zero-overhead `next()` when no hook) + `applyHandleFetchHook` (wraps `setInternalFetcher`, intercepts `internalFetch`/`createInternalAdapter`) + `applyHandleErrorHook` (fire-and-forget call inside `onError`); `defineServer({ globalHooks })` config + `mergeServerConfigs` auto-merges shared + mode-specific; `app.ts` integrates `handle` into `_setupBaseMiddleware`, `handleError` into `onError`; 30 unit + integration tests |
| P9-10 | Platform preset completion (merged P5-06) | ✅ | - | `@ubean/preset` adds 4 presets: `vercelPreset`/`vercelEdgePreset` (Serverless + Edge, `VERCEL_CAPABILITIES`/`VERCEL_EDGE_CAPABILITIES`, `exportConditions:['vercel']`, `generateVercelConfig`/`serializeVercelConfig`), `netlifyPreset` (Serverless Functions, `NETLIFY_CAPABILITIES`, `exportConditions:['netlify']`, `generateNetlifyConfig`/`serializeNetlifyConfig`), `bunPreset` (Bun native TS + `bun:sqlite`, `BUN_CAPABILITIES`, `exportConditions:['bun']`, `generateBunfigConfig`/`serializeBunfigConfig`), `denoPreset` (Deno KV/cron/Queue, `DENO_CAPABILITIES`, `exportConditions:['deno']`, `generateDenoConfig`/`serializeDenoConfig`); all `extends:'node'` inheriting the base config; `detect.ts` enhanced: config file detection (`vercel.json`/`netlify.toml`/`deno.json`/`deno.jsonc`) + env var detection (`VERCEL`/`NETLIFY`/`globalThis.Deno`/`globalThis.Bun`/`process.versions.bun`) + `package.json` dependency detection (`vercel`/`@vercel/*`/`netlify-cli`); `listDetectablePresets()` returns the new presets; `index.ts` registers them into `builtinPresets` and exports; 60 unit tests (capability matrix/inheritance/config generation/serialization/detection/registration) |

#### P2 Enhancement (completeness improvements)

| ID | Task | Status | Dependency | Notes |
| --- | --- | --- | --- | --- |
| P9-11 | Generic Sessions API | ✅ | - | `@ubean/server/sessions`: `createSessionMiddleware(options)` supports cookie mode (signed cookie stores session data) and storage mode (session ID in cookie, data in server-side `SessionStore`); `createStorageSessionStore(storage?,prefix?)` session store based on `UbeanStorage`; `useSession(c)` gets session from Hono Context; `Session<T>` interface (get/set/delete/has/all/save/destroy/isDirty/isDestroyed); custom cookie name/TTL/cookie options/ID generator/secret/exclude paths; safe methods auto-create session, dirty session auto-saves after response, destroyed session auto-clears cookie; 30 unit tests |
| P9-12 | CSRF protection middleware | ✅ | - | `@ubean/server/csrf`: `createCsrfMiddleware(options)` double-submit cookie mode (default)/origin validation/both modes; safe methods (GET/HEAD/OPTIONS/TRACE) auto-set cookie; unsafe methods validate token in header (`x-csrf-token`)/form body (`csrfToken`); supports custom cookie/header/field names, token generator, exclude paths, error handler; `generateCsrfToken(length)`/`defineCsrf()` alias; 39 unit tests |
| P9-13 | Security headers (CSP/HSTS/X-Frame-Options) | ✅ | - | `@ubean/server/security-headers`: `createSecurityHeadersMiddleware(options)` precomputes headers (zero runtime overhead); CSP (`ContentSecurityPolicyDirectives` serialization + report-only mode + `serializeCsp()` utility), HSTS (maxAge/includeSubDomains/preload), X-Frame-Options (DENY/SAMEORIGIN), X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener/Embedder/Resource-Policy; all individually disableable (false); supports exclude paths + extraHeaders; 39 unit tests |
| P9-14 | `after()` post-response execution API | ✅ | - | `@ubean/server/after`: `after(callback)` registers post-response callbacks (logging/analytics/cache invalidation); `createAfterMiddleware()` middleware uses `AsyncLocalStorage` to provide request scope (Node.js) or fallback Map (non-Node); fire-and-forget execution after response sent (queueMicrotask/waitUntil/setTimeout); does not block TTFB; `flushAfterCallbacks(c)` manual execution; `getAfterCallbackCount(c?)` test helper; callback errors silently caught; 30 unit tests (incl. P9-11/P9-15) |
| P9-15 | Request memoization (fetch auto-dedup) | ✅ | - | `@ubean/server/fetch-memo`: `createFetchMemoizationMiddleware(options)` wraps `globalThis.fetch` within the request scope, auto-deduplicates identical GET URLs (Response clone); POST/PUT/PATCH/DELETE not memoized; 5xx responses not cached (allows retry); `exclude` function for custom URL exclusion; original fetch restored after request ends; `createMemoizedFetch(options)` manually creates a memoized fetch (no middleware dependency, supports TTL); 30 unit tests (incl. P9-11/P9-14) |
| P9-16 | Single-flight mutations | ✅ | P9-02 | `@ubean/server/single-flight`: `createSingleFlightMiddleware(options)` maintains a request-scoped revalidation context via `AsyncLocalStorage`; `defineRevalidation(key, fetcher)` registers per-key dedup revalidation functions; `invalidate(...keys)`/`invalidateKey(key)` marks invalidation (accumulated within request, fire-and-forget after response, avoiding post-mutation waterfalls); `runRevalidation(key)` manual trigger; `getInvalidatedKeys()` test helper; `skip` option skips middleware; aligns with SolidStart `action`/`revalidate` pattern; 26 unit tests |
| P9-17 | Nested layouts (multi-layer) | ✅ | - | `definePage({ layout: ['default', 'admin', 'dashboard'] })` supports multi-layer nested layouts (outer→inner); type extended `PageMeta.layout`/`ScannedPageRoute.layout`/`RouteMeta.layout` to `string \| string[] \| false`; `extractDefinePageFromCode` extracts array layouts (filters non-string items, 'default' inside array kept as a literal layout name); `createVuePagesVirtualModule` and generator serialize array layouts; `@ubean/runtime/app.ts` adds `LayoutChainRenderer` recursive component + `LAYOUT_CHAIN_KEY` provide/inject, `PageView` renders the next layout layer when the layout chain has not ended, the innermost `<PageView />` renders the actual page; `normalizeLayoutNames` uniformly handles string/array/false/undefined; fully backward compatible (single-layer string behavior unchanged); 20 unit tests (routing 11 + vite 9) |
| P9-18 | Parallel routes / Intercepting routes | ✅ | - | `@ubean/routing`: `extractSlotAndIntercept(fileBase)` parses `@slotName/` parallel route segments (stripped from path, recorded as `slot` metadata) and `(..)target`/`(.)target`/`(...)target` intercepting route segments (records `interceptFrom`/`interceptTarget`); `ScannedPageRoute` extended with `slot`/`interceptFrom`/`interceptTarget` fields; `scanPages` integrates the extraction logic; `@ubean/vite` virtual module groups parallel routes by path into Vue Router named views (`components: { default, slotName }`), intercepting routes registered as `__intercept_`-prefixed standalone routes (with `isIntercepting`/`interceptFrom`/`interceptTarget` meta); `@ubean/runtime` adds `SlotView` global component (`<SlotView name="modal" />` renders named views, based on Vue Router named views); aligns with Next.js `@folder` slots + `(..)` interception; 23 unit tests (routing 14 + vite 9) |
| P9-19 | Live Content Collections | ✅ | - | `@ubean/content/live`: `defineLiveCollection(options)` fetches external data (CMS/API/DB) at request time; `LiveCollectionLoader(params)` async loader function + `LiveCollectionEntry` (`_id`/`_path`); `LiveCollection` interface (`list()`/`getItem()`/`query()`/`invalidate()`); TTL in-memory cache (`LiveCollectionCacheOptions` + custom cache key generator); `validateEntry` lightweight schema validation (required fields + basic types, lenient mode: warn but don't reject); lazy query builder (supports where/sort/limit/skip/only/without/find/findOne/findSurround/count); global registry (`getLiveCollection`/`listLiveCollections`/`clearLiveCollections`); aligns with Astro 5.10+ Live Collections; 26 unit tests |
| P9-20 | Real MDX compilation | ✅ | - | `@ubean/markdown/mdx`: `compileMdx(source, options)` uses `@mdx-js/mdx` (optional peer dep) to compile MDX into a Vue component JS module; `jsxImportSource:'@ubean/markdown'` makes the output import `jsx`/`jsxs`/`Fragment` from `@ubean/markdown/jsx-runtime` (mapped to Vue `h()`); `@ubean/markdown/jsx-runtime`: Vue-compatible JSX runtime (`jsx(type,props,key)`/`jsxs`/`Fragment`, based on `vue`'s `h`); `@ubean/markdown/vite-plugin`: `ubeanMdxPlugin(options)` Vite plugin (`enforce:'pre'`, transforms `.mdx` files, HMR full-reload); enabled by `markdown.mdx: true`; `markdown.remarkPlugins`/`rehypePlugins` config passed through; MDX v3 compatible (VFile-like input with `path`, removed `filepath` option); falls back to plain markdown + `v-html` Vue component when `@mdx-js/mdx` is not installed; `vite.config.ts` multi-entry build (index/mdx/jsx-runtime/vite-plugin); 21 unit tests |
| P9-21 | Color mode (light/dark) | ✅ | - | `@ubean/runtime/color-mode`: `useColorMode()` composable returns `{ preference, value, unknown, forced, set, toggle }`; `getColorModeScript(config)` generates a no-FOUC inline script (injected into `<head>`, synchronously sets `<html>` class or `data-color-mode` attribute before browser paint); `configureColorMode(config)` global config; `forceColorMode(mode)`/`unforceColorMode()` forced mode (route meta); dual cookie + localStorage persistence (SSR + client); `prefers-color-scheme` system preference detection + `matchMedia` live listening; custom modes (e.g. `['light','dark','sepia']`)/classPrefix/classSuffix/dataValue; `colorMode: false` to disable; Vite plugin `transformIndexHtml` auto-injects script; auto-imports preset includes `useColorMode`; 35 unit tests |
| P9-22 | Third-party script optimization (Partytown integration) | ✅ | - | `@ubean/runtime/party-town`: `useScript(src, options)` composable supports four loading strategies (`'load'`/`'idle'`/`'visible'`/`'manual'`); `partytown: true` sets `type="text/partytown"` to move scripts into a Web Worker, not blocking the main thread; `getPartyTownScript(config)` generates an inline config script (injected into `<head>`, sets `window.partytown` + loads partytown.js lib); `configurePartyTown(config)`/`isPartyTownEnabled()` global config; supports forward (forward main-thread calls like `dataLayer.push`)/mainAccess/debug/logScriptExecution/nonBlocking/libPath; `resolvePartyTownConfig()` merges defaults; Vite plugin `transformIndexHtml` auto-injects config script; `partyTown: true`/`false`/object config; auto-imports preset includes `useScript`; 39 unit tests |
| P9-23 | Draft / Preview mode | ✅ | - | `@ubean/server/draft-mode`: `createDraftModeMiddleware(options)` uses a signed cookie (`ubean_draft_mode` default) to enable draft mode; `enableDraftMode(c)`/`disableDraftMode(c)` toggle via `Set-Cookie` (secret + HMAC-SHA256 signature, tamper-proof); `isDraftMode(c)`/`useDraftMode(c)` read state; `defineDraftMode()` alias; supports custom cookie name, secret, cookie options, `enableOnAuthorize` hook (for custom auth logic, e.g. based on user role), exclude paths; aligns with Next.js `draftMode()` / Astro preview mode; 26 unit tests |
| P9-24 | Streaming metadata | ✅ | P9-01 | `@ubean/ssr`: `renderToStreamFn` captures dynamic head tags added by components via `useHead()`/`useSeoMeta()` during streaming render; `collectDynamicHeadTags(head, staticHeadTags)` diffs the static head snapshot taken before streaming starts against the full head after render completes, extracting newly added tags (title/meta/link etc.); dynamic tags are injected after the app HTML stream ends but before the tail, and the browser automatically moves `<meta>`/`<title>`/`<link>` into `<head>`; SEO crawlers and social bots see the full metadata (og:title/canonical etc.) without waiting for client hydration; aligns with Next.js streaming metadata; 4 unit tests |
| P9-25 | Email sending | ✅ | - | `@ubean/server/email`: provider abstraction layer + 4 built-in providers (`log` console output/`mock` in-memory capture/`smtp` nodemailer bridge/`sendmail` system sendmail); `defineEmailProvider(config)` definition + `createEmailTransport()` factory + `setDefaultEmailProvider()`/`useEmailProvider()` global management; `sendEmail(options)` one-stop API (auto-resolves provider + transport); `EmailOptions` (from/to/cc/bcc/subject/text/html/attachments/replyTo) + `EmailAttachment` (filename/content/contentType/cid/path); `renderEmailTemplate(template, data)` simple `{{key}}` template rendering; `getSentEmails()`/`clearSentEmails()` mock test helpers; SMTP/sendmail lazy-loaded via dynamic `import()`, friendly error when not installed; 37 unit tests |
| P9-26 | Full-text search (Pagefind integration) | ✅ | - | `@ubean/runtime/search`: `useSearch(options?)` composable returns `{ query, results, loading, error, ready, search, clear, preload }`; built-in debounce (default 150ms, configurable), limit (default 10), filters; `initPagefind(options)` dynamically loads `/pagefind/pagefind-modern.js` (caches promise, retryable on failure); `executeSearch(query, options)` low-level search API (normalized `SearchResult` with url/excerpt/meta/score/wordCount); `configureSearch(config)`/`resolveSearchConfig(config)` global config; `_setPagefindMock(mock)` test helper; `@ubean/vite`: `ubean:pagefind` plugin `closeBundle` hook runs Pagefind CLI (`npx pagefind --site <dir>`) after build to generate the index, friendly warning when not installed; `search: true/false/object` config (enabled/site/indexPath/glob/excludeSelectors/verbose); auto-imports preset includes `useSearch`; aligns with Astro Pagefind; 26 unit tests |
| P9-27 | Analytics (page view stats) | ✅ | - | `@ubean/server/analytics`: provider abstraction + 3 built-in providers (`log` console/`memory` in-memory/`mock` testing); `defineAnalyticsProvider(config)`/`registerAnalyticsProvider()`/`setGlobalAnalyticsProvider()` global management; `trackPageView(path?, properties?)`/`trackEvent(name, properties?)`/`trackRaw(record)` top-level API; `extractAnalyticsContext(c)` extracts from Hono Context (url/referrer/userAgent/ip/locale/userId); `createAnalyticsMiddleware(options)` auto page view tracking (GET + text/html + non-exclude paths), still records when handler throws; `useAnalytics(c)` gets provider from Context; supports multi-provider parallel + `before`/`after` hooks; 47 unit tests |
| P9-28 | A/B testing / Feature flags | ✅ | - | `@ubean/server/feature-flags`: boolean flag (`defineFeatureFlag(name, options)`) + multi-variant experiment (`defineExperiment(name, options)`); `createMemoryFeatureFlagStore()` + `setGlobalFeatureFlagStore()` global store; `evaluateFlag(name, context?)`/`evaluateFlagWithReason(name, context?)` returns value + evaluation reason; `getVariant(name, context?)`/`getVariantAssignment(name, context?)` multi-variant assignment (based on `userId`/`anonymousId` + SHA-1 consistent hashing, percentage bucketing); `SegmentRule`/`Segment` user segmentation (attribute/in/operator/not/and/or combinational rules); `createFeatureFlagsMiddleware(options)` injects context (extracts userId/anonymousId/attributes from cookie/header); `useFlags(c)`/`useExperiments(c)`/`useFlagContext(c)` Context helpers; supports percentage rollout + segment targeting; 61 unit tests |

### Pending Tasks (non-Phase 9)

| ID | Task | Status | Priority | Notes |
| --- | --- | --- | --- | --- |
| P5-06 | ~~Follow-up platform proposals~~ | — | — | Merged into P9-10, no longer tracked separately |

> For task details of each completed phase (P1-01 ~ P8-06), see git history; this table only retains currently active pending items.

---

### Decided Items (formerly TBD)

| ID | Item | Decision | Plan | Corresponding Task |
| --- | --- | --- | --- | --- |
| TBD-01 | DevTools client UI solution | ✅ Decided | UI fully implemented with @soybeanjs/ui (Table component natively supports virtual scrolling, no extra table library needed); code editor uses **CodeMirror 6** (lightweight ~200KB, modular, designed for embedded scenarios, far better than Monaco's ~3MB for the DevTools iframe), supports JSON/JS/Vue syntax + One Dark theme | P6-25 |
| TBD-02 | Queues design | ✅ Decided | References void's Proxy dynamic binding pattern but abstracted cross-platform: `queues/` directory + `defineQueue<T>()` to define queues, each preset injects platform drivers (Node=BullMQ/in-memory, CF=Queues, Vercel=Queues, Bun=Worker, Deno=Queue), auto-generates `.ubean/queues.d.ts` types | P6-22 |
| TBD-03 | Islands architecture implementation | ✅ Decided | References void's compile-time islands scanning approach, but uses **Astro-style** **`client:*`** **directives** (`client:load/idle/visible/media/only`) more idiomatic for Vue, instead of Import Attributes; scans `client:*` directives at compile time to automatically mark island components, pages without islands send no client JS. **v1.0 enhancement**: auto component registration — Vite plugin scans `client:*` directives + resolves `<script setup>` imports, generates `virtual:ubean-islands-registry` virtual module, the `components` parameter of `hydrateIslands` becomes optional (manual pass takes precedence) | P6-18 |
| TBD-04 | Internationalization (i18n) integration | ✅ Decided | Neither void nor nitro has built-in i18n; ubean builds in lightweight i18n: `locales/` directory + `defineLocale()` to define messages, supports `prefix/prefix_except_default/no_prefix` routing strategies, `useI18n()` composable, `<Link>` auto-handles locale prefixes | P6-21 |
| TBD-05 | Auth plugin solution | ✅ Decided | References void's Better Auth integration pattern, provided as an official plugin `ubean-auth` (not built into core): registers `/api/auth/*` routes, provides `useAuth()` composable, `c.get('user')` to get user, works with `meta.public` for route auth | P6-23 |
| TBD-06 | Markdown/MDX support | ✅ Decided | **Built-in** Markdown pages: `pages/**/*.md` mixed with `.vue` pages, `front-matter` parses YAML frontmatter, [`markdown-exit`](https://github.com/serkodev/markdown-exit) (a TS rewrite of markdown-it, natively async) renders the body, integrates Shiki code highlighting via `@shikijs/markdown-exit`, supports embedding Vue components with islands client directives; MDX optionally enabled (`markdown.mdx: true`) | P6-17 |
| TBD-07 | Component auto-imports | ✅ Decided | **Built-in** and enabled by default, controlled via config: Composables auto-imported via `unimport` (`composables/` directory), Vue components auto-imported via `unplugin-vue-components` (`components/` directory), auto-generates `.d.ts` type files | P6-19/P6-20 |
| TBD-08 | Type-safe Link component | ✅ Decided | **Typed**: the `to` prop of the `<Link>` component is constrained to the `RouteName` union type, `:params` type inference matches route params, types auto-updated when CLI/DevTools modify routes | P6-24 |
| TBD-09 | Icon extension | ✅ Decided | References **Nuxt Icon** as the primary reference, implements standalone `@ubean/icon`: based on Iconify on-demand collections and local SVG collections, default SVG output, static scanning/explicit declaration written into the client bundle; Node SSR can serve locally on demand, SSG, edge and testing use offline bundles or explicit remote providers, fallback to public Iconify API forbidden in production by default | P6-26 |
| TBD-10 | Page data protocol | ✅ Decided | References SvelteKit: loader declares logical dependencies via `depends()`, action does precise refresh via `invalidate`; same-origin calls prefer `internalFetch`, non-critical data uses defer/stream, preset must declare stream or buffered fallback semantics | P4-20 |
| TBD-11 | Observability and SEO | ✅ Decided | References Next.js: `@ubean/observability` takes request ID, Hookable spans and OpenTelemetry adapter as boundaries; on top of Head management provides structured metadata, sitemap/robots/manifest and optional OG image generation | P3-17/P3-18 |
| TBD-12 | Image/Content/Fonts/PWA | ✅ Decided | Image, Content, Fonts reference Nuxt Image, Nuxt Content v3, Nuxt Fonts as primary references respectively, all official optional extensions; PWA remains opt-in. See [Ecosystem Evolution](ecosystem.md) for detailed API, boundaries, deferred items and acceptance | P6-27~P6-30 |
| TBD-13 | Vite modular architecture | ✅ Decided | References the Nuxt modules pattern: dev server migrated to Vite middleware mode (`vite.middlewares` connects to Connect), users declare plugins via the `modules` field of `ubean.config.ts` (supports string/tuple/instance forms), the framework auto-wires built-in ubean plugins and user modules; official extension packages provide top-level config sugar (`icon`/`pwa`/`auth`/`image`/`fonts`); Vite SSR dual-build output adapts to Node/Standard/Cloudflare presets; `vite.config.ts` is retained as an advanced customization entry | P6-36~P6-40 |

## Next Steps

- [Framework Comparison](/architecture/framework-comparison) — detailed gap analysis against Next.js, Nuxt, SvelteKit, SolidStart and Astro.
- [Architecture](/architecture/architecture) — framework architecture, data flow, and configuration system.
- [Overview](/architecture/overview) — project overview, tech stack and directory structure.
- [Ecosystem](/architecture/ecosystem) — extension package evolution and boundaries.
