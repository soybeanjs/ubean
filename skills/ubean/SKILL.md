---
name: ubean
display_name: ubean Framework
description: Full-stack Vue meta-framework built on Vite, Hono and Vue. File-based routing, SSR, islands architecture, i18n, DevTools, OpenAPI and multi-platform presets.
version: 0.6.1-beta.3
author: SoybeanJS
license: MIT
category: Web Framework
repository: https://github.com/soybeanjs/ubean
homepage: https://ubean.soybeanjs.cn
keywords:
  - vue
  - vite
  - hono
  - full-stack
  - ssr
  - ssg
  - meta-framework
  - devtools
  - islands
  - i18n
  - openapi
---

# ubean Skill

> ubean is a full-stack Vue meta-framework combining Vite, Hono and Vue. The public package name is **`ubean`** (no `@ubean/core`); all framework APIs are imported from `ubean` directly or from subpath exports such as `ubean/client`.

## When to Use This Skill

Use this skill when working with ubean framework projects, including:

- Creating new ubean projects with `ubean init`
- Developing pages with file-based routing (`pages/**/*.vue`, `definePage` macro)
- Building API routes with Hono (`routes/**`, `defineHandler`, named exports `GET`/`POST`/...)
- Using hono-openapi `validator` / `describeRoute` / `resolver` for typed requests and OpenAPI
- Configuring internationalization (i18n) with `ubean.config.ts` `i18n` + `setLocale` (note `useI18n` is opt-in via `autoImports: { vueI18n: true }`, otherwise import it from `vue-i18n`)
- Using islands architecture (`v-client.load|idle|visible|media|only`)
- Configuring modules and platform presets (`standard` / `node` / `cloudflare` / `cloudflare-dev` / `vercel` / `vercel-edge` / `netlify` / `bun` / `deno` / `aws` / `azure`)
- Debugging with ubean DevTools
- Using the built-in icon / image / content / fonts / pwa / auth / electron / pinia / ui extension packages

## Quick Start

### Create a New Project

```bash
# Interactive mode
pnpm create ubean@latest

# Non-interactive mode
pnpm create ubean@latest my-app --template starter --preset node -y
```

### Development Workflow

```bash
cd my-app
pnpm install
pnpm dev
```

## Agent Info

- **Name**: ubean
- **Description**: Full-stack Vue meta-framework built on Vite, Hono and Vue
- **Version**: 0.6.1-beta.3
- **Category**: Web Framework
- **Public package**: `ubean` (workspace `packages/ubean`)

## Package Architecture

ubean is a **monorepo** of 24 packages. The public package `ubean` is an **aggregator** that re-exports all `@ubean/*` subpackages — users install one package (`ubean`) and get the full API surface via `import { ... } from 'ubean'`.

### Subpath Exports

| Subpath          | Purpose                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ubean`          | **Isomorphic main entry (client-safe)**: shared/seo/pages/markdown + Vue client kernel + islands client runtime + logger + `defineConfig`            |
| `ubean/vite`     | Default Vite plugin combo (build + vue + islands + server-actions) for `vite.config.ts`                                                              |
| `ubean/client`   | Framework client runtime: kernel + `createServerHead` + Server Actions runtime + islands registry bridge                                             |
| `ubean/server`   | Server runtime aggregate (`defineHandler`/`defineAction`/`validator`/`useDatabase`/`createUbeanApp`/`defineServer`) for `src/server.ts` + API routes |
| `ubean/build`    | Build-time tooling aggregate (`prerender`/`loadUbeanConfig`/`getAutoImportPresets`/`detectPreset`/Vite plugins)                                      |
| `ubean/i18n`     | Server-side i18n (`@intlify/core` + ALS `t()` + `compileLocalePaths` + middleware)                                                                   |
| `ubean/ssr`      | Vue SSR renderer (`createVueRenderer`)                                                                                                               |
| `ubean/scaffold` | Scaffold library + machine-readable catalog                                                                                                          |

> **Critical**: Import domain by entry — isomorphic APIs from `ubean` (safe anywhere), server APIs from `ubean/server` (Hono + `node:*`), build-time APIs from `ubean/build` (scan + oxc WASM). Importing `ubean/server` in client code triggers Vite to pre-bundle server dependencies in the browser environment. `defineConfig` in `ubean.config.ts` stays on the main entry.

### Key Subpackages

| Package         | Responsibility                                                        |
| --------------- | --------------------------------------------------------------------- |
| `@ubean/shared` | Shared types, errors, env + common utils (protocol leaf)              |
| `@ubean/scan`   | Route scanner + rou3 router + AST extractor                           |
| `@ubean/build`  | Build-time core (virtual modules + Vite plugins)                      |
| `@ubean/client` | Pure client kernel (composables, router, page cache, islands hydrate) |
| `@ubean/server` | Server runtime (cache/db/queue/cron/ws/sse/storage)                   |
| `@ubean/app`    | Hono app factory + server config                                      |
| `@ubean/config` | Config loading (c12 + defu) + module system                           |
| `@ubean/cli`    | CLI commands (init/dev/build/preview/page/env)                        |

Extension packages (`@ubean/auth`, `@ubean/icon`, `@ubean/image`, `@ubean/content`) and thin integration modules (`@ubean/integrations/{pwa,fonts,electron,pinia,ui}`) are loaded on-demand via `ubean.config.ts` flags (`icon: true`, `pwa: true`, `electron: true`, `pinia: true`, `ui: true`, etc.).

## Commands

| Command  | Description                                     | Usage                                        |
| -------- | ----------------------------------------------- | -------------------------------------------- |
| init     | Initialize a new ubean project                  | `ubean init [options]`                       |
| dev      | Start development server (Vite middleware mode) | `ubean dev [options]`                        |
| build    | Build for production (Vite SSR dual build)      | `ubean build [options]`                      |
| preview  | Preview production build                        | `ubean preview [options]`                    |
| prepare  | Generate `.ubean/` types                        | `ubean prepare [--cwd <dir>] [--no-install]` |
| page     | Scaffold page/api/layout/middleware/reuse       | `ubean page add [options]`                   |
| env      | Manage `.env` files                             | `ubean env <subcommand>`                     |
| config   | Show/init/example resolved configuration        | `ubean config <subcommand>`                  |
| devtools | Print DevTools info/URL                         | `ubean devtools info`                        |

### Command Details

#### ubean init

Initialize a new ubean project with interactive wizard or non-interactive mode.

**Options:**

- `--name`: Project name
- `--template`: Template (`unify`, `minimal`, `starter`, `blog`; default `unify`)
- `--preset`: Preset (`standard`, `node`, `cloudflare`, `vercel`, `vercel-edge`, `netlify`, `bun`, `deno`, `aws`, `azure`; default `standard` — the interactive menu only offers the first three)
- `--pm <npm|pnpm|yarn|bun>`: Package manager (default `npm`)
- `--yes, -y`: Skip interactive prompts and use defaults
- `--force, -f`: Overwrite existing files
- `--git` / `--no-git`: Initialize a git repository (prompts when neither is passed)

> Only `-f`, `-y` and `--pm` have short forms. There are **no** `-n` / `-t` / `-p` aliases — citty parses them as boolean flags, so `init -n blog -t blog` leaves `template`/`preset`/`name` unset (falling back to `unify` / `standard`) and takes `blog` as the target directory.

**Examples:**

```bash
ubean init
ubean init --name my-app --template starter --preset node
ubean init --name blog --template blog -y
ubean init my-app --preset vercel-edge -y
```

#### ubean dev

Start the development server. Uses Vite middleware mode so all configured modules' Vite plugins (HMR, virtual modules, HTML transform) take effect automatically.

**Options:**

- `--port`: Server port (default: 9527)
- `--host`: Host to listen on
- `--open`: Open browser on start

**Examples:**

```bash
ubean dev
ubean dev --port 9527 --host 0.0.0.0
```

#### ubean build

Build the application for production via Vite dual build (client + SSR).

**Options:**

- `--preset`: Build preset (`standard`, `node`, `cloudflare`, `cloudflare-dev`, `vercel`, `vercel-edge`, `netlify`, `bun`, `deno`, `aws`, `azure`; defaults to `build.preset` in ubean.config.ts, itself `node`)
- `--mode <fullstack|spa|ssg|backend>`: App mode override
- `--no-ssr` / `--ssg` / `--no-minify`: render & output toggles
- `--prerender`: Enable static site generation

**Examples:**

```bash
ubean build
ubean build --preset cloudflare
```

#### ubean preview

Preview the production build locally.

**Options:**

- `--port`: Preview port (default: 9725)
- `--host`: Host to listen on

**Examples:**

```bash
ubean preview
ubean preview --port 9527
```

#### ubean page add

Scaffold a new page / api / layout / middleware / reuse route.

**Arguments:**

- `<type>`: `page` | `api` | `layout` | `middleware` | `reuse` | `cron` | `plugin`
- `<path>`: Route path (e.g. `about`, `blog/post`, `users/[id]`)

**Options:**

- `--force`: Overwrite existing file (with `.bak` backup)
- `--dry`: Dry run, print planned changes without writing

**Examples:**

```bash
ubean page add about
ubean page add "blog/post"
ubean page add --type api users
ubean page add --type layout admin
```

## API Routes

### File Convention (single file, named exports)

ubean uses **void-style** named exports: a single file defines multiple HTTP methods through `export const GET`, `export const POST`, etc. There is **no** `.get.ts` / `.post.ts` file suffix convention.

```
src/routes/
├── api/
│   ├── hello.ts          # GET/POST /api/hello  (named exports in one file)
│   ├── users/
│   │   ├── index.ts      # GET/POST /api/users
│   │   └── [id].ts       # GET/PATCH/DELETE /api/users/:id
│   └── health.ts         # GET /api/health
└── index.ts              # GET /
```

### Defining a Handler

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ message: 'Hello from ubean API!' });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ received: body });
});
```

### Typed Requests + OpenAPI (hono-openapi)

`validator`, `describeRoute`, `resolver` are re-exported from **`ubean/server`** (originally from `hono-openapi`). The isomorphic main entry `ubean` does **not** re-export them. `defineHandlerMeta` carries ubean-specific metadata such as `requiresAuth`, `cache`, `rateLimit`.

```typescript
// src/routes/api/users/[id].ts
import { defineHandler, defineHandlerMeta, validator, describeRoute, resolver } from 'ubean/server';
import { z } from 'zod';

const idParam = z.object({ id: z.string() });

export const GET = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Get user by ID',
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: resolver(z.object({ id: z.string() })) } } },
      404: { description: 'Not found' }
    }
  }),
  defineHandlerMeta({ requiresAuth: true, cache: { ttl: 60 } }),
  validator('param', idParam),
  async c => {
    const { id } = c.req.valid('param'); // typed
    return c.json({ id });
  }
);
```

### Built-in / Internal Routes

| Route                           | Method   | Description                                      |
| ------------------------------- | -------- | ------------------------------------------------ |
| `/_health`                      | GET      | Health check endpoint                            |
| `/_openapi.json`                | GET      | OpenAPI 3.1 spec (dev)                           |
| `/_scalar`                      | GET      | Scalar API docs UI (dev)                         |
| `/_iconify`                     | GET      | Local icon collection dev server (`@ubean/icon`) |
| `/_devtools` / `/_devtools/rpc` | GET/POST | DevTools iframe + RPC (dev only)                 |

## Document Routes

### Guide

- `/guide/quickstart`: Quick start guide
- `/guide/app-modes`: Application modes (fullstack / spa / ssg / backend)
- `/guide/vite-plugin-migration`: Vite plugin migration (post-convergence config changes)
- `/guide/routing-modes`: Route generation modes (virtual / file / both)
- `/guide/pages-routing/overview`: Pages and routing overview
- `/guide/pages-routing/loaders`: Data loaders
- `/guide/pages-routing/actions`: Server Actions
- `/guide/i18n`: Internationalization
- `/guide/islands`: Islands architecture
- `/guide/content`: Content collections
- `/guide/app-modes`: fullstack / spa / ssg / backend

### Architecture

- `/architecture/overview`: Concepts and goals
- `/architecture/architecture`: Package/system architecture
- `/architecture/routing`: Route conventions + `defineHandler` design
- `/architecture/runtime`: Master feature doc (app root, presets, DevTools, colour mode, Partytown, Pagefind, queues, transitions)
- `/architecture/framework-comparison`: Capability comparison

### Ecosystem & Contributing

- `/ecosystem`: Capability maturity and deferred features
- `/contributing/engineering`: Engineering conventions, export contract, testing gates

### Reference

- `/reference/route-helpers`: Route helper functions
- `/reference/response-helpers`: Response helper functions
- `/reference/env`: Environment variables
- `/reference/database`: Database operations
- `/reference/cache`: Cache operations
- `/reference/i18n`: I18n API

### Integrations

- `/integrations/database`: Database integrations (Drizzle, db0)
- `/integrations/auth`: Authentication (`@ubean/auth`)
- `/integrations/icons`: Icons (`@ubean/icon`)
- `/integrations/electron`: Desktop apps (`@ubean/integrations/electron`)
- `/integrations/pinia`: State management (`@ubean/integrations/pinia`)
- `/integrations/ui`: UI components (`@ubean/integrations/ui`)

## Configuration

### ubean.config.ts

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  rootDir: '.',
  srcDir: 'src',
  mode: 'fullstack', // 'fullstack' (default) | 'spa' | 'ssg' | 'backend'
  ssr: true, // only effective when mode === 'fullstack'
  modules: [],
  // Top-level shortcuts for official extension packages (default: false)
  icon: false, // @ubean/icon
  pwa: false, // @ubean/integrations/pwa
  auth: false, // @ubean/auth
  image: false, // @ubean/image
  fonts: false, // @ubean/integrations/fonts
  electron: false, // @ubean/integrations/electron (enabling auto-disables SSR unless explicitly set)
  pinia: false, // @ubean/integrations/pinia (Pinia integration: dev optimizeDeps + SSR state hydration helpers)
  ui: false, // @ubean/integrations/ui (@vean/ui: UiResolver + styles.css auto-injection)
  // Route generation mode (virtual | file | both)
  routing: { mode: 'virtual' },
  // i18n routing
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default' // prefix | prefix_except_default | prefix_and_default | no_prefix
  },
  // Dark mode (auto-imported `useColorMode()` + no-FOUC inline script)
  colorMode: { preference: 'system', fallback: 'light', classSuffix: '-mode', storageKey: 'ubean-color-mode' },
  // Third-party scripts in a web worker (requires `partytown copylib public/~partytown`)
  partyTown: true,
  // Static search index built with the Pagefind CLI at build time
  search: true,
  // Cross-request fetch() Data Cache (default true)
  dataCache: true,
  // HTTP response cache store: 'auto' → fs on Node prod, memory on serverless/edge
  cache: { store: 'auto', dir: '.ubean/cache' },
  // Built-in middleware toggles (csrf + security headers)
  security: { csrf: true, headers: true },
  // Dev-time log categories: 'auto' hides diagnostics/request logs unless they fail
  logging: { level: 'info', diagnostics: 'auto', request: 'auto', scan: false, lifecycle: false },
  // Auto-import preset groups — only `ubean` is on by default
  autoImports: { ubean: true, vue: false, vueRouter: false, vueI18n: false, honoOpenapi: false },
  components: { ubean: true },
  scanOptions: { ignore: [] },
  favicon: true,
  routeRules: {}
});
```

> **`build.preset`, not a top-level `preset`.** `UbeanConfig` has no top-level `preset` field — writing `preset: 'cloudflare'` at the root is **silently ignored** and you get the default Node preset. Set it via `build: { preset: 'cloudflare' }` (verified in AGENTS.md) or leave it out entirely so `detectPreset()` infers it.

> **App modes**: `mode` controls which build steps run. `fullstack` (default) builds client + SSR + server; `spa` builds client only; `ssg` prerenders to static HTML via the direct render path (minimal static bundle, no Hono pipeline; `pages/404.vue` → `404.html`; i18n routes auto-expanded; page `loader` not executed); `backend` builds API server only. See [App Modes](/guide/app-modes) and [Route Generation Modes](/guide/routing-modes).
>
> **Electron**: `electron: true` enables `@ubean/integrations/electron` with default main/preload entries (`electron/main.ts`, `electron/preload.ts`) and auto-disables SSR (desktop apps don't need SSR unless explicitly set via `ssr: true`).

### Module Configuration

```typescript
export default defineConfig({
  modules: [
    // Vite plugin instance
    somePlugin(),

    // Factory tuple [factory, options]
    [iconFactory, { prefix: 'icon-' }],

    // Module definition
    {
      name: 'my-module',
      vitePlugin: myPlugin(),
      setup(options, kit) {
        kit.addServerHandler({ route: '/api/hello', handler: () => 'Hello' });
      },
      dependsOn: ['icon']
    }
  ]
});
```

### Built-in Module Keys

Use these keys in `dependsOn` for built-in modules:

| Key        | Module                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| `icon`     | @ubean/icon (icon system, UbeanIcon component)                            |
| `pwa`      | @ubean/integrations/pwa (PWA support)                                     |
| `auth`     | @ubean/auth (authentication)                                              |
| `image`    | @ubean/image (image optimization)                                         |
| `fonts`    | @ubean/integrations/fonts (font optimization)                             |
| `content`  | @ubean/content (content management)                                       |
| `electron` | @ubean/integrations/electron (desktop apps, auto-disables SSR)            |
| `pinia`    | @ubean/integrations/pinia (Pinia: dev optimizeDeps + SSR state hydration) |
| `ui`       | @ubean/integrations/ui (@vean/ui: UiResolver + styles.css)                |

## Key Features

### 1. Full-Stack Framework

- Server-side rendering (SSR) with Vue + `@vue/server-renderer`
- Client-side hydration with `createUbeanClientApp` / `createUbeanSSRApp`
- Islands architecture for partial hydration (`v-client.load|idle|visible|media|only` directives; legacy `client:*` still works) with auto-registration and auto-hydration (zero-config, no manual `hydrateIslands()` call needed)
- View Transitions API for native page transitions

### 2. Vite Integration

- Dev server uses Vite middleware mode (`vite.createServer({ middlewareMode: true })`)
- Hot module replacement via Vite native HMR
- Virtual modules: `ubean:pages`, `ubean:routes`, `ubean:meta`, `ubean:app-config`, `ubean:locales`, `virtual:ubean-islands-registry`
- SSR modules loaded via `vite.ssrLoadModule()` in dev

### 3. Module System

- Plugin-based architecture (`ModuleDefinition` with `vitePlugin` / `setup` / `hooks` / `dependsOn`)
- Topological dependency resolution (cycle-safe fallback)
- Nuxt Kit-style API: `addServerHandler`, `addVitePlugin`, `addVirtualImports`, `addComponentsDir`, `addAutoImport`, `addDevToolsTab`
- 10 lifecycle hooks: `app:created`, `app:before:register`, `app:after:register`, `app:ready`, `build:before`, `build:after`, `dev:setup`, `dev:listen`, `request:start`, `request:end`

### 4. Routing

- API routes: `routes/**` with void-style named exports (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS`/`HEAD`)
- Page routes: `pages/**/*.vue` (+ `.reuse.ts`, `.md`)
- Layouts: `layouts/` (`xx.vue` or `xx/index.vue`), supports nested layout chain (`layout: ['default', 'admin']` = outer → inner)
- Route groups: `(group)/` directories don't contribute URL segments
- `definePage` compile-time macro for meta/layout/name/path override
- Middleware: `middleware/` with numeric prefix ordering; `global`/`global.*` → `/*`, others by directory prefix (mounts at `/dir/*`)
- Dynamic params: `[id].vue` → `/user/:id`; matchers `[id=numeric].vue` validate params via `defineMatcher(name, fn)` (falsy = no match → next candidate or 404). Server side validated by Hono middleware (404 on reject); client side needs `router.beforeEach(createMatcherGuard())` inside `defineApp({ router: { setup } })`. Works for pages (`[id=numeric].vue`), catch-all (`[...slug=any].vue`), optional (`[[page=numeric]].vue`) and API routes (`[id=numeric].get.ts`)
- Parallel routes: `@slotName/` directories render into named slots — Vue Router named views + `<SlotView name="dialog" />` in the layout. Intercepting routes (`(.)` / `(..)` / `(...)`) are **deliberately not supported** — the scanner throws instead of silently producing a literal `/feed/(.)photo/:id` path
- Typed route helpers: **ubean exports no `useRoute`/`navigateTo`/`redirectTo` wrappers** — import `useRoute()` / `useRouter()` from `vue-router` directly. Route-path types are generated at `.ubean/typed-router.d.ts`; route generation supports `virtual` (default) / `file` / `both` modes via `routing.mode`
- Route guards: `defineApp({ router: { setup(router) { router.beforeEach(...) } } })` registers navigation guards on both client and SSR (shared setup runs first, then client/server-specific setups); registration must be synchronous
- **Reuse routes** (`xxx.reuse.ts` / `xxx.reuse.vue`): inherit the target's `cache` when not explicitly declared; `cache: false` opts out
- **Page cache (KeepAlive)**: `definePage({ cache: true })` auto-wraps the page via `getNamedPageWrapper` (no manual `defineOptions({ name })`) and enables `onActivated` / `onDeactivated`. Runtime control: `useCacheViews()`, `enablePageCache(name)`, `disablePageCache(name)`, `excludePageCache(name)`, `includePageCache(name)`, `invalidatePageCache(name)`, `isPageCached(name)`, `resetRouteCache(name?, delay)`

### 4b. Special Pages and App Root

Only **root-level** files are special (`pages/users/404.vue` is a normal `/users/404` route):

| File                            | Behaviour                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pages/404.vue` (`.ts` / `.md`) | Vue Router catch-all `/:pathMatch(.*)*` + Hono `GET *` fallback; unmatched browser navigation returns a real 404 status. `/api/*` and `/_*` keep the default JSON 404. SSG also emits `404.html`                                                                   |
| `pages/loading.vue`             | `<Suspense>` fallback shown while a lazily loaded page component resolves. **Client/SPA navigation only** — SSR resolves synchronously.                                                                                                                            |
| `pages/error.vue`               | Error boundary built on Vue `errorCaptured`; receives an `error` prop, resets on route change. **Client only.**                                                                                                                                                    |
| `src/app.vue` / `src/App.vue`   | Application root component wrapping the layout chain + page. The framework outlet is the **default slot** (`<slot />`) — do not render `<PageView />` / `<RouterView />` yourself or you bypass the layout chain. Lowercase `app.vue` wins; `.vue` extension only. |

Priority for all three app-level slots: `defineApp({ appRoot })` > `src/app.vue` > `src/App.vue`; `defineApp({ loadingComponent, errorComponent })` > `pages/loading.vue` / `pages/error.vue`.

### 5. Internationalization

- vue-i18n 11 (`legacy: false`) on Vue; `@intlify/core` + ALS in handlers
- Compact locale routing: `compileLocalePaths` shared by Hono and vue-router
- 4 strategies: `prefix` / `prefix_except_default` / `prefix_and_default` / `no_prefix`
- Detection order: URL path → cookie (`ubean_locale`, written) → Accept-Language → defaultLocale
- Framework `setLocale` = load messages + cookie + `router.replace`; import from `ubean/client`
- SSR hydration via `<script id="__UBEAN_LOCALE__">`; auto `<html lang/dir>` + hreflang

### 6. DevTools

- iframe-based panel injected in dev only (production tree-shaken)
- RPC over `postMessage` with session token + origin binding
- Built-in tabs: Overview, Pages, API Routes, Middlewares, Layouts, Cron Jobs, Env Vars, Config, API Playground, AI Assistant
- CRUD operations share logic with CLI (`packages/cli/src/shared/fs-ops.ts`)
- Hookable CRUD lifecycle (`page:beforeCreate`, `api:afterUpdate`, `env:beforeDelete`, ...)
- AI assistant with LLM function calling driving CRUD via RPC
- `defineDevToolsTab(tab)` (`@ubean/devtools`) registers a custom panel tab; modules can also add one via the kit's `addDevToolsTab()`

### 7. Platform Presets

- `standard`: generic fetch handler (default, alias `default`)
- `node`: Node.js HTTP server via `@hono/node-server` (alias `node-server`)
- `cloudflare`: Cloudflare Workers (generates `wrangler.toml`, aliases `cf`/`wrangler`/`workers`)
- `cloudflare-dev`: Cloudflare dev mode via miniflare (alias `cf-dev`)
- `vercel`: Vercel Serverless Functions (Node runtime, generates `vercel.json`, aliases `vercel-serverless`/`vercel-node`)
- `vercel-edge`: Vercel Edge Functions (edge runtime, alias `vercel-edge-function`)
- `netlify`: Netlify Serverless Functions (generates `netlify.toml`, aliases `netlify-functions`/`netlify-node`)
- `bun`: Bun runtime with native TypeScript + `bun:sqlite` (generates `bunfig.toml`, alias `bun-runtime`)
- `deno`: Deno runtime with Deno KV/cron/Queue (generates `deno.json`, aliases `deno-deploy`/`deno-runtime`)
- `aws`: AWS Lambda (aliases `aws-lambda`/`lambda`/`amazon`/`sam`; generates an AWS SAM template)
- `azure`: Azure Static Web Apps / Functions (aliases `azure-swa`/`swa`/`azure-functions`)
- Preset auto-detection: explicit config > config-file hints (wrangler.toml/vercel.json/netlify.toml/deno.json) > environment vars (VERCEL/NETLIFY/globalThis.Deno/globalThis.Bun) > default `standard`
- Capability matrix (19 capabilities: `staticServe`, `websocket`, `sse`, `cronTriggers`, `queues`, `kv`, `storage`, `database`, `envVars`, `secrets`, `nodeCompat`, `streaming`, `compression`, `https`, `http2`, `middleware`, `bodyLimit`, `multipart`, `rpc`, ...) with build-time diagnostics
- Config generators: `generateWranglerConfig` / `generateVercelConfig` / `generateNetlifyConfig` / `generateBunfigConfig` / `generateDenoConfig`

### 8. Extension Packages (`@ubean/*` scope, kebab-case)

- `@ubean/icon`: Iconify-based icons with custom local SVG collections (`defineIconCollection`, `defineIconCollectionLoader`, `useIcon`, `getIcon`/`getIconSync`), `/_iconify` dev route serving local SVGs before the Iconify API fallback
- `@ubean/auth`: Better Auth integration with an email/password fallback; `createAuthHandler()` on the server, `useAuth()`, `useSession()`, `getSessionFromHeaders()` on the client (`isAuthenticated`/`isLoading`/`signIn`/`signUp`/`signOut`/`refreshSession`); route protection via `definePage({ requiresAuth: true })` / `defineHandlerMeta({ requiresAuth: true })`
- `@ubean/integrations/pwa`: Manifest + Service Worker generation (`ubeanPwaPlugin` + `definePwaConfig`, `registerType: autoUpdate | prompt | manual`, 5 cache strategies), `usePwa()` → `isInstalled` / `isUpdateAvailable` / `isOfflineReady` / `needRefresh`
- `@ubean/image`: Multi-provider image optimization (IPX / Cloudinary / Imgix / static) — components `UbeanImg` / `NuxtImg` / `UbeanPicture`, composable `useImage()`, helpers `resolveImage()` / `defineImagePreset()` / `createSrcSet()`
- `@ubean/content`: Markdown/YAML/JSON content collections. `defineCollection` / `defineContentCollection`, then `queryCollection('blog').where(...).order(...).all()` (`queryContent` is only a backwards-compat alias); navigation via `fetchContentNavigation()`; search via `queryCollectionSearchSections` + `useContentSearch()` from `@ubean/content/vue` (**not** auto-imported; MiniSearch, build emits `dist/public/__search.json`)
- `@ubean/ai`: Vercel AI SDK orchestration — `defineAgent` / `defineAgentTool` / `defineProvider` / `configureAI` / `resolveModel`, Vue runtime `useChat` / `useAgent` / `useAIProvider` from `@ubean/ai/runtime/vue`, gateway presets from `@ubean/ai/gateway`
- `@ubean/integrations/fonts`: Google/Bunny/Fontshare fonts with `@font-face` generation
- `@ubean/integrations/electron`: Desktop apps via vite-plugin-electron; `electron: true` enables with default main/preload entries (`electron/main.ts`, `electron/preload.ts`) and auto-disables SSR
- `@ubean/integrations/pinia`: Pinia integration; `pinia: true` enables dev `optimizeDeps` pre-bundling; pair with `defineApp({ serializeState: serializePiniaState, hydrateState: hydratePiniaState })` for SSR state hydration (Pinia itself imported from `pinia`)
- `@ubean/integrations/ui`: @vean/ui integration; `ui: true` enables UiResolver (component auto-import) + styles.css injection; `ui: { css: false }` for UnoCSS mode (@vean/unocss)

> Vite-side plugin exports: `ubeanIconPlugin` (`@ubean/icon/vite`), `ubeanAuthPlugin` + `defineAuthConfig` (`@ubean/auth/vite`), `ubeanAiPlugin` + `defineAiConfig` (`@ubean/ai/vite`), `ubeanContentPlugin` (`@ubean/content/vite`), `ubeanImagePlugin` (`@ubean/image/vite`), `ubeanPwaPlugin` + `definePwaConfig` / `ubeanPiniaPlugin` + `definePiniaConfig` / `ubeanUiPlugin` + `defineUiConfig` / `ubeanElectronPlugin` + `defineElectronConfig` (`@ubean/integrations/<name>`). Usually you enable the module by config field (`icon: true`, `auth: {…}`, `pwa: true`, …) and never import them directly.

## Project Structure (user project)

```
my-app/
├── src/
│   ├── routes/           # API routes (void-style named exports)
│   │   └── api/          # /api/* endpoints
│   ├── pages/            # Page components (.vue, .md, .reuse.ts)
│   ├── layouts/          # Layout components (xx.vue or xx/index.vue)
│   ├── middleware/       # Middleware (numeric prefix ordering)
│   ├── components/       # Auto-imported Vue components
│   ├── composables/      # Auto-imported composables
│   ├── locales/          # i18n messages (en.json, zh.json, etc.)
│   ├── crons/            # Cron jobs (defineScheduled)
│   ├── queues/           # Queue workers (defineQueue)
│   ├── plugins/          # Runtime plugins
│   ├── app.ts            # Vue app config (defineApp)
│   ├── env.ts            # Environment schema (defineEnv)
│   └── server.ts         # Server hooks (defineServer)
├── public/               # Static assets
├── .ubean/                # Auto-generated types
│   ├── routes.d.ts
│   ├── pages.d.ts
│   ├── auto-imports.d.ts
│   └── components.d.ts
├── ubean.config.ts       # Framework config (defineConfig)
└── package.json
```

## Common Workflows

### Creating a Page

```bash
ubean page add page about
```

```vue
<!-- src/pages/about.vue -->
<script setup lang="ts">
definePage({
  meta: { title: 'About' }
});
</script>

<template>
  <h1>About</h1>
</template>
```

> `definePage` is a compile-time macro — auto-imported, no explicit import needed. Its top-level fields are `name`, `path`, `layout` (`string` | `string[]` | `false`), `reuse`, `meta`, `requiresAuth`, `cache`, `transition`, `head`, `ssr`. There is no top-level `title` field (use `meta: { title }`) and no top-level `middleware` field — pass route-level middleware through `meta: { middleware }`.

### Creating an API Route

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ message: 'Hello World!' });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ ok: true, received: body });
});
```

### Fetching Data (useData / useAsyncData / useFetch)

All three are auto-imported from `ubean/client` and return the same result shape:
`{ data, error, loading, pending, status, timestamp, refresh(), invalidate() }` where `status` is `'idle' | 'pending' | 'success' | 'error'`.

| API                                         | Shape                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `useData(options, context?)`                | **One options object**: `{ key?, fetcher, ttl?, tags?, dedupe? }` — `fetcher` is required |
| `useAsyncData(key, fn, options?, context?)` | Nuxt-style positional superset of `useData`; `fn` is the fetcher                          |
| `useFetch(key, url, options?, context?)`    | Wraps `useAsyncData` around an HTTP client (see below)                                    |

ubean does **not** provide `defineLoader`. Options that matter:

- `key` — cache identity. Omitting it creates a fresh `Symbol` per call, so nothing is shared between mounts.
- `ttl: 60_000` — entry freshness in ms; `tags: ['config']` — makes the entry reachable by `invalidateData(tag)`.
- `dedupe` — **default `true`**: in-flight requests with the same key collapse into one.
- Dependent data: keys are static, so re-run `refresh()` from a `watch()` rather than parameterising the key.
- SSR: the payload is serialized into `__UBEAN_DATA__` and auto-hydrated on the client (no double fetch).

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

// ✅ options object (not positional)
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json()),
  ttl: 60_000,
  tags: ['posts']
});

// ✅ positional equivalents
const { data: user } = await useAsyncData(`user:${route.params.id}`, () =>
  fetch(`/api/users/${route.params.id}`).then(r => r.json())
);
const { data: posts } = await useFetch('posts', '/api/posts');
</script>
```

### HTTP Client for `useFetch`

`useFetch` needs a client (duck-typed, not a framework type). Call `setDefaultFetch(client)` once at startup to inject one; without it, ubean falls back to native `fetch` + JSON parsing. ubean does **not** bundle a browser HTTP client:

```typescript
import { setDefaultFetch } from 'ubean/client';
// src/app.ts
import { createRequest } from '@soybeanjs/fetch';

setDefaultFetch(createRequest());
```

### Type-Safe Request Clients (OpenAPI)

`.ubean/openapi.d.ts` (`paths`) is generated with `openapi-typescript` from the app's own `/_openapi.json` — computed in-process from a live Hono app, once per dev start and once per build (**not** on route edits, so restart after changing route schemas). `ubean init` scaffolds `src/request/`:

```typescript
// src/request/client.ts — browser
import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient, toFlatTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

const request = createRequest({});
export const api = createTypedClient<paths, '/api'>(request, '/api'); // throws on failure
export const flatApi = toFlatTypedClient<paths, '/api'>(request, '/api'); // { data, error, response }

// src/request/internal.ts — server-side, in-process (no network hop)
import { createInternalAdapter } from 'ubean/server';
// createInternalAdapter(context) wraps app.fetch as a @soybeanjs/fetch adapter and forwards cookies/auth
```

### Invalidation

`invalidateData(keyOrTag, context?)` deletes matching entries and returns the count (tags are invalidatable); `invalidateAll(context?)` clears everything. Both are cache-level — the mounted composable also exposes an instance-scoped `invalidate()`.

### Streaming / Deferred Data

`defer(factory)` marks a promise as non-critical so SSR does not block the initial render; `useDeferredData(key, deferred)` resolves it on the client, reading `__UBEAN_DEFERRED__` immediately after hydration.

```vue
<script setup lang="ts">
const recommendations = defer(() => fetch('/api/recommendations').then(r => r.json()));
const { data } = useDeferredData('recommendations', recommendations);
</script>
```

### Data Cache (`defineCachedFunction` family)

Component/function-level caching is separate from HTTP response caching:

```typescript
import { defineCachedFunction, cacheLife, cacheTag, revalidateTag, revalidatePath } from 'ubean/server';

const getUser = defineCachedFunction(async (id: string) => {
  cacheLife(3600); // scope TTL in seconds
  cacheTag('users', `user:${id}`);
  return await db.query.user.findById(id);
});

await revalidateTag('users'); // also invalidates fetch Data Cache entries carrying the tag
await revalidatePath('getUser:*');
```

`cacheLife()` / `cacheTag()` use `AsyncLocalStorage`, so calling them outside a cached scope is a no-op.

### Navigation & Link

`<Link>` is a globally-registered component (no import needed):

```vue
<template>
  <Link to="/">Home</Link>
  <Link to="/users/123">User</Link>
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User detail</Link>
</template>
```

Programmatic navigation uses `useRouter()` from `vue-router` (explicit import by default — the `vueRouter` auto-import preset is off unless you set `autoImports: { vueRouter: true }`):

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
function go() {
  router.push('/about');
}
</script>
```

> `useRouter()` returns the Vue Router instance. ubean deliberately exports **no** `useRoute()` / `navigateTo()` / `redirectTo()` / `useRouteParams()` / `useRouteQuery()` wrappers — read the current route from `router.currentRoute.value` (wrap in `computed()` for reactivity) or import `useRoute()` from `vue-router`. `<Link>` props: `to`, `locale`, `replace`, `href`, `prefetch`, `activeClass`, `exactActiveClass`, `noActiveClass`; the default slot scopes `isActive` / `isExactActive`. External URLs render an `<a target="_blank" rel="noopener noreferrer">`.

### Islands & Component Boundaries

`v-client.*` goes on the **component element** (not a plain `<div>`); the modifier picks the hydration strategy.

| Directive                               | Hydrates when                                      |
| --------------------------------------- | -------------------------------------------------- |
| `v-client.load`                         | immediately after page load                        |
| `v-client.idle`                         | browser idle (`requestIdleCallback`)               |
| `v-client.visible`                      | element scrolls into view (`IntersectionObserver`) |
| `v-client.media="'(max-width: 768px)'"` | a CSS media query matches (quote the string)       |
| `v-client.only`                         | client only, no SSR output                         |

Zero config: the plugin rewrites directives into `<ubean-island v-once>` elements, auto-registers components through `virtual:ubean-islands-registry`, and the client entry hydrates after mount (double `rAF`) plus after every SPA navigation. Never call `hydrateIslands()` for normal islands.

Escape hatch — manual registration (globally registered components, `defineAsyncComponent`, dynamic imports) in `onClientReady`; manual entries win over auto-registration:

```typescript
import { defineApp, hydrateIslands } from 'ubean/client';

export default defineApp({
  onClientReady: app => hydrateIslands({ appContext: app, components: { DynamicIsland } })
});
```

Programmatic wrappers: `defineIsland(Component, strategy, { mediaQuery?, props? })` (same five strategies) and `defineServerIsland(Component, { fallback?, rerenderOnPropsChange? })` — the latter wraps an **async** component in `<Suspense>`; during prerender it emits only the fallback, during streaming SSR it streams the resolved markup.

`.`-suffixed file conventions replace the import, no directive needed:

- `Foo.client.vue` — client only; SSR emits the `<!--client-only-->` comment placeholder.
- `Foo.server.vue` — server only; the client build swaps in a stub so its imports never reach the bundle. **Must be a `<template>`-based SFC**, and its `ubean-server-only` wrapper is a flow element: using it directly under `table`/`thead`/`tbody`/`tfoot`/`tr`/`colgroup`/`select`/`optgroup` is **rejected at transform time** (the parser would hoist or drop it → hydration mismatch). Let the server component render the container instead.
- `Foo.server.vue` + `Foo.client.vue` together — import the base name (`./Foo.vue`), which must not exist; SSR renders the server half, the client half takes over after mount.

Island props must be JSON-serializable (strings, numbers, booleans, arrays, plain objects). `<ClientOnly fallback="…">` is the non-island equivalent for template fragments.

### Internationalization

```json
// src/locales/en.json
{
  "hello": "Hello",
  "items": "no items | one item | {count} items"
}
```

```vue
<script setup lang="ts">
const { t, locale, d, n } = useI18n(); // opt-in: requires `autoImports: { vueI18n: true }`; otherwise `import { useI18n } from 'vue-i18n'`
// `setLocale` is always auto-imported (from ubean/client)
// 切换语言用框架 setLocale(自动导入,来自 ubean/client)

console.log(t('hello'));
console.log(t('items', { count: 3 }));
console.log(d(new Date()));
console.log(n(1234.56));
</script>
```

Server side (`ubean/i18n`) reads the request ALS — `t()` **throws** outside it, there is no process-global locale:

```typescript
import { t, getRequestLocale } from 'ubean/i18n';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({ locale: getRequestLocale(c), msg: t('hello') });
});
```

Path helper composables (all auto-imported from `ubean/client`): `useLocalePath()` → `(path, locale?) => localized path`, `useSwitchLocalePath()` → `(locale) => current route in that locale`, `useLocaleRoute()` (alias of `useLocalePath`), `useLocaleHead()` (reactive hreflang / canonical / og:locale). Never assign `locale.value` as the switch API. Typed keys come from `.ubean/i18n.d.ts` (include `.ubean/*.d.ts` in `tsconfig.json`). Gone with no compat layer: `defineLocale`, `addLocale`, `formatDate`/`formatNumber`/`formatCurrency` — use vue-i18n `d`/`n` and ALS `t()`.

### Server Actions

`defineAction` creates a typed RPC/form endpoint. Actions declared in a **page module** are additionally reachable from a native HTML form via the `?/<name>` URL convention (SvelteKit style progressive enhancement), and `POST /__actions` serves programmatic calls.

```typescript
// src/pages/login.vue <script> block, or src/actions/login.ts
export const actions = {
  default: defineAction(async () => ({ ok: true })),
  login: defineAction(
    loginSchema, // Standard Schema v1, or anything with safeParse/parse
    async (input, ctx) => {
      const user = await verify(input.email, input.password);
      if (!user) return fail(400, { password: 'incorrect' }); // field-level errors
      if (banned(user)) throw new ActionError('Account suspended', { code: 'BANNED' });
      ctx.cookies.set('session', user.token, { httpOnly: true });
      return { user };
    }
  )
};
```

| API                                              | Notes                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `defineAction(handlerOrSchema, handler?, opts?)` | `defineServerFn` is an alias with the same ID and the same `POST /__actions` transport           |
| `useAction(actionOrId)`                          | `{ submit, pending, data, error, errors, status, result, reset }`                                |
| `useFormAction(name = 'default')`                | `{ action, pending, onSubmit, data, errors }` — wires a native `<form>` to `?/name` + SPA submit |
| `callAction(id, args)`                           | Client RPC (`POST /__actions`)                                                                   |
| `invokeServerFn(fn, input?)`                     | Isomorphic: runs the handler on the server, RPC stub on the client                               |
| `fail(status, errors)` / `ActionError`           | Field-level failure / user-readable error carrying `code` + `status`                             |

Action IDs are derived as `act_` + base32(fnv1a(`filePath:exportName`)) → 12 lowercase characters so client and server agree without configuration; the Vite plugin injects `filePath` / `name`.

```vue
<script setup lang="ts">
const { onSubmit, pending, errors } = useFormAction('login');
</script>

<template>
  <form method="POST" action="?/login" @submit.prevent="onSubmit">
    <input name="email" />
    <input name="password" type="password" />
    <p v-if="errors.password">{{ errors.password }}</p>
    <button :disabled="pending">Sign in</button>
  </form>
</template>
```

Return-value contract: `{ data, status: 200 }` on success · `fail` → `{ errors }` + `400` · `ActionError` → `{ error: { message, code } }` + `400` · `Response.redirect` → `{ data: { redirect } }` + `302` (`X-Ubean-Redirect` header) · unexpected throw → `500`. `describeActionsOpenApi()` contributes the `POST /__actions` schema to `/_openapi.json`.

### Global Server Hooks (`defineServer`)

`src/server.ts` default-exports `defineServer({...})` — the server-side counterpart of `defineApp`:

```typescript
// src/server.ts
import { defineServer } from 'ubean/server';

export default defineServer({
  plugins: [
    {
      name: 'my-plugin',
      setup(app) {
        app.use('/api/custom', handler);
      }
    }
  ],
  hooks: { 'request:start': c => console.log(c.req.method, c.req.path) },
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const response = await resolve(event);
      response.headers.set('X-Response-Time', '…');
      return response;
    },
    handleFetch: async ({ request, fetch }) => {
      request.headers.set('X-Internal-Auth', process.env.INTERNAL_TOKEN!);
      return fetch(request);
    },
    handleError: async ({ event, status, message }) => console.error(`[${status}] ${message}`)
  },
  onAppCreate: async app => {
    /* before app.init() */
  },
  onServerReady: async app => {
    /* after app.init() — start workers/schedulers */
  }
});
```

- `handle({ event, resolve })` wraps **every** request (including 404s and static assets). Calling `resolve(event)` is optional only if you short-circuit with your own `Response`.
- `handleFetch({ request, fetch, serverContext? })` intercepts server-side `internalFetch` / `createInternalAdapter`.
- `handleError({ event, error, status, message })` is side-effect-only logging/reporting; it cannot change the response.
- Shared + mode-specific files chain: `src/server.ts` then `src/server.dev.ts` / `src/server.prod.ts` (mode-specific wins per field).

### Route Rules (per-route rendering + HTTP behaviour)

```typescript
export default defineConfig({
  routeRules: {
    '/blog/**': { prerender: true },
    '/api/public/**': { cache: { ttl: 300, swr: true }, cors: true },
    '/dashboard/**': { ssr: false },
    '/news/**': { isr: { ttl: 60, swr: true } },
    '/products/**': { ppr: true },
    '/legacy/**': { redirect: '/new' },
    '/proxy/**': { proxy: 'https://api.example.com/**' }
  }
});
```

HTTP order: `redirect` > `rewrite` (re-dispatch) > `proxy` > `headers` (merged) > `cache`. `*` matches one path segment, `**` matches recursively. The matched rule is exposed to handlers as `c.get('routeRule')`.

Render fields, in evaluation priority `definePage({ ssr })` > `routeRule.ssr` > global `ssr.exclude` / `SsrOptions.streaming`:

| Value                      | Effect                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ssr: true` / `false`      | SSR or pure CSR. `false` **skips** loaders.                                                                          |
| `ssr: 'streaming'`         | Streamed SSR. Bots auto-fall back to buffered rendering so `<head>` metadata is complete.                            |
| `ssr: 'data-only'`         | Runs loaders, sends a CSR shell (data present, markup client-rendered).                                              |
| `prerender: true`          | Statically generated at build time.                                                                                  |
| `isr: 60` / `{ ttl, swr }` | Incremental static regeneration — `X-ISR: HIT\|STALE\|MISS`, background revalidation per path. Requires SSR enabled. |
| `ppr: true`                | Alias for forced streaming SSR **plus** prerender discovery (not a Next-style static shell). Emits `X-PPR`.          |

### Caching

Two independent layers — do not confuse them:

**HTTP response cache** (`ubean/server`): `useCacheStore(store?)`, `createMemoryStore(maxEntries = 200)`, `createFsCacheStore(dir)`, `createStorageCacheStore(storage)`, `createCacheMiddleware({ store, rules, defaultTtl })`, `cachedEventHandler(handler, { ttl, name })`, `invalidateRouteCache(keyPattern?)`.

- `CacheStore` = `get` / `set(key, entry, ttl)` / `delete` / `clear` / optional `peek?`.
- **`peek()` matters**: ISR stale-serving needs it. A store without `peek()` falls back to `get()`, which deletes expired entries, so no stale content is ever served.
- `CacheRule = { ttl, swr?, name? }` (`ttl: 0` disables). `swr` only emits the `stale-while-revalidate` header — app-level stale serving is ISR-only.
- `cachedEventHandler` refuses to cache non-GET/HEAD, requests with `Authorization`, cookie requests without `Cache-Control: public`, non-200 responses, and responses marked `private` / `no-store`; it strips `set-cookie`.
- HITs add `X-Cache: HIT` + `Age` (there is no MISS marker).
- `cache.store` config: `'auto'` (default) resolves to `fs` (`.ubean/cache`) on production Node/bun/deno/standard builds and stays in-memory on serverless/edge.
- **Not provided**: no `useCache()`, no `defineCache()`, no cache groups or `remember()`, no built-in Redis/Memcached driver — implement a custom `CacheStore` over `useStorage()` / `useKV()`.

**Component/function cache** (`ubean/server`): `defineCachedFunction`, `cacheLife`, `cacheTag`, `revalidateTag`, `revalidateTags`, `revalidatePath`, `useComponentCacheStore`, `createComponentMemoryStore(maxEntries = 500)`, `clearComponentCache()`. See the [Data Cache workflow](#data-cache-definecachedfunction-family) for a worked example — `revalidateTag` / `revalidatePath` also invalidate fetch Data Cache entries.

### Caching Subpath Entry Points

`@ubean/server` exposes semantic aggregate subpaths so you do not pull the whole barrel through a type checker. New code should import by capability domain:

| Subpath                         | Aggregates                                                                      | Domain                         |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `@ubean/server/cache`           | `cache` + `cache-directive`                                                     | HTTP + component cache         |
| `@ubean/server/db`              | `database`                                                                      | Database                       |
| `@ubean/server/realtime`        | `websocket` + `sse`                                                             | Realtime                       |
| `@ubean/server/security`        | `security-headers` + `csrf` + `sessions`                                        | Security                       |
| `@ubean/server/queue`           | `queue`                                                                         | Queues                         |
| `@ubean/server/cron`            | `cron` + `cron-scheduler`                                                       | Scheduled tasks                |
| `@ubean/server/storage`         | `storage`                                                                       | KV / object storage            |
| `@ubean/server/observability`   | `observability`                                                                 | Tracing / OpenTelemetry        |
| `@ubean/server/email`           | `email`                                                                         | Email                          |
| `@ubean/server/analytics`       | `analytics` + `feature-flags`                                                   | Analytics / A-B experiments    |
| `@ubean/server/static`          | `static`                                                                        | Static file serving            |
| `@ubean/server/drivers`         | `drivers`                                                                       | Platform drivers (D1/KV/Blob…) |
| `@ubean/server/middleware`      | `cors` + `rate-limit` + `after` + `fetch-memo` + `draft-mode` + `single-flight` | Request lifecycle middleware   |
| `@ubean/server/cache-directive` | `cache-directive`                                                               | Component-level cache only     |

The `@ubean/server` main entry still re-exports everything (barrel convenience), so existing imports keep working.

### Environment Variables

`defineEnv({ server, public, mode })` declares a Standard-Schema-validated env schema; `mode` is `'warn'` (default) or `'throw'`. Entries are `{ type: String | Number | Boolean, default?, required? }`.

```typescript
// src/env.ts
import { defineEnv } from 'ubean';

export const env = defineEnv({
  server: { PORT: { type: Number, default: 3000 }, DATABASE_URL: { type: String, required: true } },
  public: { API_BASE: { type: String, default: '/api' } },
  mode: 'throw'
});
```

- Server values are read as `env.PORT`; only variables prefixed `UBEAN_PUBLIC_` / `VITE_` / `PUBLIC_` are exposed to the client via `import.meta.env`.
- Only schemas with a **synchronous** `safeParse` work — a Standard-Schema-only (`~standard`) schema that parses async fails with an explicit error, so use the built-in `validate()` instead.
- `env.validate(source)` returns `{ success, errors: [{ key, message, value }] }`; `InferEnvOutput<S>` infers the shape.
- CLI: `ubean env init | list [--public] | add KEY VALUE [--public] [--force] | remove KEY`.

### Response Helpers

ubean exports **no** standalone `json()` / `html()` / `text()` / `redirect()` / `setHeader()` / `createError()` / `send()` / `stream()` / `download()` / `noContent()` / `notFound()`. Use the Hono `c` helpers:

```typescript
return c.json(body, 200, { 'X-Foo': 'bar' }); // extraHeaders
return c.html('<h1>Hi</h1>');
return c.text('ok');
return c.redirect('/login', 301);
return c.header('Set-Cookie', cookie, { append: true }); // multi-value
return c.status(204);
return c.body(null);
```

### Server Middleware Factories

All from `ubean/server`. Each factory returns a Hono middleware; the `define*` variant is the config-shaped alias. Mount them in `src/server.ts` via a plugin or `createUbeanApp({ middleware })`.

| Factory                                                                             | Key options / notes                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCorsMiddleware` / `defineCors`                                               | `origin`, `allowMethods`, `allowHeaders`, `exposeHeaders`, `credentials`, `maxAge`, `preflightContinue`. Adds `Vary: Origin` unless `origin: '*'`.                                                             |
| `createRateLimitMiddleware` / `defineRateLimit`                                     | `maxRequests = 100`, `windowMs = 60000`, `keyGenerator`, `handler(c, info)`, `skip`, `store`. Emits `RateLimit-Limit/Remaining/Reset` (+ legacy `X-RateLimit-*`).                                              |
| `createCsrfMiddleware` / `defineCsrf` / `generateCsrfToken`                         | `mode: 'token' \| 'origin' \| 'both'` (default `token` = double-submit cookie), `cookieName`, `headerName`, `fieldName`, `tokenLength`, `exclude`. Safe methods auto-ensure the token cookie.                  |
| `createSecurityHeadersMiddleware` / `defineSecurityHeaders` / `serializeCsp`        | CSP (`ContentSecurityPolicyDirectives`), HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-*`. Disabled by default in ssg dev builds (ADR-0011).       |
| `createSessionMiddleware` / `useSession` / `createStorageSessionStore`              | Cookie mode (signed, default) or storage mode (`store` set). `Session<T>` = `get`/`set`/`delete`/`has`/`all`/`save()`/`destroy()`; `ttl` defaults to 7 days, cookie `ubean_session`.                           |
| `createDraftModeMiddleware` / `defineDraftMode` / `enableDraftMode` / `isDraftMode` | HMAC-SHA256 signed `ubean_draft` cookie (1h TTL) + timing-safe compare, injected as a `DraftModeController`. Outside the middleware `isDraftMode()` returns `false` and `useDraftMode()` returns a safe no-op. |
| `createFetchMemoizationMiddleware` / `createMemoizedFetch`                          | Request-scoped GET dedupe.                                                                                                                                                                                     |
| `createDataCacheMiddleware`                                                         | Cross-request GET cache; honours `next: { revalidate, tags, noStore }` and integrates `revalidateTag` / `revalidatePath` and `FetchInitWithNext`.                                                              |
| `createTracingMiddleware` / `getRequestId` / `createObservabilityTracer`            | Request IDs + OpenTelemetry-style spans; `createConsoleExporter` / `createOpenTelemetryExporter`.                                                                                                              |
| `after(callback)` / `createAfterMiddleware`                                         | Post-response, fire-and-forget work that does not block TTFB.                                                                                                                                                  |

### Storage, Database, Queue, Cron, Realtime

| Concern      | API (`ubean/server`)                                                                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage / KV | `useStorage()` / `createStorage(driver)` / `useKV()` / `createKV()` / `createMemoryDriver()`; platform drivers in `@ubean/server/drivers` (`createCloudflareD1Database`, `createCloudflareQueueDriver`, `createVercelPostgresDatabase`, `createVercelKvQueueDriver`, `createBunSqliteDatabase`, `createDenoKvStorage`, `createNetlifyBlobsStorage`) |
| Database     | `defineDatabase({ connector, connectors, default })`, `useDatabase(name?)`, `migrateDatabase`, `runMigrations`, `getDatabaseHooks()`, `closeDatabases()`; raw SQL via `rawSql` / `sqlRaw` / `raw`                                                                                                                                                   |
| Queue        | `defineQueue(options, handler?)`, `sendMessage(name, msg)`, `sendMessages(name, msgs)`, `startQueueWorkers()`, `stopQueueWorkers()`, `getQueueStats(name)`                                                                                                                                                                                          |
| Cron         | `defineScheduled(meta, handler)` in `src/crons/` (numeric prefix ordering), `parseCron` / `validateCron`, `startCronScheduler()` (auto-started in dev; Node/bun/deno only — serverless uses the platform scheduler)                                                                                                                                 |
| WebSocket    | `defineWebSocket(def)`, `defineRoom(name)`, `createRoom(name)`, `getRoom(name)`, `broadcast(topic, data)`                                                                                                                                                                                                                                           |
| SSE          | `createSSEStream()`, `defineSSE(handler)`, `broadcastSSE(event, data, filter?)`, `formatSSEMessage(data)`                                                                                                                                                                                                                                           |

### Client Extras

| Feature             | Usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour mode         | `useColorMode()` (auto-imported) → `.value` (`'light'`/`'dark'`), `.preference` (`'system'`/`'light'`/`'dark'`), `.set(mode)`, `.toggle()`. A no-FOUC inline script is injected first in `<head>` (cookie → localStorage → `prefers-color-scheme`). Config `colorMode: false` or `{ preference, fallback, classPrefix, classSuffix, storageKey, cookieName, dataValue, modes }`; style `html.light-mode` / `html.dark-mode` or `html[data-color-mode]`. Route-level forcing: `forceColorMode(to.meta.colorMode)` / `unforceColorMode()`. |
| Third-party scripts | `useScript(src, { partytown: true, trigger, attrs, target, rootMargin })` → `{ script, loaded, error, load, remove, waitForLoad }`. Triggers: `'load'` (default) / `'idle'` / `'visible'` / `'manual'`. Requires `partyTown: true` config **and** `partytown copylib public/~partytown` after installing `@builder.io/partytown`.                                                                                                                                                                                                        |
| Static search       | Config `search: true` (runs the Pagefind CLI in `closeBundle`; needs `pnpm add -D pagefind`). `useSearch({ debounce: 150, limit: 10, filters, immediate })` → `{ query, results, loading, error, ready, search, clear, preload }`. Filter with `data-pagefind-filter="tags:guide"`.                                                                                                                                                                                                                                                      |
| Content search      | `useContentSearch()` from `@ubean/content/vue` (**not** auto-imported) — MiniSearch over collections; emits `dist/public/__search.json` at build. Hits: `{ id, title, titles, level, content, score }`.                                                                                                                                                                                                                                                                                                                                  |
| SEO                 | `useSeoMeta()`, `mergeSeoLayers(global, layout, page)`, `defineJsonLd()` / `useSchemaOrg()` / `schemaOrg.{organization,website,article,breadcrumb,product}`; OG images via `ImageResponse`, `renderOgImage`, `renderArticleOgImage` from `@ubean/seo/og-image` (satori + `@resvg/resvg-js` are optional peers).                                                                                                                                                                                                                          |
| SEO conventions     | Convention files in `src/`: `sitemap.ts` → `/sitemap.xml`, `robots.ts` → `/robots.txt`, `manifest.ts` → `/manifest.webmanifest`, `opengraph-image.ts` → `/opengraph-image`, `icon.ts` → `/icon`, `apple-icon.ts` → `/apple-icon`. Auto-registered by `createUbeanApp` (disable with `seoConventions: false`); explicit `routes/` entries win.                                                                                                                                                                                            |

### Platform Presets and Detection

Presets are selected with **`build.preset`** — there is **no** top-level `preset` field in `UbeanConfig`, and writing one is silently ignored.

```typescript
export default defineConfig({
  build: { preset: 'vercel-edge' } // not `preset: 'vercel-edge'` at the top level
});
```

`definePreset(definition, meta)` (supports `extends`; new platform presets extend `'node'`), `registerPreset`, `resolvePreset(name)`, `resolvePresetByName(name)`, `registerBuiltinPresets()`, `listDetectablePresets()`, `getPresetAliases()` / `getPresetNames()`, and the config generators `generateWranglerConfig` / `generateVercelConfig` / `generateNetlifyConfig` / `generateBunfigConfig` / `generateDenoConfig` (each with a matching `serialize*`).

`detectPreset()` / `resolvePresetWithDetection(name?, cwd?)` resolution order: **explicit** name → **config file** (`wrangler.toml`, `vercel.json`, `netlify.toml`, `deno.json[c]`, `template.yaml`, `samconfig.toml`, `staticwebapp.config.json`, plus platform deps in `package.json`) → **environment** (`VERCEL`, `NETLIFY`, `AWS_LAMBDA_FUNCTION_NAME`, `AZURE_FUNCTIONS_ENVIRONMENT`, `globalThis.Deno`, `globalThis.Bun`, `process.versions.node`) → default `standard`.

### Auto-imports (defaults matter)

The `ubean` preset group is on; every other group is **off** unless you opt in:

```typescript
export default defineConfig({
  autoImports: {
    ubean: true, // default
    vue: false, // opt-in
    vueRouter: false, // opt-in (useRouter)
    vueI18n: false, // opt-in (useI18n)
    honoOpenapi: false, // opt-in (validator, describeRoute)
    dirs: [] // appended to src/composables
  },
  components: { ubean: true, dirs: [] } // components default: Link, Head, PageView, SlotView
});
```

Preset membership: `UBEAN_CLIENT_PRESET` (`ubean/client`) covers `definePage`, `defineMiddleware` (client page-macro no-op), `defineApp`, `applyAppConfig`, `createDefaultAppConfig`, `useData`, `useAsyncData`, `useFetch`, `useHead`, `useSeoMeta`, `useColorMode`, `useScript`, `useSearch`, `usePage`, `useViewTransition`, `setLocale`, `useLocalePath`, `useSwitchLocalePath`, `useLocaleRoute`, `useLocaleHead`, the page-cache helpers and the page-transition / reload helpers. `UBEAN_SERVER_PRESET` (`ubean/server`) covers `defineHandlerMeta`, `defineAction`, `defineServerFn`, `invokeServerFn`, `createInternalAdapter`, `defineScheduled`, `defineQueue`, `sendMessage`, `sendMessages`, `getQueueStats`, `useDatabase`, `defineDatabase`, `useKV`, `createKV`, `useStorage`. `useData` / `useAsyncData` / `useFetch` are deliberately **not** in the server preset, and `defineMiddleware` on the server comes from `ubean/server` (`@ubean/routes`).

## Resources

- **Project docs**: `/docs/`
- **CLI help**: `ubean --help`
- **DevTools**: open the floating button in dev (or `Shift+Alt+D`)
- **OpenAPI UI**: `/_scalar` in dev
- **Agent guide**: `/AGENTS.md` (project root)
- **Full docs source**: `apps/docs/src/content/` (en + zh) — there is **no** `skills/ubean/docs/` directory

## Version History

- **v0.6.1-beta.3** (current):
  - Vite plugin-first lifecycle (ADR-0012): bare `vite dev|build|preview` is the full toolchain; the old `experimental.viteBuilder` switch is gone
  - 24-package monorepo + `ubean` aggregator with subpath entries (`ubean/server` / `ubean/build` / `ubean/client` / `ubean/i18n` / `ubean/ssr` / `ubean/vite` / `ubean/scaffold`)
  - Islands via Vue directives `v-client.load|idle|visible|media|only` (P9-29; legacy `client:*` still supported)
  - Page routing owned by `@ubean/vue`: parallel routes (`@slotName/`), `[param=matcher]` dynamic matchers, reuse routes, KeepAlive page cache
  - Server Actions (`defineAction` / `useAction` / `useFormAction`, `POST /__actions`), component-level cache (`defineCachedFunction` / `cacheTag` / `revalidateTag`), ISR, PPR / Server Islands (`defineServerIsland`)
  - 11 platform presets: `standard` / `node` / `cloudflare` / `cloudflare-dev` / `vercel` / `vercel-edge` / `netlify` / `bun` / `deno` / `aws` / `azure`
  - Extension packages: icon, auth, image, content, ai + `@ubean/integrations` (pwa / fonts / electron / ui / pinia)
  - Global hooks (`defineServer({ globalHooks })`), Sessions, CSRF, security headers, draft mode, fetch memoization + Data Cache
  - `mode: 'ssg'` lightweight direct-render path (ADR-0011)
  - Plain `.server.vue` / `.client.vue` / paired components, `defineServerIsland` props re-render

- **Pre-0.6 line** (historical, superseded): Vite middleware-mode dev server, Vue SSR with `@unhead/vue`, file-based API + page routing (`defineHandler` / `definePage`), hono-openapi integration, vue-i18n 11 compact locale routing, Islands (`client:*` directives), View Transitions, DevTools, prerender/SSG, built-in cron/queue/storage/database/WebSocket/SSE.
