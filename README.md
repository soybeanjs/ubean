<p align="center">
  <img src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.png" alt="ubean logo" width="120" />
</p>

<h1 align="center">ubean</h1>

<p align="center">
  A Vue-first full-stack meta-framework built on Vite-Plus
</p>

<p align="center">
  <a href="README.zh_CN.md">中文文档</a>
</p>

---

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/soybeanjs/ubean)

> **WARNING — Work in Progress, Not Production-Ready**
>
> ubean is under active development targeting the v0.1 release. Public APIs may change without notice between versions, breaking bugs are expected, and several subsystems (database layer, queue workers, cron scheduler, DevTools) have not yet been battle-tested in real-world load. **Do not use ubean in production yet.** It is currently suitable for evaluation, experimentation, and following the development progress. Production readiness is expected around the v1.0 milestone.

---

## What is ubean?

ubean unites Vue SSR pages, Hono API routes, type-safe route metadata, and portable deployment presets into a single consistent development experience. It is built on **Vite-Plus**, borrowing the Inertia-style SSR page routing from [void](https://github.com/ubeanjs/void) and the cross-platform deployment matrix from [nitro](https://github.com/unjs/nitro). Vue 3 is the only frontend adapter — every routing, validation, and config decision is type-checked at build time. A single npm package `ubean` acts as an **aggregator** that re-exports all `@ubean/*` subpackages, so installing one dependency gives you the full API surface.

## Why another meta-framework?

Nuxt, Next.js, and SvelteKit already exist — what does ubean bring that is genuinely different? Three architectural commitments define its identity:

**1. Vue-specific depth, not multi-framework breadth.** ubean targets Vue 3 only. No React adapter, no Svelte renderer, no generic abstractions that sacrifice Vue-specific optimizations. This single-framework constraint enables deep integration — the `definePage` macro is compiled away at build time, Vue Router navigation guards work identically on client and SSR, and the SSR renderer (`createVueRenderer` from `@ubean/ssr`) is purpose-built for Vue's `@vue/server-renderer`. The result is a smaller, faster runtime with zero abstraction overhead.

**2. Hono as the HTTP core, not h3.** Where Nuxt uses **h3** (its own HTTP abstraction) and nitro uses h3 as the server handler, ubean chooses **Hono** — a lighter, more modern, type-friendly HTTP framework. Every API route is a Hono handler chain; every middleware composes through Hono's native middleware system; request validation plugs directly into `hono-openapi` to generate OpenAPI 3.1 without an intermediary layer. Hono's multi-runtime design (Node.js, Cloudflare Workers, Bun, Deno) also aligns naturally with ubean's preset system.

**3. Explicit capability contracts, not silent degradation.** Every deployment preset (`node-server`, `cloudflare`, etc.) declares its capability matrix. If a target platform does not support a feature, the build produces a diagnostic error — never a silent degradation. This philosophy runs through the whole framework: `internalFetch` dispatches framework handlers in-process without a network request (and explicitly does not support upload progress); the core only depends on the Standard Schema spec (not Zod); `@ubean/icon` requires users to install a separate `@iconify-json/<collection>` package instead of bundling the full `@iconify/json` dataset.

## App Modes

ubean supports four application modes controlled by the `mode` field in `ubean.config.ts`. The default is **`fullstack`**, which produces client + SSR + server bundles. The other three modes skip unnecessary build steps to reduce output size and build time:

| Mode                             | Client | SSR        | Server | Prerender    | Typical Use Case                         |
| -------------------------------- | ------ | ---------- | ------ | ------------ | ---------------------------------------- |
| `fullstack` (default, ssr: true) | Yes    | Yes        | Yes    | Optional     | Full-stack app with SEO needs            |
| `fullstack` + `ssr: false`       | Yes    | No         | Yes    | No           | Full-stack app without SEO (admin panel) |
| `spa`                            | Yes    | No         | No     | No           | Pure client-rendered, no server          |
| `ssg`                            | Yes    | Yes (temp) | No     | Yes (forced) | Static marketing site / blog             |
| `backend`                        | No     | No         | Yes    | No           | Pure API service, no Vue pages           |

The `ssr` option only applies within `fullstack` mode — `spa` and `backend` always skip SSR, while `ssg` always requires it (for build-time rendering). Mode is **orthogonal** to preset (deployment platform) and routing mode (virtual / file generation), so you can freely combine `mode: 'fullstack'` with `preset: 'cloudflare'` and `routing.mode: 'file'`.

## Features at a Glance

| Layer     | Capability                                          | Key API                                | Package                             |
| --------- | --------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| Routing   | File-based API routes (named HTTP method exports)   | `defineHandler`                        | `@ubean/routes`                 |
| Routing   | File-based Vue SSR pages                            | `definePage` macro                     | `@ubean/scan` + `@ubean/runtime` |
| Routing   | Route metadata (auth / cache / rateLimit)           | `defineHandlerMeta`                    | `@ubean/routes`                 |
| Routing   | OpenAPI 3.1 validation + Scalar UI                  | `validator` / `describeRoute`          | `hono-openapi` (re-exported)        |
| Routing   | Type-safe route paths (generated)                   | `.ubean/routes.d.ts`                   | `@ubean/codegen`                    |
| App       | Vue app customization (plugins, guards, head)       | `defineApp`                            | `@ubean/runtime`                    |
| App       | Hono app factory                                    | `createUbeanApp`                       | `@ubean/app`                        |
| Server    | Database layer (multi-driver)                       | `defineDatabase` / `useDatabase`       | `@ubean/server`                     |
| Server    | Storage (unstorage wrapper)                         | `useStorage` / `useKV`                 | `@ubean/server`                     |
| Server    | Cache (memory + external)                           | `useCacheStore` / `cachedEventHandler` | `@ubean/server`                     |
| Server    | Queue processing                                    | `defineQueue`                          | `@ubean/server`                     |
| Server    | Scheduled tasks (cron)                              | `defineScheduled`                      | `@ubean/server`                     |
| Server    | WebSocket (crossws)                                 | `defineWebSocket`                      | `@ubean/server`                     |
| Server    | SSE streaming                                       | SSE utilities                          | `@ubean/server`                     |
| Server    | Rate limiting + CORS                                | Middleware factories                   | `@ubean/server`                     |
| Server    | Route rules (redirect / rewrite / headers / cache)  | `routeRules` config                    | `@ubean/server`                     |
| Server    | In-process handler dispatch                         | `internalFetch`                        | `@ubean/pages`                      |
| Config    | Typed config definition                             | `defineConfig`                         | `@ubean/config`                     |
| Config    | Typed environment variables                         | `defineEnv`                            | `@ubean/env`                        |
| Config    | Middleware definition                               | `defineMiddleware`                     | `@ubean/routes`                 |
| i18n      | Zero-dependency internationalization                | `defineLocale` / `t` / `useI18n`       | `@ubean/i18n` + `@ubean/runtime`    |
| SSR       | Vue server-side renderer                            | `createVueRenderer`                    | `@ubean/ssr`                        |
| Islands   | Partial hydration boundaries                        | `ubeanIslandsPlugin`                   | `@ubean/islands`                    |
| DevTools  | RPC, AI assistant, API playground, CRUD scaffolding | `devtools: true` config                | `@ubean/devtools`                   |
| Extension | Better Auth integration + fallback                  | `auth: true` config                    | `@ubean/auth`                       |
| Extension | Iconify + custom SVG collections                    | `icon: true` config                    | `@ubean/icon`                       |
| Extension | PWA manifest + service worker                       | `pwa: true` config                     | `@ubean/pwa`                        |
| Extension | Image optimization                                  | `image: true` config                   | `@ubean/image`                      |
| Extension | Content collections + Markdown                      | `content: true` config                 | `@ubean/content`                    |
| Extension | Font optimization + self-hosting                    | `fonts: true` config                   | `@ubean/fonts`                      |
| Extension | Electron desktop apps                               | `electron: true` config                | `@ubean/electron`                   |
| Extension | @soybeanjs/ui integration                           | `ui: true` config                      | `@ubean/ui`                         |

### Package Entry Points

The `ubean` main package provides several subpath exports in addition to the default `.` entry. This design prevents browsers from pulling server-side dependencies through Vite's pre-bundling:

| Subpath              | Purpose                                       | Typical Usage              |
| -------------------- | --------------------------------------------- | -------------------------- |
| `ubean`              | Main entry — re-exports all subpackages       | Server code, API routes    |
| `ubean/vite`         | Composite Vite plugin (build + vue + islands) | `vite.config.ts`           |
| `ubean/runtime/vue`  | Browser Vue client runtime (no server deps)   | Client auto-imports        |
| `ubean/runtime/app`  | Server Hono app entry (`createUbeanApp`)      | `src/server.ts`            |
| `ubean/runtime/i18n` | Server pure-function i18n                     | Build-time locale handling |
| `ubean/vue-ssr`      | Vue SSR renderer (`createVueRenderer`)        | Custom SSR setup           |

**Critical rule for newcomers:** client auto-imports **must** use the `ubean/runtime/vue` entry, never the `ubean` main entry. Importing from `ubean` in browser code triggers Vite to pre-bundle server-side dependencies (Hono, database drivers, storage adapters) — a severe performance penalty and a potential source of runtime errors in non-Node environments.

## Project Structure

### Repository Layout

ubean is a **37-package monorepo** managed by pnpm workspaces (`packages/*`, `apps/*`, `examples/*`). The public package `ubean` (`packages/ubean/`) is the aggregator that re-exports all `@ubean/*` subpackages. Each subpackage is independently built, type-checked, and consumable individually in advanced scenarios. For a CodeGraph-backed structure audit and improvement backlog, see [docs/architecture-analysis.md](docs/architecture-analysis.md).

```
packages/
├── ubean/          # Main package (npm: "ubean") — aggregator, re-exports all @ubean/*
├── types/          # @ubean/types — shared types
├── utils/          # @ubean/utils — utility functions
├── error/          # @ubean/error — error classes
├── env/            # @ubean/env — typed environment variables
├── seo/            # @ubean/seo — SEO meta management
├── pages/          # @ubean/pages — page data protocol (loader/action)
├── markdown/       # @ubean/markdown — Markdown/MDX page parsing
├── i18n/           # @ubean/i18n — zero-dependency i18n (pure functions)
├── scan/           # @ubean/scan — project scanner (scanProject + route metadata)
├── routes/         # @ubean/routes — server routes runtime (defineHandler + rou3 router)
├── actions/        # @ubean/actions — Server Actions / Form Actions (defineAction)
├── server/         # @ubean/server — server runtime (cache/db/queue/cron/ws/sse)
├── app/            # @ubean/app — Hono app factory (createUbeanApp)
├── config/         # @ubean/config — config loader (c12 + defu)
├── preset/         # @ubean/preset — platform presets (node/cloudflare + capabilities)
├── codegen/        # @ubean/codegen — type generation (routes.d.ts, pages.d.ts)
├── modules/        # @ubean/modules — module system (builtins + kit)
├── auto-imports/   # @ubean/auto-imports — unimport auto-import presets
├── runtime/        # @ubean/runtime — Vue client runtime
├── islands/        # @ubean/islands — Islands partial hydration
├── ssr/            # @ubean/ssr — Vue SSR renderer (createVueRenderer)
├── vite/           # @ubean/vite — Vue-specific Vite plugin
├── builder/        # @ubean/build — build-time core (dir: builder; package name stays @ubean/build)
├── prerender/      # @ubean/prerender — SSG prerendering
├── dev-server/     # @ubean/dev-server — dev server
├── cli/            # @ubean/cli — CLI commands (citty)
├── devtools/       # @ubean/devtools — devtools (RPC, AI, CRUD scaffolding)
├── auth/           # @ubean/auth — Better Auth integration + fallback
├── icon/           # @ubean/icon — Iconify integration + custom collections
├── pwa/            # @ubean/pwa — PWA manifest + service worker
├── image/          # @ubean/image — image optimization
├── content/        # @ubean/content — content collections
├── fonts/          # @ubean/fonts — font optimization + self-hosting
├── electron/       # @ubean/electron — Electron desktop apps (vite-plugin-electron)
├── pinia/          # @ubean/pinia — Pinia integration (SSR hydration + optimizeDeps)
└── ui/             # @ubean/ui — @soybeanjs/ui integration (UiResolver + styles.css)

apps/docs/          # Documentation site (source under src/content/{en,zh}/)
examples/           # ubean-test / frontend-only / routing-file-mode
docs/               # Repo-level engineering docs (roadmap, architecture analysis)
```

### User App Layout

When you scaffold a ubean app, `srcDir` (default `<rootDir>/src`) follows a conventional directory structure. Every directory has a framework-recognized purpose — `pages/` for Vue routes, `routes/` for API endpoints, `layouts/` for page wrappers, etc. This convention-based approach means a standard project needs zero configuration, while `ubean.config.ts` provides an escape hatch for customization:

```
my-app/
├── src/                        # Configurable srcDir (default: <rootDir>/src)
│   ├── pages/                  # File-based page routes (*.vue / *.md)
│   │   ├── (group)/            # Route groups — do not contribute to URL
│   │   ├── dashboard/
│   │   │   ├── index.vue
│   │   │   ├── profile.vue
│   │   │   └── settings.vue
│   │   ├── user/[id].vue       # Dynamic route params
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
│   ├── layouts/                # Page layouts (default.vue or default/index.vue)
│   ├── middleware/             # Route middleware (global.* / <prefix>/*.ts)
│   ├── crons/                  # Scheduled tasks (defineScheduled)
│   ├── locales/                # i18n messages (en.json, zh-CN.json)
│   ├── components/             # Business components
│   ├── composables/            # Auto-imported composables
│   └── app.ts                  # Optional: defineApp(options)
├── public/                     # Static assets
├── ubean.config.ts             # defineConfig({...})
├── env.d.ts
├── package.json
└── tsconfig.json
```

## Quick Start

> **Reminder:** ubean is not production-ready. Use it for evaluation and experimentation only.

### Scaffold a New Project

```bash
# Using pnpm (recommended)
pnpm dlx ubean init my-app

# Or with npm / yarn / bun
npx ubean init my-app
```

The init wizard will prompt you for template (minimal / starter / blog), preset (standard / node / cloudflare), and package manager.

### Manual Setup

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add ubean vue
```

Create `ubean.config.ts`:

```ts
import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: 'standard'
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

### Development Commands

| Command          | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`       | Start the dev server with HMR                                                   |
| `pnpm build`     | Build for production (client + server + optional SSR)                           |
| `pnpm preview`   | Preview the production build locally                                            |
| `pnpm prepare`   | Generate type definitions to `.ubean/` (auto-installs missing built-in modules) |
| `pnpm typecheck` | Type-check the project with vue-tsc                                             |

### Enabling Built-in Modules

Built-in modules (`icon`, `pwa`, `auth`, `image`, `fonts`, `electron`, `ui`) are opt-in via `ubean.config.ts`. When you enable one, the corresponding `@ubean/*` package is required:

```ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: true, // @ubean/ui — auto-injects @soybeanjs/ui styles.css + UiResolver
  icon: true, // @ubean/icon — Iconify integration
  pwa: true, // @ubean/pwa — manifest + service worker
  auth: true, // @ubean/auth — Better Auth integration
  electron: true // @ubean/electron — desktop app (auto-disables SSR)
});
```

Running `ubean prepare` will **auto-detect and install** any missing built-in module packages using your project's package manager (pnpm / yarn / bun / npm). Use `ubean prepare --no-install` to skip auto-install (e.g. in CI). If a module is enabled but not installed when running `ubean dev` or `ubean build`, a clear warning is logged so you know the module was silently skipped rather than puzzling over why `ui: true` has no effect.

## Architecture Direction

ubean's core implementation follows six boundaries:

1. **Pure function core.** Configuration merging, file scanning, route parsing, code generation, and type inference are all pure functions. No I/O, no Hono instances, no Vite plugins — those live behind explicit adapter boundaries. This makes the build pipeline testable without mocking the entire dev server.

2. **Explicit side-effect boundaries.** Everything that touches the file system, network, Hono, Vite, or Hookable is isolated in dedicated layers. The core layer cannot call `fs.readFile` or `app.use()` directly — it produces data structures consumed by the plugin/runtime layer.

3. **No bundled browser HTTP client.** ubean does not ship a fetch wrapper in the browser bundle. For browser HTTP requests, use [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) (`createRequest` / `toFlatRequest` / `createTypedClient`). For typed clients, consume the generated `.ubean/routes.d.ts` paths types.

4. **In-process dispatch over network round-trips.** `internalFetch` invokes framework handlers directly within the same process — no HTTP request is created. This is faster and avoids auth context leakage, but it explicitly does not support upload progress tracking.

5. **Declare capabilities, do not silently degrade.** Every preset publishes a capability matrix. Unsupported features produce build-time diagnostics, never runtime surprises. A Cloudflare Workers preset that cannot run a WebSocket handler tells you at build time, rather than silently dropping the feature.

6. **Strict TypeScript, functional style.** ubean follows TypeScript functional programming conventions — no class hierarchies for framework APIs, composition over inheritance, and every public `define*` function returns a typed object consumed structurally by the build pipeline.

## Status

The v0.1 target platforms are **Node.js** (`node-server`) and **Cloudflare Workers**. Bun, Deno, Vercel, Netlify, and other platforms are outside the v0.1 support commitment but will arrive progressively through the preset capability matrix.

### Implemented Capabilities

- **Routing:** `routes/` API file routing with named `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` / `HEAD` exports wrapped by `defineHandler`; `pages/` Vue SSR pages, layouts, route groups, reuse routes, loaders/actions, and typed navigation; `defineHandlerMeta` for route metadata (`requiresAuth`, `cache`, `rateLimit`); `validator` / `describeRoute` / `resolver` from `hono-openapi` for request validation and OpenAPI 3.1 generation; generated `paths` types at `.ubean/routes.d.ts`.
- **App:** `defineApp` options-based customization (including `router.setup` for global navigation guards on both client and SSR), `definePage` macro, `defineMiddleware`, `defineLocale`, `defineEnv`, `defineScheduled` (cron), `defineQueue`.
- **Server:** Built-in database layer (`defineDatabase` / `useDatabase`), storage (`useStorage` / `useKV`), cache (`useCacheStore` / `cachedEventHandler`), rate limiting, CORS, route rules (redirect / rewrite / headers / cache), and SSG prerendering. WebSocket (`defineWebSocket`), SSE streaming, and `internalFetch` (dispatches framework handlers in-process without a network request).
- **DevTools:** RPC, AI assistant, API playground, and CRUD scaffolding.
- **Extension packages:** `@ubean/auth` (Better Auth with fallback), `@ubean/icon` (Iconify integration), `@ubean/pwa`, `@ubean/image`, `@ubean/content`, `@ubean/fonts`, `@ubean/electron` (desktop apps via vite-plugin-electron, with default main/preload entries and auto SSR disable), `@ubean/ui` (@soybeanjs/ui integration with UiResolver and styles.css auto-injection).

> Note: While the above capabilities are implemented and pass type-checks and basic tests, several subsystems (especially the database layer, queue workers, and cron scheduler) have not been load-tested or hardened for production traffic. Treat the v0.1 release as a preview.

## Development

Requirements: Node.js and pnpm `11.11.0`.

```bash
pnpm install
pnpm typecheck
pnpm lint
```

| Command          | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `pnpm typecheck` | Type-check the project with vue-tsc                  |
| `pnpm lint`      | Run Vite-Plus/OXC and Vue ESLint auto-fixes          |
| `pnpm test`      | Run the test suite (vitest)                          |
| `pnpm dev`       | Start the example dev server (`examples/ubean-test`) |
| `pnpm build`     | Build all subpackages                                |
| `pnpm upkg`      | Check dependency updates                             |
| `pnpm commit`    | Create a commit with the project commit-message tool |

## Planning and Contributions

- The [documentation index](docs/README.md) contains the architecture reference, historical design records, and pending proposals.
- Usage guides and API references live in [skills/ubean/docs](skills/ubean/docs).
- [AGENTS.md](AGENTS.md) is the canonical quick reference for AI assistants and contributors — package list, core APIs, conventions, and common pitfalls.
- Each feature should include unit tests, a real fixture, and the applicable `dev`, `build`, `preview`, or browser end-to-end verification.
- Changes to public APIs, preset capabilities, or generated types must update the plan, tests, and migration guidance together.

## License

[MIT License](LICENSE)
