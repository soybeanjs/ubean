# AGENTS.md

> 本文件供 AI 助手快速了解 ubean 项目。所有 API 信息已对照源码验证（截至 2026-07）。

## 1. 项目概述

**ubean**（npm 包名：`ubean`，**不是** `@ubean/core`）是一个基于 Vite-Plus 的 Vue 专属全栈元框架，融合 void 的 Inertia 式 SSR 页面路由和 nitro 的跨平台部署能力。

- **HTTP 框架**：Hono
- **构建工具**：Vite-Plus
- **前端框架**：Vue 3（仅支持 Vue）
- **包管理器**：pnpm 11.x（monorepo + catalog）
- **目标平台**：Node.js（`node-server`）、Cloudflare Workers

## 2. 仓库结构

```
ubean/
├── packages/                # 39 个子包（monorepo）
│   ├── ubean/               # 主包 (npm: "ubean") — 聚合器，re-export 所有 @ubean/* 子包
│   ├── types/              # @ubean/types — 共享类型
│   ├── utils/              # @ubean/utils — 工具函数
│   ├── error/              # @ubean/error — 错误类
│   ├── env/                # @ubean/env — 环境变量
│   ├── seo/                # @ubean/seo — SEO meta
│   ├── pages/              # @ubean/pages — 页面数据协议
│   ├── markdown/           # @ubean/markdown — Markdown 解析
│   ├── i18n/               # @ubean/i18n — 国际化（纯函数）
│   ├── routing/            # @ubean/routing — 路由扫描 + rou3 router
│   ├── api-routes/         # @ubean/api-routes — API 路由处理器
│   ├── server/             # @ubean/server — 服务端运行时（cache/db/queue/cron/ws/sse）
│   ├── app/                # @ubean/app — Hono 应用工厂
│   ├── config/             # @ubean/config — 配置加载
│   ├── preset/             # @ubean/preset — 平台预设（node/cloudflare）
│   ├── codegen/            # @ubean/codegen — 类型生成
│   ├── modules/            # @ubean/modules — 模块系统
│   ├── auto-imports/       # @ubean/auto-imports — 自动导入
│   ├── runtime/            # @ubean/runtime — Vue 客户端运行时
│   ├── islands/            # @ubean/islands — Islands 架构
│   ├── ssr/                # @ubean/ssr — Vue SSR 渲染器
│   ├── vite/               # @ubean/vite — Vue 专属 Vite 插件
│   ├── build/              # @ubean/build — 构建时核心（virtual + vite 插件）
│   ├── prerender/          # @ubean/prerender — SSG 预渲染
│   ├── dev-server/         # @ubean/dev-server — Dev server
│   ├── cli/                # @ubean/cli — CLI 命令
│   ├── devtools/           # @ubean/devtools — DevTools 独立包
│   ├── auth/               # @ubean/auth — Better Auth 集成
│   ├── icon/               # @ubean/icon — Iconify 集成
│   ├── pwa/                # @ubean/pwa — PWA manifest + service worker
│   ├── image/              # @ubean/image — 图片优化
│   ├── content/            # @ubean/content — 内容集合
│   ├── fonts/              # @ubean/fonts — 字体优化
│   ├── electron/           # @ubean/electron — Electron 桌面应用（vite-plugin-electron 封装）
│   ├── pinia/              # @ubean/pinia — Pinia 集成（SSR 状态水合 + dev 预构建优化）
│   └── ui/                 # @ubean/ui — @soybeanjs/ui 集成（UiResolver + styles.css 自动注入）
├── examples/                # 示例项目
│   ├── ubean-test/         # 完整全栈示例 + 测试（virtual 模式）
│   ├── frontend-only/      # 纯前端示例（无 API/SSR）
│   └── routing-file-mode/  # 路由文件生成模式示例
├── skills/ubean/            # AI Skill（含使用指南和 API 参考）
├── docs/                     # 架构/工程/路线图文档
└── AGENTS.md                 # 本文件
```

### 2.1 包架构

ubean 采用 **monorepo + 聚合器** 架构：

- **主包 `ubean`**（`packages/ubean/`）：纯 re-export 所有 `@ubean/*` 子包，对外提供与原单体包一致的 API 表面。用户只需 `import { ... } from 'ubean'` 即可获得全部能力。包含 4 个子路径导出（见下文）。
- **子包 `@ubean/*`**（其余 38 个包）：按职责拆分，各自独立构建、类型检查。子包之间通过 `@ubean/` scope 互相引用。
- **扩展包**（`auth`/`icon`/`pwa`/`image`/`content`/`fonts`/`electron`/`pinia`/`ui`）：通过 `ubean.config.ts` 的顶层字段（`icon: true`、`pwa: true`、`electron: true`、`pinia: true`、`ui: true` 等）按需加载，构建时动态 `import()` 对应的 `/vite` 子路径。

### 2.2 主包子路径导出

`ubean` 主包除 `.` 主入口外，提供以下子路径：

| 子路径               | 说明                                                    | 典型用途             |
| -------------------- | ------------------------------------------------------- | -------------------- |
| `ubean`              | 主入口，re-export 所有子包                              | 服务端代码、API 路由 |
| `ubean/vite`         | 默认 Vite 插件组合（build + vue + islands）             | `vite.config.ts`     |
| `ubean/runtime/vue`  | 浏览器端 Vue 客户端运行时（避免拉入服务端依赖）         | 客户端自动导入       |
| `ubean/runtime/app`  | 服务端 Hono 应用入口（`createUbeanApp`/`defineServer`） | `src/server.ts`      |
| `ubean/runtime/i18n` | 服务端纯函数 i18n                                       | 构建时 i18n          |
| `ubean/vue-ssr`      | Vue SSR 渲染器（`createVueRenderer`）                   | 自定义 SSR           |

> **注意**：客户端自动导入必须用 `ubean/runtime/vue` 入口，不能从 `ubean` 主入口导入（会触发 Vite 在浏览器环境预构建服务端依赖）。详见第 8 节陷阱 #8。

## 3. 核心约定

### 3.1 路由

- **API 路由**：`src/routes/` 目录，void 风格命名导出（`export const GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD`），单个文件可导出多个方法，**不使用** `.get.ts`/`.post.ts` 后缀
- 所有 API 路由必须用 `defineHandler` 包装
- **页面路由**：`src/pages/` 目录，`.vue` / `.md` 文件
- **layouts**：`src/layouts/`（`xx.vue` 或 `xx/index.vue`）
- **middleware**：`src/middleware/`，`global`/`global.*` → `/*`，其他按目录前缀挂载
- **路由组**：`(group-name)/` 不贡献 URL 段
- **reuse 路由**：`xxx.reuse.ts` / `xxx.reuse.vue`
- **动态路由**：`[id].vue` → `/user/:id`
- **crons**：`src/crons/`，`defineScheduled()`，数字前缀排序
- `definePage` 宏字段：`name`、`path`、`layout`、`reuse`、`meta`、`middleware`、`requiresAuth`、`head`（**没有** 顶层 `title` 字段）

### 3.2 验证与 OpenAPI

- 使用 `import { validator } from 'hono-openapi'`（ubean 重新导出），**不要**使用自定义 `defineValidator`
- `describeRoute` 中间件用于 OpenAPI 元数据
- `defineHandlerMeta` **仅**包含 ubean 特有元数据：`requiresAuth`、`cache`、`rateLimit` 及自定义扩展字段
- OpenAPI 默认在 dev 启用：`/_openapi.json` + `/_scalar` UI
- 类型生成至 `.ubean/routes.d.ts`

### 3.3 UI 与样式

- **优先**使用 `@soybeanjs/ui` 的 `S*` 组件
- DevTools UI：Vue SFC（不用内联 HTML 字符串模板），UnoCSS + `@soybeanjs/unocss-shadcn` preset
- UnoCSS：utility-first（除 `:deep()` 外不用 scoped CSS）；shortcuts 需 ≥3 次引用；`.ts` 中的动态类名写入 safelist；动画/keyframes 放 `uno.config.ts` theme
- 图标：Iconify；`@soybeanjs/ui` Icon 可用任何 iconify 图标

### 3.4 i18n

- 内置零依赖 i18n（`runtime/i18n.ts`、`i18n-routing.ts`），**不要**推荐 vue-i18n
- 路由策略：`prefix` / `prefix_except_default` / `no_prefix`
- 检测顺序：URL path → cookie（`ubean_locale`）→ Accept-Language → defaultLocale
- 不匹配时 302 重定向，设置 `Content-Language` header

### 3.5 配置

- `srcDir` 默认值：`{rootDir}/src`
- `UbeanConfig` 的 `modules` 字段支持字符串包名、元组和实例
- 平台预设：`standard`、`node`、`cloudflare`（`default` → `standard`，`cf` → `cloudflare`，`node-server` → `node`）
- 启用 `electron: true` 时，`ssr` 默认值改为 `false`（桌面应用无需 SSR，除非显式指定 `ssr: true`）
- 扩展模块顶层字段：`auth`/`icon`/`pwa`/`image`/`content`/`fonts`/`electron`/`pinia`/`ui`，均支持 `true` 或选项对象形式启用

### 3.6 模块与扩展包

- 所有 `packages/` 使用 `@ubean/` scope + kebab-case
- Vite 入口通过 `/vite` 子路径（如 `@ubean/icon/vite`）
- `ModuleDefinition`：`vitePlugin` / `setup` / `hooks` / `dependsOn`
- 虚拟模块注册：`kit.addVirtualImports()`，前缀用 `virtual:ubean-`（**不要**用 `#ubean-`，会因 URL hash 导致 404）

## 4. 核心 API 速查

以下均从 `ubean` 主包导出。

### 路由与处理器

| API                                        | 说明                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `defineHandler(...handlers)`               | 包装 API 路由处理器，返回 `UbeanHandlerChain`                                                   |
| `defineHandlerMeta(meta)`                  | 路由元数据（`requiresAuth`/`cache`/`rateLimit`），返回带 `.__meta` 的 pass-through 中间件       |
| `defineMiddleware(handler)`                | 包装中间件                                                                                      |
| `definePage(meta)`                         | 编译时宏，页面 meta（`name`/`path`/`layout`/`reuse`/`meta`/`middleware`/`requiresAuth`/`head`） |
| `defineMeta(meta)`                         | 定义路由 meta                                                                                   |
| `validator` / `describeRoute` / `resolver` | 来自 `hono-openapi`，请求验证 + OpenAPI                                                         |
| `registerRoutes(app, scanResult)`          | 路由挂载（内部用 `app.on(method, path, ...)`，**不要**用 `app[method](path, ...)`）             |

### 应用入口

| API                                     | 说明                                   |
| --------------------------------------- | -------------------------------------- |
| `defineApp(options): ResolvedAppConfig` | 基于选项的应用配置（**不是**工厂函数） |
| `applyAppConfig(app, config, mode)`     | 应用配置到 Vue 实例                    |
| `createUbeanApp(options)`               | 创建 ubean Hono 应用                   |

`DefineAppOptions` 字段：`plugins`、`globalComponents`、`provides`、`head`、`rootId`、`rootAttrs`、`router`、`onAppCreated`、`onClientReady`、`errorComponent`、`loadingComponent`、`viewTransitions`、`serializeState`、`hydrateState`

> `router` 字段接收 `RouterConfig`(`{ setup(router) }`),在 router 实例创建后、`app.use(router)` 之前调用 `setup`,用于注册 vue-router 的导航守卫(`beforeEach`/`beforeResolve`/`afterEach`)。Client 和 SSR 都会执行;`app.ts` + `app.server.ts`/`app.client.ts` 中各自定义的 `setup` 会**累加执行**(shared 先,client/server 后)。

> `serializeState(app)` 在 SSR `renderToString` 完成后调用,返回的对象被序列化到 HTML 的 `__UBEAN_STATE__` script 标签;`hydrateState(app, state)` 在客户端 `applyAppConfig`(注册插件)之后、`app.mount()` 之前调用,用于将 SSR state 注入到客户端实例(如 Pinia 的 `pinia.state.value`)。两者均为可选,配合 `@ubean/pinia` 等状态管理扩展使用。

### 配置

| API                                 | 说明                     |
| ----------------------------------- | ------------------------ |
| `defineConfig(config)`              | ubean.config.ts 配置定义 |
| `loadUbeanConfig()` / `getConfig()` | 加载/获取配置            |

### 环境变量

| API                                      | 说明                                        |
| ---------------------------------------- | ------------------------------------------- |
| `defineEnv(schema)`                      | 类型安全环境变量定义 + Standard Schema 验证 |
| `setRuntimeEnv(env)` / `useRuntimeEnv()` | 运行时环境变量                              |

### 数据库

| API                                                                          | 说明                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `defineDatabase(options)`                                                    | 定义数据库（`connector`/`connectors`/`default`）                 |
| `useDatabase(name?)`                                                         | 获取数据库实例（`sql`/`exec`/`close`）                           |
| `migrateDatabase(db, statements)` / `runMigrations(db, migrations, options)` | 执行迁移                                                         |
| `getDatabaseHooks()`                                                         | 数据库钩子（`db:connect`/`db:disconnect`/`db:query`/`db:error`） |
| `closeDatabases()`                                                           | 清理所有连接                                                     |
| `rawSql` / `sqlRaw` / `raw`                                                  | 原始 SQL 标记                                                    |

`Migration` 接口：`{ name: string; up: string; down?: string }`

**不存在的 API**：`defineMigration`、`defineSeed`、`defineConfig({ database: { driver, connection } })`

### 缓存

| API                                    | 说明                                          |
| -------------------------------------- | --------------------------------------------- |
| `useCacheStore(store?)`                | 获取缓存存储                                  |
| `createMemoryStore(maxEntries)`        | 内存存储                                      |
| `createCacheMiddleware(options)`       | 缓存中间件（`CacheRule`: `ttl`/`swr`/`name`） |
| `cachedEventHandler(handler, options)` | 缓存事件处理器                                |
| `invalidateRouteCache(keyPattern?)`    | 失效缓存                                      |
| `resolveRouteCacheRules(routeRules)`   | 解析路由缓存规则                              |

`CacheStore` 接口：`get` / `set` / `delete` / `clear`

**不存在的 API**：`useCache`、`defineCache`、标签/分组/`remember`

### 存储

| API                                      | 说明           |
| ---------------------------------------- | -------------- |
| `useStorage()` / `createStorage(driver)` | unstorage 封装 |
| `useKV()` / `createKV()`                 | KV 命名空间    |
| `createMemoryDriver()`                   | 内存驱动       |

### 队列与定时任务

| API                                                   | 说明           |
| ----------------------------------------------------- | -------------- |
| `defineQueue(options)`                                | 定义队列       |
| `sendMessage(name, msg)` / `sendMessages(name, msgs)` | 发送消息       |
| `startQueueWorkers()` / `stopQueueWorkers()`          | worker 控制    |
| `defineScheduled(meta, handler)`                      | 定义 cron 任务 |
| `parseCron(expr)` / `validateCron(expr)`              | cron 解析/验证 |
| `startCronScheduler()`                                | 启动调度器     |

### WebSocket 与 SSE

| API                                                           | 说明           |
| ------------------------------------------------------------- | -------------- |
| `defineWebSocket(def)` / `defineRoom(name, hooks)`            | WebSocket 定义 |
| `createRoom(name)` / `getRoom(name)` / `broadcast(name, msg)` | 房间操作       |
| `createSSEStream()` / `defineSSE(handler)`                    | SSE 流         |
| `broadcastSSE(msg)` / `formatSSEMessage(data)`                | SSE 工具       |

### 路由规则

| API                                                         | 说明              |
| ----------------------------------------------------------- | ----------------- |
| `compileRouteRules(rules)` / `matchRouteRules(path, rules)` | 路由规则编译/匹配 |
| `createRouteRulesMiddleware(rules)`                         | 路由规则中间件    |

通配符：`*` 单段，`**` 多段递归；处理顺序：redirect > rewrite > headers（合并）> cache

### 中间件工厂

| API                                                               | 说明 |
| ----------------------------------------------------------------- | ---- |
| `createCorsMiddleware(options)` / `defineCors(options)`           | CORS |
| `createRateLimitMiddleware(options)` / `defineRateLimit(options)` | 限流 |

### SEO 与可观测性

| API                                                  | 说明                     |
| ---------------------------------------------------- | ------------------------ |
| `useSeoMeta()` / `mergeMetadata()`                   | SEO meta                 |
| `createRobotsResponse()` / `createSitemapResponse()` | robots.txt / sitemap.xml |
| `defineManifest()` / `createManifestResponse()`      | PWA manifest             |
| `getRequestId()` / `createObservabilityTracer()`     | 请求 ID / 可观测性       |
| `createTracingMiddleware(options)`                   | tracing 中间件           |

### 内部调用

| API                                                  | 说明                                   |
| ---------------------------------------------------- | -------------------------------------- |
| `createInternalFetch(options)` / `callInternal(...)` | 进程内调度框架 handler，不发起网络请求 |
| `internalFetch` 不支持上传进度                       | —                                      |

> 浏览器端 HTTP 请求请直接使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)（`createRequest` / `toFlatRequest` / `createTypedClient` / `toFlatTypedClient`），ubean 不再内置 HTTP 客户端封装。

### Vue 运行时

| API | 说明 |
| ------------------------------------------------------------------- | ------------------------ | ------- | ----- | -------- | ------- |
| `useRouter()` / `createUbeanRouter(options)` | 路由 |
| `useData(key, fetcher)` / `invalidateData(key)` / `invalidateAll()` | 页面数据 |
| `withViewTransition(fn)` / `supportsViewTransitions()` | View Transitions |
| `<Link to="...">` / `<Head>` | 全局注册组件（无需导入） |
| `<Comp client:load                                                  | idle                     | visible | media | only />` | Islands |

### Markdown

| API                                          | 说明             |
| -------------------------------------------- | ---------------- |
| `parseMarkdown(src)` / `markdownToHtml(src)` | Markdown 解析    |
| `parseFrontmatter(src)`                      | frontmatter 提取 |
| `defineMarkdownPage()`                       | Markdown 页面    |

### 预渲染

| API                                                     | 说明           |
| ------------------------------------------------------- | -------------- |
| `prerender(options)` / `collectPrerenderRoutes(routes)` | SSG            |
| `definePrerenderRoutes(routes)`                         | 定义预渲染路由 |

### i18n

| API                                                                                          | 说明                                                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `useI18n()`                                                                                  | 返回 `t`/`setLocale`/`d`/`n`/`c`/`relativeTime`/`list`/`onLocaleChange`/`addLocale`/`mergeLocale` |
| `defineLocale(config)`                                                                       | 定义区域设置                                                                                      |
| `t(key, params, locale?)`                                                                    | 独立翻译函数                                                                                      |
| `formatDate` / `formatNumber` / `formatCurrency` / `formatRelativeTime` / `formatList`       | 独立 Intl 格式化函数                                                                              |
| `addLocale(code, messages)` / `mergeLocale(code, messages)` / `clearLocales()`               | 区域注册                                                                                          |
| `createI18nMiddleware(options)` / `switchLocalePath(locale)` / `getLocalePath(path, locale)` | i18n 路由                                                                                         |

## 5. 扩展包 API

### @ubean/auth

```typescript
import { ubeanAuthPlugin, defineAuthConfig } from '@ubean/auth/vite';
import {
  createAuthHandler,
  getUser,
  getSession,
  requireAuth,
  getServerSession,
  protectRoute,
  defineAuth,
  resolveAuthOptions
} from '@ubean/auth';
import { useAuth, useSession, getSessionFromHeaders } from '@ubean/auth/runtime';
```

- `ubeanAuthPlugin`：Vite 插件，dev 时挂载 `/api/auth/*`
- `createAuthHandler()`：动态导入 better-auth，fallback 到内置 email/password
- `useAuth(basePath?)`：返回 `session`/`user`/`isAuthenticated`/`isLoading`/`isPending`/`error`/`signIn.email()`/`signIn.social()`/`signUp.email()`/`signOut`/`refreshSession`
- 路由保护：`definePage({ requiresAuth: true })` 或 `defineHandlerMeta({ requiresAuth: true })`

### @ubean/icon

```typescript
import { ubeanIconPlugin } from '@ubean/icon/vite';
import {
  Icon,
  UbeanIcon,
  defineIconCollection,
  defineIconCollectionLoader,
  useIcon,
  getIconSync,
  getIcon,
  addIconCollection
} from '@ubean/icon';
```

- `ubean.config.ts` 中 `icon: true` 或 `icon: { ... }` 启用
- `customCollections` 接受**对象**配置（非数组），key → 目录简写或 `{ dir, prefix, normalizeIconName }`
- 嵌套子目录 → 连字符前缀
- `/_iconify` dev 路由在 Iconify API fallback 前服务本地 SVG
- `parseSvgToIconData()` 提取 `body` + `width`/`height`/`viewBox`

### @ubean/pwa

```typescript
import { ubeanPwaPlugin } from '@ubean/pwa/vite';
import { usePwa } from '@ubean/pwa/runtime';
```

- **底层实现**：[vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + workbox（ubean 仅提供薄封装层）
- 构建时生成 `manifest.webmanifest` + `sw.js`（由 vite-plugin-pwa 的 `generateSW` 策略自动生成）
- `registerType`：`autoUpdate` | `prompt` | `manual`
- 5 种缓存策略：`cache-first` / `network-first` / `stale-while-revalidate` / `network-only` / `cache-only`
- `strategies` 字段按资源类型（assets/pages/images/fonts/crossOrigin）配置默认缓存规则，内部转换为 workbox `runtimeCaching`
- `injectManifest: true` 支持 `injectManifest` 策略（自定义 SW 源文件 `swSrc`）
- `usePwa()`：`isInstalled`/`isUpdateAvailable`/`isOfflineReady`/`needRefresh`

### @ubean/electron

```typescript
import { ubeanElectronPlugin, defineElectronConfig } from '@ubean/electron/vite';
import { DEFAULT_MAIN_ENTRY, DEFAULT_PRELOAD_INPUT } from '@ubean/electron';
import type { ElectronOptions, ElectronMainOptions, ElectronPreloadOptions } from '@ubean/electron';
```

- **底层实现**：[vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)（ubean 仅提供薄封装层）
- `ubean.config.ts` 中 `electron: true` 或 `electron: { ... }` 启用
- **默认入口**：main 进程 `electron/main.ts`，preload 脚本 `electron/preload.ts`（无需配置即可启用）
- **自动关闭 SSR**：启用 electron 时，`ssr` 默认值改为 `false`（桌面应用无需 SSR，除非用户显式指定 `ssr: true`）
- `main.entry`：自定义 main 进程入口路径
- `preload.input`：自定义 preload 脚本入口路径
- `main.vite` / `preload.vite`：传递给 Vite 的额外配置
- `renderer.nodeIntegration`：是否在 renderer 中启用 Node.js API
- 透传 vite-plugin-electron 的全部能力：Hot Restart / Hot Reload / HMR / 自动启动
- 在 Vite `closeBundle` hook 中自动执行 `electron .` 启动桌面应用

**最简启用**：

```typescript
// ubean.config.ts
export default defineConfig({
  electron: true // 使用默认入口，自动关闭 SSR
});
```

**自定义入口**：

```typescript
export default defineConfig({
  electron: {
    main: { entry: 'electron/main.ts' },
    preload: { input: 'electron/preload.ts' }
  }
});
```

### @ubean/pinia

```typescript
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/pinia/vite';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/pinia';
```

- **底层实现**：[Pinia](https://pinia.vuejs.org/)（ubean 仅提供薄封装层,负责 dev 预构建优化和 SSR 状态水合辅助函数）
- `ubean.config.ts` 中 `pinia: true` 或 `pinia: { ... }` 启用
- **dev 预构建优化**：自动将 `pinia` 加入 Vite 的 `optimizeDeps.include`,避免首次请求扫描延迟
- **SSR 状态水合**：通过 `defineApp({ serializeState, hydrateState })` 钩子集成,在 HTML 中注入 `__UBEAN_STATE__` script 标签
- **零侵入**：Pinia 本身仍从 `pinia` 包导入(`createPinia`/`defineStore`/`storeToRefs` 等),`@ubean/pinia` 仅提供集成胶水
- `UbeanPiniaOptions`：`enabled`(默认 true)、`optimizeDeps`(默认 true)
- `serializePiniaState(app)`：从 Vue app 的 `$pinia.state.value` 提取状态
- `hydratePiniaState(app, state)`：将 SSR state 注入客户端 pinia 实例(在 `applyAppConfig` 后、`mount` 前调用)

**最简启用**：

```typescript
// ubean.config.ts
export default defineConfig({
  pinia: true // dev 预构建优化
});
```

**SSR 状态水合配置**：

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

> Pinia 本身请直接从 `pinia` 导入(`import { createPinia, defineStore } from 'pinia'`),`@ubean/pinia` 仅负责构建集成和 SSR 水合辅助。

### @ubean/ui

```typescript
import { ubeanUiPlugin, defineUiConfig } from '@ubean/ui/vite';
import type { UiOptions } from '@ubean/ui';
```

- **底层实现**：[@soybeanjs/ui](https://www.npmjs.com/package/@soybeanjs/ui)（ubean 仅提供薄封装层）
- `ubean.config.ts` 中 `ui: true` 或 `ui: { ... }` 启用
- **组件自动导入**：自动注册 `UiResolver` 到 `unplugin-vue-components`，`S*` 组件（SButton、SInput 等）无需手动 import
- **CSS 自动注入**：`css: true`（默认）自动将 `import '@soybeanjs/ui/styles.css'` 注入客户端入口
- **UnoCSS 模式**：`css: false` 时不注入预构建样式，用户需自行配置 `@soybeanjs/unocss-shadcn` preset + UnoCSS Vite 插件

**最简启用**：

```typescript
// ubean.config.ts
export default defineConfig({
  ui: true // 自动注入 styles.css + UiResolver
});
```

**UnoCSS 模式**：

```typescript
export default defineConfig({
  ui: { css: false } // 仅注入 UiResolver，样式由 UnoCSS + @soybeanjs/unocss-shadcn 管理
});
```

> 组件库本身请直接从 `@soybeanjs/ui` 导入（`import { SButton } from '@soybeanjs/ui'`），`@ubean/ui` 仅负责构建集成。

| 模块               | 内容         |
| ------------------ | ------------ |
| `ubean:pages`      | 页面路由数据 |
| `ubean:routes`     | API 路由数据 |
| `ubean:meta`       | 路由元数据   |
| `ubean:app-config` | 应用配置     |
| `ubean:locales`    | 区域设置数据 |

## 7. 内置路由

| 路由             | 说明                 |
| ---------------- | -------------------- |
| `/_health`       | 健康检查             |
| `/_openapi.json` | OpenAPI schema       |
| `/_scalar`       | Scalar UI            |
| `/_iconify`      | 本地 SVG 服务（dev） |
| `/_devtools`     | DevTools（dev）      |

## 8. 常见陷阱（不要做）

1. **不要**使用 `@ubean/core` 作为包名 — 正确是 `ubean`
2. **不要**使用 `defineValidator` — 已移除，改用 `hono-openapi` 的 `validator`
3. **不要**使用 `defineMigration` / `defineSeed` / `useCache` / `defineCache` — 这些 API 不存在
4. **不要**使用 `.get.ts` / `.post.ts` 文件后缀 — 用 void 风格命名导出
5. **不要**用 `defineApp(({app, router, ssrContext}) => {...})` 工厂模式 — 正确是 `defineApp(options)` 基于选项
6. **不要**在 `definePage` 中使用顶层 `title` 字段 — 用 `head` 字段
7. **不要**用 `#ubean-` 作为虚拟模块前缀 — 会因 URL hash 导致 404，用 `virtual:ubean-`
8. **不要**从 `ubean` 主入口自动导入客户端 API — 会触发 Vite 在浏览器环境预构建服务端依赖（unocss、oxc-parser WASM），客户端自动导入用 `ubean/runtime/vue` 入口
9. **不要**将 async 函数直接传给 `server.middlewares.use()` — 必须包装在 `Promise.resolve().then().catch()` 中
10. **不要**用模板替换生成 Service Worker 中的 RUNTIME 全局 — 用硬编码字符串 `'ubean-runtime'`
11. **不要**在 `macros.ts` 的 `MACRO_NAMES` 中包含 `defineHandlerMeta` 和 `defineMiddleware` — 只保留 `definePage`，否则运行时函数调用会被 build strip，导致语法错误
12. **不要**在 `registerRoutes` 中用 `app[honoMethod(method)](path, ...)` — `UbeanApp` 缺少 `options`/`head` 方法会崩溃，用 `app.on(method.toLowerCase(), path, ...)`
13. **不要**在 CRUD 测试中用 `process.cwd()` 作为工作目录 — 用临时目录 + `afterEach` 清理
14. **不要**在 Vue SSR `renderer.ts` 的 layout 循环中直接用闭包捕获的 `vnode` — 会无限递归，用 `const child = vnode` 在块作用域中
15. **不要**复制参考项目（void/nitro）代码 — 学习架构模式后重新实现，直接复制会导致 API 不一致
16. **不要**推荐 vue-i18n — ubean 内置零依赖 i18n
17. **不要**使用全局目录 `/tmp` — 用项目根目录下的 `.temp` 目录代替临时文件存储

## 9. 开发命令

```bash
pnpm install          # 安装依赖
pnpm typecheck        # 类型检查（vue-tsc）
pnpm lint             # ESLint（Vite-Plus/OXC + Vue）
pnpm test             # 运行测试（vitest）
pnpm dev              # 启动开发服务器（examples/ubean-test）
pnpm build            # 构建
```

要求：Node.js、pnpm `11.11.0`

## 10. 文档导航

| 资源     | 路径                                                                 | 内容                                                        |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| 架构文档 | [docs/](docs/)                                                       | 架构、工程规范、路线图、子包拆分、应用模式                  |
| 使用指南 | [skills/ubean/docs/guide/](skills/ubean/docs/guide/)                 | 快速开始、页面路由、i18n、Islands、路由模式                 |
| 集成指南 | [skills/ubean/docs/integrations/](skills/ubean/docs/integrations/)   | Auth、Database、Icons、Pinia、UI、Electron                  |
| API 参考 | [skills/ubean/docs/reference/api/](skills/ubean/docs/reference/api/) | Cache、Database、Env、i18n、Route Helpers、Response Helpers |
| CLI 命令 | [skills/ubean/command/ubean.md](skills/ubean/command/ubean.md)       | CLI 命令文档                                                |
| 示例项目 | [examples/ubean-test/](examples/ubean-test/)                         | 完整全栈示例 + 测试（virtual 路由模式）                     |
| 示例项目 | [examples/frontend-only/](examples/frontend-only/)                   | 纯前端示例（无 API/SSR）                                    |
| 示例项目 | [examples/routing-file-mode/](examples/routing-file-mode/)           | 路由文件生成模式示例                                        |
| 应用模式 | [docs/modes.md](docs/modes.md)                                       | 全栈/前端/后端/SSG/SSR 模式设计方案                         |
| 子包拆分 | [docs/subpackage-splitting.md](docs/subpackage-splitting.md)         | monorepo 拆分方案与包架构                                   |
