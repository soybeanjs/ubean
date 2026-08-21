---
title: Architecture
description: "How ubean is architected: its five layers, package layout, and configuration system."
---

# Architecture

## 1. Layered Architecture

ubean is a full-stack meta-framework built on Vite, Hono, and Vue 3, organized into five layers. The repository is structured as **33 packages** (`packages/*`); the main `ubean` package is a thin aggregator that re-exports every `@ubean/*` subpackage.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ubean Framework Layers                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  CLI Layer (@ubean/cli)                      │   │
│  │  ubean dev | build | preview | prepare                       │   │
│  │  init | page | env | config | devtools | scaffold            │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │               Build Core Layer (build-time)                  │   │
│  │  @ubean/config   config loading (defineConfig / c12)        │   │
│  │  @ubean/scan  route scanning (pages/routes/layouts/...)  │   │
│  │  @ubean/build    production build orchestration             │   │
│  │  @ubean/build-core  virtual-registry / macros / registry   │   │
│  │  @ubean/prerender  SSG prerendering (routeRules-driven)     │   │
│  │  @ubean/modules  module system (builtins + kit hooks)       │   │
│  │  @ubean/codegen  type generation (routes.d.ts / typed-router)│  │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │               Vite Plugin Layer (@ubean/vite)               │   │
│  │  ubeanPlugin()  virtual modules / client stubs / macros    │   │
│  │  ubeanVite()     Vue SFC / islands / SSR entry / head        │   │
│  │  extension /vite subpaths: icon / pwa / auth / image / ...  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                Runtime Layer (runtime)                       │   │
│  │  @ubean/app     Hono app factory (createUbeanApp)           │   │
│  │  @ubean/client Vue client runtime (createUbeanClientApp)      │   │
│  │  @ubean/ssr     Vue SSR renderer (streaming / PPR)          │   │
│  │  @ubean/server  cache / db / queue / cron / ws / sse / ...  │   │
│  │  @ubean/pages   page data protocol (loaders / actions)      │   │
│  │  @ubean/actions Server Actions / Form Actions               │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │               Platform Preset Layer (@ubean/preset)         │   │
│  │  standard │ node │ cloudflare │ vercel │ vercel-edge        │   │
│  │  netlify │ bun │ deno (auto-detected by detectPreset)       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 Package Organization

- **Aggregator main package**: `packages/ubean` (npm: `ubean`) contains no framework logic — it re-exports all subpackages, preserving the same API surface as the original single package.
- **Single-purpose subpackages**: the remaining 32 packages are split by capability (`@ubean/shared` / `@ubean/scan` / `@ubean/vue` / `@ubean/app` / `@ubean/ssr` …), each built and type-checked independently.
- **Extensions loaded on demand**: `auth` / `icon` / `pwa` / `image` / `content` / `fonts` / `electron` / `pinia` / `ui` are enabled via top-level `ubean.config.ts` fields (the pwa/fonts/electron/pinia/ui integrations live in `@ubean/integrations`); the build dynamically `import()`s the matching `/vite` subpath. They **never** become hard dependencies of the main package.
- **Entry boundaries**: server code imports from the `ubean` main entry or `ubean/runtime/app`; browser code must import from `ubean/runtime/vue` to keep server-side build tooling out of the browser bundle.

## 2. Core Data Flow

### 2.1 Dev Mode

```
ubean dev
  │
  ├─► Load config (ubean.config.ts + defaults merged via c12)
  │    └─► Resolve preset (detectPreset auto-detection or build.preset)
  │
  ├─► Scan project files (@ubean/scan)
  │    ├─► src/routes/     → API routes (defineHandler named exports)
  │    ├─► src/pages/      → Vue page routes (definePage macro)
  │    ├─► src/layouts/    → layouts (resolved by path hierarchy)
  │    ├─► src/middleware/ → Hono middleware (global → /*, prefix → subpath)
  │    ├─► src/crons/      → scheduled tasks (defineScheduled)
  │    └─► public/         → static assets (ETag / Cache-Control)
  │
  ├─► Start Vite dev server (@ubean/dev-server + @ubean/vite)
  │    ├─► ubeanPlugin()   virtual modules, client stubs, macro transforms
  │    └─► ubeanVite()     Vue SFC, SSR render pipeline, HMR
  │
  ├─► Start Hono dev server (@ubean/app: route rules + middleware + ISR)
  │
  └─► File watch → HMR / route rebuild → auto refresh
```

### 2.2 Build Mode

```
ubean build
  │
  ├─► Load config + resolve preset + scan project files
  │
  ├─► Generate virtual modules and types
  │    ├─► Route manifest (virtual:ubean-pages / routes)
  │    ├─► Module registry (registry.ts)
  │    ├─► .ubean/routes.d.ts + typed-router.d.ts
  │    └─► islands registry
  │
  ├─► Client build (Vite)
  │    └─► Vue client bundle (hydration entry)
  │
  ├─► Server build (Vite SSR / Rolldown)
  │    ├─► Entry: server entry for the preset
  │    ├─► Bundle all routes / middleware / module plugins
  │    └─► Output to outputDir/server
  │
  ├─► Prerender (mode: 'ssg' or routeRules.prerender / ppr)
  │    └─► Generate static HTML
  │
  └─► Emit platform artifacts (vercel.json / wrangler.toml / netlify.toml / …)
```

## 3. Configuration System

The configuration entry point is `ubean.config.ts`, declared with `defineConfig` (loading and types live in `@ubean/config`). Defaults are merged by `loadUbeanConfig`; the full field list is in the [API Reference](/reference/api/config).

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  // App mode: fullstack (default) | spa | ssg | backend
  mode: 'fullstack',

  // Source directory (default: <rootDir>/src)
  srcDir: 'src',

  // SSR config: true (default) | false | { exclude, streaming }
  ssr: true,

  // Directory conventions (defaults are fine; override as needed)
  dir: {
    pages: 'src/pages',
    routes: 'src/routes',
    layouts: 'src/layouts',
    middleware: 'src/middleware',
    public: 'public'
  },

  // Route rules: per-route rendering control (cache / redirect / ISR / PPR)
  routeRules: {
    '/blog/**': { isr: 3600 },
    '/old-page': { redirect: '/new-page' }
  },

  // Prerendering (SSG): all: true or an include list
  prerender: { all: true },

  // Module system: package names / tuples / instances
  modules: [],

  // Extensions (opt-in; the matching /vite plugin is loaded at build time)
  icon: true,         // @ubean/icon
  pwa: true,          // @ubean/integrations/pwa
  auth: true,         // @ubean/auth
  ui: { css: false }, // @ubean/integrations/ui (UnoCSS mode)
  pinia: true,        // @ubean/integrations/pinia

  // DevTools panel (disabled by default)
  devtools: { enabled: true },

  // vue-i18n 11 + compact locale routing
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default'
  },

  // Markdown pages (unplugin-vue-markdown + shiki highlighting)
  markdown: {
    enabled: true,
    theme: { light: 'one-light', dark: 'one-dark-pro' }
  },

  // Dev server
  dev: { port: 9527, host: 'localhost' },

  // Build options
  build: { minify: true, sourcemap: false }
});
```

**Key points**:

- The platform preset is set via `build.preset`; when omitted, `detectPreset()` auto-detects from `vercel.json` / `netlify.toml` / `deno.json` and runtime globals.
- Extension top-level fields accept either `true` or an options object.
- `routeRules` supports `ssr` (`boolean | 'streaming'`) / `prerender` / `isr` (`number | { ttl, swr? }`) / `ppr`, sorted by rule and path specificity, and readable at runtime via `c.get('routeRule')`.

See [Overview §3](overview.md#3-directory-structure) for the convention-based app directory structure.
