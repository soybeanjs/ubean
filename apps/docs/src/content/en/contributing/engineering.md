---
title: Engineering
description: "Engineering standards for ubean: coding conventions, testing, and the release process."
---

# Engineering

## 5.1 Core Principles

1. **Pure functions first**: All utility functions must be pure functions — same input produces same output, with no side effects.
2. **Immutability**: Use `const`, `readonly`, `Object.freeze()`, and the spread operator rather than mutation.
3. **Function composition**: Use pipe/compose patterns to compose functions; avoid deep nesting.
4. **Higher-order functions**: Use higher-order functions to abstract common patterns.
5. **Type safety**: Strict TypeScript; avoid `any`; make full use of generics.
6. **No classes by default**: Prefer factory functions and closures over classes; only use classes in the runtime core when necessary (e.g. Router, DevServer).
7. **Pure core functions**: Route resolution, config merging, code generation, and type computation stay pure; the Hono app, Hookable, file system, network, and mutable context live behind explicit adapter/effect boundaries and have dependencies injected via parameters.

## 5.2 File Organization Conventions

```typescript
// 1. Type imports first
import type { Config, ResolvedConfig } from '../types';
import type { Preset } from '../preset/types';

// 2. External dependencies
import { resolve, join } from 'pathe';
import { defu } from 'defu';
import { getLogger } from '@ubean/shared/logger';

// 3. Internal dependencies
import { readConfig } from './loader';
import { resolvePaths } from './resolvers/paths';

// 4. Constant definitions (pure data)
const DEFAULT_CONFIG = {
  srcDir: './',
  output: {
    dir: './.output'
  }
} as const;

// 5. Pure utility functions (no external state dependencies)
// - Naming: verb prefix, lowerCamelCase
// - Must have JSDoc describing purpose, params, and return value
// - Must have type annotations
/**
 * Merge user config with default config
 * @param userConfig - user config
 * @param defaults - default config
 * @returns merged config
 */
function mergeConfig<T extends Record<string, unknown>>(userConfig: Partial<T>, defaults: T): T {
  return defu(userConfig, defaults) as T;
}

// 6. Primary exported functions
// - Naming: prefer named exports
// - Split complex functions into small pure functions internally
/**
 * Load and parse the ubean config
 * @param rootDir - project root directory
 * @param opts - load options
 * @returns resolved config
 */
export async function loadOptions(rootDir: string, opts: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const rawConfig = await readConfig(rootDir, opts);
  const preset = await resolvePreset(rawConfig.preset, { dev: opts.dev });
  const withDefaults = mergeConfig(rawConfig, DEFAULT_CONFIG);

  return resolvePaths(withDefaults, rootDir);
}

// 7. Avoid: default exports, classes, let mutation, any types
```

## 5.3 Async Function Conventions

```typescript
// ✅ Good: return a Promise, use async/await
async function readJsonFile<T>(path: string): Promise<T> {
  const content = await fsp.readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

// ✅ Good: error handling returns a Result type or throws a specific error
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function tryReadJson<T>(path: string): Promise<Result<T>> {
  try {
    const value = await readJsonFile<T>(path);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}
```

## 5.4 Type Design Conventions

```typescript
// ✅ Use interface for object shapes, type for unions/utility types
export interface UbeanOptions {
  readonly rootDir: string;
  readonly preset: PresetName;
  readonly dev: boolean;
}

// ✅ Use literal types + as const
export const PRESET_NAMES = ['node-server', 'bun', 'deno', 'cloudflare', 'vercel'] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

// ✅ Use generics to preserve type safety
function createHandler<T extends EventHandler>(handler: T): T {
  return handler;
}

// ✅ Use conditional types for type inference
type InferLoaderData<T> = T extends () => Promise<{ data: infer D }> ? D : never;
```

---

## 6. Testing Strategy

### 6.1 Test Framework

- **vitest** (vite-plus integrated version)
- **@vitest/coverage-v8** (coverage)

### 6.2 Test Types

1. **Unit tests** (`test/unit/`)
   - Pure function tests: utility functions, config parsing, route matching
   - No file system or network dependencies
   - Fast execution; coverage target > 90%
2. **Integration tests** (`test/integration/`)
   - Build pipeline tests
   - Dev server tests
   - Preset adaptation tests
   - Use complete projects from `test/fixtures`
3. **Browser end-to-end tests** (`test/e2e/`)

- Use Playwright to verify SSR hydration, client navigation, form actions, and error pages
- Only run against officially supported presets; formal platform smoke tests remain the authoritative verification (simulators are supplementary)

1. **Type tests**
   - Use `expectTypeOf` to verify type inference
2. **Packaging and deployment smoke tests**

- After `pnpm pack`, install into a standalone fixture and verify public exports, CLI, and type declarations
- Run `dev`, `build`, `preview`, and target-platform deployment smoke tests for each official preset

### 6.3 Continuous Acceptance Gates

Testing is not a final wrap-up task. Every implementation phase must add or update the corresponding fixtures and meet the following gates before merge:

1. Unit tests cover the newly added pure computation, scanning, and code-generation logic.
2. At least one real fixture covers the `dev`, `build`, and `preview` paths of the new capability.
3. Public TypeScript APIs get positive and negative type tests; generated file changes must verify that incremental updates match cold-start results.
4. Changes to SSR, routing, or page protocols add browser end-to-end tests.
5. Changes to preset capabilities update the capability matrix and run a local or remote smoke test for that preset.
6. Changes to client transport cover ofetch default paths, XHR `FormData` upload progress, cancellation, timeouts, unknown total, HTTP/network error normalization, and SSR/edge unsupported diagnostics.

Coverage is used to find blind spots; it is not a release standard that replaces contract tests. Core runtime and public APIs are included by default; only generated code, platform-non-executable shims, and approved adapter branches may be excluded, with the reason documented next to the config.

### 6.4 Current Verification Baseline (2026-09-10)

- Main package (`ubean`) has no test suite of its own — tests live in the subpackages they verify.
- Core subpackages: `@ubean/server` 382, `@ubean/builder` 234, `@ubean/islands` 205 (directive / paired-components / server-client-components / islands-registry / server-component-rerender), `@ubean/vue` 202, `@ubean/routes` 152 (includes Server Actions), `@ubean/client` 130, `@ubean/cli` 96, `@ubean/config` 95, `@ubean/devtools` 41, `@ubean/preset` 88.
- Extension packages: `@ubean/icon` 32, `@ubean/auth` 15, `@ubean/image` 45, `@ubean/content` 93 (incl. 30 full-text search tests), `@ubean/integrations` 39 (pwa / fonts), `@ubean/seo` 116, `@ubean/markdown` 21, `@ubean/i18n` 22, `@ubean/pages` 63, `@ubean/scan` 13, `@ubean/shared` 54, `@ubean/ai` 15, `@ubean/app` 69.
- Examples: `ubean-test` 783 (incl. prerender fixtures), `client-only-spa` 30.
- **3035 tests passing** across the whole repo.
- `pnpm typecheck`: passes. The compiler version is pinned by the workspace override `typescript: '6.0.3'` in `pnpm-workspace.yaml`, so every workspace package resolves the same TypeScript.
- `pnpm build`: passes (main package + all 8 extension packages, including `@ubean/devtools` and `@ubean/islands`).
- Tasks marked ✅ on the roadmap must have corresponding source code, a public call path, and verification proportionate to the risk; command skeletons, regex extractions, or unconnected runtime paths must not be marked as fully delivered.

### 6.5 Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'pathe';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/__generated__/**']
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      ubean: resolve(__dirname, 'src/index.ts'),
      'ubean/server': resolve(__dirname, 'src/server.ts')
    }
  }
});
```

### 6.6 Test Example

```typescript
// test/unit/routing.test.ts
import { describe, it, expect } from 'vitest';
import { parseRoutePattern, matchRoute } from '../../src/utils/route';

describe('route utils', () => {
  describe('parseRoutePattern', () => {
    it('should parse static routes', () => {
      const result = parseRoutePattern('/users');
      expect(result).toEqual({
        pattern: '/users',
        params: [],
        wildcard: false
      });
    });

    it('should parse dynamic params', () => {
      const result = parseRoutePattern('/users/:id');
      expect(result.params).toEqual(['id']);
    });

    it('should parse catch-all routes', () => {
      const result = parseRoutePattern('/blog/**');
      expect(result.wildcard).toBe(true);
    });
  });

  describe('matchRoute', () => {
    it('should match static routes', () => {
      const match = matchRoute('/users', '/users');
      expect(match).not.toBeNull();
      expect(match?.params).toEqual({});
    });

    it('should extract dynamic params', () => {
      const match = matchRoute('/users/:id', '/users/123');
      expect(match?.params).toEqual({ id: '123' });
    });
  });
});
```

---

## 7. CLI Command Design

The CLI command list and framework implementation are detailed in [Runtime & Developer Experience §4.13](/architecture/runtime#413-cli-command-system).

---

## 8. Export Design

### 8.1 Aggregator subpath contract (`packages/ubean/package.json`)

The published `ubean` package is an aggregator: the main entry re-exports all `@ubean/*` subpackages, and each subpath carves out one capability domain with an explicit environment boundary. The real `exports` map (built output is `.d.ts` + `.js`):

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./vite": { "types": "./dist/vite.d.ts", "import": "./dist/vite.js" },
    "./client": { "types": "./dist/client.d.ts", "import": "./dist/client.js" },
    "./ssr": { "types": "./dist/ssr.d.ts", "import": "./dist/ssr.js" },
    "./server": { "types": "./dist/server.d.ts", "import": "./dist/server.js" },
    "./build": { "types": "./dist/build.d.ts", "import": "./dist/build.js" },
    "./i18n": { "types": "./dist/i18n.d.ts", "import": "./dist/i18n.js" },
    "./scaffold": { "types": "./dist/scaffold.d.ts", "import": "./dist/scaffold.js" }
  },
  "bin": {
    "ubean": "./bin/ubean.mjs"
  }
}
```

There are no `./handler`, `./openapi`, `./client-xhr`, `./internal`, `./cron`, `./response`, `./env`, `./_env`, `./pages*`, `./devtools`, `./vue*`, `./database`, `./storage`, `./kv`, `./cache`, `./sse`, `./ws`, `./task`, `./config`, `./builder`, `./types`, or `./routes` subpaths — those capabilities live in the `@ubean/*` subpackages.

| Subpath | Aggregates | Capability boundary | Typical consumer |
| --- | --- | --- | --- |
| `ubean` | `@ubean/shared` / `seo` / `pages` / `markdown` + islands runtime + logger + inline `defineConfig` | **Isomorphic**: browser-safe by contract — no `node:*`, no filesystem scanning, no Hono server runtime | isomorphic code; base for client auto-imports |
| `ubean/server` | `@ubean/app` + `@ubean/routes` + `@ubean/server` + `@ubean/shared/node` + `hono-openapi` + `logger/hono` | **Server-only**: Hono app factory (`createUbeanApp`), `defineHandler`/`defineAction`, ISR/route-rules/OpenAPI, cache/db/queue/cron/ws/sse, `validator`/`describeRoute`; contains Hono and `node:*` | API routes, `src/middleware/`, `src/server.ts` |
| `ubean/build` | `@ubean/build/prerender` + `@ubean/preset` + `@ubean/config` + `@ubean/build/codegen` + `@ubean/scan` + plugin entries | **Build-time**: SSG prerender, presets (`definePreset`/`detectPreset`), config loading, codegen presets, scanner; contains `node:*` and oxc WASM | build scripts, `vite.config.ts`, CI |
| `ubean/client` | `@ubean/client` + `@ubean/routes/runtime` + islands registry bridge | **Framework client**: `createUbeanClientApp`, router/head/i18n runtime, `callAction`/`useAction`/`useFormAction`/`invokeServerFn`, `createServerHead`, `hydrateIslands` | virtual modules, client entry |
| `ubean/i18n` | `@ubean/i18n` + `@ubean/i18n/routing` | **Server i18n**: ALS `t()`/`d()`/`n()`, locale path compilation, detection middleware; contains `node:async_hooks` | build-time i18n, Hono middleware |
| `ubean/ssr` | `@ubean/client/ssr` | **SSR renderer**: `createVueRenderer` | custom SSR entries |
| `ubean/vite` | `@ubean/build` (core + vue) + `@ubean/islands` + server actions plugin | **Vite plugin composition**: single `ubeanPlugin()` entry | `vite.config.ts` |
| `ubean/scaffold` | `@ubean/cli` scaffold layer | **Scaffolding**: `scaffold`/`deleteScaffold`/`recoverScaffold`/`listScaffoldableFiles` + machine-readable manifest (`getScaffoldManifest`) | studio / IDE plugins |

Rules enforced by this contract:

- Browser code imports from the isomorphic main entry or `ubean/client`; anything touching Hono / `node:*` must come from `ubean/server`, `ubean/build`, or `ubean/i18n`.
- `bin` points at `./bin/ubean.mjs`, a forwarding launcher that imports `@ubean/cli/cli` (the CLI implementation lives in `@ubean/cli`).
- Adding or removing a subpath requires updating this contract and the docs pages that reference it.

---

### 8.2 Release Scope and Platform Capability Contract

To avoid a mismatch between "declared support" and actual runtime semantics, version support is split into three tiers: **officially supported**, **experimental**, and **community/on-demand**. Only presets that pass the corresponding deployment smoke test can enter the officially supported list.

| Version | Officially supported            | Experimental                              | Not in commitment scope                                  |
| ------- | ------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| v0.1    | Node.js (`node-server`)         | Cloudflare Workers (after separate review) | Bun, Deno, Vercel, Netlify, and other platforms          |
| v0.2+   | Decided by the capability matrix and CI results | New presets ship experimentally first    | Platforms that have not passed matrix acceptance         |

Each preset must explicitly declare its `capabilities` (the 19 real capability keys — `staticServe`, `websocket`, `sse`, `cronTriggers`, `queues`, `kv`, `storage`, `database`, `envVars`, `secrets`, `nodeCompat`, `streaming`, `compression`, `https`, `http2`, `middleware`, `bodyLimit`, `multipart`, `rpc`). The builder performs pre-checks based on enabled features and preset capabilities:

- When a capability is missing, the build surfaces the feature, config location, target preset, and an alternative at build time — no silent degradation.
- Cron is only enabled when the platform provides a trigger or a long-lived process capability; serverless presets do not provide a "built-in resident scheduler".
- ISR, WebSocket, Queue, file storage, and similar features must declare their consistent semantics, limitations, and test environments in each preset; when consistent semantics cannot be guaranteed, they should be a preset extension rather than a core capability.

### 8.3 Client and Public API Boundary

ubean does **not** ship its own browser HTTP client. Direct HTTP calls use the standard `fetch` or the injected [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch) client (`createRequest` / `toFlatRequest`, plus `createTypedClient` / `toFlatTypedClient` from `@soybeanjs/fetch/openapi`); the data layer (`useData` / `useFetch`) is injected via `setDefaultFetch`. `internalFetch` is an in-process dispatcher to framework handlers (no network hop), not a fetch-middleware stack.

- Server-side framework code (API routes, loaders) must never rely on a bundled HTTP client — use `fetch` / `internalFetch` / the injected `@soybeanjs/fetch` instance.
- OpenAPI types are used only for compile-time parameter and response inference; no OpenAPI document is loaded at runtime.
- The published `exports` map is the aggregator subpath contract in §8.1 — there are no `./experimental/*`, `./internal` or `./_env` entries; those are historical single-package leftovers.
- Before each release, `pnpm pack` is installed into a standalone fixture to verify all public entries, conditional exports, and type declarations.

---

## 9. Implementation Conventions and Reference Resources

### 9.1 UI Component Conventions (DevTools)

The DevTools panel UI must be built with the `@soybeanjs/ui` component library and follow these conventions:

1. **Component library choice**: Prefer the pre-styled `S*` components from `@soybeanjs/ui` (such as `SButton`, `SCard`, `STabs`, `STable`, `SInput`, `SModal`, etc.)
2. **Style import**: Import the styles at the entry point when used:
   ```typescript
   import '@soybeanjs/ui/styles.css';
   ```
3. **Auto-import config**: Configure auto-import via `unplugin-vue-components` with `UiResolver`:

   ```typescript
   import Components from 'unplugin-vue-components/vite';
   import { UiResolver } from '@soybeanjs/ui/resolver';

   Components({
     resolvers: [UiResolver()]
   });
   ```

4. **Theme config**: Use `SConfigProvider` for global theme, size, and language configuration.
5. **Reference docs**:
   - Local Skill: `~/.agents/skills/soybean-ui/`
   - Online docs: `https://ui.soybeanjs.cn/`
   - Component reference: `https://ui.soybeanjs.cn/llms.txt`

### 9.2 Platform Adaptation References

The adaptation implementation for each platform (preset) must first reference the following open-source projects:

1. **Nitro** (`/Users/soybean/Web/Projects/OpenSource/nitro`)
   - Reference Nitro's preset architecture design
   - Reference Nitro's platform capability detection and degradation strategies
   - Reference Nitro's build output structure and runtime adaptation
   - Focus on: preset definitions, rollup config, runtime entry, platform-specific hooks

2. **Hono Vite Plugins** (`https://github.com/honojs/vite-plugins`)
   - Reference the official Hono Vite plugin implementation
   - Reference dev server integration patterns
   - Reference HMR and hot-reload strategies
   - Focus on: vite-plugin development, dev-mode middleware, client injection

3. **Reference principles**:
   - Study the architecture design and implementation patterns and adapt them to ubean's API
   - Keep ubean's API design consistent
   - All adapter layers must have corresponding test cases
   - Platform-specific capabilities must be declared via the capability matrix

### 9.3 Dependency Installation Conventions

- Use `pnpm` as the package manager, following workspace catalog version management
- UI-related dependencies (@soybeanjs/ui, etc.) are only introduced when needed; users are not forced to install them
- DevTools-related dependencies are devDependencies or loaded dynamically on demand

## 10. CodeGraph Workflow Convention

> Before changing a core symbol, check its blast radius with CodeGraph instead of guessing from intuition or doc wording. Source: [ADR-0005](../../../../../../docs/adr/0005-opt09-impl-opt11-timing-opt01-subitem.md).

### 10.1 When to run

When modifying any of the following core symbols, the PR description must include the `codegraph impact` result (brief blast radius):

- `defineHandler` / `defineHandlerMeta` / `defineMiddleware` (route/API handler protocol)
- `scanProject` (route scanning)
- `registerRoutes` (route registration)
- `ubeanPlugin` (Vite plugin main entry)
- `macros` (`definePage` and other compile-time macros)
- `createUbeanApp` / `createUbeanClientApp` (app factories)
- `resolveModules` (module system)

### 10.2 Steps

```bash
codegraph sync                    # sync the index
codegraph impact <symbol>         # inspect the blast radius
```

Paste the "direct / transitive references" counts and the key file list into the PR description.

### 10.3 Relationship to PRs

- **Convention first**: this text lands independently of any code PR.
- **First sample**: the `createUbeanApp` → `createUbeanClientApp` rename PR (OPT-01) was the first PR to follow this convention, attaching `codegraph impact createUbeanApp`.
- Do not stuff `codegraph impact` output into this convention's own non-code PR — "setting the rule" and "first use" stay separate.

## 11. Extension Package Contract Table

> Every "extension package" (a package with a `./vite` subpath export **and not in the main `ubean` package's `dependencies`**) must register a row below. CI (`scripts/verify-packages.mjs`, shared with the package-tree check) derives the extension set from `packages/*/package.json` and asserts each one appears in this table. Source: [ADR-0006](../../../../../../docs/adr/0006-opt07-contract-table-opt08-test-priority.md).
>
> **Note**: `pwa` / `fonts` / `electron` / `pinia` / `ui` are subpaths of `@ubean/integrations` (`@ubean/integrations/pwa` etc.). Their Vite plugins are exported from the subpath main entry; runtime helper functions (e.g. `serializePiniaState` / `hydratePiniaState`) are exported from the `@ubean/integrations` main entry.

### 11.1 Contract table

| Package | config key | `/vite` plugin | runtime entry | peerDeps | Core dep shape | Default behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `@ubean/ai` | `ai` | `ubeanAiPlugin` | `./runtime/vue` (`useChat`/`useAgent`/`useAIProvider`) | **ai, @ai-sdk/openai-compatible (optional)**, hono, vite, vue | **optional-peer** (`ai`/`@ai-sdk/openai-compatible` in `peerDependencies`, optional) | Thin Vercel AI SDK wrapper; `defineAgent`/`defineAgentTool` + provider presets; client auto-imports `useChat`/`useAgent`/`useAIProvider` |
| `@ubean/auth` | `auth` | `ubeanAuthPlugin` | `./runtime` (`useAuth`) | hono, vite, vue (all optional) | **hard** (`better-auth` in `dependencies`) | Mounts `/api/auth/*`; better-auth first, falls back to built-in email/password |
| `@ubean/icon` | `icon` | `ubeanIconPlugin` | `./runtime` | vue (optional) | none (only defu/pathe) | Iconify `customCollections`; dev `/_iconify` route serves local SVG before API fallback |
| `@ubean/integrations/pwa` | `pwa` | `ubeanPwaPlugin` (subpath main) | `@ubean/integrations` (`usePwa`) | vite, vue (both optional) | **hard** (`vite-plugin-pwa` in `dependencies`) | Generates manifest+sw; `registerType: autoUpdate`; 5 cache strategies |
| `@ubean/image` | `image` | `ubeanImagePlugin` | `./runtime` | vite, vue (both optional) | none (only defu/ohash/pathe/ufo) | Image optimization & transforms |
| `@ubean/content` | `content` | `ubeanContentPlugin` | `./runtime` + `./vue` (`useContentSearch`) | vite, vue (both optional) | none (only defu/pathe/scule + `@ubean/shared`) | markdown/MDX/YAML/JSON content collections; heading-level search sections, `__search.json` + optional Pagefind index in SSG |
| `@ubean/integrations/fonts` | `fonts` | `ubeanFontsPlugin` (subpath main) | `@ubean/integrations` | vite (optional) | none (only defu/ohash/pathe/ufo) | Google Fonts / local fonts / self-hosting / metrics |
| `@ubean/integrations/electron` | `electron` | `ubeanElectronPlugin` (subpath main) | — | electron, vite (both optional) | **hard** (`vite-plugin-electron` in `dependencies`) | Wraps `vite-plugin-electron`; `electron: true` enables and auto-disables SSR |
| `@ubean/integrations/pinia` | `pinia` | `ubeanPiniaPlugin` (subpath main) | `@ubean/integrations` (`serializePiniaState`/`hydratePiniaState`) | **pinia (required)**, vue (optional) | **peer** (`pinia` in `peerDependencies`, not optional) | SSR state hydration + dev pre-bundling; does not auto-inject a Pinia instance |
| `@ubean/integrations/ui` | `ui` | `ubeanUiPlugin` (subpath main) | — | **@soybeanjs/ui (required)**, vite (optional) | **peer** (`@soybeanjs/ui` in `peerDependencies`, not optional) | `UiResolver` auto-imports + `styles.css` injection (`css: true` can disable) |

### 11.2 Core dependency shapes

- **hard**: core library in `dependencies`, installed automatically with the extension (auth, `@ubean/integrations/pwa`, `@ubean/integrations/electron`).
- **peer**: core library in `peerDependencies`, **not** optional — the user must install it (pinia/ui).
- **optional-peer**: in `peerDependencies` with `optional: true` (e.g. each package's vite/vue).
- **none**: no heavy core library, only utility deps (icon/image/content/fonts).

### 11.3 Known inconsistency

The `hard` / `peer` mix is a known inconsistency: auth, `@ubean/integrations/pwa`, and `@ubean/integrations/electron` install their core library automatically, while `@ubean/integrations/pinia` and `@ubean/integrations/ui` require the user to install theirs. New extension packages should pick one shape explicitly and register it here; a future cleanup is possible (see [ADR-0006](../../../../../../docs/adr/0006-opt07-contract-table-opt08-test-priority.md)).

### 11.4 New extension package checklist

A PR adding an extension package must also:

1. expose a `./vite` subpath in `package.json` (so CI derives it into the extension set);
2. add a row to table 11.1 (CI fails on a missing row);
3. mark the core dependency shape per 11.2.

## 12. Client JS budget

Claims of "lighter JS" need numbers. After a production build:

```bash
pnpm --filter ubean-test build
pnpm analyze   # or `ubean analyze`; reads dist/client/.vite/manifest.json
# committed baseline:
#   ubean analyze --out examples/ubean-test/benchmarks/bundle-baseline.json
```

By default this writes gzip totals to `.ubean/bundle-baseline.json` (`totalGzip` / `entryGzip` / per-chunk). The committed regression baseline is `examples/ubean-test/benchmarks/bundle-baseline.json` (`ubean analyze --out`). Snapshot (2026-08-22, ubean-test production client): **113.0 kB gzip** total / **6.6 kB** entry (`app-*.js`) / 30 JS chunks. Treat that file as the Islands-page regression baseline. `ubean analyze --write=false` prints without writing. CI runs `ubean analyze --check benchmarks/bundle-baseline.json` (default: 5% relative growth on total / entry gzip).

---

## Next Steps

- [Runtime & Dev Experience](/architecture/runtime) — dev server, presets, and CLI command system
- [Routing](/architecture/routing) — file-based routing and route rules
- [Quickstart](/guide/quickstart) — get a project running in minutes
- [ubean API Reference](/reference/api/ubean) — core runtime exports
