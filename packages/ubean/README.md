# ubean

**English | [中文](./README.zh-CN.md)**

A Vue-first full-stack meta-framework built on Vite-Plus — one npm package aggregating all `@ubean/*` subpackages behind dedicated subpath entries.

```ts
import { defineConfig } from 'ubean';
import { defineHandler } from 'ubean/server';

export default defineConfig({
  ssr: true,
  build: { preset: 'node' }
});

export const GET = defineHandler(async c => c.json({ ok: true }));
```

## Table of Contents

- [ubean](#ubean)
  - [Documentation](#documentation)
  - [Package Positioning](#package-positioning)
  - [Install](#install)
  - [Quick Start](#quick-start)
  - [Subpath Entries](#subpath-entries)
  - [Import Context Rules](#import-context-rules)
  - [The Size Trap](#the-size-trap)
  - [Type Safety](#type-safety)
  - [Architecture Notes](#architecture-notes)

## Documentation

Full docs: **<https://ubean.soybeanjs.dev>** · [Quick start](https://ubean.soybeanjs.dev/guide/quickstart/) · [API reference](https://ubean.soybeanjs.dev/reference/api/ubean/)

This README only covers the package surface (subpath entries and import contexts). Guiding docs — routing, loaders, actions, islands, i18n, integrations — live on the docs site.

## Package Positioning

| Layer            | Responsibility                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ubean` (`.`)    | Isomorphic barrel: shared, SEO, page protocol, markdown, Vue client kernel, islands runtime, logger, `defineConfig` |
| `ubean/client`   | The only client entry: client kernel re-exports, Server Actions runtime, islands bridge                             |
| `ubean/server`   | Server runtime: app factory, routes, cache/db/queue/cron/ws/sse, `validator` / `describeRoute`                      |
| `ubean/build`    | Build-time: prerender/SSG, platform presets, config loader, codegen presets, scanner, Vite plugins                  |
| `ubean/vite`     | Default Vite plugin composition (build + vue + islands + server actions)                                            |
| `ubean/i18n`     | Server-side i18n (re-export of `@ubean/i18n` plus routing middleware)                                               |
| `ubean/ssr`      | Vue SSR renderer (`createVueRenderer`)                                                                              |
| `ubean/scaffold` | Scaffolding library and machine-readable catalog                                                                    |

**Included:**

- Everything `@ubean/*` — 23 subpackages re-exported behind the subpaths above, so a single dependency gives the whole framework.
- The CLI binary, exposed as `ubean` through `bin/ubean.mjs`.
- `defineConfig` on the isomorphic main entry, safe to import from a config file, the client or shared code.

**NOT included** (deliberately):

- No multi-framework support. Vue is the only target — ubean invests in Vue-specific depth rather than breadth across frameworks.
- No h3/Nitro HTTP layer. Hono is the HTTP core; `ubean/server` re-exports Hono-shaped handlers and `hono-openapi` helpers.
- No HTTP client. Use [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) on the browser side.
- No bundled third-party API pass-through. `vue`, `vue-router`, `vue-i18n` and `@vue/server-renderer` APIs are imported from those packages directly.
- No optional extensions in the hard dependency graph. Images, content, icons, AI, auth, fonts, PWA, Electron and DevTools are separate opt-in packages.

**Runtime dependency whitelist (main entry):** the 16 `@ubean/*` workspace packages plus `hono` and `hono-openapi`. The full, authoritative list is in [`packages/ubean/package.json`](./package.json).

**Optional peer:** `vue` (`^3.0.0`) — required by the client runtime, not by the server-only entries.

## Install

```bash
pnpm add ubean
pnpm add vue        # peer, required for the client runtime

# optional extensions, installed only when you enable them
pnpm add @ubean/ai
pnpm add @ubean/auth
pnpm add @ubean/integrations
pnpm add -D @ubean/devtools
```

## Quick Start

**1. Configure the project**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ssr: true,
  build: { preset: 'node' },
  autoImports: true,
  components: true
});
```

**2. Add a page**

```vue
<!-- src/pages/index.vue -->
<script setup lang="ts">
definePage({ head: { title: 'Home' } });
const { data } = await useFetch('greeting', '/api/greeting');
</script>

<template>
  <h1>{{ data?.message }}</h1>
</template>
```

**3. Add an API route**

```ts
// src/routes/api/greeting.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(async c => c.json({ message: 'hello' }));
```

Then run `pnpm dev` (or `vite dev` — the Vite plugin owns the dev/build/preview lifecycle).

## Subpath Entries

| Subpath          | What lives behind it                                                                                                               | Import it from                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `ubean`          | Isomorphic values: shared utilities, SEO, page data protocol, markdown, Vue client kernel, islands runtime, logger, `defineConfig` | Config file, client, shared code    |
| `ubean/vite`     | The default Vite plugin composition                                                                                                | `vite.config.ts`                    |
| `ubean/client`   | The only client entry — client kernel plus `createServerHead`, Server Actions runtime and islands hydration bridge                 | Client code, SPA entry              |
| `ubean/server`   | App factory (`createUbeanApp`), route runtime, cache, db, queue, cron, WebSocket/SSE, `validator`, `describeRoute`                 | `src/server.ts`, API routes         |
| `ubean/build`    | Prerender/SSG, platform presets, `loadUbeanConfig`, codegen presets, scanner, Vite plugin bodies                                   | Build scripts, CI, `vite.config.ts` |
| `ubean/i18n`     | Server-side i18n: `t()` over AsyncLocalStorage, `createI18nMiddleware`                                                             | Server code that needs `t()`        |
| `ubean/ssr`      | `createVueRenderer`                                                                                                                | Custom SSR setups                   |
| `ubean/scaffold` | `scaffold` / `getScaffoldManifest` and the machine-readable catalog                                                                | Studio / IDE integrations           |

## Import Context Rules

Pick the entry by where the code runs:

1. **Isomorphic values** (types, `defineConfig`, SEO helpers, markdown, the Vue client kernel) → `ubean`.
2. **Server APIs** (`defineHandler`, `useDatabase`, `validator`, `describeRoute`, cache, queue, cron) → `ubean/server`.
3. **Build-time APIs** (`prerender`, `loadUbeanConfig`, `getAutoImportPresets`, `detectPreset`, Vite plugin bodies) → `ubean/build`.
4. **Server-side i18n** (`t()`, `createI18nMiddleware`) → `ubean/i18n`.
5. **Client code** → `ubean/client`, not the main barrel.

Importing a server symbol from the main entry in client code pulls Hono and `node:*` into the browser pre-bundle. Importing the main barrel from a client module costs bundle size — see below.

## The Size Trap

The main entry is an aggregate barrel: shared, SEO, pages, markdown, the Vue client kernel, islands and the logger. Importing it from a client module drags that whole chain into the client graph.

Measured in the example project, a single `import { defineMatcher } from 'ubean'` in a client file moved the entry chunk from **45.2 kB gzip to 111.9 kB gzip** (+148%). Switching the same import to `'ubean/client'` brought it back to **+1.5%**.

Rule of thumb: in anything that ships to the browser, import from `ubean/client`. The bundle-size guard (`pnpm analyze:check`) checks the size only — it cannot see where an import came from — so `packages/cli/test/example-imports.test.ts` asserts directly that example client-graph files never import from the main `ubean` entry.

## Type Safety

- `defineConfig(config?)` returns `UbeanConfig`; `ResolvedConfig` is what the framework actually reads after defaults and presets are applied.
- `PresetName` / `BuiltinPresetName` are closed unions over the built-in platform presets, so `build: { preset: ... }` is checked at compile time.
- `PageHead`, `HttpMethod`, `PageAssetTags`, `PageRenderer` and `InternalFetchOptions` type the page protocol shared between scanner, builder and runtime.
- `defineApp(options)` returns `ResolvedAppConfig`; `DefineAppOptions` types every hook, including `serializeState` / `hydrateState`.
- `ScaffoldManifest`, `ScaffoldTypeManifest` and `ScaffoldArgManifest` describe the machine-readable catalog consumed by studio tooling.
- Server and client surfaces both re-export from `@ubean/routes/runtime`, so `useAction` / `callAction` keep one set of types.

## Architecture Notes

- **Aggregator, not a monolith.** `ubean` is a pure re-export layer over 23 `@ubean/*` subpackages. Every symbol you import resolves to the subpackage that owns it.
- **Subpaths are the contract.** The `exports` map defines eight entries; the boundaries between them are what keep the client graph free of server and build-time dependencies.
- **Hono is the HTTP core.** Route handlers are Hono handlers, `validator` / `describeRoute` come from `hono-openapi`, and the app factory returns a Hono app.
- **Isomorphic by construction.** The main entry is safe in both environments by design; anything that is not safe there lives behind a subpath.
- **Extensions stay out of the core.** AI, auth, integrations and DevTools are separate packages enabled through `ubean.config.ts` fields, keeping native dependencies and remote SDKs out of the core graph.
- **Vite owns the lifecycle.** The plugin registers the client and ubean environments plus the build app, so `vite dev|build|preview` alone is the complete toolchain.
- **Machine-readable contracts.** `ubean/scaffold` exposes a versioned catalog so external tools (studio, IDE plugins) can drive file generation without importing build internals.
- **Where to read next.** The docs site at <https://ubean.soybeanjs.dev> holds the guides, integrations and API reference; the [root README](../../README.md) owns the feature tour, platform presets and framework comparison; the [architecture decisions](../../docs/adr) record the plugin-first lifecycle, platform artifact contract and DevTools hosting.
