---
title: Overview
description: "High-level overview of ubean: origins, project structure, and design conventions."
---

# Overview

## 1. Project Overview

**ubean** is a full-stack meta-framework built on Vite, Hono, and Vue 3, fusing void's Inertia-style SSR page routing with nitro's cross-platform deployment capabilities, organized as a monorepo of 37 single-purpose packages.

### 1.1 Core Positioning

- **Vue-specific**: Only supports Vue 3, deeply integrated with the Vue ecosystem
- **Build toolchain**: Built on Vite (vite-plus workflow), with Hono as the HTTP framework
- **Cross-platform deployment**: Borrows nitro's preset system, supporting Node.js, Bun, Deno, Cloudflare, Vercel, Netlify and other platforms
- **Functional programming**: Strictly follows the TypeScript functional programming paradigm
- **Complete testing**: Full test coverage based on vitest (1000+ tests across the repo)

### 1.2 Local Reference Projects

| Project | Local Path | Reference Content |
| --- | --- | --- |
| **void** | [/Users/soybean/Web/Projects/OpenSource/void](file:///Users/soybean/Web/Projects/OpenSource/void) | Primary reference: file-based routing, defineHandler middleware chain pattern, Islands architecture, Markdown pages, Better Auth integration, Queues Proxy dynamic binding, Cron Jobs, Skills/Agent system, DevTools style, Vite-Plus build, Inertia-style SSR page rendering (request validation switched to hono-openapi's validator/describeRoute) |
| **@void/vue** | [/Users/soybean/Web/Projects/OpenSource/void](file:///Users/soybean/Web/Projects/OpenSource/void-vue) | void's Vue-specific plugin |
| **nitro** | [/Users/soybean/Web/Projects/OpenSource/nitro](file:///Users/soybean/Web/Projects/OpenSource/nitro) | Multi-platform preset system (30+ deployment platforms), routeRules (cache/headers/redirects/proxy), OpenAPI auto-generation (Scalar UI), Storage layer (unstorage), Database layer (db0), prerender/SSG, runtime plugin lifecycle |
| **hono-ssr** | [/Users/soybean/Web/Projects/SoybeanJS/hono-ssr](file:///Users/soybean/Web/Projects/SoybeanJS/hono-ssr) | `createDefineRoute` multi-overload type inference pattern; middleware chain Input types accumulate left-to-right via `IntersectNonAnyTypes`, ensuring validator-defined params/query/json types flow to subsequent handlers |
| **elegant-router** | [/Users/soybean/Web/Projects/SoybeanJS/elegant-router](file:///Users/soybean/Web/Projects/SoybeanJS/elegant-router) | Typed route names (RouteName union type), reuse routes (`xxx.reuse.ts` for reusing page components), CLI route add/remove/modify (interactive commands), virtual module exposing full route data, route group naming conversion |
| **@soybeanjs/request** | [/Users/soybean/Web/Projects/SoybeanJS/request](file:///Users/soybean/Web/Projects/SoybeanJS/request) | axios-based type-safe fetch client design, dual-mode (standard mode throws on error, flat mode returns `{ data, error }`), request/response type inference based on openapi-typescript-generated paths types |

### 1.3 Reference Project Integration Strategy

| Feature | void | nitro | ubean Decision |
| --- | --- | --- | --- |
| HTTP Framework | Hono | h3 | ✅ Hono (lightweight, modern, type-friendly) |
| Build Tool | Vite-Plus | Vite/Rollup/Rolldown | ✅ Vite-Plus |
| Page Routing | Inertia-style SSR + framework adapters | renderer abstraction | ✅ Inertia-style, Vue adapter only |
| API Routing | File-based routing (routes/) | File-based routing (server/api/) | ✅ File-based routing (routes/) |
| Platform Adaptation | Cloudflare-focused | 30+ platform presets | ✅ nitro-style preset system |
| Deployment Platform | Void Cloud (proprietary) | Independent per-platform | ❌ Removed, replaced with generic deployment |
| Authentication | Better Auth built-in | None built-in | ✅ Standalone extension `@ubean/auth` (Better Auth integration + built-in fallback) |
| State Management | None built-in | None built-in | ✅ Standalone extension `@ubean/pinia` (Pinia integration + SSR state hydration) |
| Database | Drizzle ORM + D1/PG | db0 abstraction layer | ✅ Drizzle ORM + multi-database drivers |
| Environment Variables | defineEnv + Schema validation | runtimeConfig | ✅ defineEnv + type-safe validation |
| Cache/ISR | KV + Edge Cache | routeRules cache | ✅ Fusion of both |
| Skills System | ✅ Agent routing | ❌ | ✅ Retained and enhanced |
| Plugin System | Vite plugins | Runtime plugins + module system | ✅ Vite plugins + runtime plugins |
| Hooks System | Wrangler hooks | Hookable lifecycle | ✅ Hookable full lifecycle |
| Type-safe Client | typed fetch | None built-in | ✅ Auto-generated type-safe client |
| OpenAPI Docs | ❌ | ✅ Scalar/Swagger UI | ✅ nitro-style OpenAPI auto-generation |
| App Instance Customization | ❌ Hardcoded entry | ❌ | ✅ defineApp exposes Vue instance |

---

## 2. Tech Stack

### 2.1 Workspace Planned Dependencies

The following is the workspace aggregate manifest; actual ownership must follow §2.4; it is not the single-package dependency manifest for `packages/ubean`.

```json
{
  "hono": "^4.x",
  "vite": "catalog:",
  "vite-plus": "catalog:",
  "defu": "^6.x",
  "pathe": "^2.x",
  "hookable": "^6.x",
  "citty": "^0.2.x",
  "c12": "^4.x",
  "tslog": "^5.x",
  "tinyglobby": "^0.2.x",
  "magic-string": "^0.30.x",
  "estree-walker": "^3.x",
  "ofetch": "^2.x",
  "ohash": "^2.x",
  "ufo": "^1.x",
  "unstorage": "^2.x",
  "db0": "^0.3.x",
  "drizzle-orm": "^0.45.x",
  "crossws": "^0.4.x",
  "unimport": "^6.x",
  "unenv": "^2.x",
  "std-env": "^4.x",
  "knitwork": "^1.x",
  "mlly": "^1.x",
  "scule": "^1.x",
  "confbox": "^0.2.x",
  "@scalar/openapi-types": "^0.2.x",
  "@standard-schema/spec": "^1.x",
  "enquirer": "^2.x",
  "ts-morph": "^24.x",
  "birpc": "^0.2.x",
  "fuse.js": "^7.x",
  "@soybeanjs/ui": "^0.x",
  "@soybeanjs/headless": "^0.x",
  "@codemirror/state": "^6.x",
  "@codemirror/view": "^6.x",
  "@codemirror/commands": "^6.x",
  "@codemirror/language": "^6.x",
  "@codemirror/lang-json": "^6.x",
  "@codemirror/lang-javascript": "^6.x",
  "@codemirror/lang-vue": "^0.x",
  "@codemirror/theme-one-dark": "^6.x",
  "unplugin-vue-components": "^28.x",
  "@iconify/vue": "^5.x",
  "@iconify/utils": "^3.x",
  "markdown-exit": "^1.x",
  "@shikijs/markdown-exit": "^4.x",
  "front-matter": "^4.x"
}
```

### 2.2 Development Dependencies

```json
{
  "@vitejs/plugin-vue": "^6.x",
  "vitest": "catalog:",
  "@vitest/coverage-v8": "^4.x",
  "@playwright/test": "^1.x",
  "typescript": "^7.x",
  "vue": "^3.x",
  "vue-tsc": "^3.x",
  "@types/enquirer": "^2.x"
}
```

### 2.3 Package Manager

- **<pnpm@11.x>** (monorepo + catalog management)

### 2.4 Dependencies and Package Boundaries

Dependencies are split by runtime boundary; each sub-package keeps minimal deps for its runtime scope. The aggregator `packages/ubean` only re-exports — it carries no runtime logic:

| Scope | Dependency Strategy | Example |
| --- | --- | --- |
| Foundation sub-packages | Only dependencies shared by Node and edge | `@ubean/types`, `@ubean/env`, `@ubean/utils` (Hono, Hookable, rou3, Standard Schema types) |
| Vue Integration | Vue and Vue Router as `peerDependencies`; SSR renderer pulled in via server entry | `vue`, `vue-router`, `@vue/server-renderer` |
| Preset Packages | `@ubean/preset` ships all platform presets; not statically imported by the core | `standard`/`node`/`cloudflare`/`vercel`/`netlify`/`bun`/`deno` |
| Browser Transport Adapters | Only bundled in the browser client entry; do not enter Node, edge, or SSR bundles | database drivers, upload-progress adapters |
| DevTools and Auth/PWA | Standalone packages, not in the production bundle by default | `@ubean/devtools`, `@ubean/auth`, `@ubean/pwa` |
| Asset and Content Extensions | Standalone packages; dependencies and platform implementations split by feature, not statically imported by core | `@ubean/icon`, `@ubean/image`, `@ubean/content`, `@ubean/fonts` |
| State Management and UI Integration | Standalone packages; underlying libraries are peerDependencies so users control versions | `@ubean/pinia`, `@ubean/ui` |

- If docs examples use `zod`, it must be marked as a user-project dependency; the framework core only depends on the Standard Schema spec and is not bound to a specific validation library.
- `@ubean/icon` lists `@iconify/vue` as a Vue peer dependency; `@iconify-json/<collection>` is installed by users on demand as a dev dependency; adding the full `@iconify/json` to framework or app default dependencies is forbidden.
- `rou3`, `env-runner`, `@vue/server-renderer`, `vue-router`, Scalar UI, and end-to-end testing tools must be written into the actual package manifest before implementing the corresponding features, and their `dependencies`, `peerDependencies`, or `devDependencies` ownership must be determined.
- Each new dependency must document the target package, runtime, license, bundle impact, and alternatives; `latest` must not be used as a published dependency version.

---

## 3. Directory Structure

> The repository is split into 37 single-purpose packages under `packages/`. `packages/ubean` is a thin aggregator that re-exports from all sub-packages — it does not contain the framework logic itself.

```
ubean/
├── packages/
│   ├── ubean/                       # Aggregator package (npm: "ubean") — pure re-exports
│   │   ├── bin/ubean.mjs            # CLI binary entry
│   │   ├── src/
│   │   │   ├── runtime/             # App/i18n/vue runtime shims (app.ts, i18n.ts, vue.ts)
│   │   │   ├── index.ts             # Public exports (re-exports all sub-packages)
│   │   │   ├── vite.ts              # Combined Vite plugin entry
│   │   │   └── vue-ssr.ts           # Vue SSR bridge
│   │   └── package.json
│   │
│   │   ── Foundation (leaf packages) ──
│   ├── types/                       # @ubean/types — shared type definitions
│   ├── utils/                       # @ubean/utils — glob, path, port, string, vite-config
│   ├── error/                       # @ubean/error — error handling
│   ├── env/                         # @ubean/env — defineEnv + schema validation
│   ├── seo/                         # @ubean/seo — conventions, json-ld, og-image
│   ├── pages/                       # @ubean/pages — Pages protocol (protocol.ts, data.ts)
│   ├── markdown/                    # @ubean/markdown — Markdown/MDX pages
│   ├── i18n/                        # @ubean/i18n — zero-dependency i18n + routing
│   │
│   │   ── Server runtime ──
│   ├── api-routes/                  # @ubean/api-routes — handler.ts, router.ts, openapi.ts, route-rules.ts, isr.ts
│   ├── actions/                     # @ubean/actions — Server Actions (define, dispatch, registry, vite)
│   ├── server/                      # @ubean/server — cache, database, storage, websocket, sse, queue, cron, cors, rate-limit, sessions, email, observability, security-headers
│   ├── app/                         # @ubean/app — createUbeanApp (Hono factory), hooks, define-server
│   │
│   │   ── Build-time ──
│   ├── auto-imports/                # @ubean/auto-imports — unimport presets
│   ├── prerender/                   # @ubean/prerender — SSG prerender
│   ├── preset/                      # @ubean/preset — platform presets (node, cloudflare, bun, deno, netlify, vercel, standard)
│   ├── config/                      # @ubean/config — c12 config loading (loader.ts, types.ts, routing.ts)
│   ├── codegen/                     # @ubean/codegen — type generation (route-types.ts, openapi-types.ts)
│   ├── modules/                     # @ubean/modules — module system (builtins.ts, kit.ts)
│   ├── routing/                     # @ubean/routing — route scanning (scan.ts, define-page.ts, detect-exports.ts, route-name.ts, generator/)
│   │
│   │   ── Vue client runtime ──
│   ├── runtime/                     # @ubean/runtime — app, client, composables, define-app, head, i18n, islands, page-macro, page-runtime, party-town, router, view-transitions, color-mode, cache-views, search
│   ├── builder/                     # @ubean/build — Vite build plugin (dir: builder; package name stays @ubean/build)
│   ├── vite/                        # @ubean/vite — Vue Vite plugin
│   ├── islands/                     # @ubean/islands — Islands (vite.ts, runtime.ts, directive.ts, bootstrap.ts)
│   ├── ssr/                         # @ubean/ssr — createVueRenderer (PPR + streaming)
│   │
│   │   ── CLI & Dev ──
│   ├── cli/                         # @ubean/cli — citty-based CLI (build, dev, preview, prepare, init, page, env, config, devtools, scaffold-commands)
│   ├── dev-server/                  # @ubean/dev-server — runner.ts, server.ts, vite-server.ts, watcher.ts
│   ├── devtools/                    # @ubean/devtools — client/ (Vue iframe app) + src/ (node rpc, server, shared)
│   │
│   │   ── Extensions (opt-in) ──
│   ├── auth/                        # @ubean/auth — Better Auth integration + fallback
│   ├── pinia/                       # @ubean/pinia — Pinia integration + SSR state hydration
│   ├── ui/                          # @ubean/ui — @soybeanjs/ui integration
│   ├── icon/                        # @ubean/icon — Iconify + custom collections
│   ├── image/                       # @ubean/image — image optimization
│   ├── content/                     # @ubean/content — content collections
│   ├── fonts/                       # @ubean/fonts — font optimization
│   ├── pwa/                         # @ubean/pwa — manifest + service worker
│   ├── electron/                    # @ubean/electron — Electron desktop apps
│   │
├── apps/
│   └── docs/                       # Official documentation site (this site, dogfooding)
├── examples/
│   ├── ubean-test/                 # Complete full-stack example + tests (virtual routing mode)
│   ├── frontend-only/              # Frontend-only example (no API/SSR)
│   └── routing-file-mode/          # Route file generation mode example
│
├── skills/ubean/                   # ubean AI Skill
│       ├── SKILL.md                 # Skill routing definition
│       ├── AGENT_PROMPT.md          # Agent prompt
│       ├── command/ubean.md         # CLI command docs
│       └── docs/                    # Built-in docs (guide, integrations, reference/api)
│
├── docs/                           # Repo-level engineering docs (ADRs, glossary, product plan)
├── scripts/                        # CI verification scripts (verify-packages.mjs)
├── .github/workflows/ci.yml
├── README.md, README.zh_CN.md
├── eslint.config.mjs
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
└── tsconfig.json
```

> Package-architecture details (aggregator pattern, subpath exports, extension mechanism) — see [Architecture §1](architecture.md#1-layered-architecture).

### User App Directory Structure

Conventions for a ubean app's `srcDir` (default `<rootDir>/src`):

```
my-app/
├── src/                        # Configurable srcDir
│   ├── pages/                  # File-based page routes (*.vue / *.md)
│   │   ├── (group)/            # Route groups: do not affect URL
│   │   ├── dashboard/
│   │   │   ├── index.vue
│   │   │   ├── profile.vue
│   │   │   └── settings.vue
│   │   ├── user/[id].vue       # Dynamic params
│   │   ├── about.vue
│   │   └── index.vue
│   ├── routes/                 # API routes (void-style named exports)
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── [id].ts     # export const GET / PATCH / DELETE
│   │   │   │   └── index.ts    # export const GET / POST
│   │   │   └── hello.ts
│   │   ├── sitemap.xml.ts
│   │   └── robots.txt.ts
│   ├── layouts/                # Layouts (default.vue or default/index.vue)
│   ├── middleware/             # Middleware (global.* / <prefix>/*.ts)
│   ├── crons/                  # Cron jobs (defineScheduled)
│   ├── locales/                # i18n messages (en.json, zh-CN.json)
│   ├── components/             # Business components
│   ├── composables/            # Composables
│   └── app.ts                  # Optional: defineApp(options)
├── public/                     # Static assets
├── ubean.config.ts             # defineConfig(...)
├── env.d.ts
├── package.json
└── tsconfig.json
```

---

## Next Steps

- [Architecture](/architecture/architecture) — framework architecture, data flow, and configuration system.
- [Routing](/architecture/routing) — file-based routing scan and route conventions.
- [Quick Start](/guide/quickstart) — create your first ubean project.
