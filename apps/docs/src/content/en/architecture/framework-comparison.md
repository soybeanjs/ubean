---
title: Framework Comparison
description: "How ubean compares to Next.js, Nuxt, SvelteKit, SolidStart, and Astro — and where its differentiators lie."
---

# Framework Comparison

A high-level comparison of ubean against the mainstream meta-frameworks (as of 2026): **Next.js 16**, **Nuxt 4**, **SvelteKit 2**, **SolidStart 1.x**, and **Astro 5/6**. The matrix helps you decide when ubean fits — and when another framework might be a better choice.

## Overview Matrix

| Dimension | Next.js | Nuxt | SvelteKit | SolidStart | Astro | **ubean** |
| --- | --- | --- | --- | --- | --- | --- |
| UI framework | React 19 | Vue 3 | Svelte 5 | Solid | Multi | **Vue 3** |
| Build tool | Turbopack | Vite | Vite | Vinxi (Vite+Nitro) | Vite | **Vite** |
| HTTP layer | Node/Runtime | Nitro (Hono) | Node/Hono | Nitro | Node/Hono | **Hono** |
| Streaming SSR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅ (default) | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅ (SWR) | ✅ routeRules.isr + SWR |
| Per-route render rules | ⚠️ partial | ✅ routeRules | ❌ | ❌ | ✅ | ✅ routeRules |
| PPR / Server Islands | ✅ stable | ❌ | ❌ | ❌ | ✅ | ✅ |
| Server Components | ✅ RSC | ✅ (`.server.vue`) | ❌ | ❌ | ❌ | ✅（`.server.vue` + match） |
| Server Actions / Form Actions | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Islands (partial hydration) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Built-in DB / Queue / Cron / WS | ❌ | ⚠️ partial | ❌ | ❌ | ❌ | ✅ |
| Built-in Auth | ❌ (Auth.js) | ⚠️ | ❌ | ❌ | ❌ | ✅ extension |
| Built-in i18n | ❌ | ⚠️ module | ❌ | ❌ | ⚠️ routing | ✅ zero-dependency |
| Built-in DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ✅ + AI assistant |
| Platform presets | Vercel/Node/Edge | 12+ | 6+ | 20+ | 4+ | **8** (Node/CF/Vercel/Netlify/Bun/Deno) |

## Feature Highlights

### Rendering

ubean covers the full rendering spectrum: streaming SSR, SSG, ISR (with SWR), per-route render rules via `routeRules` (`ssr` / `prerender` / `isr` / `ppr`), and Partial Prerendering through `defineServerIsland()` wrapping async components in `<Suspense>`. Vue's SFC/`<script setup>` ecosystem means there are no Server Components — islands are the model for partial hydration instead.

### Data & Mutations

- **Server Actions / Form Actions**: `defineAction()` explicit wrapper plus SvelteKit-style `?/<name>` form actions, with a stable action ID (`base32(SHA-1)`) and a client runtime (`callAction` / `useAction` / `useFormAction`).
- **Request memoization & single-flight mutations**: fetch dedup per request scope and request-scoped revalidation (`defineRevalidation` / `invalidate`) to avoid post-mutation waterfalls.
- **`after()`**: response-time callbacks (logging, analytics, cache invalidation) without blocking TTFB.

### Routing

File-based routes with parallel routes (`@slotName/` → Vue Router named views + `<SlotView>`), intercepting routes (`(..)target`), route groups, nested layouts, `404`/`loading`/`error` convention files, typed routes, and View Transitions.

### Security & Sessions

Sessions API (cookie or storage-backed), CSRF protection (double-submit cookie + origin check), and configurable security headers (CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy).

### Developer Experience

- **OpenAPI auto-generation** (`/_openapi.json` + Scalar UI) — a differentiator most frameworks lack.
- **Zero-dependency i18n** (4 routing strategies + Intl + plural + linked messages, no vue-i18n).
- **Islands architecture** (`v-client.*` directive + `defineIsland()` / `defineServerIsland()` wrappers).
- **Electron** desktop apps out of the box; multi-provider image optimization; a full CLI scaffold (`page` / `api` / `layout` / `middleware` / `cron` / `plugin` / `env` / `config`).

## Deployment Platforms

| Platform | ubean |
| --- | --- |
| Node.js | ✅ |
| Cloudflare | ✅ |
| Vercel | ✅ Serverless + Edge |
| Netlify | ✅ Functions |
| Bun | ✅ native TS + `bun:sqlite` |
| Deno | ✅ KV / cron / Queue |

Every preset extends `node` and ships its own capability matrix, build configuration, and config-file generator. The platform is auto-detected via config file, environment variables, or `package.json` dependencies.

## Where ubean Stands Out

| Differentiator | Detail |
| --- | --- |
| **Built-in full-stack primitives** | DB / Queue / Cron / WebSocket / SSE / Cache in one dependency, where competitors require third-party glue |
| **AI-powered DevTools** | Embedded ai-sdk integration with multiple views |
| **OpenAPI auto-generation** | `/_openapi.json` + Scalar UI — rare among meta-frameworks |
| **Zero-dependency i18n** | 4 strategies + Intl + plural + linked messages |
| **Islands for Vue** | `v-client.*` directive + runtime wrappers — uncommon in the Vue ecosystem |
| **Electron built-in** | Desktop apps out of the box |
| **Hono-native** | Edge-runtime friendly and lightweight |

## Good-Fit Checklist

Consider ubean when you want:

1. A **Vue-specific** full-stack framework (pages + API + SSR in one tool)
2. **Islands** partial hydration to ship less client JavaScript
3. **Built-in** full-stack primitives (DB, queue, cron, WebSocket, SSE, cache, i18n) without vendor lock-in
4. **Multi-platform** deployment (Node / Bun / Deno / Cloudflare / Vercel / Netlify) from one codebase
5. A **DevTools + AI** workflow integrated into the framework

If you require React Server Components (choose Next.js) or a framework-agnostic content site (Astro), those remain better fits.
