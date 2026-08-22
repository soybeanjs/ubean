---
title: Framework Comparison
description: How ubean compares to Next.js, Nuxt, SvelteKit, SolidStart, Astro, TanStack Start, and Analog — scored by what the default path actually does.
---

# Framework Comparison

As of **2026-08**. Peers: **Next.js 16**, **Nuxt 4**, **SvelteKit 2**, **SolidStart**, **Astro 5/6**, **TanStack Start**, and **Analog 2.7**. Use the matrix to decide when ubean fits — and when another framework is a better choice.

The ubean column is scored by **whether the default path actually does the thing**, not by whether a TypeScript field exists. `⚠️` means partial, in-memory defaults, or APIs that are not mounted by `createUbeanApp`.

## Overview Matrix

| Dimension | Next.js | Nuxt | SvelteKit | SolidStart | Astro | TanStack Start | Analog | **ubean** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI framework | React 19 | Vue 3 | Svelte 5 | Solid | Multi | React (router-first) | Angular | **Vue 3** |
| Build tool | Turbopack | Vite | Vite | Vite / Nitro-family | Vite | Vite / Rsbuild | Vite + Nitro | **Vite** |
| HTTP layer | Own runtime | Nitro | Adapters | Nitro | Adapters | Start server | Nitro | **Hono** |
| Streaming SSR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ experimental | ✅ |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅ (default) | ✅ | ✅ | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅ SWR | ⚠️ | ⚠️ | ⚠️ rules exist; default store is in-process memory |
| Per-route render rules | ⚠️ partial | ✅ routeRules | ⚠️ | ⚠️ | ✅ | ✅ `ssr` / `data-only` | ⚠️ | ✅ `ssr`/`isr`/`prerender`/`rewrite`/`proxy` |
| PPR / static shell | ✅ | ❌ | ❌ | ❌ | ✅ Server Islands | ❌ | ❌ | ⚠️ `ppr: true` forces streaming SSR; not a Next-style static shell |
| Server Components | ✅ RSC | ✅ `.server.vue` | ❌ | ❌ | ❌ | ❌ (server functions) | ❌ | ✅ `.server.vue` (**not** RSC) |
| Server Actions / server functions | ✅ | ❌ first-class | ✅ form actions | ✅ | ✅ | ✅ `createServerFn` | ✅ 2.7 | ✅ `defineAction` / `defineServerFn` + `?/<name>` |
| Islands (partial hydration) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ `v-client.*` |
| Built-in DB / Queue / Cron / WS | ❌ | ⚠️ partial | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ APIs exist; DB/Queue/Storage **default to memory** |
| Built-in Auth | ❌ Auth.js | ⚠️ module | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ extension (Better Auth) |
| Built-in i18n | ❌ | ⚠️ module | ❌ | ❌ | ⚠️ routing | ❌ | ❌ | ✅ vue-i18n 11 + compact locale paths |
| Built-in DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ❌ | ❌ | ✅ + AI assistant |
| Platform presets | Vercel-first | 12+ | 6+ | Many runtimes | 4+ | Many hosts | Nitro | **9** (Node / CF / Vercel / Edge / Netlify / Bun / Deno + cf-dev) |

## How to read the ubean column

- **Wired**: streaming SSR, SSG, file-based routing (including parallel and intercepting routes), Server Actions / `defineServerFn`, `useFetch`, select SSR (`false` / `'data-only'` / `true`), `.server.vue`, Islands, vue-i18n 11, OpenAPI + Scalar, preset generators.
- **API exists, default path incomplete**: ISR / component-cache stores default to in-process memory (`cache: { store: 'fs' }` is available). Sessions stay opt-in. CSRF (origin), security headers, and fetch Data Cache middleware mount by default. Dev `/_ipx` serves local files; without a transform library it passes the original through (`X-IPX-Mode: passthrough`). CF / Vercel Queue/DB use `@ubean/server/drivers` — memory is not a substitute.
- **Deliberately out of scope**: React Server Components, a multi-UI runtime, a second in-house i18n engine, and Nuxt-style client `middleware/*.global` files (use `defineApp({ router: { setup } })` for guards). Need RSC? Use Next.js. Need a multi-framework content site? Use Astro.

## Feature Highlights

### Rendering

Streaming SSR, SSG, ISR (at the rules layer), and `routeRules` / `definePage` `ssr` (`true` / `'data-only'` / `false` / `'streaming'`) / `prerender` / `isr`. `ssr: false` skips the loader; `'data-only'` runs the loader but returns a CSR shell. Today `ppr: true` means forced streaming SSR plus prerender discovery — **not** Next.js Partial Prerendering with a static shell. Server-only UI uses `.server.vue` (optionally paired with `.client.vue`). Shipping less client JS uses `v-client.*` islands. `defineServerIsland()` wraps async components in `<Suspense>`; that is a streaming hole, not a static shell.

### Data and mutations

- **Server Actions / Form Actions**: `defineAction()` / `defineServerFn()` plus SvelteKit-style `?/<name>` URLs, stable action IDs, and `callAction` / `useAction` / `useFormAction` / `invokeServerFn`. Same `POST /__actions`; optionally expose with `describeActionsOpenApi()`.
- **`useData` / `useAsyncData` / `useFetch` / `defer`**: SSR payload hydration. `useFetch` wraps `useAsyncData`; inject [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) via `setDefaultFetch(createRequest())`. ubean does not invent an HTTP client.
- **`after()`**: post-response work that does not block TTFB.
- Sessions stay opt-in. CSRF (origin) and Data Cache middleware mount by default.

### Routing

File-based routes, parallel routes (`@slotName/` → Vue Router named views + `<SlotView>`), intercepting routes, groups, nested layouts, and `404` / `loading` / `error` convention files. `routeRules.redirect` / `rewrite` / `proxy` / headers all run. `rewrite` rematches internally; `proxy` forwards to the target URL.

### Internationalization

Config lives only on `ubean.config.ts` → `i18n`. Vue uses vue-i18n 11 (`legacy: false`). Hono and vue-router share `compileLocalePaths()`. `createUbeanApp` mounts the middleware. Import `useI18n` / `setLocale` from `ubean/runtime/vue`.

### Developer experience

- **OpenAPI** (`/_openapi.json` + Scalar) — first-class in few meta-frameworks.
- **Islands** (`v-client.*` + runtime wrappers) — uncommon in Vue meta-frameworks.
- **Electron, PWA, Pinia, UI** load from top-level `ubean.config.ts` fields and stay out of the core dependency graph.
- CLI scaffolds: `page` / `api` / `layout` / `middleware` / `cron`, and more. `ubean analyze` reads the Vite client manifest and writes `.ubean/bundle-baseline.json`.

## Deployment platforms

| Platform | ubean |
| --- | --- |
| Node.js | ✅ |
| Cloudflare | ✅ preset; KV / Queue still need platform drivers — memory is not a substitute |
| Vercel | ✅ Serverless + Edge |
| Netlify | ✅ Functions |
| Bun | ✅ native TS + `bun:sqlite` |
| Deno | ✅ preset; Deno KV / cron / Queue need explicit wiring |

Every preset extends `node` and can generate its config file. Detection uses config files, environment variables, or `package.json` dependencies.

## When ubean fits

1. You want a **Vue-only** full-stack framework (pages + API + SSR), not React / Angular / multi-UI.
2. You want **Islands** to ship less client JS, with optional `.server.vue`.
3. You want **Hono-native** + Vite, deploying to Node / Bun / Deno / Cloudflare / Vercel / Netlify.
4. You want in-framework **OpenAPI** and **vue-i18n 11 locale routing**, not a pile of extra modules.

## When to pick someone else

| Need | Better fit |
| --- | --- |
| React Server Components / mature PPR static shells | Next.js |
| Largest Vue module ecosystem, Nitro preset count | Nuxt |
| Progressive enhancement + minimal `load` functions | SvelteKit |
| Type-safe router + `createServerFn` at the center | TanStack Start |
| Islands-default content sites, multi-UI | Astro |
| Angular + Vite meta-framework | Analog |
| Fine-grained reactivity + Solid | SolidStart |

TanStack Start and Analog are **not** drop-in substitutes (different UI runtimes). They are listed because they represent the other 2026 Vite meta-framework path: router-first, typed server functions, selective SSR. ubean aims at those *capabilities* on the Vue side — it does not port those runtimes.
