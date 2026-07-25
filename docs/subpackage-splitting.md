# ubean 子包拆分方案

> **实施状态:已完成(2026-07)**
>
> 本文档为原始设计方案。实际实施中进行了以下调整:
> - **未创建 `@ubean/core` 中间包** — `packages/core` 最终直接重命名为 `packages/ubean`,聚合器包名即为 `ubean`(非 `@ubean/core`)。
> - **扩展包目录去掉 `ubean-` 前缀** — `packages/ubean-auth/` → `packages/auth/`(包名仍为 `@ubean/auth`)。
> - **导出格式统一为 `.js`/`.d.ts`** — 通过 `vite.config.ts` 的 `fixedExtension: false` 实现(非 `.mjs`/`.d.mts`)。
> - **新增 4 个子路径导出** — `ubean/runtime/vue`、`ubean/runtime/app`、`ubean/runtime/i18n`、`ubean/vue-ssr`。
>
> 当前实际包架构见 [AGENTS.md](../AGENTS.md) 第 2 节。
>
> ---
>
> 目标:将 `packages/ubean` 中的实现拆分为多个职责清晰的子包,使前端项目可独立使用部分能力(无 SSR / 无后端路由),同时对齐 elegant-router 的实体文件路由生成能力。

## 1. 设计原则

1. **零破坏性过渡**:新子包在 `packages/` 下独立孵化;`packages/ubean` 在 `@ubean/core` 完成前保持不变。
2. **聚合器最终回归 `ubean`**:`@ubean/core` 实现完成后,`packages/ubean` 改为从 `@ubean/core` re-export,CLI 二进制 `ubean-next` 改名为 `ubean`,对外包名仍是 `ubean`。
3. **ubean 专注 Vue 生态**:子包命名去掉 `vue-` 前缀(`@ubean/runtime`、`@ubean/vite`、`@ubean/ssr`),与已有 `@ubean/auth`、`@ubean/icon` 风格一致。
4. **路由生成双模式**:既支持虚拟模块(现有),也支持生成实体文件(对齐 elegant-router),用户可通过配置切换。
5. **依赖天然分层**:`routing` 不依赖 Vue,`runtime/app` 不依赖 Vue,Vue 专属代码集中在 Layer 4。

## 2. 三阶段演进策略

### 阶段 A:子包孵化(并行存在)
- 新建 `packages/<subpkg>/` 目录,逐个迁移源码
- `packages/ubean` 保持不变,继续维护
- 新增 `packages/core/`,发布为 `@ubean/core`,提供 `ubean-next` CLI

### 阶段 B:聚合器切换 ⭐
- `@ubean/core` 实现完成并通过全量测试
- `packages/ubean` 改造为聚合器:
  - 删除 `src/` 下原代码(已迁移到子包)
  - `src/index.ts` 改为纯 re-export:`export * from '@ubean/core';`
  - `bin/ubean.mjs` 改为转发到 `@ubean/core` 的 CLI
  - CLI 二进制名从 `ubean-next` 改为 `ubean`
  - `package.json` 的 `dependencies` 改为各 `@ubean/*` 子包
- 对外用户感知:包名 `ubean` 不变,CLI 命令 `ubean` 不变,API 表面 100% 向后兼容
- `@ubean/core` 仍可作为更显式的入口供高级用户使用

### 阶段 C:旧代码退役
- `@ubean/core` 1.0 稳定后,在 `packages/ubean` 中将 `@ubean/core` 标记为推荐入口
- 2.0 时考虑将 `packages/ubean` 与 `packages/core` 合并(可选)

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

## 3. 仓库结构(目标)

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
├── build/                    # @ubean/build(框架无关 Vite 插件)
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

## 4. 子包清单与职责

### Layer 0 — 基础共享

#### `@ubean/types`
- **职责**: 全局共享类型 —— `UbeanEnv`、`RouteMeta`、`UbeanHandler`、`UbeanMiddleware`、`ComposedHandler`、`Input`、`UbeanVariables`、`UbeanBindings`、`PageHead`(从 pages 协议下沉)
- **来源**: `packages/ubean/src/types/handler.ts`
- **依赖**: `hono`(类型)
- **入口**: `@ubean/types`

#### `@ubean/utils`
- **职责**: 纯工具函数 —— `filePathToRoute`、`stripRouteGroups`、`findAvailablePort`、`findUserViteConfig`
- **来源**: `packages/ubean/src/utils/path.ts`、`core/utils/port.ts`、`core/utils/vite-config.ts`
- **依赖**: `pathe`、`tinyglobby`、`node:net`
- **入口**: `@ubean/utils`

### Layer 1 — 框架无关的文件式路由

#### `@ubean/routing` ⭐
- **职责**: 文件式路由核心,提供**双模式**生成能力(虚拟模块 + 实体文件)
- **来源**:
  - `core/routing/scan.ts`、`core/routing/router.ts`(rou3)、`core/routing/route-name.ts`、`core/routing/detect-exports.ts`、`core/routing/types.ts`、`core/routing/define-page.ts`(AST 部分)
  - **新增** `generator/` 目录(对齐 elegant-router)
- **依赖**: `rou3`、`tinyglobby`、`pathe`、`@ubean/utils`、`@ubean/types`、`@ubean/markdown`(可选 peer)、`ts-morph`(实体文件模式)
- **入口**:
  - `@ubean/routing` — 扫描器、匹配器、AST 提取
  - `@ubean/routing/generator` — 实体文件生成器
  - `@ubean/routing/types` — 路由类型(供生成文件引用)

#### `@ubean/api-routes`
- **职责**: 后端 API 路由运行时 —— `defineHandler`、`defineHandlerMeta`、`defineMiddleware`、`registerRoutes`、`createRouteLoader`、路由规则中间件、`internal-fetch`、内置 OpenAPI 路由
- **来源**: `runtime/{handler,router,route-rules,internal-fetch,internal/openapi}.ts`
- **依赖**: `hono`、`hono-openapi`、`@ubean/types`、`@ubean/routing`(type-only)
- **入口**: `@ubean/api-routes`

### Layer 2 — 服务端运行时原语

#### `@ubean/server`
- **职责**: 服务端运行时原语 —— cache、database、queue、cron(+ scheduler)、websocket、sse、storage、observability、static、cors、rate-limit
- **来源**: `runtime/{cache,database,queue,cron,cron-scheduler,websocket,sse,storage,observability,static,cors,rate-limit}.ts`
- **依赖**: `hono`、`unstorage`、`hookable`、`@ubean/types`
- **入口**: `@ubean/server`
- **可选拆分**(后期): `@ubean/cache`、`@ubean/database`、`@ubean/queue`、`@ubean/cron`、`@ubean/realtime`、`@ubean/storage`

#### `@ubean/app`
- **职责**: Hono 应用工厂 + 服务器配置 —— `createUbeanApp`、`defineServer`、`createDefaultServerConfig`、`mergeServerConfigs`、`applyServerConfig`
- **来源**: `runtime/{app,define-server}.ts`
- **依赖**: `hono`、`hookable`、`@ubean/api-routes`、`@ubean/server`、`@ubean/routing`(type-only)、`@ubean/config`(type-only)
- **入口**: `@ubean/app`

### Layer 3 — 同构运行时(前端可用)

#### `@ubean/i18n`
- **职责**: 零依赖 i18n 核心 —— `defineLocale`、`t`、`setLocale`、`formatDate/Number/Currency/RelativeTime/List`、`addLocale`、`mergeLocale`、`detectLocale`、`detectBrowserLocale`
- **来源**: `runtime/{i18n,i18n-routing}.ts`
- **入口**: `@ubean/i18n`、`@ubean/i18n/routing`

#### `@ubean/env`
- **职责**: 类型安全环境变量 —— `defineEnv`、`setRuntimeEnv`、`useRuntimeEnv`
- **来源**: `runtime/env.ts`
- **依赖**: `@standard-schema/spec`
- **入口**: `@ubean/env`

#### `@ubean/error`
- **职责**: 错误处理 —— `UbeanError`、`createError`、`isUbeanError`、`errorToResponse`
- **来源**: `runtime/error.ts`
- **入口**: `@ubean/error`

#### `@ubean/seo`
- **职责**: SEO 工具 —— `useSeoMeta`、`mergeMetadata`、`buildMetaTags`、`buildLinkTags`、`buildTitle`、`renderHeadTags`、`createRobotsResponse`、`createSitemapResponse`、`defineManifest`、`createManifestResponse`
- **来源**: `runtime/seo.ts`
- **入口**: `@ubean/seo`

#### `@ubean/pages`
- **职责**: 页面数据协议 + 同构数据层 —— `PageObject`、`PageRenderer`、`buildPageShell`、`buildClientOnlyShell`、`renderPage`、`pageJsonResponse`、`useData`、`invalidateData`、`invalidateAll`、`clearDataCache`、`declareDependencies`、`withDependencies`、`createInternalFetch`、`createStreamResponse`、`createSseStream`、`defineDataKey`
- **来源**: `runtime/pages/`
- **依赖**: `@ubean/types`(type-only)
- **入口**: `@ubean/pages`

### Layer 4 — Vue 专属模块

#### `@ubean/runtime`
- **职责**: Vue 客户端运行时 —— `createUbeanApp`、`createUbeanSSRApp`、`useRouter`、`useHead`、`usePage`、`Link`、`Head`、`PageView`、`defineApp`、`applyAppConfig`、`createUbeanRouter`、`resolveRoute`、`isActiveRoute`、composables、`useCacheViews`、`usePageTransition`、`useReloadSignal`、`useViewTransition`、`hydrateIslands`、`useI18n`(Vue 集成)、vue-router `RouteMeta` 类型扩展
- **来源**: `runtime/vue/`
- **依赖**: `vue`、`vue-router`、`@unhead/vue`、`@ubean/pages`、`@ubean/i18n`、`@ubean/seo`(type-only)
- **入口**: `@ubean/runtime`、`@ubean/runtime/app`、`@ubean/runtime/define-app`

#### `@ubean/islands`
- **职责**: Islands 架构 —— Vite 插件(`client:load/idle/visible/media/only` 指令转换)、bootstrap 脚本、客户端 hydrate 运行时
- **来源**: `core/islands/`、`runtime/vue/islands.ts`
- **依赖**: `vue`(SFC 编译)、`@ubean/utils`
- **入口**: `@ubean/islands/vite`、`@ubean/islands/runtime`

#### `@ubean/ssr`
- **职责**: Vue SSR 渲染器 —— `createVueRenderer`、`renderToString`、`applyServerAppConfig`
- **来源**: `core/vue/renderer.ts`
- **依赖**: `vue`、`@vue/server-renderer`、`@unhead/vue`、`@ubean/pages`、`@ubean/runtime`、`@ubean/islands`
- **入口**: `@ubean/ssr`

#### `@ubean/vite`
- **职责**: Vue 专属 Vite 插件 —— `ubeanVuePlugin`(主插件)、虚拟模块生成(`virtual:ubean-pages`、`virtual:ubean-app`、`virtual:ubean-server`、`virtual:ubean-client-entry`)、组件/composables 自动导入、Markdown 集成
- **来源**: `core/vue/{plugin,virtual-modules}.ts`
- **依赖**: `unplugin-vue-components`、`unplugin-auto-import`、`unplugin-vue-markdown`、`oxc-transform`、`@ubean/routing`、`@ubean/auto-imports`、`@ubean/markdown`、`@ubean/runtime`
- **入口**: `@ubean/vite`

### Layer 5 — 构建工具与编排

#### `@ubean/auto-imports`
- **职责**: 自动导入预设 —— `VUE_PRESET`、`UBEAN_CLIENT_PRESET`、`UBEAN_SERVER_PRESET`、`UBEAN_PRESET`、`BUILTIN_PRESETS`、`generateAutoImports`
- **来源**: `core/auto-imports/`
- **依赖**: `unimport`、`@ubean/routing`(type-only)
- **入口**: `@ubean/auto-imports`

#### `@ubean/markdown`
- **职责**: Markdown 解析 —— `parseMarkdown`、`parseFrontmatter`、`markdownToHtml`、`extractHeadings`、`extractExcerpt`、`defineMarkdownPage`
- **来源**: `core/markdown/`
- **依赖**: `markdown-exit`
- **入口**: `@ubean/markdown`

#### `@ubean/prerender`
- **职责**: SSG 预渲染
- **来源**: `core/prerender/`
- **依赖**: `@ubean/routing`、`@ubean/pages`、`@ubean/app`
- **入口**: `@ubean/prerender`

#### `@ubean/preset`
- **职责**: 部署预设 —— `standardPreset`、`nodePreset`、`cloudflarePreset`、`generateWranglerConfig`、`detectPreset`
- **来源**: `core/preset/`
- **入口**: `@ubean/preset`

#### `@ubean/config`
- **职责**: 配置加载与类型 —— `defineConfig`、`loadUbeanConfig`、`UbeanConfig`、`ResolvedConfig`、`RouteRule`、`PrerenderConfig`、新增 `RoutingConfig`(路由生成配置)
- **来源**: `core/config/`
- **依赖**: `c12`、`defu`、`pathe`、`@ubean/preset`(type-only)
- **入口**: `@ubean/config`

#### `@ubean/codegen`
- **职责**: 类型生成 —— `generateTypes`(生成 `.ubean/routes.d.ts`)、增强后也生成 `ubean-router.d.ts`、`typed-router.d.ts`
- **来源**: `core/codegen/`
- **依赖**: `openapi-typescript`、`@ubean/routing`(type-only)
- **入口**: `@ubean/codegen`

#### `@ubean/modules`
- **职责**: 模块系统 —— `resolveModules`、`defineModule`、`createModuleKitContext`、`BUILTIN_MODULES` 注册表
- **来源**: `core/modules/`
- **依赖**: `hookable`、`@ubean/config`(type-only)
- **入口**: `@ubean/modules`

#### `@ubean/build`
- **职责**: 核心 Vite 插件(框架无关部分)—— `ubeanPlugin`(`ubean:routes`/`ubean:pages`/`ubean:meta`/`ubean:app-config`/`ubean:locales` 虚拟模块)、`transformMacros`、虚拟模块注册中心、集成路由生成器(根据 `routing.mode` 决定是否触发实体文件生成)
- **来源**: `core/build/vite/{plugin,build,macros}.ts`、`core/build/virtual/{modules,registry}.ts`(框架无关部分)
- **依赖**: `vite`、`oxc-transform`、`@ubean/routing`、`@ubean/config`、`@ubean/modules`
- **入口**: `@ubean/build/vite`

#### `@ubean/dev-server`
- **职责**: 开发服务器编排 —— `createViteDevServer`、`createDevRunner`、watcher
- **来源**: `core/dev/`
- **依赖**: `vite`、`@vitejs/plugin-vue`、`@ubean/build`、`@ubean/vite`、`@ubean/ssr`、`@ubean/app`、`@ubean/islands`、`@ubean/cli`
- **入口**: `@ubean/dev-server`

#### `@ubean/cli`
- **职责**: CLI 命令 —— `ubean dev`、`ubean build`、`ubean prepare`、`ubean init`、`ubean preview`、`ubean page`、新增(对齐 elegant-router):`ubean add-route`、`ubean delete-route`、`ubean update-route`、`ubean recovery-route`、`ubean add-reuse-route`、`ubean backup`
- **来源**: `core/cli/`、`bin/ubean.mjs`
- **依赖**: `citty`、`consola`、`ts-morph`(路由 CLI 命令)、其他子包(懒加载)
- **入口**: `@ubean/cli`(二进制 `ubean-next`,阶段 B 后改名 `ubean`)

### Layer 6 — 新聚合器

#### `@ubean/core`
- **职责**: 新版 ubean 聚合器 —— 重新导出所有子包、提供默认 `ubeanPlugin` 组装、提供 `ubean-next` CLI(阶段 B 后回归 `ubean`)
- **依赖**: 所有 `@ubean/*` 子包(`workspace:*`)
- **入口**:
  - `@ubean/core` — 主入口(re-export 所有)
  - `@ubean/core/vite` — 默认 Vite 插件(组合 `@ubean/build` + `@ubean/vite` + `@ubean/islands`)
  - `@ubean/core/app` — `@ubean/app`
  - `@ubean/core/runtime` — `@ubean/runtime`(浏览器入口)

## 5. 依赖图

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

## 6. 路由生成双模式设计(对齐 elegant-router)

### 6.1 模式说明

| 模式 | 说明 | 适用场景 | 优点 |
|---|---|---|---|
| `virtual`(默认) | 仅虚拟模块 | SSR 项目、不想在仓库留生成文件 | 零磁盘文件,HMR 即时生效 |
| `file` | 仅实体文件 | 需要类型安全、想在 `routes.ts` 中手动改 meta | 类型推导更强、用户可编辑、可脱离 ubean 运行时使用 |
| `both` | 两者并存 | 过渡期、需要虚拟模块 HMR 又需要实体文件类型 | 兼具两者优点 |

### 6.2 配置(`@ubean/config` 中新增 `routing` 字段)

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

### 6.3 生成文件清单

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

### 6.4 生成器 API(`@ubean/routing/generator`)

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

### 6.5 生成文件示例

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

### 6.6 增量更新机制(关键)

- **首次生成**:整个 `routes.ts` 数组从扫描结果生成
- **后续更新**:用 `ts-morph` 解析现有 `routes.ts`,只增/删/改差异路由
- **用户手动添加的 `meta` 字段不会被覆盖**(只更新 `name`/`path`/`component`/`layout`)
- **删除路由时**:备份到 `.ubean/route-backup.json`,可通过 CLI 恢复
- **失败回滚**:每次更新前备份当前文件,失败时回滚

### 6.7 CLI 命令增强(`@ubean/cli`)

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

## 7. 使用场景对照

### 场景 A:全栈项目(默认)
```bash
pnpm add ubean
```
- 自动拉取所有子包(transitive deps)
- `ubean dev` / `ubean build` 行为完全不变
- 用户 API 表面 100% 向后兼容
- 显式使用 `@ubean/core` 也可获得相同效果

### 场景 B:纯前端 SPA(无 SSR / 无后端路由)⭐
```bash
pnpm add @ubean/vite @ubean/runtime @ubean/routing @ubean/pages @ubean/auto-imports @ubean/islands @soybeanjs/fetch
```
**不安装**:`@ubean/app`、`@ubean/api-routes`、`@ubean/server`、`@ubean/ssr`、`@ubean/prerender`

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

享受的能力:
- ✅ 文件式路由(虚拟模式 或 实体文件模式)
- ✅ 布局系统
- ✅ `<Link>`、`<Head>`、`<PageView>`、`useRouter`、`useData`、`useHead`、`useSeoMeta`
- ✅ `useI18n`、`t`、`formatDate`
- ✅ View Transitions
- ✅ Islands 局部水合
- ✅ HTTP 请求(`@soybeanjs/fetch`)
- ✅ 路由类型安全(`RouteKey`、`RoutePathMap`)
- ❌ 无 SSR 渲染
- ❌ 无 `defineHandler` / API 路由
- ❌ 无 cache/database/queue/cron

### 场景 C:后端 API 服务(无前端)
```bash
pnpm add @ubean/app @ubean/api-routes @ubean/routing @ubean/server
```

### 场景 D:Vue + Islands + SSR(自定义组装)
```bash
pnpm add @ubean/vite @ubean/runtime @ubean/ssr @ubean/pages @ubean/routing @ubean/islands @soybeanjs/fetch
```

### 场景 E:仅用路由生成能力(脱离 ubean 运行时)
```bash
pnpm add @ubean/routing
```
- 用 `@ubean/routing/generator` 在自己的 Vite 插件 / 脚本中生成路由文件
- 类似 elegant-router 独立使用模式

## 8. 阶段 B:聚合器切换详细步骤

`@ubean/core` 实现完成并通过全量验证后,执行以下步骤将 `ubean` 包切换为聚合器:

### 8.1 `packages/ubean` 改造

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

### 8.2 `packages/core` CLI 改名

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

### 8.3 用户感知

| 项目 | 阶段 A | 阶段 B |
|---|---|---|
| 包名 | `ubean`(旧)、`@ubean/core`(新) | `ubean`(re-export core)、`@ubean/core`(推荐) |
| CLI 命令 | `ubean`(旧)、`ubean-next`(新) | `ubean`(统一) |
| API 表面 | 两套并存 | 100% 向后兼容 |
| 依赖来源 | `packages/ubean/src/` | `packages/<子包>/` 通过 `@ubean/core` 聚合 |

### 8.4 验证清单

切换前必须通过:
- [ ] `pnpm -r typecheck` 全部通过
- [ ] `pnpm -r test` 全部通过
- [ ] `pnpm -r build` 全部通过
- [ ] `examples/ubean-test` 跑通 `pnpm dev` + `pnpm build`
- [ ] 新增 `examples/frontend-only` 跑通
- [ ] 新增 `examples/routing-file-mode` 跑通
- [ ] API 表面 100% 向后兼容(对比 `packages/ubean/src/index.ts` 与 `@ubean/core` 导出)

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| `runtime/pages/protocol.ts` 被 `core/routing/scan.ts` type-only 引用 | routing 拆出后循环依赖 | `PageHead` 接口下沉到 `@ubean/types` |
| `core/routing/define-page.ts` 含 vue-router 类型扩展 | routing 包被迫依赖 vue-router | 把 `declare module 'vue-router'` 移到 `@ubean/runtime` |
| `core/markdown` 被 `core/routing/scan.ts` 用于 frontmatter | routing 依赖 markdown | 改为 `@ubean/markdown` 作 peerDep,通过 options 注入 parser |
| 路由实体文件模式 vs 虚拟模式数据格式不一致 | 双模式行为不统一 | 共享同一份 `RouteNode` 数据结构,生成器和虚拟模块都基于它 |
| ts-morph 增量更新失败时数据丢失 | 用户手动改的 meta 丢失 | 每次更新前备份到 `.ubean/route-backup.json`,失败时回滚 |
| 阶段 B 切换时旧 `ubean` 包用户升级出现破坏性变更 | 用户感知中断 | 严格保证 `packages/ubean/src/index.ts` 的 re-export 覆盖所有原 API,通过对比测试验证 |
| `optimizeDeps.exclude` 列表需更新 | Vite 预构建错误 | 在 `@ubean/vite` 的 `config()` hook 中列出所有 `@ubean/*` 子包 |
| elegant-router 类型增强与 ubean 现有 `RouteMeta` 扩展冲突 | 类型重复声明 | 统一在 `@ubean/runtime` 中维护 `RouteMeta` 扩展,`typed-router.d.ts` 仅声明 `RouteNamedMap` |
| 子包版本不一致 | 用户安装不兼容组合 | 主包 `ubean` 锁定所有子包版本;`@ubean/core` 也锁定;独立使用子包时通过 peerDeps 声明兼容范围 |

## 10. 实施路径与时间预估

### 阶段 0:准备(0.5 天)
- [ ] 创建 `packages/<subpkg>/` 目录骨架(共 23 个新包)
- [ ] 配置 `tsconfig.json` 的 `references`,支持子包增量编译
- [ ] 更新 `pnpm-workspace.yaml`(已自动包含 `packages/*`,无需改动)
- [ ] 原 `packages/ubean` 保持不变

### 阶段 1:基础层(2-3 天)
- [ ] `@ubean/types` ← `src/types/handler.ts`
- [ ] `@ubean/utils` ← `src/utils/`、`core/utils/`
- [ ] `@ubean/markdown` ← `core/markdown/`
- [ ] `@ubean/error` ← `runtime/error.ts`
- [ ] `@ubean/env` ← `runtime/env.ts`
- [ ] `@ubean/seo` ← `runtime/seo.ts`
- [ ] `@ubean/i18n` ← `runtime/{i18n,i18n-routing}.ts`
- [ ] `@ubean/pages` ← `runtime/pages/`

### 阶段 2:路由与后端(3-4 天)⭐ 含 elegant-router 增强
- [ ] `@ubean/routing` ← `core/routing/`
  - 剥离 `define-page.ts` 的 vue-router 类型扩展
  - 新增 `generator/` 目录:实现 `RouteGenerator` 类
  - 实现 4 个生成文件函数(routes/imports/shared/transformer)
  - 实现 2 个类型声明函数(ubean-router.d.ts/typed-router.d.ts)
  - 实现 ts-morph 增量更新
  - 实现路由备份/恢复
- [ ] `@ubean/api-routes` ← `runtime/{handler,router,route-rules,internal-fetch,internal/openapi}.ts`
- [ ] `@ubean/server` ← 合并 12 个服务端原语文件
- [ ] `@ubean/app` ← `runtime/{app,define-server}.ts`
- [ ] `@ubean/config` 增强:新增 `RoutingConfig` 类型与默认值

### 阶段 3:Vue 专属(3-4 天)
- [ ] `@ubean/runtime` ← `runtime/vue/`(改造 import 路径 + 加入 vue-router 类型扩展)
- [ ] `@ubean/islands` ← `core/islands/` + `runtime/vue/islands.ts`
- [ ] `@ubean/ssr` ← `core/vue/renderer.ts`
- [ ] `@ubean/vite` ← `core/vue/{plugin,virtual-modules}.ts`

### 阶段 4:构建工具(2-3 天)
- [ ] `@ubean/auto-imports` ← `core/auto-imports/`
- [ ] `@ubean/build` ← `core/build/`(集成路由生成器,根据 `routing.mode` 触发实体文件生成)
- [ ] `@ubean/prerender` ← `core/prerender/`
- [ ] `@ubean/preset` ← `core/preset/`
- [ ] `@ubean/codegen` ← `core/codegen/`(增强:生成 `ubean-router.d.ts`/`typed-router.d.ts`)
- [ ] `@ubean/modules` ← `core/modules/`
- [ ] `@ubean/dev-server` ← `core/dev/`
- [ ] `@ubean/cli` ← `core/cli/` + 新增 5 个路由管理命令

### 阶段 5:聚合器(1 天)
- [ ] 创建 `packages/core/`,实现 `src/index.ts`(纯 re-export)
- [ ] 实现 `bin/ubean-next.mjs`(委托给 `@ubean/cli`)
- [ ] 实现 `src/vite.ts`(默认 `ubeanPlugin` 组合 `@ubean/build` + `@ubean/vite` + `@ubean/islands`)
- [ ] 全量验证:`pnpm typecheck` + `pnpm test` + `pnpm dev` + `pnpm build`

### 阶段 6:示例与文档(2-3 天)
- [ ] 新增 `examples/frontend-only/` — 场景 B 示例(SPA,无后端)
- [ ] 新增 `examples/routing-file-mode/` — 路由实体文件模式示例
- [ ] 升级 `examples/ubean-test/` 为 `routing-virtual-mode/` 示例
- [ ] 更新 `AGENTS.md` 反映新包结构
- [ ] 更新 `skills/ubean/docs/` 增加路由生成模式文档
- [ ] CI 矩阵:`pnpm -r typecheck && pnpm -r test && pnpm -r build`

### 阶段 7:聚合器切换(1 天)⭐
- [ ] `packages/ubean/src/` 删除原代码(已迁移到子包)
- [ ] `packages/ubean/src/index.ts` 改为 `export * from '@ubean/core'`
- [ ] `packages/ubean/bin/ubean.mjs` 改为转发到 `@ubean/core/bin/ubean.mjs`
- [ ] `packages/core/bin/ubean-next.mjs` 改名为 `ubean.mjs`
- [ ] `packages/ubean/package.json` 的 `dependencies` 改为 `@ubean/core: workspace:*`
- [ ] `packages/core/package.json` 的 `bin` 改为 `{ "ubean": "./bin/ubean.mjs" }`
- [ ] 验证清单(见 §8.4)全部通过
- [ ] 发布 `ubean@1.0.0`(对外用户感知:零破坏)

### 阶段 8:旧代码退役(可选,2.0 时)
- [ ] 在 `packages/ubean` 中将 `@ubean/core` 标记为推荐入口
- [ ] 评估是否合并 `packages/ubean` 与 `packages/core`(可选)

**总工作量**: 15-18 个工作日(单人)
