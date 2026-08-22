---
title: Routing Modes
description: Route generation modes — virtual, file, and both — and when to use each.
---

# Route Generation Modes

ubean supports three route data generation modes, aligned with the design philosophy of [elegant-router](https://github.com/elegant-router/vue-router-elegant): you can switch freely between "virtual modules" and "physical files".

## Mode Overview

| Mode | File output | Virtual module | Use case | IDE navigation |
|---|---|---|---|---|
| `virtual` (default) | None | ✅ Registered | Fast startup, zero config, no git pollution | Via virtual module mapping |
| `file` | ✅ Generated | ❌ Not registered | Manual `meta` edits, direct IDE jumps, PR review of generated files | Direct jump to `src/router/_generated/routes.ts` |
| `both` | ✅ Generated | ✅ Registered | Debugging (compare virtual/physical data side by side) | Both |

## Configuration

Configure via the `routing` field in `ubean.config.ts`:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routing: {
    mode: 'file', // 'virtual' | 'file' | 'both' (default 'virtual')
    outputDir: 'src/router/_generated', // Physical file output directory (relative to rootDir; produces routes.ts / imports.ts)
    defaultLayout: 'default', // Default layout name (default 'default'; set to false to disable)
    routeLazy: true, // Lazy-load route components (default true)
    layoutLazy: true, // Lazy-load layout components (default true)
    watchFile: true, // Watch file changes in dev mode (default true)
    fileUpdateDuration: 100, // File-change debounce duration (default 100ms)
    onGenerated(files) {
      console.log('[ubean] Route files generated:', files);
    }
  }
});
```

> 📌 `typed-router.d.ts` is not written to `outputDir`; it is always generated to `.ubean/typed-router.d.ts` — the same directory as other pure-type declaration outputs (`auto-imports.d.ts`, `components.d.ts`), all of which are gitignored. It provides types via module augmentation (`declare module '@ubean/scan'`); as long as `tsconfig.json`'s `include` covers `.ubean/*`, the types take effect globally.

### Full Option Reference

See the `RoutingConfig` type in [`@ubean/config`](../../../../../../packages/config/src/types.ts).

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `'virtual' \| 'file' \| 'both'` | `'virtual'` | Route data generation mode |
| `outputDir` | `string` | `'src/router/_generated'` | Physical file output directory (relative to `rootDir`; produces `routes.ts`/`imports.ts`) |
| `generateBuiltinRoutes` | `boolean` | `true` | Generate built-in routes (404, root redirect) |
| `rootRedirect` | `string` | — | Root path redirect target (e.g. `/home`) |
| `notFoundRouteComponent` | `string` | `'404.vue'` | 404 page component path |
| `defaultLayout` | `string \| false` | `'default'` | Default layout name |
| `routeLazy` | `boolean` | `true` | Lazy-load route components |
| `layoutLazy` | `boolean` | `true` | Lazy-load layout components (parallel to `routeLazy`) |
| `getRouteName` | `(filePath) => string` | built-in | Custom route name generator |
| `getRoutePath` | `(filePath) => string` | built-in | Custom route path generator |
| `getRouteLayout` | `(filePath) => string \| false \| undefined` | built-in | Custom layout resolver |
| `getRouteMeta` | `(filePath, frontmatter) => Record` | built-in | Custom route meta resolver |
| `onGenerated` | `(files: string[]) => void` | — | Generation-complete callback (only `file`/`both`) |
| `watchFile` | `boolean` | `true` | Watch changes in dev (only `file`/`both`) |
| `fileUpdateDuration` | `number` | `100` | Debounce duration (ms) |

> **Page scanning source**: page-file scanning is based directly on `dir.pages` (supports `string | string[]` multi-directory), no longer via separate `pageInclude`/`pageExclude` glob filters. To exclude specific files, use `scanOptions.ignore` (applies to all scan types: pages/routes/layouts/middleware, etc.).

## Mode Details

### 1. `virtual` (default) — Virtual Module Mode

ubean scans `src/pages/` and `src/layouts/` at build/dev time and registers route data into virtual modules:

- `virtual:ubean-pages` — page route data
- `virtual:ubean-routes` — API route data
- `virtual:ubean-meta` — route metadata
- `virtual:ubean-app-config` — app config
- `virtual:ubean-locales` — locale data

**Pros**: zero-config startup, no git history pollution, all route data generated in memory.

**Cons**: cannot jump directly to route definitions in the IDE, and generated route `meta` cannot be edited manually.

```ts
// Default behavior, no config needed
export default defineConfig({});
```

### 2. `file` — Physical File Mode

After scanning, ubean writes route data to the following locations:

```
src/router/_generated/        # Physical route files (editable meta, incremental protection)
├── routes.ts                  # Flattened RouteRecord[] (name/path/component/layout/meta)
└── imports.ts                 # Lazy-loaded views and layouts records

.ubean/                        # Pure type declarations (gitignored, fully regenerated each time)
└── typed-router.d.ts          # Type definitions (RouteKey/RoutePath/RouteLayoutKey/ReuseRouteKey)
```

**Pros**:
- The IDE can jump directly to `routes.ts` to inspect route definitions
- Manual `meta` edits are supported — the generator updates incrementally and never overwrites user modifications
- The generated `.d.ts` provides strongly-typed route name/path autocompletion via module augmentation (`declare module '@ubean/scan'`), active globally

**Cons**:
- Decide whether to add `src/router/_generated/` to `.gitignore` (recommended to commit for PR review, or ignore to avoid polluting git history)
- Slightly slower first startup (writes files)

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    outputDir: 'src/router/_generated'
  }
});
```

#### Incremental Update Behavior

The generator follows these rules on each regeneration:

1. **`routes.ts`** (in `outputDir`): for each route record, preserves the user's existing `meta` field (never overwrites it), updating only auto-generated fields such as `name`/`path`/`component`/`layout`
2. **`imports.ts`** (in `outputDir`): fully regenerated (no user-editable content)
3. **`typed-router.d.ts`** (in `.ubean/`): fully regenerated (no user-editable content, gitignored)

When new page files are added, the generator appends new routes at the end of `routes.ts`, with default `meta` coming from the `definePage({ meta })` macro or frontmatter.

#### The `onGenerated` Callback

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    onGenerated(files) {
      // files: ['/abs/src/router/_generated/routes.ts', '.../imports.ts', '.../typed-router.d.ts']
      console.log(`[ubean] Generated ${files.length} route files`);
    }
  }
});
```

### 3. `both` — Hybrid Mode (Debugging)

Generates physical files and registers virtual modules at the same time. Suitable for:
- Transitioning from `virtual` to `file`
- Debugging route data inconsistencies (comparing virtual module vs physical file differences)

```ts
export default defineConfig({
  routing: {
    mode: 'both'
  }
});
```

## Frontend-Only Projects

For pure SPA projects that don't depend on a backend (SSR/API routes), you can use only the `@ubean/vite`, `@ubean/client`, `@ubean/scan`, and `@ubean/pages` subpackages without pulling in `@ubean/build`, `@ubean/app`, or `@ubean/server`.

```ts
// vite.config.ts (frontend-only)
import { defineConfig } from 'vite-plus';
import { ubeanVite } from '@ubean/build/vue';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default defineConfig({
  plugins: [...ubeanVite(), ubeanIslandsPlugin()]
});
```

In this case, the route generation mode defaults to `virtual` (handled internally by `@ubean/vite`). To switch to `file` mode, pass it through `ubeanVite` options:

```ts
ubeanVite({
  routing: { mode: 'file' }
});
```

## CLI Route Management Commands (Planned)

Aligned with elegant-router, ubean plans to provide the following commands in `@ubean/cli` (added after Phase 6):

| Command | Description |
|---|---|
| `ubean add-route <name>` | Create a page file and trigger generation |
| `ubean delete-route <name>` | Delete a page file and clean up generated files |
| `ubean recovery-route <name>` | Restore a deleted route from backup |
| `ubean update-route` | Force-regenerate all route files |
| `ubean add-reuse-route <name>` | Add a reuse route (`xxx.reuse.vue`) |
| `ubean backup` | Back up the current `src/router/_generated/` |

> As of Phase 5, the CLI already provides 6 scaffold commands — `ubean page`/`ubean api`/`ubean layout`/`ubean middleware`/`ubean cron`/`ubean plugin` — 100% aligned with the original ubean behavior. The 6 route-management commands above will be added after Phase 6 docs and examples land.

## Migration Guide

### From `virtual` to `file`

1. Add `routing: { mode: 'file' }` to `ubean.config.ts`
2. Run `pnpm dev` or `pnpm build` — the generator automatically produces `src/router/_generated/`
3. Add `src/router/_generated/` to `.gitignore` (optional — commit it if you want route changes reviewed in PRs)
4. To edit `meta` manually, edit the `meta` field of the corresponding record in `routes.ts`
5. When adding/removing pages later, the generator updates incrementally, preserving user modifications

### From `file` Back to `virtual`

1. Change `routing: { mode: 'virtual' }` in `ubean.config.ts` (or remove the `routing` field)
2. Delete the `src/router/_generated/` directory (optional — leftover files don't affect virtual mode)
3. Re-run `pnpm dev`

## Differences from elegant-router

| Dimension | ubean | elegant-router |
|---|---|---|
| Default mode | `virtual` | `file` |
| Virtual mode | ✅ Supported | ❌ Not supported |
| Physical file mode | ✅ Supported | ✅ Default |
| Hybrid mode | ✅ `both` | ❌ |
| Incremental meta protection | ✅ | ❌ (fully regenerated) |
| Framework-agnostic | ✅ (`@ubean/scan` doesn't depend on Vue) | ❌ (Vue-only) |
| Type generation | `typed-router.d.ts` | `typed-router.d.ts` |
| CLI route management | Planned | ✅ Built-in |

ubean's core advantage is **`virtual` mode as the zero-config default**, while also providing `file` mode for scenarios that need IDE navigation and manual `meta` editing. The two modes can be switched freely at different stages of the same project.
