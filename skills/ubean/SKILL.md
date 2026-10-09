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
- Configuring internationalization (i18n) with `ubean.config.ts` `i18n` + `useI18n` / `setLocale`
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

`validator`, `describeRoute`, `resolver` are re-exported from `ubean` (originally from `hono-openapi`). `defineHandlerMeta` carries ubean-specific metadata such as `requiresAuth`, `cache`, `rateLimit`.

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
- `/guide/pages-routing/actions`: Actions
- `/guide/i18n`: Internationalization
- `/guide/islands`: Islands architecture

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
    strategy: 'prefix_except_default' // prefix | prefix_except_default | no_prefix
  },
  routeRules: {}
});
```

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
- Layouts: `layouts/` (`xx.vue` or `xx/index.vue`), supports nested layout chain
- Route groups: `(group)/` directories don't contribute URL segments
- `definePage` compile-time macro for meta/layout/name/path override
- Middleware: `middleware/` with numeric prefix ordering; `global`/`global.*` → `/*`, others by directory prefix
- Typed route helpers: **ubean exports no `useRoute`/`navigateTo`/`redirectTo` wrappers** — import `useRoute()` / `useRouter()` from `vue-router` directly. Route-path types are generated at `.ubean/typed-router.d.ts`; route generation supports `virtual` (default) / `file` / `both` modes via `routing.mode`
- Route guards: `defineApp({ router: { setup(router) { router.beforeEach(...) } } })` registers navigation guards on both client and SSR (shared setup runs first, then client/server-specific setups)

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

- `@ubean/icon`: Iconify-based icons with custom local SVG collections, `/_iconify` dev route
- `@ubean/auth`: Better Auth integration with email/password fallback, `useAuth()` composable
- `@ubean/integrations/pwa`: Manifest + Service Worker generation, `usePwa()` composable
- `@ubean/image`: Multi-provider image optimization (IPX/Cloudinary/Imgix/...)
- `@ubean/content`: Markdown/YAML/JSON content collections with `queryCollection()` (`queryContent` is only a backwards-compat alias)
- `@ubean/integrations/fonts`: Google/Bunny/Fontshare fonts with `@font-face` generation
- `@ubean/integrations/electron`: Desktop apps via vite-plugin-electron; `electron: true` enables with default main/preload entries (`electron/main.ts`, `electron/preload.ts`) and auto-disables SSR
- `@ubean/integrations/pinia`: Pinia integration; `pinia: true` enables dev `optimizeDeps` pre-bundling; pair with `defineApp({ serializeState: serializePiniaState, hydrateState: hydratePiniaState })` for SSR state hydration (Pinia itself imported from `pinia`)
- `@ubean/integrations/ui`: @vean/ui integration; `ui: true` enables UiResolver (component auto-import) + styles.css injection; `ui: { css: false }` for UnoCSS mode (@vean/unocss)

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

### Fetching Data (useData)

`useData` is auto-imported. ubean does not bundle a browser HTTP client — use the native `fetch`, or [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) for a typed client with upload progress and flat error mode.

```vue
<script setup lang="ts">
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});
</script>

<template>
  <div v-if="loading">Loading…</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <ul v-else>
    <li v-for="post in data.posts" :key="post.id">{{ post.title }}</li>
  </ul>
</template>
```

### Navigation & Link

`<Link>` is a globally-registered component (no import needed):

```vue
<template>
  <Link to="/">Home</Link>
  <Link to="/users/123">User</Link>
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User detail</Link>
</template>
```

Programmatic navigation uses `useRouter()` (auto-imported):

```vue
<script setup lang="ts">
const router = useRouter();
function go() {
  router.push('/about');
}
</script>
```

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
const { t, locale, d, n } = useI18n(); // 自动导入需 autoImports: { vueI18n: true }(默认关闭),否则从 vue-i18n 显式导入
// 切换语言用框架 setLocale(自动导入,来自 ubean/client)

console.log(t('hello'));
console.log(t('items', { count: 3 }));
console.log(d(new Date()));
console.log(n(1234.56));
</script>
```

## Resources

- **Project docs**: `/docs/`
- **CLI help**: `ubean --help`
- **DevTools**: open the floating button in dev (or `Shift+Alt+D`)
- **OpenAPI UI**: `/_scalar` in dev
- **Agent guide**: `/AGENTS.md` (project root)

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
