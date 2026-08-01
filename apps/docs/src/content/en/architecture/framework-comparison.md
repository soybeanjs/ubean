---
title: Framework Comparison
---

# Framework Comparison and Gap Analysis

> Comparison subjects: **Next.js 16**, **Nuxt 4**, **SvelteKit 2 (Svelte 5)**, **SolidStart 1.x**, **Astro 5/6** vs **ubean v0.1.x**
> Data sources: official docs of each framework (as of 2026-07) + ubean source code
> Purpose: serves as the factual basis for [roadmap.md](roadmap.md) Phase 9 task planning; periodically re-reviewed when competitors release major versions

---

## I. Overview Comparison Matrix

| Dimension | Next.js 16 | Nuxt 4 | SvelteKit 2 | SolidStart 1.x | Astro 5/6 | **ubean** |
| --- | --- | --- | --- | --- | --- | --- |
| UI Framework | React 19 | Vue 3 | Svelte 5 | Solid | Multi-framework | Vue 3 |
| Build Tool | Turbopack | Vite | Vite | Vinxi (Vite+Nitro) | Vite | Vite-Plus |
| HTTP Layer | Node/Runtime | Nitro (Hono) | Node/Hono | Nitro | Node/Hono | Hono |
| SSR Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ P9-01 |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅ default | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅ (SWR) | ✅ P9-03 (routeRules.isr + SWR) |
| per-route render rules | ⚠️ (partial) | ✅ routeRules | ❌ | ❌ | ✅ `export const prerender` | ✅ P9-03 (routeRules.ssr/prerender/isr) |
| PPR / Server Islands | ✅ stable | ❌ | ❌ | ❌ | ✅ `server:defer` | ✅ P9-04 (`routeRules.ppr` + `defineServerIsland()` runtime wrapper → `<Suspense>`) |
| Server Components | ✅ RSC | ✅ | ❌ | ❌ | ❌ (Islands) | ❌ |
| Server Actions | ✅ | ❌ | ✅ form actions | ✅ | ✅ Actions | ✅ P9-02 (`defineAction()` wrapper + form actions) |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ P9-01 |
| Islands | ❌ | ❌ | ❌ | ❌ | ✅ original | ✅ |
| Multi-framework | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Built-in DB | ❌ | ❌ | ❌ | ❌ | ⚠️ (deprecated) | ✅ db0 |
| Built-in Queue/Cron/WS | ❌ | ⚠️ partial | ❌ | ❌ | ❌ | ✅ |
| Built-in Auth | ❌ (Auth.js) | ⚠️ | ❌ | ❌ | ❌ | ✅ Better Auth |
| Built-in i18n | ❌ | ⚠️ module | ❌ | ❌ | ⚠️ routing | ✅ zero-dependency |
| Built-in DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ✅ AI assistant |
| Platform presets | Vercel/Node/Edge | 12+ | 6+ | 20+ | 4+ | 6 (Node/CF/Vercel/Netlify/Bun/Deno, P9-10) |

---

## II. Detailed Feature Comparison

### 2.1 Rendering Modes (most critical difference)

| Capability | Other Frameworks | ubean | Gap |
| --- | --- | --- | --- |
| **SSR Streaming Render** | Next/Nuxt/SvelteKit/Solid/Astro all support `renderToStream`/`pipe`/Suspense streaming | ✅ P9-01 (`renderToNodeStream` + `ReadableStream`, `SsrOptions.streaming`) | Closed |
| **Partial Prerendering** | Next.js 16 stable (static shell + Suspense streaming for dynamic); Astro 5 `server:defer` Server Islands | ✅ P9-04 (`routeRules.ppr: true` implies `prerender` + forces streaming SSR; `defineServerIsland()` runtime wrapper wraps in `<Suspense>` with a fallback + extracts `#fallback`) | Closed |
| **ISR** | Next.js built-in; Nuxt `routeRules: { swr: 600 }`; Astro 5 experimental | ✅ P9-03 (`routeRules.isr` + SWR, `peek` keeps stale entries) | Closed |
| **per-route render rules** | Nuxt `routeRules` can switch SSR/SSG/ISR/CSR + cors/headers per-route; Astro `export const prerender = false` | ✅ P9-03 (`routeRules.ssr`/`prerender`/`isr`, overrides global `ssr.exclude`) | Closed |
| **Server Components** | Next.js RSC default; Nuxt `<ServerComponent>` | ❌ | Design difference (Vue ecosystem) |
| **Hydration error recovery** | Next/Nuxt have detailed error boundaries + streaming fallback | ✅ `error.vue` | Closed |

ubean's rendering-layer gaps are essentially closed: streaming SSR (P9-01), ISR + per-route render rules (P9-03), PPR/Server Islands (P9-04) have all landed; the P0 strategic rendering and mutation layer capabilities are aligned.

### 2.2 Data Fetching and Mutation

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **Server Actions / Form Actions** | Next.js `"use server"`; SvelteKit `actions`; SolidStart `action()`; Astro `defineAction` | ✅ P9-02 (`defineAction()` explicit wrapper + SvelteKit-style `?/name` form action) |
| **`useFetch`/`useAsyncData` equivalent** | Nuxt full set (dedupe/refresh/payload/CSP); SvelteKit `load` functions | ⚠️ `useData`/`useAsyncData` is thin |
| **`defer()` streaming non-critical data** | Next.js Suspense + `defer`; SvelteKit streaming promises | ❌ |
| **Single-flight mutations** | SolidStart exclusive, avoids post-mutation waterfalls | ❌ |
| **Request memoization** | Next.js auto fetch memoization | ❌ |
| **Payload extraction (SSG)** | Nuxt auto-extracts `__NUXT_DATA__` | ⚠️ `__UBEAN_STATE__` but no SSG payload extraction |
| **Hooks (handle/handleFetch/handleError)** | SvelteKit global hooks; Nuxt server plugins | ✅ `defineServer({ globalHooks })` |
| **`after()` post-response execution** | Next.js 16 `after()` for logging/analytics/cache invalidation without blocking TTFB | ❌ |

ubean chose the `useData`/`depends`/`invalidate` route (TBD-10), and has closed the **Server Actions** paradigm via P9-02 (`defineAction()` explicit wrapper + SvelteKit-style `?/name` form action), aligning with the common trend across Next/SvelteKit/Solid/Astro.

### 2.3 Routing

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **File-convention routing** | All support | ✅ |
| **Parallel Routes** | Next.js `@folder` slots | ✅ P9-18 (`@slotName/` directory convention → Vue Router named views + `<SlotView>` component) |
| **Intercepting Routes** | Next.js `(..)` modal routes | ✅ P9-18 (`(..)target`/`(.)target`/`(...)target` directory convention → `__intercept_`-prefixed routes + intercept meta) |
| **Route Groups** | All support `(group)` | ✅ |
| **Dynamic routes + matchers** | SvelteKit matchers; others `[param]` | ⚠️ no matchers |
| **Nested layouts** | Next/Nuxt/SvelteKit multi-layer nesting | ✅ `layout: ['default', 'admin', 'dashboard']` multi-layer nesting (P9-17) |
| **404/loading/error convention files** | Next.js `not-found.tsx`/`loading.tsx`/`error.tsx`/`global-error.tsx`; SvelteKit `+error.svelte` | ✅ `404.vue`/`loading.vue`/`error.vue` |
| **typed routes** | Nuxt/SvelteKit `$types` auto-generated | ✅ TBD-08 |
| **View Transitions** | Next/Nuxt/Astro/SvelteKit | ✅ |

### 2.4 Cache System

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **Component-level cache directives** | Next.js `"use cache"` + `cacheLife()`/`cacheTag()`/`updateTag()` | ✅ P9-08 (`defineCachedFunction()` explicit wrapper + `cacheLife()`/`cacheTag()` macros; `wrapWithCache()` kept as deprecated alias; the removed `"use cache"` directive / `ubeanCacheDirectivePlugin()` / `@ubean/server/vite` export have been deleted) |
| **fetch auto memo + cache** | Next.js Data Cache + revalidateTag/revalidatePath | ❌ |
| **per-route cache rules** | Nuxt `routeRules.cache`; Astro `routeRules` | ✅ `resolveRouteCacheRules` + `routeRules.cache` (P9-03 enhanced) |
| **SWR** | Nuxt `swr: 600`; Astro `swr` | ✅ CacheRule.swr + ISR SWR (P9-03, `peek` keeps stale entries) |
| **Tag-based invalidation** | Next.js `cacheTag`/`updateTag`; Astro tags | ✅ P9-08 (`revalidateTag(tag)`/`revalidateTags(...)`/`revalidatePath(pattern)` component-level cache tag invalidation) |
| **cachedEventHandler** | Nuxt `defineCachedEventHandler`/`defineCachedFunction` | ✅ |
| **CDN/Edge cache integration** | Next Full Route Cache; Astro adapter providers | ❌ |

### 2.5 SEO File Conventions

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **`sitemap.ts` file convention** | Next.js `app/sitemap.ts` auto-generates `/sitemap.xml` | ✅ P9-05 (`src/sitemap.ts` → `registerSeoConventions` auto-registers GET `/sitemap.xml`) |
| **`robots.ts` file convention** | Next.js `app/robots.ts` | ✅ P9-05 (`src/robots.ts` → GET `/robots.txt`) |
| **`manifest.ts` file convention** | Next.js `app/manifest.ts` | ✅ P9-05 (`src/manifest.ts` → GET `/manifest.webmanifest`) |
| **`opengraph-image.tsx` dynamic generation** | Next.js `ImageResponse`; SvelteKit `@vercel/og` | ✅ P9-05 (convention file) + P9-06 (`@ubean/seo/og-image`: `ImageResponse` class + `renderOgImage`/`renderArticleOgImage` + `defaultTemplate`/`articleTemplate` + font loading helpers; `satori`/`@resvg/resvg-js` are optional peer deps) |
| **`icon.tsx`/`apple-icon.tsx`** | Next.js dynamic icons | ✅ P9-05 (`src/icon.ts`/`src/apple-icon.ts` → GET `/icon`/`/apple-icon`) |
| **`metadata`/`generateMetadata`** | Next.js Metadata API (auto dedupe + streaming) | ⚠️ `useSeoMeta`/`definePage({head})` no auto dedupe |
| **Streaming metadata** | Next.js streaming metadata (crawler-disabled) | ❌ |
| **JSON-LD / Schema.org** | Nuxt `nuxt-schema.org`; Astro manual | ✅ P9-07 (`@ubean/seo/json-ld`: `defineJsonLd`/`useSchemaOrg`/`renderJsonLdScript` + `schemaOrg.{organization,website,article,breadcrumb,product}` factories) |

### 2.6 Content and Media

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **Content Collections** | Astro Content Layer API (pluggable loaders, 5x speedup); Nuxt Content | ✅ `@ubean/content` |
| **Live Collections (request-time fetch)** | Astro 5.10+ experimental, 6 stable | ✅ P9-19 (`defineLiveCollection` + loader function + TTL cache + schema validation + lazy query builder) |
| **MDX** | Next/Nuxt/Astro/SvelteKit all support | ⚠️ type registered but no MDX compiler |
| **Image optimization** | Next `next/image`; Nuxt `@nuxt/image`; Astro `astro:assets`; SvelteKit `enhanced-img` | ✅ `@ubean/image` multi-provider |
| **Font optimization** | Next `next/font`; Nuxt `@nuxt/fonts`; Astro `astro:fonts` | ✅ `@ubean/fonts` |
| **Responsive image srcset** | Astro 5.10 stable; Next auto | ✅ |
| **Remote image domain allowlist** | Next/Astro | ✅ |

### 2.7 Platform Deployment

| Platform | Next.js | Nuxt | SvelteKit | SolidStart | Astro | **ubean** |
| --- | --- | --- | --- | --- | --- | --- |
| Node | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cloudflare | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vercel | ✅ native | ✅ | ✅ | ✅ | ✅ | ✅ P9-10 (Serverless + Edge) |
| Netlify | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ P9-10 (Functions) |
| Bun | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ P9-10 (native TS) |
| Deno | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ P9-10 (KV/cron/Queue) |
| AWS/Azure | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ |

ubean P9-10 has closed the four major platform presets Vercel/Netlify/Bun/Deno, all `extends:'node'` inheriting the base config, and provides platform-specific capability matrices, build config (`exportConditions`/`externals`/`outputDir`) and config file generators (`generateVercelConfig`/`generateNetlifyConfig`/`generateBunfigConfig`/`generateDenoConfig`). `detectPreset()` supports three auto-detection methods: config files, environment variables, and `package.json` dependencies.

### 2.8 Security and Sessions

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **CSRF protection** | Astro 5 enabled by default; Next/SvelteKit middleware | ✅ P9-12 (double-submit cookie + origin validation) |
| **CSP header generation** | Astro 6 stable; Next.js headers | ✅ P9-13 (`serializeCsp` + report-only) |
| **Security headers (HSTS/X-Frame etc.)** | Next/Nuxt/Astro config | ✅ P9-13 (HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/Cross-Origin-*) |
| **Generic Sessions API** | Astro 5.7+ `Astro.session`; SvelteKit locals | ✅ P9-11 (cookie + storage modes) |
| **Rate limiting** | Third-party | ✅ |
| **CORS** | All | ✅ |

### 2.9 Developer Experience

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **DevTools** | Nuxt DevTools; Astro Toolbar | ✅ AI assistant + 13 views (**strongest**) |
| **CLI scaffolding** | Next create-next-app; Nuxt nuxi; Astro create-astro | ✅ 14 commands |
| **auto-imports** | Nuxt default; Astro partial | ✅ |
| **HMR** | All | ✅ |
| **Typed routes** | Nuxt/SvelteKit | ✅ |
| **Module system** | Nuxt Kit | ✅ |
| **OpenAPI auto-generation** | ❌ most have none | ✅ **unique** |
| **Drizzle Studio integration** | ❌ | ✅ **unique** |
| **AI assistant integration** | ❌ | ✅ **unique** |

### 2.10 State and Extensions

| Capability | Other Frameworks | ubean |
| --- | --- | --- |
| **Pinia SSR hydration** | Nuxt default | ✅ `@ubean/pinia` |
| **Electron** | Nuxt `nuxt-electron` | ✅ `@ubean/electron` |
| **PWA** | Nuxt `@vite-pwa/nuxt`; Astro | ✅ `@ubean/pwa` |
| **WebSocket/SSE** | Third-party | ✅ built-in |
| **Queue/Cron** | Third-party | ✅ built-in |
| **Color mode (light/dark)** | Nuxt `@nuxtjs/color-mode` | ❌ delegated to @soybeanjs/ui |
| **Third-party script optimization** | Nuxt `@nuxtjs/scripts`; Astro partytown | ❌ |
| **Email sending** | Third-party | ❌ |
| **Full-text search** | Astro Pagefind; Nuxt | ❌ |
| **Analytics** | Vercel Analytics; Nuxt | ❌ (observability only) |
| **A/B testing / Feature flags** | Third-party | ❌ |
| **Draft mode / Preview** | Next.js `draftMode()`; Astro | ❌ |

---

## III. ubean Feature Gap Analysis (by priority)

> Task IDs and status follow [roadmap.md](roadmap.md) Phase 9; this table is only an analysis index.

### P0 Strategic Gaps (affecting core competitiveness)

#### 1. ❌ Streaming SSR
- **Status**: [packages/ssr/src/index.ts](../packages/ssr/src/index.ts) uses `renderToString` (L173, L187)
- **Competitors**: Next/Nuxt/SvelteKit/Solid/Astro all support streaming
- **Impact**: TTFB/LCP disadvantage, long tasks block first byte
- **Plan**: switch to `@vue/server-renderer`'s `renderToNodeStream`/`pipeToWritable`, with Vue Suspense
- **Task**: P9-01

#### 2. ✅ Server Actions / Form Actions (P9-02 completed)
- **Status**: the `@ubean/actions` package provides `defineAction` (schema validation support) + `fail()`/`ActionError` error model + global registry + stable action ID (`base32(sha1(filePath:exportName))`) + `/__actions` RPC middleware + SvelteKit-style `?/<name>` form action (page module `export const actions` map, progressive enhancement) + client `useAction`/`useFormAction`/`callAction` + `defineAction()` call-expression Vite plugin (the `ubeanServerActionsPlugin` detects `defineAction(` calls and injects `filePath`/`name`; server-side registers to the global registry, client-side replaces with RPC stub)
- **Competitors**: Next.js `"use server"`, SvelteKit `actions`, SolidStart `action()`, Astro `defineAction`
- **Task**: P9-02 ✅

#### 3. ✅ ISR + per-route render rules (P9-03 completed)
- **Status**: `RouteRule` extended with `ssr`/`prerender`/`isr` per-route fields; `route-rules` middleware sorts by rule + path specificity and exposes via `c.get('routeRule')`; router overrides global settings per-route via `ssr` (`false`/`true`/`'streaming'`); GET requests run ISR (TTL + SWR, `peek` keeps stale entries for stale revalidation); `prerender` auto-discovers `prerender: true` routes from `routeRules`
- **Competitors**: Next.js ISR, Nuxt `routeRules: { swr: 600 }`, Astro SWR
- **Task**: P9-03 ✅

#### 4. ✅ Partial Prerendering / Server Islands
- **Status**: `RouteRule` extended with `ppr: true` field (implies `prerender: true` + forces streaming SSR, equivalent to `ssr: 'streaming'`); `route-rules` middleware matches `ppr` field; router forces streaming output for PPR routes and adds `X-PPR: true` response header; `prerender` auto-discovers `ppr: true` routes to generate the static shell; `@ubean/islands` provides `defineServerIsland(Component, options?)` runtime wrapper (replaces the removed `server:defer` compile-time directive): wraps an async component in `<Suspense>` with a fallback (string | Component | default `<ubean-defer-fallback>` placeholder), sets `inheritAttrs: false`, forwards attrs + slots to the inner Component; during prerender only the fallback (static shell) is rendered, during streaming SSR the resolved async component content is streamed out via the Suspense boundary
- **Competitors**: Next.js 16 PPR stable, Astro 5 `server:defer`
- **Task**: P9-04 ✅

### P1 Important Gaps (affecting alignment)

#### 5. ✅ File-convention SEO (`sitemap.ts`/`robots.ts`/`opengraph-image.tsx`)
- **Status**: `@ubean/seo/conventions` provides the `SEO_CONVENTIONS` descriptor table + `registerSeoConventions(app,{srcDir})` runtime scanner, auto-registers GET routes for `src/sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.ts`/`icon.ts`/`apple-icon.ts`; sitemap/robots/manifest wrapped with `create*Response`, image-convention handlers return `Response` directly; `enabled`/`disabled` filter + multi-extension candidates (`.ts/.js/.mjs/.mts/.cjs`)
- **Competitors**: Next.js complete file conventions
- **Task**: P9-05 ✅

#### 6. ✅ Dynamic OG Image generation (P9-06 completed)
- **Status**: `@ubean/seo/og-image` provides the `ImageResponse` class (aligns with Next.js, uses `ReadableStream` for lazy rendering, can synchronously `return new ImageResponse(node, { fonts })`) + `renderOgImage(input, options)`/`renderArticleOgImage(input, options)` one-step rendering + `renderToImage(node, options)` low-level rendering (returns `{ body, contentType }`) + `defaultTemplate(input)`/`articleTemplate(input)` built-in Satori VDOM templates (gradient background/adaptive title font-size/optional description/site name/logo/author date) + `shadeColor(hex, percent)` color lighten/darken + `loadDefaultFont()`/`loadFontFromUrl()`/`loadFontFromFile()` font loading helpers + `isOgImageSupported()` capability detection; `satori`/`@resvg/resvg-js` are optional peer deps, loaded via runtime dynamic `import()`, friendly guidance error when not installed
- **Competitors**: Next.js `ImageResponse` (based on Satori + resvg), SvelteKit `@vercel/og`, Astro `astro-og-image`
- **Task**: P9-06 ✅

#### 7. ✅ JSON-LD / Schema.org structured data (P9-07 completed)
- **Status**: `@ubean/seo/json-ld` provides `defineJsonLd(schema)` pure-function definition + `useSchemaOrg(schema)` Vue composable (injects head via `globalThis.__UBEAN_HEAD__`) + `renderJsonLdScript(schema)`/`renderJsonLdScripts(schemas)` serializes to `<script type="application/ld+json">` tags (auto-escapes `<`/`>`/U+2028/U+2029 to prevent injection) + `mergeJsonLd(schemas)` merges into a `@graph` array + `schemaOrg.{organization,website,article,breadcrumb,product}` factory functions
- **Competitors**: Nuxt `nuxt-schema.org` (based on `schema-dts` types); Astro manual injection
- **Task**: P9-07 ✅

#### 8. ✅ Component-level cache directives (`"use cache"`/`cacheLife`/`cacheTag`)
- **Status**: `@ubean/server/cache-directive` provides `cacheLife(seconds)`/`cacheTag(...tags)` macros (pass scope via `AsyncLocalStorage`) + `defineCachedFunction(fn,options)` explicit cache wrapper (replaces the removed `"use cache"` string directive; `wrapWithCache(fn,options)` kept as a deprecated alias) + `revalidateTag(tag)`/`revalidateTags(...)`/`revalidatePath(pattern)` invalidation API + standalone `ComponentCacheStore` (stores JSON-serializable values, with tag reverse index); the removed `ubeanCacheDirectivePlugin()` Vite plugin and `@ubean/server/vite` export have been deleted (replaced by the explicit `defineCachedFunction()` call); integrated into the default `ubean/vite` plugin composition
- **Competitors**: Next.js 16 `"use cache"` + `cacheLife()`/`cacheTag()`/`revalidateTag()`
- **Task**: P9-08 ✅

#### 9. ✅ SvelteKit-style Global Hooks (`handle`/`handleFetch`/`handleError`)
- **Status**: `@ubean/app/hooks` provides three global hooks: `handle` (wraps every request, covers all routes + static assets + 404 + error responses), `handleFetch` (intercepts server-side `internalFetch`/`createInternalAdapter` calls, can modify request headers/URL/inject auth), `handleError` (unified entry for uncaught errors, for logging/reporting); registered via `defineServer({ globalHooks })`, `mergeServerConfigs` auto-merges shared + mode-specific hooks; `applyHandleHook` registers first in the middleware chain, zero-overhead degradation to normal `next()` when no hook; 30 unit + integration tests
- **Competitors**: SvelteKit `hooks.server.ts` / Nuxt server plugins / Astro middleware
- **Task**: P9-09 ✅

#### 10. ✅ Platform preset completion (Vercel/Netlify/Bun/Deno)
- **Status**: `@ubean/preset` has added 4 presets (merged original P5-06):
  - `vercelPreset` / `vercelEdgePreset`: Serverless + Edge modes, `VERCEL_CAPABILITIES` / `VERCEL_EDGE_CAPABILITIES` capability matrices (Edge mode disables `nodeCompat`/`database`/`queues`/`cronTriggers`, enables `kv`), `exportConditions: ['vercel']`, `generateVercelConfig()` / `serializeVercelConfig()` generates `vercel.json`
  - `netlifyPreset`: Serverless Functions mode, `NETLIFY_CAPABILITIES` capability matrix, `exportConditions: ['netlify']`, `generateNetlifyConfig()` / `serializeNetlifyConfig()` generates `netlify.toml`
  - `bunPreset`: Bun native TypeScript runtime + `bun:sqlite`, `BUN_CAPABILITIES` capability matrix, `exportConditions: ['bun']`, `generateBunfigConfig()` / `serializeBunfigConfig()` generates `bunfig.toml`
  - `denoPreset`: Deno KV / Deno.cron / Deno.Queue native support, `DENO_CAPABILITIES` capability matrix, `exportConditions: ['deno']`, `generateDenoConfig()` / `serializeDenoConfig()` generates `deno.json`
  - All use `extends: 'node'` to inherit the base config; each preset provides independent `output`/`runtime`/`serve`/`commands`/`hooks`
- **Detection**: `detectPreset()` enhanced to three auto-detections: config files (`vercel.json`/`netlify.toml`/`deno.json`/`deno.jsonc`) + environment variables (`VERCEL`/`NETLIFY`/`globalThis.Deno`/`globalThis.Bun`/`process.versions.bun`) + `package.json` dependencies (`vercel`/`@vercel/*`/`netlify-cli`); `listDetectablePresets()` returns 9 presets
- **Competitors**: Nitro 12+ presets / Nuxt 6+ / Astro 4+
- **Task**: P9-10 ✅ (merged P5-06)

### P2 Enhancement Gaps (completeness improvements)

| # | Missing Capability | Task ID |
| --- | --- | --- |
| 11 | Generic Sessions API (`Astro.session`-style) | P9-11 |
| 12 | CSRF protection middleware | P9-12 |
| 13 | Security headers (CSP/HSTS/X-Frame-Options) | P9-13 |
| 14 | `after()` post-response execution API | P9-14 |
| 15 | Request memoization (fetch auto-dedup) | P9-15 |
| 16 | Single-flight mutations | P9-16 |
| 17 | Nested layouts (multi-layer) | P9-17 |
| 18 | Parallel routes / Intercepting routes | P9-18 |
| 19 | Live Content Collections (request-time fetch) | P9-19 |
| 20 | Real MDX compilation (currently only type registration) | P9-20 |
| 21 | Color mode (light/dark) | P9-21 |
| 22 | Third-party script optimization (Partytown integration) | P9-22 |
| 23 | Draft / Preview mode | P9-23 |
| 24 | Streaming metadata | P9-24 |
| 25 | Email sending | P9-25 |
| 26 | Full-text search (Pagefind integration) | P9-26 |
| 27 | Analytics (page view stats) | P9-27 |
| 28 | A/B testing / Feature flags | P9-28 |

---

## IV. ubean Unique Advantages (must not lose)

ubean has several differentiated capabilities that competitors **do not have**, which are its core competitiveness:

| Advantage | Description |
| --- | --- |
| **Built-in full-stack primitives** | DB/Queue/Cron/WS/SSE/Cache one-stop; competitors all need third-party |
| **AI assistant DevTools** | Built-in ai-sdk integration, 13 views including Drizzle Studio, Terminal |
| **OpenAPI auto-generation** | `/_openapi.json` + Scalar UI, no competitor has it |
| **Zero-dependency i18n** | 4 strategies + Intl + plural + linked messages, no vue-i18n needed |
| **Better Auth + fallback** | Built-in auth fallback solution |
| **Islands architecture** | `v-client.*` Vue directives + `defineIsland()`/`defineServerIsland()` runtime wrappers, rare in the Vue ecosystem |
| **Electron built-in** | Desktop apps out of the box |
| **Multi-provider image optimization** | ipx/cloudinary/imgix/vercel/netlify etc. 10+ |
| **Complete CLI scaffolding** | page/api/layout/middleware/cron/plugin full set |
| **Hono-native** | Edge-runtime friendly |

---

## V. Priority Recommendations

**Recommended roadmap ordering** (by ROI):

1. **Streaming SSR** (P0, unlocks PPR prerequisite) — change `@ubean/ssr` to use `renderToNodeStream`
2. **per-route render rules + ISR** (P0) — extend `routeRules`
3. **Server Actions** (P0, ✅ completed P9-02) — `defineAction()` explicit wrapper
4. **PPR / Server Islands** (P0, ✅ completed P9-04, depends on 1+3) — `routeRules.ppr` + `defineServerIsland()` → `<Suspense>`
5. **File-convention SEO** (P1) — sitemap.ts/robots.ts/opengraph-image
6. **OG Image generation** (P1) — Satori integration
7. **JSON-LD/Schema.org** (P1)
8. **Platform preset completion** (P1, ✅ completed P9-10, merged P5-06) — Vercel/Netlify/Bun/Deno presets
9. **CSRF + security headers** (P2, ✅ completed P9-12 + P9-13) — CSRF double-submit cookie + origin validation; CSP/HSTS/X-Frame-Options/Permissions-Policy/Cross-Origin-* security headers
10. **Sessions API + after()** (P2)

ubean's architecture (Hono + Vite-Plus + module system) is sufficient to support the above completion. The P0 rendering and mutation layers (streaming SSR, ISR, per-route rules, Server Actions, PPR) have all landed, and the P1 important level (file-convention SEO, OG Image, JSON-LD, component-level cache directives, global Hooks, platform preset completion) is also complete; the core capability alignment of the Vue meta-framework catching up with Next.js 16 is done. Subsequent focus is on P2 enhancement level (Sessions/CSRF/security headers/after()/nested layouts, etc.).

---

## VI. Review Mechanism

- Whenever a competitor releases a major version (Next.js 17, Nuxt 5, Astro 7, SvelteKit 3, SolidStart 2), update the corresponding section of this document
- After ubean completes Phase 9 tasks, mark ✅ in [roadmap.md](roadmap.md) and sync the status column of this table
- New differentiated capabilities (ubean-unique) should be added to Section IV

## Next Steps

- [Roadmap](/architecture/roadmap) — delivery milestones, key technical decisions and task tracking.
- [Architecture](/architecture/architecture) — framework architecture, data flow, and configuration system.
- [Overview](/architecture/overview) — project overview, tech stack and directory structure.
- [Quick Start](/guide/quickstart) — create your first ubean project.
