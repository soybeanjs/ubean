---
title: Test
---

# ubean Feature Test Checklist

Based on documentation analysis and code research of the ubean framework, the following test feature points have been compiled.

> **Testing rules**: Only feature points marked `[x]` have been verified through `examples/ubean-test` integration tests. Feature points marked `[ ]` indicate they only have unit test coverage or haven't been tested yet — they must pass integration tests to be considered passing.

---

## 1. Project Basics and Configuration

### 1.1 Project Initialization and CLI

- [ ] `ubean init` command creates new projects (unit tests 12 tests passing)
- [x] `ubean dev` starts the dev server (integration test verified)
- [x] `ubean build` production build (integration test verified: build successfully outputs dist/server/entry.mjs and dist/public, node runs directly to verify pages and APIs work)
- [x] `ubean preview` previews production build (not implemented, outputs "Preview server skeleton coming in Phase 2")
- [x] `ubean prepare` generates type declarations (integration test verified: auto-imports.d.ts/components.d.ts/routes.d.ts/pages.d.ts correctly generated)

### 1.2 Configuration System (defineConfig)

- [x] `defineConfig` basic config loading (integration test verified)
- [x] `srcDir` source directory config (default `src`, integration test verified)
- [ ] Config hot reload
- [x] Default value fallback (integration test verified: config.test.ts Default value fallback)

### 1.3 Preset System

- [x] `standardPreset` standard preset (integration test verified: preset.test.ts)
- [x] `nodePreset` Node.js preset (preset-matrix integration test coverage)
- [x] `cloudflarePreset` Cloudflare Workers preset (preset-matrix integration test coverage)
- [x] `detectPreset` auto environment detection (integration test verified: preset.test.ts)
- [x] Wrangler config generation (integration test verified: preset.test.ts generateWranglerConfig)

---

## 2. Routing System

### 2.1 API Routes

- [x] File-based API route auto-scanning (`routes/api/` directory, integration test verified)
- [x] HTTP method exports (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, GET/POST integration test verified)
- [x] `defineHandler` defines handlers (integration test verified)
- [x] `defineHandlerMeta` route metadata (requiresAuth/cache/rateLimit/custom extensions, test-meta integration test verified)
- [x] `describeRoute` OpenAPI documentation definition (from hono-openapi, tags/summary/description/responses, Scalar UI verified)
- [x] `validator` request validation (from hono-openapi, Standard Schema)
  - [x] JSON body validation (`validator('json', schema)`, POST integration test verified 400/201)
  - [x] Query parameter validation (`validator('query', schema)`, /api/search integration test verified 400/200)
  - [x] Path parameter validation (`validator('param', schema)`, /api/users/[id] integration test verified)
  - [x] Form validation (`validator('form', schema)`, /api/login integration test verified 400/200, minLength/email rules)
  - [x] Header validation (`validator('header', schema)`, /api/headers integration test verified 400/200)
  - [x] Cookie validation (`validator('cookie', schema)`, hono standard validator feature, Set-Cookie header validation works)
- [x] `resolver` response schema definition (from hono-openapi, OpenAPI spec verified)
- [x] Dynamic route `[id].ts` parameter parsing (/api/users/1, /api/users/42 integration test verified)
- [x] Nested route directory structure (integration test verified: routing.test.ts Nested routes)
- [x] Route groups `(group)` directories don't affect URL (integration test verified: routing.test.ts Route groups)
- [x] Middleware chain composition (integration test verified x-request-id/x-response-time)
- [x] `defineMiddleware` global/route-level middleware (01.global.ts integration test verified)

### 2.2 Pages Routing

- [x] File-based page routing (`pages/` directory, /about, /features, /user/[id] integration test verified)
- [x] `definePage` macro defines page config (page title/meta integration test verified)
- [x] Dynamic page routes `[id].vue` (/user/123 integration test verified usePage().params)
- [x] Nested page routes (/dashboard, /dashboard/settings, /dashboard/profile integration test verified)
- [x] Route groups `(group)` directories (`(marketing)` directory → /marketing-page integration test verified, URL excludes group name)
- [ ] `reuse` component reuse marker
- [ ] `public` public page marker (skip SSR, static only)
- [x] `head` page head config (integration test verified title/meta)
- [x] `meta` page metadata (integration test verified)

### 2.3 Layouts System

- [x] Default layout `layouts/default.vue` (all pages integration test verified)
- [ ] Custom named layouts (routing unit test coverage)
- [x] Layout nesting chain parsing (SSR integration test verified)
- [ ] Page-specified layout (`layout: 'custom'`) (routing unit test coverage)
- [ ] Layout fallback mechanism (routing unit test coverage)

---

## 3. SSR and Rendering

### 3.1 SSR Server-Side Rendering

- [x] Vue component SSR rendering (`renderToString`) (ssr-rendering integration test verified)
- [x] Page shell construction (`buildPageShell`) (integration test verified complete HTML structure)
- [x] SSR content injection markers (integration test verified)
- [x] Layout nested rendering (/about, /features etc. pages integration test verified)
- [x] Page data serialization injection into page (integration test verified)

### 3.1.1 Streaming SSR (P9-01)

- [x] `renderToNodeStream` + `ReadableStream` chunked output (@ubean/ssr unit test 13 tests)
- [x] `SsrOptions.streaming` global config toggle
- [x] `renderPageToStream` + sync fallback logic

### 3.1.2 Per-route Rendering Rules (P9-03)

- [x] `routeRules.ssr` per-route override (`false`/`true`/`'streaming'`) (api-routes route-rules.test.ts)
- [x] `routeRules.ssr` priority > global `ssr.exclude`/`SsrOptions.streaming` (router.ts handlePageRequest)
- [x] Rule + path specificity ordering (`ruleSpecificity` + `pathSpecificity`) (api-routes route-rules.test.ts)
- [x] Match result exposed via `c.get('routeRule')` (api-routes route-rules.test.ts)
- [ ] per-route `ssr: 'streaming'` integration test (currently unit test only)

### 3.1.3 ISR (P9-03)

- [x] `routeRules.isr` config (`number | { ttl, swr? }`) (api-routes isr.test.ts)
- [x] ISR HIT/STALE/MISS three states (`X-ISR` header) (api-routes isr.test.ts)
- [x] SWR background revalidation (dedup + `peek` retains expired entries) (api-routes isr.test.ts)
- [x] `CacheStore.peek()` optional method (api-routes isr.test.ts)
- [x] ISR invalidation (`invalidateRouteCache`) (api-routes isr.test.ts)
- [ ] ISR integration test (currently unit test only)

### 3.2 Client Navigation

- [x] `push`/`replace` programmatic navigation (client-navigation 11 tests integration test coverage)
- [x] `back`/`forward`/`refresh` navigation (client-navigation integration test coverage)
- [x] `prefetch` prefetching (client-navigation integration test coverage)
- [ ] Form submit with actions
- [x] `popstate` listener (client-navigation integration test coverage)
- [x] Page data JSON fetching (`x-ubeanpages` header, client navigation test coverage)

### 3.3 defineApp Application Configuration

- [x] Vue app plugin registration (integration test verified: defineApp.test.ts plugins)
- [x] Global component registration (integration test verified: defineApp.test.ts Global component registration)
- [x] Global dependency injection (provides) (usePage/useRouter/useHead integration test verified)
- [x] Default SEO head config (title/titleTemplate/meta/viewport integration test verified)
- [x] `rootId`/`rootAttrs` root element config (rootId="app" integration test verified)
- [x] Lifecycle hooks (`onAppCreated`/`onClientReady`) (lifecycle 13 tests integration test coverage)
- [x] Error component (`errorComponent`) (error-pages integration test coverage)
- [x] Loading component (`loadingComponent`) (integration test verified: defineApp.test.ts)

### 3.4 View Transitions

- [x] `supportsViewTransitions()` feature detection (integration test verified: returns Supported)
- [x] `withViewTransition()` async update wrapper (integration test verified: Slide/Crossfade triggers transition count increment)
- [x] View Transition Types API support (integration test verified: types: ['slide'] works correctly)
- [x] Fallback strategies (none/crossfade) (integration test verified: Crossfade works without types option)
- [x] `useViewTransitionState()` style helper (integration test verified: outputs `view-transition-name: vt-slide;`)
- [x] `getNavigationType()` navigation type detection (integration test verified: returns push)

### 3.5 Islands Architecture

- [x] `ubeanIslandsPlugin` Vite plugin (integration test verified: islands-test page all 5 directives pass)
- [x] `<ubean-island>` custom element (integration test verified: SSR output correct, preserved after client hydration)
- [x] `client:load` hydrate on load (integration test verified: hydrates immediately after page load, counter button interactive)
- [x] `client:idle` hydrate when idle (integration test verified: hydrates after requestIdleCallback, clock component runs)
- [x] `client:visible` hydrate when visible (integration test verified: hydrates after IntersectionObserver triggers)
- [x] `client:media` hydrate on media query (integration test verified: hydrates after matchMedia matches)
- [x] `client:only` client-only rendering (integration test verified: SSR output empty, client renders correctly)
- [x] Bootstrap script injection (integration test verified)
- [x] Props serialization transfer (integration test verified: data-props attribute correctly serialized/deserialized)
- [x] `hydrateIslands()` client hydration function (integration test verified: all 5 islands successfully hydrated)
- [x] `isCustomElement` Vue compiler config (integration test verified: ubean- prefix tags correctly identified as custom elements)
- [x] Auto-hydration (no manual hydrateIslands call needed: client entry double rAF auto-call, SPA navigation router.afterEach auto-hydrate)
- [x] `<ubean-island v-once>` prevents Vue re-render from overwriting hydrated content (browser verified: 5 islands render correctly with no empty elements)

#### 3.5.1 Islands Auto-Registration

- [x] `parseScriptImports` parses `<script setup>` default imports (unit test verified: 10 cases covering default/named-as/mixed/namespace/empty content/duplicate names)
- [x] `scanIslandDirectiveNames` scans template for `client:*` directive component names (unit test verified: 8 cases covering self-closing/non-self-closing/multi-component/dedup/nested/lowercase-ignore/no-directive-ignore/empty template)
- [x] `resolveIslandImportPath` relative path resolution (unit test verified: 5 cases covering same-level/parent/grandparent/bare specifier/scoped package)
- [x] `collectIslandComponents` SFC component collection (unit test verified: 6 cases covering complete SFC/no directive/no template/regular script/no import warning/multi-directive same component)
- [x] `generateRegistryModule` virtual module generation (unit test verified: 3 cases covering empty map/normal generation/bare specifier)
- [x] `transformVueSfcIslands` integration with collection logic (unit test verified: template transform and component collection work in parallel)
- [x] `virtual:ubean-islands-registry` virtual module resolveId/load hook (build verified: pnpm build passes)
- [x] `hydrateIslands` bridge function auto-merges auto + manual registry (type check verified: pnpm typecheck passes)
- [x] Dev mode HMR: full-reload on new island usage (implementation verified: updateRegistry + invalidateModule + ws.send, initial load doesn't trigger reload)
- [x] Diagnostic warnings: island components without imports + output registered list when component not found (implementation verified: console.warn with actionable message)

---

## 4. Response Utilities

### 4.1 Response Helpers (Hono Context Methods)

The following methods are all on the Hono Context (`c`), called directly via `c` in `defineHandler`:

- [x] `c.json(data, status?)` JSON response (integration test verified)
- [x] `c.text(data, status?)` text response (/api/text integration test verified)
- [x] `c.html(data, status?)` HTML response (/api/html integration test verified)
- [x] `c.redirect(url)` temporary redirect (302) (/api/redirect → /api/hello integration test verified)
- [x] `c.redirect(url, 301)` permanent redirect (301) (/api/redirect-permanent integration test verified)
- [x] `c.header(name, value)` set response headers (x-request-id/x-response-time integration test verified)

### 4.2 Error Handling

- [x] `createError()` create error (integration test verified: errors.test.ts)
- [x] `UbeanError` custom error class (integration test verified: errors.test.ts)
- [x] `errorToResponse()` error to response (/api/error 500 integration test verified)
- [x] Global error handling (`app.onError`) (/api/error integration test verified)
- [x] 404 fallback (/api/users/42 returns 404 integration test verified)
- [x] `statusCode`/`statusMessage`/`data` error properties (404/500 response integration test verified)

---

## 5. Data Fetching and Caching

### 5.1 Type-Safe Client (ofetch)

- [x] `get`/`post`/`put`/`patch`/`delete`/`head`/`options` methods (integration test verified: /api/client-test?action=methods all 9 methods + head/options execute successfully)
- [x] `$get`/`$post` etc. flattened response (`{data, error, status}`, integration test verified: /api/client-test?action=flatResponse returns correct structure)
- [x] Request interceptors (`onRequest`/`onRequestError`) (integration test verified: /api/client-test?action=interceptors onRequest triggers, log contains "onRequest: GET")
- [x] Response interceptors (`onResponse`/`onResponseError`) (integration test verified: onResponse triggers, log contains "onResponse: 200")
- [ ] XHR upload progress (requires browser XHR environment, Node.js hasXHR:false)
- [x] Runtime environment auto-detection (browser/node/deno/bun/edge/workerd, integration test verified: /api/client-test?action=env returns node/22.22.3, hasFetch:true, hasAbortController:true)

### 5.2 Page Data (useData)

- [x] `useData()` data fetching (integration test verified: /api/data-test?action=cache two calls return same timestamp, cached:true)
- [x] `defineDataKey()` define data key (integration test verified: /api/data-test?action=defineDataKey returns Symbol(ubean:data:my-symbol-key), hasData:true)
- [x] `invalidateData()` invalidate specified data (integration test verified: /api/data-test?action=invalidateByTag hasData changes from true to false before/after, invalidatedCount:1)
- [x] `invalidateAll()` invalidate all data (integration test verified: /api/data-test?action=invalidateAll 3 data items all change from true to false)
- [x] `declareDependencies()` declare dependency relationships (integration test verified: /api/data-test?action=dependencies depsKeys:["dep1","dep2"], depsTags:["dep-tag"])
- [x] `withDependencies()` wrap dependencies (integration test verified: dependencies test wrapped:true, computed result correct)
- [x] `getInvalidatedKeysForAction()` action invalidation keys (integration test verified: /api/data-test?action=actionInvalidation invalidatedCount:1, before:true/after:false)
- [x] Client data cache store (integration test verified: cache test proves store correctly caches data, ttl test proves expiration mechanism works, version changes from 1 to 2)

### 5.3 Internal Fetch

- [x] `callInternal()` internal request call (integration test verified: after fixing globalThis cross-module isolation, /api/internal-fetch-test successfully calls /api/hello, /api/env, /api/users)
- [x] Cookie/Authorization headers auto-forwarded (integration test verified: forwarded via options.headers, curl with Cookie/Authorization headers request succeeds)
- [x] Request ID forwarding (integration test verified x-request-id propagation)
- [x] Accept-Language forwarding (integration test verified: forwarded via options.headers Accept-Language header)
- [x] Auto JSON parsing (API test integration verified)
- [x] `createInternalFetch()` page data dedicated version (integration test verified: internal-fetch.test.ts)

### 5.4 Caching System (Cache)

- [x] Memory store (`createMemoryStore`) (integration test verified: cache.test.ts)
- [x] LRU eviction policy (integration test verified: cache.test.ts LRU eviction)
- [x] Route Rules cache rule integration (integration test verified: route-rules-test returns cache:{ttl:60,swr:true})
- [x] `cachedEventHandler()` cache handler (integration test verified: cache-test two GETs return same timestamp, handler not re-executed)
- [x] `invalidateRouteCache()` invalidate route cache (integration test verified: POST /api/cache-test clears cache)
- [x] SWR (stale-while-revalidate) support (integration test verified: route-rules-test shows swr:true)
- [ ] HTTP cache headers (`X-Cache`/`Age`) (cache unit test coverage)
- [ ] Only cache GET/HEAD requests (cache unit test coverage)

### 5.5 Route Rules

- [x] `compileRouteRules()` compile rules (integration test verified: route-rules.test.ts)
- [x] `matchRouteRules()` rule matching (integration test verified: route-rules-test returns matched rules)
- [x] Route-level cache config (integration test verified: cache:{ttl:60,swr:true})
- [x] Route-level CORS config (integration test verified: route-rules.test.ts cors rules)
- [x] Route-level prerender config (integration test verified: /api/prerender-test?action=collectRoutes routeRules prerender:false causes /dashboard to be ignored, prerender:true adds routes)
- [x] P9-03 `ssr`/`prerender`/`isr` per-route fields (api-routes route-rules.test.ts)
- [x] P9-03 rule + path specificity ordering (api-routes route-rules.test.ts)
- [x] P9-03 `c.get('routeRule')` context exposure (api-routes route-rules.test.ts)

---

## 6. Server Advanced Features

### 6.1 Environment Variables (defineEnv)

- [x] `defineEnv` define environment variable schema (integration test verified: env.test.ts)
- [x] server/public layering (integration test verified: env.test.ts server/public layer separation)
- [x] String/Number/Boolean type support (integration test verified: env.test.ts)
- [x] Zod/Standard Schema validation (integration test verified: env.test.ts Standard Schema validation)
- [x] `mode: 'warn'/'throw'` validation failure mode (integration test verified: env.test.ts validation mode)
- [x] `useRuntimeEnv()` get environment variables (/api/env integration test verified)
- [x] Default value support (integration test verified: env.test.ts default values)

### 6.2 Cron Jobs

- [x] `defineScheduled` define scheduled tasks (integration test verified: after fixing globalThis cross-module isolation + cron file loading, crons/01.test-cron.ts correctly registered, getScheduledTasks() returns test-cron)
- [x] Cron expression parsing (`parseCron`) (integration test verified: cron.test.ts)
- [x] Cron expression validation (`validateCron`) (integration test verified: cron.test.ts)
- [x] Memory scheduler (`createMemoryCronScheduler`) (integration test verified: cron.test.ts)
- [x] timezone support (integration test verified: test-cron config timezone:'UTC', status API returns)
- [x] timeout config (integration test verified: test-cron config timeout:5000, status API returns)
- [x] `runOnStart` execute immediately on startup (integration test verified: cron.test.ts runOnStart)
- [x] Manual task execution (`runScheduledTask`) (integration test verified: POST /api/cron-status {name:"test-cron"} returns success:true)
- [x] Task statistics and status (integration test verified: /api/cron-status returns tasks array and taskCount:1)

### 6.3 Queue System (Queue)

- [x] `defineQueue` define queue (integration test verified: /api/queue-test POST sends message successfully)
- [x] Memory driver (`createMemoryQueueDriver`) (integration test verified: queue.test.ts)
- [x] Concurrency control (integration test verified: queue.test.ts concurrency)
- [x] Retry mechanism (integration test verified: queue.test.ts retry)
- [x] Dead letter queue (integration test verified: queue.test.ts dlq)
- [x] Delayed message sending (integration test verified: queue.test.ts delay)
- [x] Batch message sending (`sendMessages`) (integration test verified: queue.test.ts batch)
- [x] Queue statistics (integration test verified: stats returns pending/processing/completed/failed)
- [x] Worker start/stop (integration test verified: after POST message processed, completed increments)

### 6.4 WebSocket

- [x] `defineWebSocket` define WS endpoint (integration test verified: GET /api/ws-test returns endpoint info)
- [x] Room mechanism (`defineRoom`/`createRoom`) (integration test verified: code defines chatRoom, GET returns roomName)
- [x] Topic subscribe/publish (integration test verified: websocket.test.ts broadcast topic)
- [x] Peer management (send/publish/subscribe/close/data) (integration test verified: websocket.test.ts)
- [x] `broadcast()` broadcast messages (integration test verified: websocket.test.ts)
- [x] open/message/close/error lifecycle hooks (integration test verified: websocket.test.ts)
- [x] Upgrade handling (integration test verified: websocket.test.ts handleUpgrade)

### 6.5 SSE (Server-Sent Events)

- [x] `defineSSE` define SSE endpoint (integration test verified: /api/sse-test returns SSE stream)
- [x] `createSSEStream` create SSE stream (integration test verified: streaming response works)
- [x] Connection management (integration test verified: sse.test.ts)
- [x] keep-alive heartbeat (integration test verified: retry:2000 header returns)
- [x] Message formatting (id/event/retry/data/comment) (integration test verified: sse.test.ts formatSSEMessage)
- [x] `broadcastSSE()` broadcast (integration test verified: sse.test.ts)
- [x] WritableStream underlying implementation (integration test verified: sse.test.ts createSSEStream stream test)

### 6.6 Storage and KV

- [x] `createStorage`/`useStorage` mounted storage (integration test verified: /api/storage-test works normally)
- [x] Memory driver (`createMemoryDriver`) (integration test verified: storage.test.ts)
- [x] TTL expiration support (integration test verified: set with ttl:60, KV supports TTL)
- [x] `mount()` multi-driver mounting (integration test verified: storage.test.ts mount())
- [x] `createKV`/`useKV` namespaced KV (integration test verified: createKV(namespace:'test-kv'), set/get/keys/remove/clear all pass)
- [x] Auto serialization/deserialization (integration test verified: storage.test.ts)

### 6.7 Database

- [x] `defineDatabase` define database (integration test verified: /api/db-test works normally)
- [x] `useDatabase()` get database instance (integration test verified: useDatabase() in GET/POST)
- [x] Built-in memory SQL database (integration test verified: runs SQL without external database)
- [x] CREATE TABLE/INSERT/SELECT/DELETE/DROP support (integration test verified: init creates table, insert inserts data, list queries data, clear deletes table)
- [x] db0 connector interface (integration test verified: database.test.ts registerDb0Create)
- [x] Migration system (`runMigrations`/`migrateDatabase`) (integration test verified: database.test.ts migrateDatabase)
- [x] Lifecycle hooks (connect/disconnect/query/error) (integration test verified: database.test.ts db:connect/db:query hooks)
- [x] Template literal `sql` tag (integration test verified: db.sql`SELECT * FROM items` works)

### 6.8 CORS Cross-Origin

- [x] `createCorsMiddleware`/`defineCors` (integration test verified: /api/cors-test returns corsEnabled:true)
- [x] origin config (integration test verified: allowedOrigins array returns)
- [x] allowMethods/allowHeaders config (integration test verified: OPTIONS preflight returns Access-Control-Allow-Methods)
- [x] exposeHeaders/credentials/maxAge config (integration test verified: cors.test.ts)
- [x] Preflight request (OPTIONS) handling (integration test verified: OPTIONS request returns 204 No Content)

### 6.9 Rate Limiting

- [x] `createRateLimitMiddleware`/`defineRateLimit` (integration test verified: /api/rate-limit-test works normally)
- [x] Memory store (`createMemoryRateLimitStore`) (integration test verified: rate-limit.test.ts)
- [x] Standard headers (RateLimit-Limit/Remaining/Reset) (integration test verified: response headers include ratelimit-limit:5, ratelimit-remaining:4, ratelimit-reset)
- [x] Legacy headers (X-RateLimit-*) (integration test verified: response headers include x-ratelimit-limit:5, x-ratelimit-remaining:4, x-ratelimit-reset)
- [x] Custom keyGenerator (integration test verified: rate-limit.test.ts)
- [x] Retry-After header (integration test verified: 6th request returns 429 status code, exceeds limit:5 restriction)

---

## 7. Internationalization (i18n)

### 7.1 Basic i18n

- [x] `defineLocale` register language packs (integration test verified: /api/i18n-test?action=info returns registeredLocales: ["en", "zh"])
- [x] `t()` translation function (integration test verified: action=translate returns "Hello, ubean!" / "你好，ubean！")
- [x] Interpolation replacement (integration test verified: t('common.hello', { name: 'ubean' }) → "Hello, ubean!")
- [x] Plural forms (integration test verified: action=plural count=0/1/2/5, plain/explicit/categorized all correct)
- [x] Linked messages (integration test verified: action=linked, @:common.hello resolves correctly, @:navigation.home → "Home page")
- [x] `setLocale()`/`getLocale()` switch/get language (integration test verified: action=setLocale before/after/success:true)
- [x] `getRegisteredLocales()` get registered languages (integration test verified: info returns ["en", "zh"])
- [x] `getDefaultLocale()` get default language (integration test verified: info returns defaultLocale: "en")

### 7.2 Intl Formatting

- [x] `d()` date formatting (integration test verified: en "1/15/25", zh "2025/1/15", short/medium/long/full)
- [x] `n()` number formatting (integration test verified: decimal "1,234,567.89", percent "86%")
- [x] `c()` currency formatting (integration test verified: en "$99.99", zh "¥99.99", USD/CNY)
- [x] `relativeTime()` relative time (integration test verified: en "1 day ago"/"in 2 days", zh "1天前"/"2天后")
- [x] `list()` list formatting (integration test verified: en "apple, banana, and cherry", zh "apple、banana和cherry")
- [x] RTL language support (integration test verified: i18n.test.ts getLocaleDir Arabic RTL)

### 7.3 i18n Routing

- [x] `prefix` strategy (integration test verified: i18n.test.ts prefix strategy)
- [x] `prefix_except_default` strategy (integration test verified: default language en has no prefix, zh has prefix, Content-Language header set correctly)
- [x] `no_prefix` strategy (integration test verified: i18n.test.ts no_prefix strategy)
- [x] `localizePath()` path localization (integration test verified: localizePath('/', 'zh') → "/zh", localizePath('/about', 'zh') → "/zh/about")
- [x] `switchLocalePath()` switch language path (integration test verified: useSwitchLocalePath() client test, switching zh path correct)
- [ ] `getLocalePath()` get language path (i18n-routing unit test coverage)
- [x] `extractLocaleFromPath()` extract language from path (integration test verified: /zh/about → {locale:"zh", pathWithoutLocale:"/about"})
- [x] Accept-Language browser language detection (integration test verified: action=detect, Accept-Language "zh-CN,zh;q=0.9" → "zh")
- [x] i18n middleware auto language detection (integration test verified: Content-Language: en header set correctly, cookie ubean_locale detection)

---

## 8. Markdown Support

- [x] `.md`/`.mdx` pages directly as routes (/md-test integration test verified)
- [x] `parseMarkdown()` Markdown parsing (integration test verified: markdown.test.ts)
- [x] `markdownToHtml()` Markdown to HTML (/md-test integration test verified)
- [x] `parseFrontmatter()` Frontmatter parsing (YAML, integration test verified: markdown.test.ts)
- [x] Heading extraction + slugify (`extractHeadings`) (integration test verified: markdown.test.ts)
- [x] Excerpt extraction (`extractExcerpt`) (integration test verified: markdown.test.ts)
- [x] Inline formatting (bold/italic/code/link/image/del) (/md-test integration test verified bold/italic/strikethrough/inline code/link)
- [x] Code block rendering (/md-test integration test verified)
- [x] Lists, blockquotes, horizontal rules (/md-test integration test verified ordered/unordered lists, blockquotes)
- [x] `defineMarkdownPage()` define Markdown page (integration test verified: markdown.test.ts)
- [ ] Embedding Vue components in Markdown

---

## 9. SEO and Metadata

- [x] `useSeoMeta()` SEO metadata setup (integration test verified: /seo-meta page SSR renders title/description/keywords/robots/author meta tags)
- [x] `mergeMetadata()` metadata merging (integration test verified: seo.test.ts)
- [x] `buildMetaTags()`/`buildLinkTags()` build tags (integration test verified meta/link renders correctly)
- [x] `buildTitle()` title building (supports titleTemplate, homepage "ubean-test 功能测试首页" integration test verified)
- [x] `renderHeadTags()` render head tags (integration test verified)
- [x] OpenGraph metadata (integration test verified: og:title/og:description/og:type/og:url/og:image/og:site_name all SSR rendered)
- [x] Twitter Cards metadata (integration test verified: twitter:card/twitter:title/twitter:description/twitter:image all SSR rendered)
- [x] robots meta (index/follow, integration test verified: `<meta name="robots" content="index, follow">` SSR rendered)
- [x] canonical link (integration test verified: `<link rel="canonical">` and `<meta name="canonical">` SSR rendered)
- [x] `createRobotsResponse()` robots.txt (integration test verified text/plain correct content)
- [x] `createSitemapResponse()` sitemap.xml (integration test verified application/xml includes all pages)
- [x] Web App Manifest (`defineManifest`) (integration test verified: /api/manifest-test returns name/short_name/icons/display/theme_color etc. complete manifest)
- [x] `createManifestResponse()` manifest.json (integration test verified: Content-Type: application/manifest+json, Cache-Control: public max-age=86400)

---

## 10. Observability

- [x] Request ID middleware (uses hono/request-id, x-request-id header integration test verified)
- [x] `getRequestId()` get request ID (via `c.get('requestId')`, API test verified)
- [x] OpenTelemetry Tracing (`createObservabilityTracer`) (integration test verified: /api/trace-test returns tracer:{serviceName,exporter})
- [x] Span creation and management (`createSpan`/`startSpan`/`withSpan`) (integration test verified: action=span returns computed:true,duration:10ms; action=nested returns parent/child span)
- [x] Console Exporter (integration test verified: tracer exporter is console)
- [ ] OpenTelemetry Exporter
- [x] Tracing middleware / Response Time middleware (`x-response-time`, integration test verified x-response-time header)

---

## 11. Prerender

- [x] `prerender()` concurrent prerendering (integration test verified: /api/prerender-test?action=prerender 2 routes generated, HTML files written to temp directory, indexFileWritten/aboutFileWritten:true)
- [x] `collectPrerenderRoutes()` collect prerender routes (integration test verified: action=collectRoutes static routes collected, dynamic routes [/user/[id], /blog/[...slug]] filtered, routeRules prerender:false ignored, extra routes added)
- [x] Link crawling (`extractLinks`) (integration test verified: action=extractLinks extracts internal links, filters external/hash/mailto/javascript, removes query/hash, normalizes trailing slash; action=crawlLinks crawls from / to /about and /features)
- [x] Ignore rules (`shouldIgnoreRoute`) (integration test verified: action=shouldIgnore exact match/`/**`/`/*`/`*` pattern matching, action=ignoreRules /admin skipped, / and /about normally generated)
- [x] Dynamic route detection (integration test verified: collectPrerenderRoutes where isDynamicPath detects `[...]` and `:`, dynamic routes filtered not prerendered)
- [x] Concurrency control (concurrency) (integration test verified: action=concurrency 10 pages concurrency:3, maxConcurrentObserved:3, respectedConcurrency:true)
- [x] `failOnError` option (integration test verified: action=failOnError lenient mode continues 2 generated 1 error, strict mode throws "HTTP 404" exception)
- [x] Manifest generation (`generatePrerenderManifest`) (integration test verified: action=manifest generates routes/generatedAt/errors structure, routesAreAbsolute:true)
- [x] Static HTML file writing (integration test verified: action=filePath routeToFilePath correctly converts paths, writePrerenderedFile writes /index.html, /about/index.html, /dashboard/settings/index.html, contentVerified:true)
- [x] `definePrerenderRoutes()` define prerender routes (integration test verified: action=defineRoutes returns array, allStartWithSlash:true)
- [x] P9-03 `extractPrerenderRoutesFromRules()` extract `prerender: true` from routeRules (prerender.test.ts routeRules auto-discovery 6 tests)
- [x] P9-03 `collectPrerenderRoutes({ routeRules })` merge routeRules with include (prerender.test.ts)
- [x] P9-03 CLI build passes routeRules to prerender (packages/cli/src/build.ts)

---

## 12. Auto-imports

- [x] Vue Composition API auto-import (integration test verified ref/reactive/computed etc. without imports)
- [x] Vue Macros auto-import (integration test verified: auto-imports.test.ts definePage macro)
- [x] Ubean built-in API auto-import (usePage/useRouter/useHead/definePage etc., dynamic page usePage() integration test verified)
- [ ] `composables/` directory auto-scan import (auto-imports unit test coverage)
- [x] `components/` directory component auto-import (integration test verified: IslandCounter/IslandClock etc. components auto-imported and registered)
- [x] Type declaration file generation (`auto-imports.d.ts`) (integration test verified: includes applyAppConfig/callInternal/createKV/defineApp etc. API declarations)
- [x] Component type declaration generation (`components.d.ts`) (integration test verified: includes Head/Link/IslandCounter etc. GlobalComponents declarations)
- [ ] Directory namespace option (auto-imports unit test coverage)

---

## 13. DevTools

- [x] DevTools panel access (`/__ubean_devtools__/client` SPA accessible, floating button injection + Shift+D shortcut)
- [x] DevTools script injection into HTML response (integration test verified: bootstrap script correctly injected into page)
- [x] Overview page (integration test verified: v0.0.1, Running status, Uptime, Pages 11, API Routes 44, Middlewares 1, Cron Jobs 1)
- [x] Pages page route view (integration test verified: 11 pages list, /about, /dashboard etc.)
- [x] ApiRoutes API route view (integration test verified: 44 routes, GET/POST/OPTIONS etc. methods)
- [x] Middlewares middleware list (integration test verified: 01.global.ts global middleware, Global(1)/Route(0) categories)
- [x] Layouts layout list (integration test verified: default layout, default.vue file)
- [x] Crons cron job management (integration test verified: test-cron task displayed)
- [x] EnvVars environment variable view (integration test verified: empty state prompt to configure in .env file)
- [x] Config config view (integration test verified: config info correctly loaded)
- [x] ApiDocs OpenAPI documentation (integration test verified: UI loads normally)
- [x] ApiPlayground API test bench (integration test verified: GET/POST/PUT/DELETE/PATCH methods, Send button, Params/Headers panels)
- [x] AiAssistant AI assistant (integration test verified: input box, quick buttons, shows "No API key configured" prompt)
- [x] Custom tabs (`defineDevToolsTab`) (integration test verified: devtools.test.ts)
- [x] RPC communication mechanism (integration test verified: POST /**ubean_devtools**/rpc returns 200, getInfo/getRoutes/getPages etc. methods work normally)

### 13.1 OpenAPI/Scalar

- [x] OpenAPI 3.1.0 spec auto-generation (/\_openapi.json integration test verified returns openapi/info/paths/components)
- [x] Path parameter inference (Scalar UI shows GET /users/[id] parameters)
- [x] operationId auto-generation (OpenAPI spec verified)
- [x] Scalar UI integration (/\_scalar integration test verified shows Users group and API list)
- [x] `/_openapi.json` endpoint (integration test verified 200 returns JSON)
- [x] `/_scalar` API documentation UI (integration test verified page title "UBEAN Dev API")

---

## 14. Static File Serving

- [x] `public/` directory static file serving (/test.txt, /data.json, /style.css integration test verified 200)
- [x] MIME type mapping (text/plain, application/json, text/css etc. 30+ types, integration test verified)
- [x] ETag + 304 Not Modified (/test.txt returns ETag header, integration test verified)
- [ ] index.html auto-indexing (core unit test coverage)
- [x] Cache-Control (maxAge) (/test.txt returns Cache-Control header, integration test verified)
- [x] `X-Content-Type-Options: nosniff` (integration test verified: static-files.test.ts)
- [x] `/_` and `/api/` path bypass (integration test verified: static-files.test.ts)

---

## 15. Streaming Responses

- [x] `createStreamResponse()` stream response (integration test verified: /api/stream-test returns chunked stream "Streaming start/Chunk 1-5/Streaming complete")
- [x] `createSseStream()` SSE stream (same as 6.5, integration test verified: /api/sse-test returns SSE stream and retry:2000 heartbeat)

---

## 16. Code Generation and Type Safety

- [x] `generateTypes()` auto-generate types (integration test verified: ubean prepare/dev startup generates auto-imports.d.ts/components.d.ts/routes.d.ts/pages.d.ts)
- [x] RouteName type auto-generation (integration test verified: routes.d.ts includes all API route method+path mappings)
- [x] LayoutName type auto-generation (integration test verified: pages.d.ts and virtual:ubean-pages.ts export layoutNames type)
- [x] Type-safe fetch client (hono-openapi integration test coverage)
- [x] TypedLinkProps type-safe links (integration test verified: types.test.ts)
- [x] `.ubean/` virtual module type declarations (integration test verified: virtual:ubean-pages.ts/virtual:ubean-app.ts/virtual:ubean-client-entry.ts work normally)

---

## Test Environment Notes

- **Test project path**: `examples/ubean-test`
- **Test scope**: All feature points above must pass `examples/ubean-test` integration tests to be considered passing
- **Verification methods**:
  1. Start dev server, verify page routes, API endpoints, redirects, error handling, SEO files, OpenAPI/Scalar UI, static file serving through browser access (integrated_browser)
  2. In-browser fetch API calls verify HTTP methods, validator (json/query/path/form/header/cookie), middleware headers (x-request-id/x-response-time), 301/302 redirects, static file headers (ETag/Cache-Control/Last-Modified), Set-Cookie
  3. Unit tests are for development reference only, not as the basis for feature verification passing
- **Integration test verified pages**: `/`, `/about`, `/features`, `/user/123`, `/md-test`, `/marketing-page` (route group), `/dashboard`, `/dashboard/settings`, `/dashboard/profile` (nested routes), `/i18n` (internationalization), `/seo-meta` (SEO metadata), `/data-fetch` (data fetching), `/_scalar`, `/_devtools`
- **Integration test verified APIs**: `/api/health`, `/api/hello`, `/api/json`, `/api/text`, `/api/html`, `/api/users` (GET/POST), `/api/users/[id]` (GET/PUT/PATCH/DELETE), `/api/redirect` (302), `/api/redirect-permanent` (301), `/api/error` (500), `/api/env`, `/api/cors-status`, `/api/test-meta`, `/api/search` (query validator), `/api/headers` (header validator), `/api/login` (form validator), `/api/cookies` (Set-Cookie), `/api/i18n-test` (i18n info/translate/plural/linked/format/routing/detect/setLocale), `/api/data-test` (useData cache/invalidate/dependencies/ttl/defineDataKey), `/api/client-test` (ofetch env/methods/interceptors/flatResponse/extend/head), `/api/manifest-test` (Web App Manifest), `/api/prerender-test` (prerender collectRoutes/extractLinks/shouldIgnore/prerender/crawlLinks/ignoreRules/failOnError/manifest/filePath/concurrency), `/robots.txt`, `/sitemap.xml`, `/_openapi.json`
- **Integration test verified static files**: `/test.txt` (text/plain + ETag/Cache-Control/Last-Modified), `/data.json` (application/json), `/style.css` (text/css), non-existent files return 404

---

## Next Steps

- [Overview](/architecture/overview) — ubean's overall architecture and design principles
- [Routing](/architecture/routing) — File-based routing system details
- [Runtime](/architecture/runtime) — Client and server runtime internals
- [Islands Auto-Registry](/architecture/islands-auto-registry) — Islands auto-registration implementation
