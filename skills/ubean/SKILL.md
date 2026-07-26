---
name: ubean
display_name: ubean Framework
description: Full-stack Vue meta-framework built on Vite, Hono and Vue. File-based routing, SSR, islands architecture, i18n, DevTools, OpenAPI and multi-platform presets.
version: 0.0.1
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

> ubean is a full-stack Vue meta-framework combining Vite, Hono and Vue. The public package name is **`ubean`** (no `@ubean/core`); all framework APIs are imported from `ubean` directly or from subpath exports such as `ubean/runtime/vue`.

## When to Use This Skill

Use this skill when working with ubean framework projects, including:

- Creating new ubean projects with `ubean init`
- Developing pages with file-based routing (`pages/**/*.vue`, `definePage` macro)
- Building API routes with Hono (`routes/**`, `defineHandler`, named exports `GET`/`POST`/...)
- Using hono-openapi `validator` / `describeRoute` / `resolver` for typed requests and OpenAPI
- Configuring internationalization (i18n) with `defineLocale` / `useI18n`
- Using islands architecture (`client:load|idle|visible|media|only`)
- Configuring modules and platform presets (`standard` / `node` / `cloudflare`)
- Debugging with ubean DevTools
- Using the built-in icon / image / content / fonts / pwa / auth / electron / ui extension packages

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
- **Version**: 0.0.1
- **Category**: Web Framework
- **Public package**: `ubean` (workspace `packages/ubean`)

## Package Architecture

ubean is a **monorepo** of 38 packages. The public package `ubean` is an **aggregator** that re-exports all `@ubean/*` subpackages — users install one package (`ubean`) and get the full API surface via `import { ... } from 'ubean'`.

### Subpath Exports

| Subpath              | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `ubean`              | Main entry — re-exports all subpackages (server-side code, API routes)          |
| `ubean/vite`         | Default Vite plugin combo (build + vue + islands) for `vite.config.ts`          |
| `ubean/runtime/vue`  | Browser-side Vue client runtime (avoids pulling server deps into client bundle) |
| `ubean/runtime/app`  | Server Hono app entry (`createUbeanApp` / `defineServer`) for `src/server.ts`   |
| `ubean/runtime/i18n` | Server-side pure-function i18n                                                  |
| `ubean/vue-ssr`      | Vue SSR renderer (`createVueRenderer`)                                          |

> **Critical**: Client-side auto-imports MUST use `ubean/runtime/vue`, not `ubean` main entry — the latter triggers Vite to pre-bundle server-side dependencies (unocss, oxc-parser WASM) in the browser environment.

### Key Subpackages

| Package          | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `@ubean/types`   | Shared type definitions                                               |
| `@ubean/routing` | Route scanner + rou3 router + AST extractor                           |
| `@ubean/build`   | Build-time core (virtual modules + Vite plugins)                      |
| `@ubean/runtime` | Vue client runtime (composables, router, islands hydrate)             |
| `@ubean/server`  | Server runtime (cache/db/queue/cron/ws/sse/storage)                   |
| `@ubean/app`     | Hono app factory + server config                                      |
| `@ubean/config`  | Config loading (c12 + defu)                                           |
| `@ubean/vite`    | Vue-specific Vite plugin (pages/entry virtual modules + auto-imports) |
| `@ubean/cli`     | CLI commands (init/dev/build/preview/page/env)                        |

Extension packages (`@ubean/auth`, `@ubean/icon`, `@ubean/pwa`, `@ubean/image`, `@ubean/content`, `@ubean/fonts`, `@ubean/electron`, `@ubean/ui`) are loaded on-demand via `ubean.config.ts` flags (`icon: true`, `pwa: true`, `electron: true`, `ui: true`, etc.).

## Commands

| Command  | Description                                     | Usage                       |
| -------- | ----------------------------------------------- | --------------------------- |
| init     | Initialize a new ubean project                  | `ubean init [options]`      |
| dev      | Start development server (Vite middleware mode) | `ubean dev [options]`       |
| build    | Build for production (Vite SSR dual build)      | `ubean build [options]`     |
| preview  | Preview production build                        | `ubean preview [options]`   |
| prepare  | Generate `.ubean/` types                        | `ubean prepare [--force]`   |
| page     | Scaffold page/api/layout/middleware/reuse       | `ubean page add [options]`  |
| env      | Manage `.env` files                             | `ubean env <subcommand>`    |
| config   | Show/init/example resolved configuration        | `ubean config <subcommand>` |
| devtools | Print DevTools info/URL                         | `ubean devtools info`       |

### Command Details

#### ubean init

Initialize a new ubean project with interactive wizard or non-interactive mode.

**Options:**

- `--name, -n`: Project name
- `--template, -t`: Template (`starter`, `minimal`, `blog`)
- `--preset, -p`: Preset (`standard`, `node`, `cloudflare`)
- `--pm`: Package manager (`npm`, `pnpm`, `yarn`)
- `--yes, -y`: Skip interactive prompts
- `--force, -f`: Overwrite existing directory
- `--git`: Initialize git repository

**Examples:**

```bash
ubean init
ubean init --name my-app --template starter --preset node
ubean init -n blog -t blog -y
```

#### ubean dev

Start the development server. Uses Vite middleware mode so all configured modules' Vite plugins (HMR, virtual modules, HTML transform) take effect automatically.

**Options:**

- `--port, -p`: Server port (default: 5173)
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

- `--preset, -p`: Build preset (`standard`, `node`, `cloudflare`)
- `--prerender`: Enable static site generation
- `--clean`: Clean output directory before build

**Examples:**

```bash
ubean build
ubean build --preset cloudflare
```

#### ubean preview

Preview the production build locally.

**Options:**

- `--port, -p`: Preview port (default: 4173)
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
ubean page add page about
ubean page add page "blog/post"
ubean page add api users
ubean page add layout admin
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
import { defineHandler } from 'ubean';

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
import { defineHandler, defineHandlerMeta, validator, describeRoute, resolver } from 'ubean';
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

- `/docs/guide/quickstart`: Quick start guide
- `/docs/guide/app-modes`: Application modes (fullstack / spa / ssg / backend)
- `/docs/guide/routing-modes`: Route generation modes (virtual / file / both)
- `/docs/guide/pages-routing/overview`: Pages and routing overview
- `/docs/guide/pages-routing/loaders`: Data loaders
- `/docs/guide/pages-routing/actions`: Actions
- `/docs/guide/i18n`: Internationalization
- `/docs/guide/islands`: Islands architecture

### Reference

- `/docs/reference/api/route-helpers`: Route helper functions
- `/docs/reference/api/response-helpers`: Response helper functions
- `/docs/reference/api/env`: Environment variables
- `/docs/reference/api/database`: Database operations
- `/docs/reference/api/cache`: Cache operations
- `/docs/reference/api/i18n`: I18n API

### Integrations

- `/docs/integrations/database`: Database integrations (Drizzle, db0)
- `/docs/integrations/auth`: Authentication (`@ubean/auth`)
- `/docs/integrations/icons`: Icons (`@ubean/icon`)
- `/docs/integrations/electron`: Desktop apps (`@ubean/electron`)
- `/docs/integrations/ui`: UI components (`@ubean/ui`)

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
  pwa: false, // @ubean/pwa
  auth: false, // @ubean/auth
  image: false, // @ubean/image
  fonts: false, // @ubean/fonts
  electron: false, // @ubean/electron (enabling auto-disables SSR unless explicitly set)
  ui: false, // @ubean/ui (@soybeanjs/ui: UiResolver + styles.css auto-injection)
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

> **App modes**: `mode` controls which build steps run. `fullstack` (default) builds client + SSR + server; `spa` builds client only; `ssg` prerenders to static HTML; `backend` builds API server only. See [App Modes](/docs/guide/app-modes) and [Route Generation Modes](/docs/guide/routing-modes).
>
> **Electron**: `electron: true` enables `@ubean/electron` with default main/preload entries (`electron/main.ts`, `electron/preload.ts`) and auto-disables SSR (desktop apps don't need SSR unless explicitly set via `ssr: true`).

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

| Key        | Module                                             |
| ---------- | -------------------------------------------------- |
| `icon`     | @ubean/icon (icon system, UbeanIcon component)     |
| `pwa`      | @ubean/pwa (PWA support)                           |
| `auth`     | @ubean/auth (authentication)                       |
| `image`    | @ubean/image (image optimization)                  |
| `fonts`    | @ubean/fonts (font optimization)                   |
| `content`  | @ubean/content (content management)                |
| `electron` | @ubean/electron (desktop apps, auto-disables SSR)  |
| `ui`       | @ubean/ui (@soybeanjs/ui: UiResolver + styles.css) |

## Key Features

### 1. Full-Stack Framework

- Server-side rendering (SSR) with Vue + `@vue/server-renderer`
- Client-side hydration with `createUbeanApp` / `createUbeanSSRApp`
- Islands architecture for partial hydration (`client:load|idle|visible|media|only`)
- View Transitions API for native page transitions

### 2. Vite Integration

- Dev server uses Vite middleware mode (`vite.createServer({ middlewareMode: true })`)
- Hot module replacement via Vite native HMR
- Virtual modules: `ubean:pages`, `ubean:routes`, `ubean:meta`, `ubean:app-config`, `ubean:locales`
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
- Typed navigation: `useRoute('RouteName')` infers path params from `typed-router.d.ts`; route generation supports `virtual` (default) / `file` / `both` modes via `routing.mode`
- Route guards: `defineApp({ router: { setup(router) { router.beforeEach(...) } } })` registers navigation guards on both client and SSR (shared setup runs first, then client/server-specific setups)

### 5. Internationalization

- Built-in zero-dependency i18n (`runtime/i18n.ts`, `i18n-routing.ts`)
- 3 routing strategies: `prefix` / `prefix_except_default` / `no_prefix`
- Detection order: URL path → cookie (`ubean_locale`) → Accept-Language → defaultLocale
- Vue reactive `useI18n()` with `t` / `d` / `n` / `c` / `relativeTime` / `list`
- Pluralization (pipe syntax), linked messages (`@:key`), missing key handlers
- SSR hydration: locale injected via `<script id="__UBEAN_LOCALE__">`, auto syncs `<html lang/dir>`

### 6. DevTools

- iframe-based panel injected in dev only (production tree-shaken)
- RPC over `postMessage` with session token + origin binding
- Built-in tabs: Overview, Pages, API Routes, Middlewares, Layouts, Cron Jobs, Env Vars, Config, API Playground, AI Assistant
- CRUD operations share logic with CLI (`packages/cli/src/shared/fs-ops.ts`)
- Hookable CRUD lifecycle (`page:beforeCreate`, `api:afterUpdate`, `env:beforeDelete`, ...)
- AI assistant with LLM function calling driving CRUD via RPC

### 7. Platform Presets

- `standard`: generic fetch handler
- `node`: Node.js HTTP server via `@hono/node-server`
- `cloudflare`: Cloudflare Workers (generates `wrangler.toml`)
- Preset auto-detection: explicit config > config-file hints (wrangler.toml) > environment vars > default `standard`
- Capability matrix (19 capabilities: `fs`, `cronTrigger`, `websocket`, `queue`, `isr`, ...) with build-time diagnostics

### 8. Extension Packages (`@ubean/*` scope, kebab-case)

- `@ubean/icon`: Iconify-based icons with custom local SVG collections, `/_iconify` dev route
- `@ubean/auth`: Better Auth integration with email/password fallback, `useAuth()` composable
- `@ubean/pwa`: Manifest + Service Worker generation, `usePwa()` composable
- `@ubean/image`: Multi-provider image optimization (IPX/Cloudinary/Imgix/...)
- `@ubean/content`: Markdown/YAML/JSON content collections with `queryContent()`
- `@ubean/fonts`: Google/Bunny/Fontshare fonts with `@font-face` generation
- `@ubean/electron`: Desktop apps via vite-plugin-electron; `electron: true` enables with default main/preload entries (`electron/main.ts`, `electron/preload.ts`) and auto-disables SSR
- `@ubean/ui`: @soybeanjs/ui integration; `ui: true` enables UiResolver (component auto-import) + styles.css injection; `ui: { css: false }` for UnoCSS mode (@soybeanjs/unocss-shadcn)

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
│   └── plugins/          # Runtime plugins
├── public/               # Static assets
├── .ubean/                # Auto-generated types
│   ├── routes.d.ts
│   ├── pages.d.ts
│   ├── auto-imports.d.ts
│   └── components.d.ts
├── ubean.config.ts       # Framework config (defineConfig)
├── app.ts                # Vue app config (defineApp)
├── env.ts                # Environment schema (defineEnv)
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

> `definePage` is a compile-time macro — auto-imported, no explicit import needed. Its top-level fields are `name`, `path`, `layout`, `reuse`, `meta`, `middleware`, `requiresAuth`, `head`. There is no top-level `title` field; use `meta: { title }`.

### Creating an API Route

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean';

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
const { data, error, loading, refresh, invalidate } = await useData('posts', () =>
  fetch('/api/posts').then(r => r.json())
);
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
const { t, locale, setLocale, d, n, c } = useI18n();

console.log(t('hello'));
console.log(t('items', { count: 3 }));
console.log(d(new Date()));
console.log(n(1234.56));
console.log(c(42.99, 'USD'));
</script>
```

## Resources

- **Project docs**: `/docs/`
- **CLI help**: `ubean --help`
- **DevTools**: open the floating button in dev (or `Shift+Alt+D`)
- **OpenAPI UI**: `/_scalar` in dev
- **Agent guide**: `/AGENTS.md` (project root)

## Version History

- **v0.0.1**: Initial release
  - Vite middleware mode dev server with module auto-loading
  - SSR with Vue + `@unhead/vue` head management
  - File-based routing (API + Pages) with `defineHandler` / `definePage`
  - hono-openapi integration (`validator` / `describeRoute` / `resolver`)
  - i18n with pluralization, Intl formatting, locale-prefixed routing, SSR hydration
  - Islands architecture (`client:*` directives)
  - View Transitions API
  - DevTools with CRUD + AI assistant
  - Platform presets (Standard, Node, Cloudflare)
  - Extension packages: icon, auth, pwa, image, content, fonts
  - Prerender / SSG
  - Built-in cron, queue, storage, database, WebSocket, SSE
  - `@ubean/electron` desktop app support (default main/preload entries, auto-disable SSR)
  - `@ubean/ui` @soybeanjs/ui integration (UiResolver component auto-import + styles.css auto-injection)
