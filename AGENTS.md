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
├── packages/
│   ├── ubean/              # 主包 (npm: "ubean") — 核心运行时 + 构建时 + CLI
│   ├── devtools/           # @ubean/devtools — DevTools 独立包
│   ├── ubean-auth/         # @ubean/auth — Better Auth 集成
│   ├── ubean-icon/         # @ubean/icon — Iconify 集成
│   ├── ubean-pwa/           # @ubean/pwa — PWA manifest + service worker
│   ├── ubean-image/         # @ubean/image
│   ├── ubean-content/       # @ubean/content
│   └── ubean-fonts/         # @ubean/fonts
├── examples/ubean-test/     # 完整示例 + 测试
├── skills/ubean/            # AI Skill（含使用指南和 API 参考）
├── docs/                     # 架构/工程/路线图文档
└── AGENTS.md                 # 本文件
```

主包 `packages/ubean/src/` 内部分为：

- `core/` — 构建时：`auto-imports/`、`build/`（virtual + vite 插件）、`cli/`、`codegen/`、`config/`、`dev/`、`devtools/`、`islands/`、`markdown/`、`modules/`、`prerender/`、`preset/`、`routing/`、`vue/`
- `runtime/` — 运行时：`app.ts`、`handler.ts`、`router.ts`、`cache.ts`、`database.ts`、`storage.ts`、`queue.ts`、`cron.ts`、`websocket.ts`、`sse.ts`、`env.ts`、`i18n.ts`、`seo.ts`、`route-rules.ts`、`rate-limit.ts`、`cors.ts`、`observability.ts`、`internal-fetch.ts`、`pages/`、`vue/`、`internal/`

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

`DefineAppOptions` 字段：`plugins`、`globalComponents`、`provides`、`head`、`rootId`、`rootAttrs`、`onAppCreated`、`onClientReady`、`errorComponent`、`loadingComponent`、`viewTransitions`

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

### 客户端

| API                                                  | 说明                           |
| ---------------------------------------------------- | ------------------------------ |
| `createClient(options)` / `defaultClient`            | HTTP 客户端                    |
| `get`/`post`/`put`/`patch`/`delete`/`head`/`options` | 便捷方法（throw on error）     |
| `$get`/`$post`/`$put`/`$patch`/`$delete`             | flat 模式（`{ data, error }`） |

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

- 构建时生成 `manifest.webmanifest` + `sw.js`
- `registerType`：`autoUpdate` | `prompt` | `manual`
- 5 种缓存策略
- `usePwa()`：`isInstalled`/`isUpdateAvailable`/`isOfflineReady`/`needRefresh`

## 6. 虚拟模块

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
| 架构文档 | [docs/](docs/)                                                       | 架构、工程规范、路线图                                      |
| 使用指南 | [skills/ubean/docs/guide/](skills/ubean/docs/guide/)                 | 快速开始、页面路由、i18n、Islands                           |
| 集成指南 | [skills/ubean/docs/integrations/](skills/ubean/docs/integrations/)   | Auth、Database、Icons                                       |
| API 参考 | [skills/ubean/docs/reference/api/](skills/ubean/docs/reference/api/) | Cache、Database、Env、i18n、Route Helpers、Response Helpers |
| CLI 命令 | [skills/ubean/command/ubean.md](skills/ubean/command/ubean.md)       | CLI 命令文档                                                |
| 示例项目 | [examples/ubean-test/](examples/ubean-test/)                         | 完整示例 + 测试                                             |
