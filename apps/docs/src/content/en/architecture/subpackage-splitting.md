---
title: Subpackage Splitting
---

# Subpackage Splitting

> **Implementation Status: Complete (2026-07)**
>
> This document is the original design proposal. The following adjustments were made during actual implementation:
> - **`@ubean/core` intermediate package was not created** — `packages/core` was ultimately renamed directly to `packages/ubean`; the aggregator package name is `ubean` (not `@ubean/core`).
> - **Extension package directories dropped the `ubean-` prefix** — `packages/ubean-auth/` → `packages/auth/` (the package name remains `@ubean/auth`).
> - **Export formats unified to `.js`/`.d.ts`** — achieved via `fixedExtension: false` in `vite.config.ts` (not `.mjs`/`.d.mts`).
> - **Added 4 subpath exports** — `ubean/runtime/vue`, `ubean/runtime/app`, `ubean/runtime/i18n`, `ubean/vue-ssr`.
>
> For the current actual package architecture, see [AGENTS.md](../AGENTS.md) section 2.
>
> ---
>
> Goal: Split the implementation in `packages/ubean` into multiple subpackages with clear responsibilities, so that frontend projects can independently use subsets of capabilities (no SSR / no backend routes), while aligning with elegant-router's entity file route generation capability.

## 1. Design Principles

1. **Zero-breaking transition**: New subpackages are incubated independently under `packages/`; `packages/ubean` remains unchanged until `@ubean/core` is complete.
2. **Aggregator ultimately returns to `ubean`**: Once `@ubean/core` is implemented, `packages/ubean` is converted to re-export from `@ubean/core`; the CLI binary `ubean-next` is renamed to `ubean`; the external package name remains `ubean`.
3. **ubean focuses on the Vue ecosystem**: Subpackage names drop the `vue-` prefix (`@ubean/runtime`, `@ubean/vite`, `@ubean/ssr`), consistent with the existing `@ubean/auth` and `@ubean/icon` style.
4. **Dual-mode route generation**: Supports both virtual modules (existing) and generated entity files (aligned with elegant-router); users can switch via configuration.
5. **Natural dependency layering**: `routing` does not depend on Vue; `runtime/app` does not depend on Vue; Vue-specific code is concentrated in Layer 4.

## 2. Three-Phase Evolution Strategy

### Phase A: Subpackage Incubation (parallel existence)
- Create `packages/<subpkg>/` directories and migrate source code one by one
- `packages/ubean` remains unchanged and continues to be maintained
- Add `packages/core/`, published as `@ubean/core`, providing the `ubean-next` CLI

### Phase B: Aggregator Switch ⭐
- `@ubean/core` implementation is complete and passes full testing
- `packages/ubean` is converted to an aggregator:
  - Delete the original code under `src/` (already migrated to subpackages)
  - `src/index.ts` becomes a pure re-export: `export * from '@ubean/core';`
  - `bin/ubean.mjs` forwards to `@ubean/core`'s CLI
  - CLI binary name changes from `ubean-next` to `ubean`
  - `package.json` `dependencies` change to the respective `@ubean/*` subpackages
- External user perception: package name `ubean` unchanged, CLI command `ubean` unchanged, API surface 100% backward compatible
- `@ubean/core` can still serve as a more explicit entry point for advanced users

### Phase C: Legacy Code Retirement
- After `@ubean/core` 1.0 stabilizes, mark `@ubean/core` as the recommended entry point in `packages/ubean`
- At 2.0, consider merging `packages/ubean` and `packages/core` (optional)

```
阶段 A:                       阶段 B:                        阶段 C:
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ packages/ubean     │      │ packages/ubean     │      │ packages/ubean     │
│  (源码,不变)       │      │  (re-export core)  │      │  (re-export core)  │
├─────────────────────┤      ├─────────────────────┤      ├─────────────────────┤
│ packages/core      │      │ packages/core      │      │ packages/core      │
│  (@ubean/core)     │      │  (@ubean/core)     │      │  (推荐入口)        │
├─────────────────────┤      ├─────────────────────┤      ├─────────────────────┤
│ packages/<子包>    │      │ packages/<子包>    │      │ packages/<子包>    │
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
CLI: ubean + ubean-next       CLI: ubean (统一)            CLI: ubean
```

## 3. Repository Structure (Target)

```
packages/
├── ubean/                    # 对外包名(阶段 B 后变为 re-export)
│   ├── src/index.ts          # export * from '@ubean/core'
│   └── bin/ubean.mjs         # 转发到 @ubean/core CLI
│
├── core/                     # @ubean/core(聚合器)
│   ├── src/
│   │   ├── index.ts          # 纯 re-export
│   │   └── vite.ts           # 默认 Vite 插件组装
│   └── bin/ubean-next.mjs    # 阶段 A 用,阶段 B 后改名 ubean
│
├── types/                    # @ubean/types
├── utils/                    # @ubean/utils
├── routing/                  # @ubean/routing(含实体文件生成器)
├── api-routes/               # @ubean/api-routes
├── actions/                  # @ubean/actions(Server Actions / Form Actions)
├── server/                   # @ubean/server
├── app/                      # @ubean/app
├── i18n/                     # @ubean/i18n
├── env/                      # @ubean/env
├── error/                    # @ubean/error
├── seo/                      # @ubean/seo
├── pages/                    # @ubean/pages
├── runtime/                  # @ubean/runtime(Vue 客户端运行时)
├── islands/                  # @ubean/islands
├── ssr/                      # @ubean/ssr
├── vite/                     # @ubean/vite(Vue 专属 Vite 插件)
├── auto-imports/             # @ubean/auto-imports
├── markdown/                 # @ubean/markdown
├── prerender/                # @ubean/prerender
├── preset/                   # @ubean/preset
├── config/                   # @ubean/config
├── codegen/                  # @ubean/codegen
├── modules/                  # @ubean/modules
├── builder/                  # @ubean/build（目录名 builder，包名仍为 @ubean/build）
├── dev-server/               # @ubean/dev-server
├── cli/                      # @ubean/cli
│
├── ubean-auth/               # 已有
├── ubean-icon/               # 已有
├── ubean-pwa/                # 已有
├── ubean-image/              # 已有
├── ubean-content/            # 已有
├── ubean-fonts/              # 已有
└── devtools/                 # 已有
```

## 4. Subpackage Inventory and Responsibilities

### Layer 0 — Foundation Shared

#### `@ubean/types`
- **Responsibility**: Globally shared types — `UbeanEnv`, `RouteMeta`, `UbeanHandler`, `UbeanMiddleware`, `ComposedHandler`, `Input`, `UbeanVariables`, `UbeanBindings`, `PageHead` (sunk from the pages protocol)
- **Source**: `packages/ubean/src/types/handler.ts`
- **Dependencies**: `hono` (types)
- **Entry**: `@ubean/types`

#### `@ubean/utils`
- **Responsibility**: Pure utility functions — `filePathToRoute`, `stripRouteGroups`, `findAvailablePort`, `findUserViteConfig`
- **Source**: `packages/ubean/src/utils/path.ts`, `core/utils/port.ts`, `core/utils/vite-config.ts`
- **Dependencies**: `pathe`, `tinyglobby`, `node:net`
- **Entry**: `@ubean/utils`

### Layer 1 — Framework-Agnostic File-Based Routing

#### `@ubean/routing` ⭐
- **Responsibility**: File-based routing core, providing **dual-mode** generation capability (virtual module + entity files)
- **Source**:
  - `core/routing/scan.ts`, `core/routing/router.ts` (rou3), `core/routing/route-name.ts`, `core/routing/detect-exports.ts`, `core/routing/types.ts`, `core/routing/define-page.ts` (AST part)
  - **New** `generator/` directory (aligned with elegant-router)
- **Dependencies**: `rou3`, `tinyglobby`, `pathe`, `@ubean/utils`, `@ubean/types`, `@ubean/markdown` (optional peer), `ts-morph` (entity file mode)
- **Entries**:
  - `@ubean/routing` — scanner, matcher, AST extraction
  - `@ubean/routing/generator` — entity file generator
  - `@ubean/routing/types` — route types (for generated files to reference)

#### `@ubean/api-routes`
- **Responsibility**: Backend API route runtime — `defineHandler`, `defineHandlerMeta`, `defineMiddleware`, `registerRoutes`, `createRouteLoader`, route rule middleware, `internal-fetch`, built-in OpenAPI routes
- **Source**: `runtime/{handler,router,route-rules,internal-fetch,internal/openapi}.ts`
- **Dependencies**: `hono`, `hono-openapi`, `@ubean/types`, `@ubean/routing` (type-only)
- **Entry**: `@ubean/api-routes`

### Layer 2 — Server Runtime Primitives

#### `@ubean/server`
- **Responsibility**: Server runtime primitives — cache, database, queue, cron (+ scheduler), websocket, sse, storage, observability, static, cors, rate-limit
- **Source**: `runtime/{cache,database,queue,cron,cron-scheduler,websocket,sse,storage,observability,static,cors,rate-limit}.ts`
- **Dependencies**: `hono`, `unstorage`, `hookable`, `@ubean/types`
- **Entry**: `@ubean/server`
- **Optional split (later)**: `@ubean/cache`, `@ubean/database`, `@ubean/queue`, `@ubean/cron`, `@ubean/realtime`, `@ubean/storage`

#### `@ubean/app`
- **Responsibility**: Hono app factory + server config — `createUbeanApp`, `defineServer`, `createDefaultServerConfig`, `mergeServerConfigs`, `applyServerConfig`
- **Source**: `runtime/{app,define-server}.ts`
- **Dependencies**: `hono`, `hookable`, `@ubean/api-routes`, `@ubean/server`, `@ubean/routing` (type-only), `@ubean/config` (type-only)
- **Entry**: `@ubean/app`

### Layer 3 — Isomorphic Runtime (Frontend-Usable)

#### `@ubean/i18n`
- **Responsibility**: Zero-dependency i18n core — `defineLocale`, `t`, `setLocale`, `formatDate/Number/Currency/RelativeTime/List`, `addLocale`, `mergeLocale`, `detectLocale`, `detectBrowserLocale`
- **Source**: `runtime/{i18n,i18n-routing}.ts`
- **Entries**: `@ubean/i18n`, `@ubean/i18n/routing`

#### `@ubean/env`
- **Responsibility**: Type-safe environment variables — `defineEnv`, `setRuntimeEnv`, `useRuntimeEnv`
- **Source**: `runtime/env.ts`
- **Dependencies**: `@standard-schema/spec`
- **Entry**: `@ubean/env`

#### `@ubean/error`
- **Responsibility**: Error handling — `UbeanError`, `createError`, `isUbeanError`, `errorToResponse`
- **Source**: `runtime/error.ts`
- **Entry**: `@ubean/error`

#### `@ubean/seo`
- **Responsibility**: SEO utilities — `useSeoMeta`, `mergeMetadata`, `buildMetaTags`, `buildLinkTags`, `buildTitle`, `renderHeadTags`, `createRobotsResponse`, `createSitemapResponse`, `defineManifest`, `createManifestResponse`
- **Source**: `runtime/seo.ts`
- **Entry**: `@ubean/seo`

#### `@ubean/pages`
- **Responsibility**: Page data protocol + isomorphic data layer — `PageObject`, `PageRenderer`, `buildPageShell`, `buildClientOnlyShell`, `renderPage`, `pageJsonResponse`, `useData`, `invalidateData`, `invalidateAll`, `clearPageData`, `declareDependencies`, `withDependencies`, `createInternalFetch`, `createStreamResponse`, `createSseStream`, `defineDataKey`
- **Source**: `runtime/pages/`
- **Dependencies**: `@ubean/types` (type-only)
- **Entry**: `@ubean/pages`

### Layer 4 — Vue-Specific Modules

#### `@ubean/runtime`
- **Responsibility**: Vue client runtime — `createUbeanVueApp`, `createUbeanSSRApp`, `useRouter`, `useHead`, `usePage`, `Link`, `Head`, `PageView`, `defineApp`, `applyAppConfig`, `createUbeanRouter`, `resolveRoute`, `isActiveRoute`, composables, `useCacheViews`, `usePageTransition`, `useReloadSignal`, `useViewTransition`, `hydrateIslands`, `useI18n` (Vue integration), vue-router `RouteMeta` type extension
- **Source**: `runtime/vue/`
- **Dependencies**: `vue`, `vue-router`, `@unhead/vue`, `@ubean/pages`, `@ubean/i18n`, `@ubean/seo` (type-only)
- **Entries**: `@ubean/runtime`, `@ubean/runtime/app`, `@ubean/runtime/define-app`

#### `@ubean/islands`
- **Responsibility**: Islands architecture — Vite plugin (`v-client.*` / legacy `client:*` directive transformation), bootstrap script, client hydrate runtime, **component auto-registration** (scan `v-client.*` / `client:*` directives + parse `<script setup>` imports → generate `virtual:ubean-islands-registry` virtual module)
- **Source**: `core/islands/`, `runtime/vue/islands.ts`
- **Dependencies**: `vue` (SFC compilation), `@ubean/utils`
- **Entries**: `@ubean/islands/vite`, `@ubean/islands/runtime`
- **Virtual module**: `virtual:ubean-islands-registry` (generated by the Vite plugin, exports the auto-collected island component registry)

#### `@ubean/ssr`
- **Responsibility**: Vue SSR renderer — `createVueRenderer`, `renderToString`, `applyServerAppConfig`
- **Source**: `core/vue/renderer.ts`
- **Dependencies**: `vue`, `@vue/server-renderer`, `@unhead/vue`, `@ubean/pages`, `@ubean/runtime`, `@ubean/islands`
- **Entry**: `@ubean/ssr`

#### `@ubean/vite`
- **Responsibility**: Vue-specific Vite plugin — `ubeanVuePlugin` (main plugin), virtual module generation (`virtual:ubean-pages`, `virtual:ubean-app`, `virtual:ubean-server`, `virtual:ubean-client-entry`), component/composables auto-import, Markdown integration
- **Source**: `core/vue/{plugin,virtual-modules}.ts`
- **Dependencies**: `unplugin-vue-components`, `unplugin-auto-import`, `unplugin-vue-markdown`, `oxc-transform`, `@ubean/routing`, `@ubean/auto-imports`, `@ubean/markdown`, `@ubean/runtime`
- **Entry**: `@ubean/vite`

### Layer 5 — Build Tooling and Orchestration

#### `@ubean/auto-imports`
- **Responsibility**: Auto-import presets — `VUE_PRESET`, `UBEAN_CLIENT_PRESET`, `UBEAN_SERVER_PRESET`, `BUILTIN_PRESETS`, `generateAutoImports`
- **Source**: `core/auto-imports/`
- **Dependencies**: `unimport`, `@ubean/routing` (type-only)
- **Entry**: `@ubean/auto-imports`

#### `@ubean/markdown`
- **Responsibility**: Markdown parsing — `parseMarkdown`, `parseFrontmatter`, `markdownToHtml`, `extractHeadings`, `extractExcerpt`, `defineMarkdownPage`
- **Source**: `core/markdown/`
- **Dependencies**: `markdown-exit`
- **Entry**: `@ubean/markdown`

#### `@ubean/prerender`
- **Responsibility**: SSG pre-rendering
- **Source**: `core/prerender/`
- **Dependencies**: `@ubean/routing`, `@ubean/pages`, `@ubean/app`
- **Entry**: `@ubean/prerender`

#### `@ubean/preset`
- **Responsibility**: Deployment presets — `standardPreset`, `nodePreset`, `cloudflarePreset`, `generateWranglerConfig`, `detectPreset`
- **Source**: `core/preset/`
- **Entry**: `@ubean/preset`

#### `@ubean/config`
- **Responsibility**: Config loading and types — `defineConfig`, `loadUbeanConfig`, `UbeanConfig`, `ResolvedConfig`, `RouteRule`, `PrerenderConfig`, new `RoutingConfig` (route generation config)
- **Source**: `core/config/`
- **Dependencies**: `c12`, `defu`, `pathe`, `@ubean/preset` (type-only)
- **Entry**: `@ubean/config`

#### `@ubean/codegen`
- **Responsibility**: Type generation — `generateTypes` (generates `.ubean/routes.d.ts`); after enhancement, also generates `ubean-router.d.ts`, `typed-router.d.ts`
- **Source**: `core/codegen/`
- **Dependencies**: `openapi-typescript`, `@ubean/routing` (type-only)
- **Entry**: `@ubean/codegen`

#### `@ubean/modules`
- **Responsibility**: Module system — `resolveModules`, `defineModule`, `createModuleKitContext`, `BUILTIN_MODULES` registry
- **Source**: `core/modules/`
- **Dependencies**: `hookable`, `@ubean/config` (type-only)
- **Entry**: `@ubean/modules`

#### `@ubean/build`
- **Responsibility**: Core Vite plugin (framework-agnostic part) — `ubeanPlugin` (`ubean:routes`/`ubean:pages`/`ubean:meta`/`ubean:app-config`/`ubean:locales` virtual modules), `transformMacros`, virtual module registry, integrated route generator (triggers entity file generation based on `routing.mode`)
- **Source**: `core/build/vite/{plugin,build,macros}.ts`, `core/build/virtual/{modules,registry}.ts` (framework-agnostic part)
- **Dependencies**: `vite`, `oxc-transform`, `@ubean/routing`, `@ubean/config`, `@ubean/modules`
- **Entry**: `@ubean/build/vite`

#### `@ubean/dev-server`
- **Responsibility**: Dev server orchestration — `createViteDevServer`, `createDevRunner`, watcher
- **Source**: `core/dev/`
- **Dependencies**: `vite`, `@vitejs/plugin-vue`, `@ubean/build`, `@ubean/vite`, `@ubean/ssr`, `@ubean/app`, `@ubean/islands`, `@ubean/cli`
- **Entry**: `@ubean/dev-server`

#### `@ubean/cli`
- **Responsibility**: CLI commands — `ubean dev`, `ubean build`, `ubean prepare`, `ubean init`, `ubean preview`, `ubean page`, new (aligned with elegant-router): `ubean add-route`, `ubean delete-route`, `ubean update-route`, `ubean recovery-route`, `ubean add-reuse-route`, `ubean backup`
- **Source**: `core/cli/`, `bin/ubean.mjs`
- **Dependencies**: `citty`, `consola`, `ts-morph` (route CLI commands), other subpackages (lazy-loaded)
- **Entry**: `@ubean/cli` (binary `ubean-next`, renamed to `ubean` after Phase B)

### Layer 6 — New Aggregator

#### `@ubean/core`
- **Responsibility**: New ubean aggregator — re-exports all subpackages, provides default `ubeanPlugin` assembly, provides `ubean-next` CLI (returns to `ubean` after Phase B)
- **Dependencies**: All `@ubean/*` subpackages (`workspace:*`)
- **Entries**:
  - `@ubean/core` — main entry (re-exports all)
  - `@ubean/core/vite` — default Vite plugin (combines `@ubean/build` + `@ubean/vite` + `@ubean/islands`)
  - `@ubean/core/app` — `@ubean/app`
  - `@ubean/core/runtime` — `@ubean/runtime` (browser entry)

## 5. Dependency Graph

```
                              ┌─────────────────────────┐
                              │   @ubean/core (聚合器)  │
                              │  bin: ubean-next       │
                              └──────────┬──────────────┘
                                         │
        ┌───────────────────┬────────────┼────────────┬─────────────────┐
        ▼                   ▼            ▼            ▼                 ▼
   @ubean/cli          @ubean/dev   @ubean/build   @ubean/vite     @ubean/ssr
        │                   │            │            │                 │
        │                   ▼            ▼            ▼                 ▼
        │              @ubean/app   @ubean/routing  @ubean/auto-imports @ubean/runtime
        │                   │       ⭐双模式生成      │                 │
        │                   ▼            │            ▼                 ▼
        │          @ubean/api-routes     │       @ubean/markdown    @ubean/pages
        │                   │            │                            │
        │                   ▼            │                            ▼
        │       @ubean/server             │                       @ubean/i18n
        │                                │                       @ubean/seo
        ▼                                │
   @ubean/modules                         │
   @ubean/config                          │
   @ubean/preset                          │
   @ubean/codegen                         │
   @ubean/prerender                       │
   @ubean/islands                         │
   @ubean/utils                           │
   @ubean/types                           │
   @ubean/markdown ─────────────────────┘
```

## 6. Dual-Mode Route Generation Design (aligned with elegant-router)

### 6.1 Mode Overview

| Mode | Description | Use Case | Advantages |
|---|---|---|---|
| `virtual` (default) | Virtual module only | SSR projects, don't want generated files in the repo | Zero disk files, instant HMR |
| `file` | Entity files only | Need type safety, want to manually edit `meta` in `routes.ts` | Stronger type inference, user-editable, can be used without the ubean runtime |
| `both` | Both coexist | Transition period, need virtual module HMR and entity file types | Combines advantages of both |

### 6.2 Configuration (new `routing` field in `@ubean/config`)

```ts
export interface RoutingConfig {
  /**
   * 生成模式
   * - 'virtual': 仅虚拟模块(默认,ubean 现有行为)
   * - 'file': 仅实体文件(对齐 elegant-router)
   * - 'both': 两者并存
   */
  mode?: 'virtual' | 'file' | 'both';

  /** 实体文件输出目录(相对于 rootDir) */
  outputDir?: string;            // 默认 'src/router/_generated'

  /** 类型声明输出目录 */
  dtsDir?: string;              // 默认 'src/typings'

  /** 是否生成内置路由(Root、404) */
  generateBuiltinRoutes?: boolean;  // 默认 false

  /** 根路由重定向 */
  rootRedirect?: string;            // 默认 undefined

  /** 404 路由组件名 */
  notFoundRouteComponent?: string;  // 默认 '404'

  /** 默认复用路由组件 */
  defaultReuseRouteComponent?: string;  // 默认 'Wip'

  /** 复用路由配置 */
  reuseRoutes?: string[];           // 默认 []

  /** 布局配置 */
  layouts?: Record<string, string>;  // { name: 'path/to/layout.vue' }

  /** 是否懒加载 */
  routeLazy?: (node: RouteNode) => boolean;     // 默认 () => true
  layoutLazy?: (name: string) => boolean;       // 默认 () => true

  /** 命名/路径/布局自定义钩子 */
  getRouteName?: (node: RouteNode) => string;
  getRoutePath?: (node: RouteNode) => string;
  getRouteLayout?: (node: RouteNode) => string;
  getRouteMeta?: (node: RouteNode) => Record<string, unknown> | null;

  /** 生成完成钩子(用户可后处理) */
  onGenerated?: (nodes: RouteNode[], options: ResolvedRoutingConfig) => void | Promise<void>;

  /** 监听文件变化时是否自动重新生成 */
  watchFile?: boolean;              // 默认 true
  fileUpdateDuration?: number;     // 默认 500ms(防抖)
}
```

### 6.3 Generated File Inventory

```
<srcDir>/router/_generated/
├── routes.ts         # 路由数据(扁平结构,用 ts-morph 增量更新)
├── imports.ts        # 组件懒加载映射(layouts + views)
├── shared.ts         # 共享工具(getRoutePath、isRedirect)
└── transformer.ts    # 转换函数(扁平数据 → vue-router 嵌套结构)

<dtsDir>/
├── ubean-router.d.ts      # 路由类型(RouteKey、RoutePathMap、RouteLayoutKey)
└── typed-router.d.ts      # vue-router 类型增强(RouteNamedMap)
```

### 6.4 Generator API (`@ubean/routing/generator`)

```ts
import { RouteGenerator } from '@ubean/routing/generator';
import type { RoutingConfig } from '@ubean/config';

const generator = new RouteGenerator(config);

// 一次性生成所有文件
await generator.generate();

// 监听变化增量更新
generator.watch();

// 停止监听
generator.stopWatch();

// 获取当前路由节点数据
const nodes = generator.getNodes();

// 手动触发重新生成
await generator.regenerate();

// 仅生成类型声明
await generator.generateDts();

// 仅生成 routes.ts(增量更新)
await generator.generateRoutes();

// 添加路由(对齐 elegant-router CLI)
await generator.addRoute({ name: 'About', path: '/about', component: 'About' });

// 删除路由(带备份)
await generator.deleteRoute('About');

// 恢复路由
await generator.recoveryRoute('About');

// 添加复用路由
await generator.addReuseRoute('/reuse/:id');
```

### 6.5 Generated File Examples

#### `routes.ts`

```ts
/* eslint-disable */
// Generated by @ubean/routing
// Read more: https://ubean.dev/routing

import type { UbeanRoute } from '@ubean/routing/types';

export const routes: UbeanRoute[] = [
  { name: 'Root', path: '/', redirect: '/home' },
  {
    name: 'Home',
    path: '/home',
    layout: 'default',
    component: 'Home',
    meta: { title: 'Home' }
  },
  {
    name: 'User_Id',
    path: '/user/:id',
    layout: 'default',
    component: 'User_Id',
    meta: { title: 'User' }
  }
];
```

#### `imports.ts`

```ts
import type { RouteFileKey, RouteLayoutKey, RawRouteComponent } from '@ubean/routing/types';

export const layouts: Record<RouteLayoutKey, RawRouteComponent> = {
  default: () => import('@/layouts/default.vue')
};

export const views: Record<RouteFileKey, RawRouteComponent> = {
  Home: () => import('@/pages/index.vue'),
  User_Id: () => import('@/pages/user/[id].vue')
};
```

#### `shared.ts`

```ts
import type { RouteKey, RoutePathMap, UbeanRoute, UbeanRedirect } from '@ubean/routing/types';

const routePathMap: RoutePathMap = {
  'Root': '/',
  'Home': '/home',
  'User_Id': '/user/:id'
};

export function getRoutePath(key: RouteKey) {
  return routePathMap[key];
}

export function isRedirect(route: UbeanRoute): route is UbeanRedirect {
  return 'redirect' in route;
}
```

#### `transformer.ts`

```ts
import type { RouteRecordRaw } from 'vue-router';
import type { UbeanRoute, RawRouteComponent } from '@ubean/routing/types';
import { isRedirect } from './shared';

export function transformToVueRoutes(
  routes: UbeanRoute[],
  layouts: Record<string, RawRouteComponent>,
  views: Record<string, RawRouteComponent>
): RouteRecordRaw[] {
  const { redirects, groupedRoutes } = getFormattedRoutes(routes);

  const vueRoutes: RouteRecordRaw[] = [...redirects];

  groupedRoutes.forEach((items, layout) => {
    const layoutRoute: RouteRecordRaw = {
      path: `/${layout}-layout`,
      component: layouts[layout],
      children: items.map(item => {
        const { layout: _, component, ...rest } = item;
        return { component: views[component], ...rest };
      })
    };
    vueRoutes.push(layoutRoute);
  });

  return vueRoutes;
}

function getFormattedRoutes(routes: UbeanRoute[]) {
  const groupedRoutes = new Map<string, UbeanRoute[]>();
  const redirects: UbeanRoute[] = [];

  routes.forEach(route => {
    if (isRedirect(route)) {
      redirects.push(route);
      return;
    }
    const items = groupedRoutes.get(route.layout) || [];
    items.push(route);
    groupedRoutes.set(route.layout, items);
  });

  return { redirects, groupedRoutes };
}
```

#### `ubean-router.d.ts`

```ts
declare module '@ubean/routing/types' {
  type RouteRecordSingleView = import('vue-router').RouteRecordSingleView;
  type RouteRecordRedirect = import('vue-router').RouteRecordRedirect;
  type RouteComponent = import('vue-router').RouteComponent;

  type Lazy<T> = () => Promise<T>;

  export type RawRouteComponent = RouteComponent | Lazy<RouteComponent>;
  export type RouteLayoutKey = 'default';

  export type RoutePathMap = {
    'Root': '/';
    'Home': '/home';
    'User_Id': '/user/:id';
  };

  export type RouteKey = keyof RoutePathMap;
  export type RoutePath = RoutePathMap[RouteKey];

  export type RootRouteKey = 'Root';
  export type NotFoundRouteKey = 'NotFound';
  export type BuiltinRouteKey = RootRouteKey | NotFoundRouteKey;

  export type RouteFileKey = Exclude<RouteKey, BuiltinRouteKey>;

  type MappedNamePath = {
    [K in RouteKey]: { name: K; path: RoutePathMap[K] };
  }[RouteKey];

  export type UbeanSingleView = Omit<RouteRecordSingleView, 'component' | 'name' | 'path'> & {
    component: RouteFileKey;
    layout: RouteLayoutKey;
  } & MappedNamePath;

  export type UbeanRedirect = Omit<RouteRecordRedirect, 'children' | 'name' | 'path'> & MappedNamePath;

  export type UbeanRoute = UbeanSingleView | UbeanRedirect;
}
```

#### `typed-router.d.ts`

```ts
import type { RouteNamedMap } from '@ubean/routing/types';

declare module 'vue-router' {
  export interface TypesConfig {
    RouteNamedMap: RouteNamedMap;
  }
}

declare module '@ubean/routing/types' {
  import type {
    RouteParamsRawGeneric,
    RouteParamsGeneric,
    RouteRecordInfo,
    ParamValue,
    ParamValueZeroOrOne
  } from 'vue-router';

  export interface RouteNamedMap {
    'Root': RouteRecordInfo<'Root', '/', Record<never, never>, Record<never, never>>;
    'Home': RouteRecordInfo<'Home', '/home', Record<never, never>, Record<never, never>>;
    'User_Id': RouteRecordInfo<'User_Id', '/user/:id', { id: ParamValue<true> }, { id: ParamValue<false> }>;
  }
}
```

### 6.6 Incremental Update Mechanism (Key)

- **First generation**: The entire `routes.ts` array is generated from scan results
- **Subsequent updates**: Use `ts-morph` to parse the existing `routes.ts`, only adding/removing/modifying differential routes
- **User-added `meta` fields are not overwritten** (only `name`/`path`/`component`/`layout` are updated)
- **On route deletion**: Backed up to `.ubean/route-backup.json`, recoverable via CLI
- **Failure rollback**: The current file is backed up before each update; rolled back on failure

### 6.7 CLI Command Enhancements (`@ubean/cli`)

```bash
# 添加路由(同时创建文件 + 更新生成文件)
ubean add-route about --path /about

# 删除路由(带备份)
ubean delete-route about

# 恢复已删除的路由
ubean recovery-route about

# 更新路由(改名/路径)
ubean update-route oldName --name newName --path /new-path

# 添加复用路由
ubean add-reuse-route /reuse/:id

# 备份当前路由配置
ubean backup
```

## 7. Usage Scenario Comparison

### Scenario A: Full-Stack Project (default)
```bash
pnpm add ubean
```
- Automatically pulls in all subpackages (transitive deps)
- `ubean dev` / `ubean build` behavior is completely unchanged
- User API surface is 100% backward compatible
- Explicitly using `@ubean/core` achieves the same effect

### Scenario B: Frontend-Only SPA (no SSR / no backend routes) ⭐
```bash
pnpm add @ubean/vite @ubean/runtime @ubean/routing @ubean/pages @ubean/auto-imports @ubean/islands @soybeanjs/fetch
```
**Not installed**: `@ubean/app`, `@ubean/api-routes`, `@ubean/server`, `@ubean/ssr`, `@ubean/prerender`

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { ubeanVuePlugin } from '@ubean/vite';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
import { loadUbeanConfig } from '@ubean/config';

const config = await loadUbeanConfig();

export default defineConfig({
  plugins: [
    ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  ]
});
```

Capabilities available:
- ✅ File-based routing (virtual mode or entity file mode)
- ✅ Layouts system
- ✅ `<Link>`, `<Head>`, `<PageView>`, `useRouter`, `useData`, `useHead`, `useSeoMeta`
- ✅ `useI18n`, `t`, `formatDate`
- ✅ View Transitions
- ✅ Islands partial hydration
- ✅ HTTP requests (`@soybeanjs/fetch`)
- ✅ Route type safety (`RouteKey`, `RoutePathMap`)
- ❌ No SSR rendering
- ❌ No `defineHandler` / API routes
- ❌ No cache/database/queue/cron

### Scenario C: Backend API Service (no frontend)
```bash
pnpm add @ubean/app @ubean/api-routes @ubean/routing @ubean/server
```

### Scenario D: Vue + Islands + SSR (custom assembly)
```bash
pnpm add @ubean/vite @ubean/runtime @ubean/ssr @ubean/pages @ubean/routing @ubean/islands @soybeanjs/fetch
```

### Scenario E: Using Only Route Generation (without ubean runtime)
```bash
pnpm add @ubean/routing
```
- Use `@ubean/routing/generator` in your own Vite plugin / script to generate route files
- Similar to using elegant-router standalone

## 8. Phase B: Aggregator Switch Detailed Steps

After `@ubean/core` is implemented and passes full validation, execute the following steps to switch the `ubean` package to an aggregator:

### 8.1 `packages/ubean` Conversion

```ts
// packages/ubean/src/index.ts(改造后)
// ubean 包变为纯 re-export,所有实际代码在 @ubean/core 中
export * from '@ubean/core';
export type * from '@ubean/core';
```

```js
// packages/ubean/bin/ubean.mjs(改造后)
#!/usr/bin/env node
// 转发到 @ubean/core 的 CLI
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cliPath = require.resolve('@ubean/core/bin/ubean.mjs');
await import(cliPath);
```

```json
// packages/ubean/package.json(改造后)
{
  "name": "ubean",
  "version": "1.0.0",
  "bin": { "ubean": "./bin/ubean.mjs" },
  "files": ["dist", "bin"],
  "type": "module",
  "main": "./dist/index.mjs",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs" },
    "./vite": { "types": "./dist/vite.d.ts", "import": "./dist/vite.mjs" },
    "./runtime": { "browser": "./dist/runtime.mjs", "import": "./dist/runtime.mjs" }
  },
  "dependencies": {
    "@ubean/core": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3.0.0"
  }
}
```

### 8.2 `packages/core` CLI Rename

```json
// packages/core/package.json(改造后)
{
  "name": "@ubean/core",
  "bin": { "ubean": "./bin/ubean.mjs" }
}
```

```bash
# 旧(阶段 A):
ubean-next dev
ubean-next build

# 新(阶段 B):
ubean dev
ubean build
```

### 8.3 User Perception

| Item | Phase A | Phase B |
|---|---|---|
| Package name | `ubean` (legacy), `@ubean/core` (new) | `ubean` (re-export core), `@ubean/core` (recommended) |
| CLI command | `ubean` (legacy), `ubean-next` (new) | `ubean` (unified) |
| API surface | Two sets coexist | 100% backward compatible |
| Dependency source | `packages/ubean/src/` | `packages/<subpackages>/` aggregated via `@ubean/core` |

### 8.4 Validation Checklist

Before switching, the following must pass:
- [ ] `pnpm -r typecheck` all pass
- [ ] `pnpm -r test` all pass
- [ ] `pnpm -r build` all pass
- [ ] `examples/ubean-test` runs `pnpm dev` + `pnpm build` successfully
- [ ] New `examples/frontend-only` runs successfully
- [ ] New `examples/routing-file-mode` runs successfully
- [ ] API surface is 100% backward compatible (compare `packages/ubean/src/index.ts` with `@ubean/core` exports)

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `runtime/pages/protocol.ts` is type-only referenced by `core/routing/scan.ts` | Circular dependency after routing is split out | Sink the `PageHead` interface to `@ubean/types` |
| `core/routing/define-page.ts` contains vue-router type extensions | routing package forced to depend on vue-router | Move `declare module 'vue-router'` to `@ubean/runtime` |
| `core/markdown` is used by `core/routing/scan.ts` for frontmatter | routing depends on markdown | Make `@ubean/markdown` a peerDep, inject the parser via options |
| Route entity file mode vs virtual mode data format mismatch | Inconsistent dual-mode behavior | Share the same `RouteNode` data structure; both the generator and virtual module are based on it |
| ts-morph incremental update failure causes data loss | User's manually modified meta is lost | Back up to `.ubean/route-backup.json` before each update; roll back on failure |
| Phase B switch causes breaking changes for existing `ubean` package users | User-perceived disruption | Strictly ensure `packages/ubean/src/index.ts` re-export covers all original APIs; verify via comparison tests |
| `optimizeDeps.exclude` list needs updating | Vite pre-bundling errors | List all `@ubean/*` subpackages in the `config()` hook of `@ubean/vite` |
| elegant-router type extension conflicts with ubean's existing `RouteMeta` extension | Duplicate type declarations | Maintain `RouteMeta` extension centrally in `@ubean/runtime`; `typed-router.d.ts` only declares `RouteNamedMap` |
| Subpackage version mismatch | Users install incompatible combinations | Main package `ubean` locks all subpackage versions; `@ubean/core` also locks; when using subpackages independently, declare compatible ranges via peerDeps |

## 10. Implementation Path and Time Estimates

### Phase 0: Preparation (0.5 days)
- [ ] Create `packages/<subpkg>/` directory skeletons (23 new packages total)
- [ ] Configure `tsconfig.json` `references` to support incremental compilation of subpackages
- [ ] Update `pnpm-workspace.yaml` (already includes `packages/*` automatically, no changes needed)
- [ ] Original `packages/ubean` remains unchanged

### Phase 1: Foundation Layer (2-3 days)
- [ ] `@ubean/types` ← `src/types/handler.ts`
- [ ] `@ubean/utils` ← `src/utils/`, `core/utils/`
- [ ] `@ubean/markdown` ← `core/markdown/`
- [ ] `@ubean/error` ← `runtime/error.ts`
- [ ] `@ubean/env` ← `runtime/env.ts`
- [ ] `@ubean/seo` ← `runtime/seo.ts`
- [ ] `@ubean/i18n` ← `runtime/{i18n,i18n-routing}.ts`
- [ ] `@ubean/pages` ← `runtime/pages/`

### Phase 2: Routing and Backend (3-4 days) ⭐ Includes elegant-router enhancements
- [ ] `@ubean/routing` ← `core/routing/`
  - Strip vue-router type extensions from `define-page.ts`
  - Add `generator/` directory: implement `RouteGenerator` class
  - Implement 4 generation file functions (routes/imports/shared/transformer)
  - Implement 2 type declaration functions (ubean-router.d.ts/typed-router.d.ts)
  - Implement ts-morph incremental updates
  - Implement route backup/recovery
- [ ] `@ubean/api-routes` ← `runtime/{handler,router,route-rules,internal-fetch,internal/openapi}.ts`
- [ ] `@ubean/server` ← merge 12 server primitive files
- [ ] `@ubean/app` ← `runtime/{app,define-server}.ts`
- [ ] `@ubean/config` enhancement: add `RoutingConfig` type and defaults

### Phase 3: Vue-Specific (3-4 days)
- [ ] `@ubean/runtime` ← `runtime/vue/` (refactor import paths + add vue-router type extensions)
- [ ] `@ubean/islands` ← `core/islands/` + `runtime/vue/islands.ts`
- [ ] `@ubean/ssr` ← `core/vue/renderer.ts`
- [ ] `@ubean/vite` ← `core/vue/{plugin,virtual-modules}.ts`

### Phase 4: Build Tooling (2-3 days)
- [ ] `@ubean/auto-imports` ← `core/auto-imports/`
- [ ] `@ubean/build` ← `core/build/` (integrate route generator, trigger entity file generation based on `routing.mode`)
- [ ] `@ubean/prerender` ← `core/prerender/`
- [ ] `@ubean/preset` ← `core/preset/`
- [ ] `@ubean/codegen` ← `core/codegen/` (enhancement: generate `ubean-router.d.ts`/`typed-router.d.ts`)
- [ ] `@ubean/modules` ← `core/modules/`
- [ ] `@ubean/dev-server` ← `core/dev/`
- [ ] `@ubean/cli` ← `core/cli/` + add 5 route management commands

### Phase 5: Aggregator (1 day)
- [ ] Create `packages/core/`, implement `src/index.ts` (pure re-export)
- [ ] Implement `bin/ubean-next.mjs` (delegates to `@ubean/cli`)
- [ ] Implement `src/vite.ts` (default `ubeanPlugin` combining `@ubean/build` + `@ubean/vite` + `@ubean/islands`)
- [ ] Full validation: `pnpm typecheck` + `pnpm test` + `pnpm dev` + `pnpm build`

### Phase 6: Examples and Documentation (2-3 days)
- [ ] Add `examples/frontend-only/` — Scenario B example (SPA, no backend)
- [ ] Add `examples/routing-file-mode/` — route entity file mode example
- [ ] Upgrade `examples/ubean-test/` to `routing-virtual-mode/` example
- [ ] Update `AGENTS.md` to reflect the new package structure
- [ ] Update `skills/ubean/docs/` with route generation mode docs
- [ ] CI matrix: `pnpm -r typecheck && pnpm -r test && pnpm -r build`

### Phase 7: Aggregator Switch (1 day) ⭐
- [ ] Delete original code in `packages/ubean/src/` (already migrated to subpackages)
- [ ] Change `packages/ubean/src/index.ts` to `export * from '@ubean/core'`
- [ ] Change `packages/ubean/bin/ubean.mjs` to forward to `@ubean/core/bin/ubean.mjs`
- [ ] Rename `packages/core/bin/ubean-next.mjs` to `ubean.mjs`
- [ ] Change `packages/ubean/package.json` `dependencies` to `@ubean/core: workspace:*`
- [ ] Change `packages/core/package.json` `bin` to `{ "ubean": "./bin/ubean.mjs" }`
- [ ] Validation checklist (see §8.4) all pass
- [ ] Publish `ubean@1.0.0` (zero-breaking for external users)

### Phase 8: Legacy Code Retirement (optional, at 2.0)
- [ ] Mark `@ubean/core` as the recommended entry point in `packages/ubean`
- [ ] Evaluate whether to merge `packages/ubean` and `packages/core` (optional)

**Total estimated effort**: 15-18 working days (single developer)

## Next Steps

- [Architecture Overview](/architecture/overview)
- [Routing](/architecture/routing)
- [Routing Modes](/guide/routing-modes)
