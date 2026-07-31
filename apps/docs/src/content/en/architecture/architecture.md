---
title: Architecture
---

# Architecture

## 4.1 Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ubean Framework Architecture                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     CLI Layer (citty)                        │   │
│  │  ubean dev | ubean build | ubean prepare | ubean preview    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                   Core Layer (Core)                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Config   │  │ Routing  │  │  Build   │  │  Preset  │   │   │
│  │  │ Loader   │  │  Scan    │  │  System  │  │ Resolver │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │  Hooks   │  │ Dev      │  │ Prerender│  │  Types   │   │   │
│  │  │ System   │  │ Server   │  │  / SSG   │  │  System  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 Vite Plugin Layer (Vite-Plus)                │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ ubeanPlugin()           │ ubeanVue()                 │  │   │
│  │  │ - Virtual modules       │ - Vue SFC processing       │  │   │
│  │  │ - Client stubs          │ - SSR rendering            │  │   │
│  │  │ - Env schema            │ - Client routing           │  │   │
│  │  │ - Dev triggers          │ - Islands                  │  │   │
│  │  │ - Binding injection     │ - Head management          │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                  Runtime Layer (Runtime)                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Hono Server │  │  Router     │  │ Route Rules         │ │   │
│  │  │             │  │  (rou3)     │  │ (cache/headers/     │ │   │
│  │  │             │  │             │  │  redirects/ISR)     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Plugins     │  │ Storage     │  │ Database/Drizzle    │ │   │
│  │  │ (hookable)  │  │ (unstorage) │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ WebSocket   │  │ SSE/Streams │  │ Cache/ISR           │ │   │
│  │  │ (crossws)   │  │             │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 Platform Adapter Layer (Presets)             │   │
│  │  Node.js │ Bun │ Deno │ Cloudflare │ Vercel │ Netlify │ ...│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 4.2 Core Data Flow

#### 4.2.1 Dev Mode Flow

```
ubean dev
  │
  ├─► Load config (ubean.config.ts)
  │    └─► Resolve preset (auto-detect or manual)
  │
  ├─► Scan project files
  │    ├─► routes/        → API routes
  │    ├─► pages/         → Page routes + .server.ts
  │    ├─► middleware/    → Global middleware
  │    ├─► plugins/       → Runtime plugins
  │    └─► public/        → Static assets
  │
  ├─► Start Vite dev server (vite-plus)
  │    ├─► ubeanPlugin()
  │    │    ├─► Virtual module registration
  │    │    ├─► Client stub injection
  │    │    └─► Environment variable schema validation
  │    └─► ubeanVue()
  │         ├─► Vue SFC processing
  │         └─► SSR/HMR config
  │
  ├─► Start Worker runtime (env-runner)
  │    └─► Hono server handles requests
  │
  └─► File watch → hot reload → auto refresh
```

#### 4.2.2 Build Mode Flow

```
ubean build
  │
  ├─► Load config + resolve preset
  ├─► Scan project files
  ├─► Generate virtual modules
  │    ├─► Route manifest
  │    ├─► Runtime config
  │    ├─► Plugin registry
  │    └─► Platform polyfills
  │
  ├─► Client build (Vite)
  │    └─► Vue SSR client bundle
  │
  ├─► Server build (Rollup/Rolldown)
  │    ├─► Entry: server entry for the preset
  │    ├─► Bundle all routes/middleware/plugins
  │    ├─► Platform-specific processing
  │    └─► Output to .output/server/
  │
  ├─► Static asset processing
  │    └─► Output to .output/public/
  │
  ├─► Prerender (if SSG enabled)
  │    └─► Generate static HTML
  │
  └─► Generate platform config files
       └─► vercel.json / wrangler.toml / netlify.toml / ...
```

## 4.3 Configuration System

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  // Platform preset: auto-detect or manual
  preset: 'node-server', // node-server | bun | deno | cloudflare | vercel | ...

  // Source directories
  srcDir: './',
  routesDir: './routes',
  pagesDir: './pages',
  middlewareDir: './middleware',
  publicDir: './public',

  // Server directory
  serverDir: './server',

  // Output config
  output: {
    dir: './.output',
    serverDir: './.output/server',
    publicDir: './.output/public'
  },

  // Route rules
  routeRules: {
    '/**': { cache: { maxAge: 60 } },
    '/api/**': { cors: true },
    '/blog/**': { isr: 3600 },
    '/old-page': { redirect: '/new-page' }
  },

  // Runtime config (accessible via useRuntimeConfig())
  runtimeConfig: {
    apiSecret: '', // server-only
    public: {
      apiBase: '/api' // client-accessible
    }
  },

  // Environment variable validation schema
  env: {
    DATABASE_URL: { type: 'string', required: true },
    API_KEY: { type: 'string', secret: true }
  },

  // Storage config
  storage: {
    data: { driver: 'fs', base: './data' },
    redis: { driver: 'redis', url: '...' }
  },

  // Database config
  database: {
    default: {
      connector: 'sqlite', // sqlite | postgresql | mysql | d1 | libsql
      options: {
        /* ... */
      }
    }
  },

  // Plugins
  plugins: [],

  // Modules
  modules: [],

  // Vue config
  vue: {
    ssr: true,
    islands: false
  },

  // OpenAPI docs config
  openAPI: {
    meta: {
      title: 'My Ubean App',
      description: 'API documentation',
      version: '1.0.0'
    },
    route: '/_openapi.json', // OpenAPI JSON endpoint
    production: 'runtime', // 'runtime' | 'prerender' | false
    ui: {
      scalar: { route: '/_scalar' }, // Scalar UI (enabled by default, false to disable)
      swagger: false // Swagger UI (disabled by default)
    }
  },

  // Build config
  build: {
    minify: true,
    sourcemap: false
  },

  // Dev server
  devServer: {
    port: 9527,
    host: 'localhost',
    watch: []
  },

  // Framework info
  framework: {
    name: 'ubean',
    version: '0.1.0'
  }
});
```

For the convention-based app directory structure, see [Overview §3](overview.md#3-directory-structure).

## Next Steps

- [Overview](/architecture/overview) — project overview, tech stack and directory structure.
- [Routing](/architecture/routing) — file-based routing scan and route conventions.
- [Runtime](/architecture/runtime) — runtime server, middleware, and plugins.
- [Quick Start](/guide/quickstart) — create your first ubean project.
