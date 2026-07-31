---
title: Modes
---

# Modes

> **Status: ✅ Implemented (2026-07)**
>
> This document is the original design proposal. The `AppMode` type and the `mode`/`ssr` config fields have landed in [`@ubean/config`](../packages/config/src/types.ts) (`'fullstack' | 'spa' | 'ssg' | 'backend'`).
> This document is retained as a design decision record; the authoritative API is defined by [AGENTS.md](../AGENTS.md) and [skills/ubean/docs](../skills/ubean/docs).
>
> ---
>
> This document describes the design of ubean's `mode` config field, which supports multiple application shapes including frontend-only, backend-only, full-stack, and SSG.

## 1. Background and Goals

### 1.1 Current Problems

ubean's current build pipeline (see [packages/build/src/production.ts](../packages/build/src/production.ts)) **unconditionally builds the client bundle + SSR bundle + server bundle**, so even pure frontend projects emit a full `dist/server/` directory. This causes:

1. **Redundant artifacts** — the `frontend-only` example still outputs `dist/server/entry.mjs`, `server.mjs`, and other files that are never used.
2. **Build time waste** — building the SSR bundle accounts for roughly 40% of total build time, a clear waste for pure frontend projects.
3. **Ambiguous semantics** — the `frontend-only` example's [ubean.config.ts](../examples/frontend-only/ubean.config.ts) is an empty config; "frontend-only" intent is only implied by the absence of `src/routes/` and `src/server.ts`, with no explicit declaration.
4. **Deployment confusion** — users do not know which artifacts are required and which can be deleted.

### 1.2 Design Goals

- **Single config entry** — declare the application shape via the `mode` field in `ubean.config.ts`.
- **Full-stack by default** — `mode` defaults to `fullstack`, fully backward compatible with current behavior.
- **Build on demand** — skip unnecessary build steps based on `mode` to reduce artifact size and build time.
- **Orthogonal design** — `mode` is orthogonal to `preset` (deployment platform), `routing.mode` (route generation), and `prerender` (SSG toggle); they can be combined freely.
- **SSR controllable** — within `fullstack` mode, `ssr: false` disables SSR rendering while keeping API routes + client rendering (avoids introducing a redundant `ssr` mode alias).

### 1.3 Non-Goals

- **Do not** change any behavior of the existing `fullstack` mode (`ssr: true` default) — zero breaking change.
- **Do not** replace `preset`'s platform adaptation responsibility (node/cloudflare/vercel, etc.).
- **Do not** introduce CJS/`require` exports — stay ESM-only.
- **Do not** auto install/uninstall npm dependencies — users still run `pnpm add` manually.
- **Do not** keep `ssr` as a standalone mode — it is semantically identical to `fullstack`; instead, an `ssr: boolean` option controls it within `fullstack` mode.

## 2. Mode Definitions

### 2.1 AppMode Type

```typescript
export type AppMode = 'fullstack' | 'spa' | 'ssg' | 'backend';
```

> **Design decision**: `ssr` is no longer kept as a standalone mode. The original `ssr` mode behaved identically to `fullstack` — it was only a "semantic emphasis", but the duplicated config semantics led users to assume differences. Replacing it with an `ssr: boolean` option under `fullstack` mode both emphasizes "whether SSR is needed" and avoids mode proliferation.

### 2.2 Mode Semantics

| Mode | Client bundle | SSR bundle | Server bundle | Prerender | Description |
|---|---|---|---|---|---|
| `fullstack` (default, `ssr: true`) | ✅ | ✅ | ✅ | optional | Current default behavior: Vue pages + Hono API + SSR |
| `fullstack` + `ssr: false` | ✅ | ❌ | ✅ | ❌ | Vue pages + Hono API, no SSR rendering (suitable for full-stack apps without SEO needs) |
| `spa` | ✅ | ❌ | ❌ | ❌ | Pure client-side rendering; static HTML + JS only, no server |
| `ssg` | ✅ | ✅ (temporary) | ❌ | ✅ (forced) | SSR renders static HTML at build time; output is purely static files |
| `backend` | ❌ | ❌ | ✅ | ❌ | Pure Hono API service; no Vue pages, no SSR |

### 2.3 Mode Selection Guide

| Scenario | Recommended mode | Notes |
|---|---|---|
| Full-stack app (pages + API + SEO) | `fullstack` (default) | Most common; includes SSR |
| Full-stack app (pages + API, no SEO) | `fullstack` + `ssr: false` | Admin dashboards, etc. |
| Pure API service (no frontend) | `backend` | Microservices, BFF |
| Marketing site / blog (static) | `ssg` | SEO-friendly; deploy to CDN |
| Pure frontend app (no API) | `spa` | No SEO needs, no server |

### 2.4 Relationship to Existing Config

| Config field | Relationship to mode | Notes |
|---|---|---|
| `build.preset` | Orthogonal | `mode` controls architecture (frontend/backend presence); `preset` controls deployment platform (node/cf) |
| `routing.mode` | Orthogonal | `routing.mode` controls route file generation (virtual/file); unrelated to `mode` |
| `prerender.enabled` | Overridden by mode | `ssg` forces `prerender.enabled = true`; `spa`/`backend`/`fullstack`+`ssr:false` force it to `false` |
| `ssr` | Sub-option of mode | Only effective when `mode === 'fullstack'`; ignored under `spa`/`ssg`/`backend` |
| `icon`/`pwa`/`auth`, etc. | Orthogonal | Extensions load on demand; unaffected by `mode` |
| `i18n` | Orthogonal | i18n config is independent of `mode` |

## 3. Architecture Design

### 3.1 Config Layer

#### 3.1.1 Type Definition

Added to the `UbeanConfig` interface in [packages/config/src/types.ts](../packages/config/src/types.ts):

```typescript
export type AppMode = 'fullstack' | 'spa' | 'ssg' | 'backend';

export interface UbeanConfig {
  /**
   * Application mode; controls which build steps run on demand.
   *
   * - `fullstack` (default): client + SSR + server, complete full-stack
   * - `spa`: pure client-side rendering, no SSR, no server bundle
   * - `ssg`: static site generation, prerendered at build time; output is purely static files
   * - `backend`: pure API backend, no Vue pages, no SSR
   */
  mode?: AppMode;

  /**
   * Whether to build the SSR bundle. Only effective when `mode === 'fullstack'`.
   *
   * - `true` (default): build the SSR bundle to support server-side rendering
   * - `false`: skip the SSR bundle build, keeping only client rendering + API routes
   *
   * Ignored under other modes (`spa`/`backend` never have SSR;
   * `ssg` always requires SSR for prerendering).
   */
  ssr?: boolean;
  // ... existing fields unchanged
}
```

#### 3.1.2 Default Values

Added to `configDefaults` in [packages/config/src/loader.ts](../packages/config/src/loader.ts):

```typescript
const configDefaults: ResolvedConfig = {
  mode: 'fullstack', // new, default full-stack
  ssr: true,         // new, SSR on by default
  // ... existing fields
};
```

#### 3.1.3 ResolvedConfig

`ResolvedConfig` automatically inherits the `mode` and `ssr` fields (already wrapped in `Required`).

### 3.2 Build Layer

The core change is in the `buildProduction` function of [packages/build/src/production.ts](../packages/build/src/production.ts).

#### 3.2.1 Build Pipeline Branching

```typescript
export async function buildProduction(options: BuildOptions): Promise<BuildManifest> {
  const { config, scanResult } = options;
  const mode = config.mode;
  const ssrEnabled = mode === 'fullstack' ? config.ssr : (mode === 'ssg');

  // 1. Generate virtual modules (selectively based on mode)
  await generateVirtualModulesToDisk(cwd, config, scanResult, virtualDir, mode, ssrEnabled);

  // 2. Client bundle (mode !== 'backend')
  if (mode !== 'backend') {
    await buildClientBundle(/* ... */);
  }

  // 3. SSR bundle (fullstack+ssr / ssg)
  //    - fullstack + ssr:true → SSR needed
  //    - fullstack + ssr:false → skip SSR
  //    - ssg → SSR needed (for prerendering)
  //    - spa / backend → skip SSR
  if (ssrEnabled) {
    await buildSSRBundle(/* ... */);
  }

  // 4. Server entry (fullstack / backend)
  //    - fullstack → always needs a server bundle (API routes + optional SSR)
  //    - backend → needs a server bundle (pure API)
  //    - ssg → the temporary server bundle is cleaned up by the CLI after prerender
  //    - spa → no server bundle
  if (mode === 'fullstack' || mode === 'backend') {
    await generateServerEntry(/* ... */);
  }

  // 5. SSG prerender (mode === 'ssg', or prerender.enabled)
  //    Handled by the CLI layer (clis/build.ts), not inside buildProduction
}
```

#### 3.2.2 On-Demand Virtual Module Generation

In `generateVirtualModulesToDisk` of [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts):

| Virtual module | fullstack + ssr:true | fullstack + ssr:false | spa | ssg | backend |
|---|---|---|---|---|---|
| `ubean:routes` (API routes) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ubean:pages` (page routes) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ubean:meta` (route metadata) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ubean:app-config` (app config) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ubean:locales` (i18n) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `virtual:ubean-pages` (Vue pages) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `virtual:ubean-app` (Vue app entry) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `virtual:ubean-server` (server entry) | ✅ | ✅ | ❌ | ✅ (temporary) | ✅ |
| `virtual:ubean-client-entry` (client entry) | ✅ | ✅ | ✅ | ✅ | ❌ |

> **Note**: `fullstack` + `ssr:false` still generates `virtual:ubean-server` because the server bundle is still needed to start the Hono app and handle API routes — it just does not render Vue pages.

#### 3.2.3 Conditional Vue Plugin Loading

In `builtinPlugins` at [production.ts#L499-L511](../packages/build/src/production.ts#L499-L511):

```typescript
const builtinPlugins: VitePlugin[] = [];

// Vue plugins are only loaded in non-backend mode (backend has no pages)
if (config.mode !== 'backend') {
  builtinPlugins.push(
    vue({ /* ... */ }) as VitePlugin,
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  );
}

// ubeanPlugin (core plugin) is always loaded (handles route scanning and virtual modules)
if (!userViteConfig) {
  builtinPlugins.push(ubeanPlugin({ config }));
}
```

### 3.3 CLI Layer

#### 3.3.1 build Command

In [packages/cli/src/build.ts](../packages/cli/src/build.ts):

```typescript
export const buildCommand: CommandDef = {
  args: {
    // existing args...
    mode: {
      type: 'string',
      description: 'App mode (fullstack, spa, ssg, backend). Overrides ubean.config.ts mode'
    },
    ssr: {
      type: 'boolean',
      description: 'Enable SSR in fullstack mode (only effective with --mode fullstack)',
      default: true
    },
    // new --ssg shortcut flag
    ssg: {
      type: 'boolean',
      description: 'Shortcut for --mode ssg',
      default: false
    }
  },
  async run({ args }) {
    const config = await loadUbeanConfig(cwd);

    // CLI --mode overrides the config file
    if (args.mode) config.mode = args.mode;
    if (args.ssg) config.mode = 'ssg';

    // CLI --ssr override (only effective in fullstack mode)
    if (config.mode === 'fullstack' && args.ssr !== undefined) {
      config.ssr = args.ssr;
    }

    // Adjust prerender behavior based on mode
    if (config.mode === 'ssg') {
      config.prerender.enabled = true; // force on
    } else if (config.mode === 'spa' || config.mode === 'backend') {
      config.prerender.enabled = false; // force off
    } else if (config.mode === 'fullstack' && !config.ssr) {
      config.prerender.enabled = false; // fullstack + ssr:false cannot prerender
    }

    // Existing build flow...
    const manifest = await buildProduction({ /* ... */ });

    // SSG prerender (mode === 'ssg' or prerender.enabled)
    const shouldPrerender = config.prerender.enabled;
    if (shouldPrerender) {
      const fetcher = await createSsrFetcher(cwd, manifest);
      await prerender({ /* ... */ });
    }

    // SSG mode: clean up the temporary server bundle
    if (config.mode === 'ssg') {
      await rm(outDirs.server, { recursive: true, force: true });
    }
  }
};
```

#### 3.3.2 preview Command

In [packages/cli/src/preview.ts](../packages/cli/src/preview.ts), choose the preview method based on `mode`:

| Mode | Preview method |
|---|---|
| `fullstack` / `backend` | Start `dist/server/server.mjs` (existing behavior) |
| `spa` / `ssg` | Start a static file server (serve `dist/public/`) |

```typescript
async run({ args }) {
  const config = await loadUbeanConfig(cwd);

  if (config.mode === 'spa' || config.mode === 'ssg') {
    // Static file server
    await startStaticServer({ root: join(cwd, config.build.outputDir, 'public'), port, host });
  } else {
    // Existing Node server preview logic (fullstack + ssr:true/false / backend)
    await startNodeServer({ serverPath, port, host });
  }
}
```

> **Note**: `fullstack` + `ssr:false` still uses the Node server for preview because the server bundle contains the API route handlers.

### 3.4 Dev Layer

Dev mode changes are minimal because Vite middleware mode natively supports on-demand loading.

In [packages/dev-server/src/vite-server.ts](../packages/dev-server/src/vite-server.ts#L220-L225):

```typescript
const builtinPlugins: VitePlugin[] = [];

// backend mode does not load Vue-related plugins
if (config.mode !== 'backend') {
  builtinPlugins.push(
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  );
}

if (!hasUserViteConfig) {
  builtinPlugins.push(ubeanPlugin({ config }));
}
```

The dev server's request handling is unchanged — `app.fetch(webReq)` already handles scenarios with no pages or no routes correctly.
`fullstack` + `ssr:false` still goes through Vite middleware SSR in dev (because dev does not distinguish SSR on/off; it only affects build artifacts).
If you need to strictly disable dev SSR, this can be addressed in a later iteration.

### 3.5 Module System (No Changes Needed)

The dynamic `import()` mechanism in [packages/modules/src/index.ts](../packages/modules/src/index.ts#L203) already supports on-demand loading of extension packages (icon/pwa/auth/image/fonts); `mode` does not need to intervene.

`mode` only controls **core build steps** and **virtual module generation**; it does not touch extension package loading logic.

## 4. Detailed Behavior per Mode

### 4.1 `fullstack` Mode (default, `ssr: true`)

**Identical to current behavior; zero changes.**

- Build: `dist/public/` (client) + `dist/server/` (server)
- Dev: Vite middleware + Hono app
- Preview: Node server (`server.mjs`)
- Prerender: optional (controlled by `prerender.enabled`)

### 4.2 `fullstack` Mode + `ssr: false`

**Full-stack but no SSR. Suitable for full-stack apps without SEO needs, such as admin dashboards.**

Build flow:
1. ✅ Generate client + server virtual modules (the server still needs to start the Hono app to handle API routes)
2. ✅ Build client bundle → `dist/public/`
3. ❌ Skip SSR bundle build (saves about 40% of build time)
4. ✅ Build server bundle (contains the Hono app + API routes, but no Vue renderer)
5. ❌ Skip prerender (no SSR, cannot prerender)

Artifact structure:
```
dist/
├── public/          # client artifacts
│   ├── index.html
│   ├── assets/
│   └── favicon.svg
└── server/          # server artifacts (API only, no SSR renderer)
    ├── entry.mjs
    ├── server.mjs
    └── package.json
```

Dev behavior:
- Same as `fullstack` + `ssr:true` (dev mode does not distinguish SSR on/off)
- HMR works normally

Preview behavior:
- Starts the Node server (same as `fullstack`); API routes respond normally, page requests are rendered client-side

### 4.3 `spa` Mode

**Pure client-side rendering, no server.**

Build flow:
1. ✅ Generate client virtual modules (`ubean:pages`, `ubean:app`, `virtual:ubean-client-entry`)
2. ✅ Build client bundle → `dist/public/`
3. ✅ Generate `index.html` (containing `<script type="module">` pointing to the client entry)
4. ❌ Skip SSR bundle build
5. ❌ Skip server entry generation
6. ❌ Skip prerender

Artifact structure:
```
dist/
└── public/
    ├── index.html
    ├── assets/
    │   ├── app-[hash].js
    │   └── ...
    └── favicon.svg
```

Dev behavior:
- Vite dev server still uses middleware mode, but `app.fetch()` returns client HTML for all routes
- HMR works normally

Preview behavior:
- Starts a static file server serving `dist/public/`

### 4.4 `ssg` Mode

**Static site generation; prerender at build time.**

Build flow:
1. ✅ Generate client + SSR virtual modules (SSR is only used for build-time rendering)
2. ✅ Build client bundle → `dist/public/`
3. ✅ Build SSR bundle → `dist/server/` (temporary)
4. ✅ Force prerender → generate `dist/public/**/*.html`
5. ✅ Delete the temporary `dist/server/` directory

Artifact structure:
```
dist/
└── public/
    ├── index.html          # prerendered home page
    ├── about/
    │   └── index.html      # prerendered /about
    ├── blog/
    │   ├── post-1/
    │   │   └── index.html
    │   └── ...
    ├── assets/             # client JS/CSS
    └── favicon.svg
```

Dev behavior:
- Same as `fullstack` (dev mode does not prerender; real-time SSR)

Preview behavior:
- Starts a static file server serving `dist/public/`

### 4.5 `backend` Mode

**Pure API backend, no frontend.**

Build flow:
1. ✅ Generate API route virtual modules (`ubean:routes`, `ubean:app-config`, `ubean:locales`)
2. ❌ Skip page-related virtual modules (`ubean:pages`, `ubean:meta`, `virtual:ubean-pages`, etc.)
3. ❌ Skip Vue plugin loading
4. ❌ Skip client bundle build
5. ✅ Build SSR/server bundle → `dist/server/` (contains the Hono app + API routes)

Artifact structure:
```
dist/
└── server/
    ├── entry.mjs
    ├── server.mjs          # Node entry
    └── package.json
```

Dev behavior:
- Vite middleware mode, but Vue plugins are not loaded
- `app.fetch()` directly handles API requests; no page rendering

Preview behavior:
- Starts the Node server (same as `fullstack`)

## 5. Implementation Strategy

### 5.1 Phased Implementation

| Phase | Content | Risk | Value |
|---|---|---|---|
| Phase 1 | Config types + defaults + CLI args | Low | Infrastructure |
| Phase 2 | `spa` mode | Low | High (most common) |
| Phase 3 | `ssg` mode | Medium (needs temporary artifact cleanup) | High (marketing site scenario) |
| Phase 4 | `backend` mode | Medium (conditional Vue plugin loading) | Medium |
| Phase 5 | `fullstack` + `ssr: false` | Low (reuses prior conditional branches) | Medium (no-SEO full-stack scenario) |
| Phase 6 | Examples + docs | Low | Completeness |

### 5.2 Backward Compatibility Guarantees

- `mode` defaults to `fullstack` and `ssr` defaults to `true`; existing projects need no changes.
- The build flow for `mode: 'fullstack'` + `ssr: true` (default) is **completely identical** to the current one (uses strict equality checks; control flow is unchanged).
- The existing `prerender.enabled` config behaves unchanged under `fullstack` + `ssr: true`.
- The existing `frontend-only` example can be smoothly migrated to `mode: 'spa'` (but the old config still works).
- The legacy `mode: 'ssr'` config will be rejected (type error) — this is an **intentional breaking change** because the `ssr` mode was previously identical to `fullstack` and was never actually released.

### 5.3 Test Strategy

- At least one example project per mode
- `pnpm typecheck` passes fully
- `pnpm -r build` passes fully
- Verify that each mode's artifact structure matches expectations
- Verify that `fullstack` + `ssr: true` (default) behavior is completely identical to before the change (regression test)
- Verify that `fullstack` + `ssr: false` skips the SSR bundle while API routes still respond normally

## 6. Key Decision Records

### 6.1 Why `mode` instead of `type`?

`type` is a reserved word in the TypeScript ecosystem, and `package.json` already has a `"type": "module"` field, which would cause confusion. `mode` has clear semantics and does not conflict with Vite's `mode` concept (ubean's `mode` is architectural; Vite's `mode` is environment-variable level).

### 6.2 Why does `ssg` mode still need SSR at build time?

The essence of SSG is "execute SSR at build time to generate static HTML". Without building an SSR bundle, prerendering is impossible. Therefore, the `ssg` build flow includes an SSR bundle, but the temporary server artifacts are **cleaned up** after the build, leaving only static files as output.

### 6.3 Why not auto install/uninstall dependencies?

Auto-installing dependencies introduces side effects (npm registry calls, lockfile changes), and behavior differs across package managers (pnpm/yarn/npm). ubean keeps a "declare in config + user installs manually" model, consistent with Nuxt/Next.

### 6.4 Why does `backend` mode still keep `ubeanPlugin`?

`ubeanPlugin` ([packages/build/src/vite.ts](../packages/build/src/vite.ts)) handles route scanning and core virtual module generation, which are still needed in `backend` mode (API route scanning). Only the Vue-specific plugins (`ubeanVuePlugin`, `ubeanIslandsPlugin`) are skipped on demand.

### 6.5 Why remove the `ssr` mode in favor of `fullstack` + `ssr: false`?

The original proposal kept `ssr` as a semantic alias for `fullstack`, but this caused several problems:

1. **Cognitive load**: Faced with 5 modes, users would be confused about the difference between `ssr` and `fullstack`, and docs would need to repeatedly explain they are "equivalent".
2. **Poor extensibility**: If "fullstack but skip SSR" needed to be supported later, a new mode or extra option would be required, bloating the mode matrix.
3. **Broken orthogonality**: `mode` should describe the "application shape" (frontend/backend/full-stack/static), while SSR on/off is a "build option" and should not be mixed into the mode dimension.

Changing to an `ssr: boolean` option:
- `mode` retains 4 pure shapes (full-stack/frontend/static/backend)
- SSR is a sub-option of `fullstack` mode, with clear semantics
- Users can toggle SSR independently without changing the mode
- The type system can precisely express "the `ssr` field only takes effect under `fullstack`" and silently ignores it under other modes

### 6.6 Why does `fullstack` + `ssr: false` still generate a server bundle?

`ssr: false` only skips the SSR bundle (the Vue renderer); it does not skip the server bundle (the Hono app). Because full-stack apps typically include API routes alongside, and API routes need the server bundle to respond. If the user needs neither SSR nor API, they should use `spa` mode.

## 7. References

- [packages/config/src/types.ts](../packages/config/src/types.ts) — config type definitions
- [packages/config/src/loader.ts](../packages/config/src/loader.ts) — config loading and defaults
- [packages/build/src/production.ts](../packages/build/src/production.ts) — build pipeline
- [packages/build/src/virtual-modules.ts](../packages/build/src/virtual-modules.ts) — virtual module generation
- [packages/cli/src/build.ts](../packages/cli/src/build.ts) — CLI build command
- [packages/cli/src/preview.ts](../packages/cli/src/preview.ts) — CLI preview command
- [packages/dev-server/src/vite-server.ts](../packages/dev-server/src/vite-server.ts) — dev server
- [packages/modules/src/index.ts](../packages/modules/src/index.ts) — module system (dynamic import)
- [examples/frontend-only/ubean.config.ts](../examples/frontend-only/ubean.config.ts) — existing frontend example

## Next Steps

- [Routing](/architecture/routing) — file-based routing and route rules
- [Ecosystem](/architecture/ecosystem) — official extensions and capability roadmap
- [Quickstart](/guide/quickstart) — get a project running in minutes
- [Runtime & Dev Experience](/architecture/runtime) — dev server, presets, and middleware
