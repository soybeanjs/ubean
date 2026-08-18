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
import { getLogger } from '@ubean/logger';

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

### 6.4 Current Verification Baseline (2026-08-03)

- Main package (`ubean`): 38 test files, **799 tests passing** (81 DevTools tests moved to the standalone `@ubean/devtools` package).
- Core subpackages: `@ubean/islands` 199 (directive / paired-components / server-client-components / islands-registry / server-component-rerender), `@ubean/ssr` 18, `@ubean/actions` 69, `@ubean/routes` route-rules 27, `@ubean/devtools` 81, examples/ubean-test prerender 92.
- Extension packages: `@ubean/icon` 32, `@ubean/auth` 13, `@ubean/integrations/pwa` 19, `@ubean/image` 42, `@ubean/content` 18, `@ubean/integrations/fonts` 21, `@ubean/seo` 114.
- **~1075 tests passing** across the whole repo.
- `pnpm typecheck`: passes. The TypeScript 7 and `vue-tsc` compatibility layer is provided via the workspace override `typescript: npm:typescript-native-bridge@0.0.0`; its native dependency `koffi` must be explicitly allowed in the `allowBuilds` list of `pnpm-workspace.yaml`.
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
      'ubean/meta': resolve(__dirname, 'src/meta.ts')
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

### 8.1 package.json exports

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./handler": {
      "types": "./dist/runtime/handler.d.mts",
      "import": "./dist/runtime/handler.mjs"
    },
    "./openapi": {
      "types": "./dist/runtime/openapi.d.mts",
      "import": "./dist/runtime/internal/routes/openapi.mjs"
    },
    "./client": {
      "types": "./dist/runtime/client.d.mts",
      "import": "./dist/runtime/client.mjs",
      "browser": {
        "import": "./dist/runtime/client-browser.mjs"
      }
    },
    "./client-xhr": {
      "types": "./dist/runtime/client-xhr.d.mts",
      "browser": {
        "import": "./dist/runtime/client-xhr.mjs"
      }
    },
    "./internal": {
      "types": "./dist/runtime/internal-fetch.d.mts",
      "import": "./dist/runtime/internal-fetch.mjs"
    },
    "./cron": {
      "types": "./dist/runtime/cron.d.mts",
      "import": "./dist/runtime/cron.mjs"
    },
    "./response": {
      "types": "./dist/runtime/response.d.mts",
      "import": "./dist/runtime/response.mjs"
    },
    "./env": {
      "types": "./dist/runtime/env-public.d.mts",
      "import": "./dist/runtime/env-public.mjs",
      "browser": {
        "import": "./dist/runtime/env-public-client.mjs"
      }
    },
    "./_env": {
      "types": "./dist/runtime/env.d.mts",
      "import": "./dist/runtime/env.mjs"
    },
    "./pages": {
      "types": "./dist/pages/index.d.mts",
      "import": "./dist/pages/index.mjs"
    },
    "./devtools": {
      "types": "./dist/devtools/runtime.d.mts",
      "import": "./dist/devtools/runtime.mjs"
    },
    "./pages-protocol": {
      "types": "./dist/pages/protocol.d.mts",
      "import": "./dist/pages/protocol.mjs"
    },
    "./pages-head": {
      "types": "./dist/pages/head.d.mts",
      "import": "./dist/pages/head.mjs"
    },
    "./pages-client": {
      "types": "./dist/pages/client.d.mts",
      "import": "./dist/pages/client.mjs"
    },
    "./vue": {
      "types": "./dist/vue/client.d.mts",
      "import": "./dist/vue/client.mjs"
    },
    "./vue/app": {
      "types": "./dist/vue/app.d.mts",
      "import": "./dist/vue/app.mjs"
    },
    "./vue/plugin": {
      "types": "./dist/vue/plugin.d.mts",
      "import": "./dist/vue/plugin.mjs"
    },
    "./vue/runtime": {
      "types": "./dist/runtime/vue.d.mts",
      "import": "./dist/runtime/vue.mjs"
    },
    "./database": {
      "types": "./dist/runtime/database.d.mts",
      "import": "./dist/runtime/database.mjs"
    },
    "./storage": {
      "types": "./dist/runtime/storage.d.mts",
      "import": "./dist/runtime/storage.mjs"
    },
    "./kv": {
      "types": "./dist/runtime/kv.d.mts",
      "import": "./dist/runtime/kv.mjs"
    },
    "./cache": {
      "types": "./dist/runtime/cache.d.mts",
      "import": "./dist/runtime/cache.mjs"
    },
    "./sse": {
      "types": "./dist/runtime/sse.d.mts",
      "import": "./dist/runtime/sse.mjs"
    },
    "./ws": {
      "types": "./dist/runtime/websocket.d.mts",
      "import": "./dist/runtime/websocket.mjs"
    },
    "./task": {
      "types": "./dist/runtime/task.d.mts",
      "import": "./dist/runtime/task.mjs"
    },
    "./config": {
      "types": "./dist/runtime/config.d.mts",
      "import": "./dist/runtime/config.mjs"
    },
    "./vite": {
      "types": "./dist/core/build/vite/plugin.d.mts",
      "import": "./dist/core/build/vite/plugin.mjs"
    },
    "./builder": "./dist/builder.mjs",
    "./types": "./dist/types/index.mjs",
    "./routes": {
      "types": "./dist/routes-stub.d.mts"
    }
  },
  "bin": {
    "ubean": "./dist/cli/index.mjs"
  }
}
```

---

### 8.2 Release Scope and Platform Capability Contract

To avoid a mismatch between "declared support" and actual runtime semantics, version support is split into three tiers: **officially supported**, **experimental**, and **community/on-demand**. Only presets that pass the corresponding deployment smoke test can enter the officially supported list.

| Version | Officially supported            | Experimental                              | Not in commitment scope                                  |
| ------- | ------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| v0.1    | Node.js (`node-server`)         | Cloudflare Workers (after separate review) | Bun, Deno, Vercel, Netlify, and other platforms          |
| v0.2+   | Decided by the capability matrix and CI results | New presets ship experimentally first    | Platforms that have not passed matrix acceptance         |

Each preset must explicitly declare `capabilities`, such as `fs`, `cronTrigger`, `longLivedProcess`, `websocket`, `queue`, `isr`, and `nodeCompat`. The builder performs pre-checks based on enabled features and preset capabilities:

- When a capability is missing, the build surfaces the feature, config location, target preset, and an alternative at build time — no silent degradation.
- Cron is only enabled when the platform provides a trigger or a long-lived process capability; serverless presets do not provide a "built-in resident scheduler".
- ISR, WebSocket, Queue, file storage, and similar features must declare their consistent semantics, limitations, and test environments in each preset; when consistent semantics cannot be guaranteed, they should be a preset extension rather than a core capability.

### 8.3 Client and Public API Boundary

The core HTTP client is built on the standard Fetch API to ensure consistent behavior across browser, Node, Deno, and edge runtimes. `createClient` and `internalFetch` share a middleware model for requests, responses, errors, and retries; `internalFetch` dispatches directly to the framework handler and does not depend on the network or an axios adapter.

- `axios`/`axios-retry` are only optional browser or Node adapter packages and must not enter the edge server bundle.
- OpenAPI types are used only for compile-time parameter and response inference; no OpenAPI document is loaded at runtime.
- `exports` is split into stable public entries, `./experimental/*` entries, and private implementations; `./internal` and `./_env` are not stable user APIs.
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

---

## Next Steps

- [Runtime & Dev Experience](/architecture/runtime) — dev server, presets, and CLI command system
- [Routing](/architecture/routing) — file-based routing and route rules
- [Quickstart](/guide/quickstart) — get a project running in minutes
- [ubean API Reference](/reference/api/ubean) — core runtime exports
