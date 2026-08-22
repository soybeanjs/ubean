# AGENTS.md

> 本文件供 AI 助手快速了解 ubean 项目。所有 API 信息已对照源码验证（截至 2026-08）。
> 仓库级工程文档索引见 [docs/README.md](docs/README.md)。

## 1. 项目概述

ubean/（npm 包名：`ubean`，**不是** `@ubean/core`）是一个基于 Vite-Plus 的 Vue 专属全栈元框架，融合 void 的 Inertia 式 SSR 页面路由和 nitro 的跨平台部署能力。

- **HTTP 框架**：Hono
- **构建工具**：Vite-Plus
- **前端框架**：Vue 3（仅支持 Vue）
- **包管理器**：pnpm 11.x（monorepo + catalog；根 `packageManager` 当前为 `pnpm@11.22.0`）
- **目标平台**：Node.js（`node-server`）、Cloudflare Workers、Vercel（Serverless + Edge）、Netlify、Bun、Deno

## 2. 仓库结构

```
ubean/
├── packages/                # 28 个包（monorepo）
│   ├── ubean/               # 主包 (npm: "ubean") — 聚合器，re-export 所有 @ubean/* 子包
│   │
│   │   ── 基础 / 共享层（leaf packages）──
│   ├── shared/              # @ubean/shared — 共享类型/错误/环境变量/通用工具；含 ./node、./logger、./logger/hono 子路径
│   ├── vue/                 # @ubean/vue — 精简 Vue 客户端内核 + 页面路由唯一所有者（插件式，vue + vue-router only；含 /vite、/generator 子路径）
│   ├── markdown/            # @ubean/markdown — Markdown 解析
│   ├── seo/                 # @ubean/seo — SEO meta
│   ├── pages/               # @ubean/pages — 页面数据协议
│   ├── i18n/                # @ubean/i18n — 国际化（@intlify/core + 约束前缀路由）
│   │
│   │   ── 服务端运行时 ──
│   ├── routes/              # @ubean/routes — 服务端路由运行时 (defineHandler + rou3 router + ISR + route-rules + OpenAPI + internal-fetch；原 api-routes)
│   ├── actions/             # @ubean/actions — Server Actions / Form Actions（defineAction + Vite 插件注入 ID）
│   ├── server/              # @ubean/server — 服务端运行时（cache/db/queue/cron/ws/sse）
│   ├── app/                 # @ubean/app — Hono 应用工厂（createUbeanApp → UbeanApp）
│   │
│   │   ── 构建时工具 ──
│   ├── builder/             # @ubean/build — Vite 插件（./vite 核心 + ./vue Vue 专属）+ 生产构建 + ./prerender SSG
│   ├── codegen/             # @ubean/codegen — 类型生成（含原 auto-imports 的 VUE_PRESET/UBEAN_CLIENT_PRESET）
│   ├── config/              # @ubean/config — 配置加载 + 模块系统（defineModule / resolveModules）
│   ├── preset/              # @ubean/preset — 平台预设（standard/node/cloudflare/vercel/netlify/bun/deno）
│   │
│   │   ── 路由扫描 ──
│   ├── scan/                # @ubean/scan — 项目扫描器 + 路由元数据聚合（页面扫描委托 @ubean/vue；原 routing 的扫描部分）
│   │
│   │   ── 客户端运行时 ──
│   ├── client/              # @ubean/client — 框架客户端运行时（基于 @ubean/vue 内核；含 /app、/define-app、/server 子路径；原 runtime）
│   │
│   │   ── 服务 / 工具 ──
│   ├── ssr/                 # @ubean/ssr — Vue SSR 渲染器
│   ├── islands/             # @ubean/islands — Islands 架构（指令转换 + 组件自动注册）
│   ├── dev-server/          # @ubean/dev-server — Dev server
│   ├── cli/                 # @ubean/cli — CLI 命令
│   ├── devtools/            # @ubean/devtools — DevTools 独立包（opt-in，不进聚合器硬依赖）
│   │
│   │   ── 扩展包 ──
│   ├── ai/                  # @ubean/ai — AI 大模型集成（defineAgent/defineAgentTool + Vue runtime，薄封装 Vercel AI SDK）
│   ├── auth/                # @ubean/auth — Better Auth 集成
│   ├── icon/                # @ubean/icon — Iconify 集成
│   ├── image/               # @ubean/image — 图片优化
│   ├── content/             # @ubean/content — 内容集合
│   └── integrations/        # @ubean/integrations — 集成包集合（pwa/fonts/electron/ui/pinia 子路径；原独立包合并）
├── apps/
│   └── docs/               # 官方文档站（指南 / 集成 / API / 架构正文）
├── examples/                # 示例项目
│   ├── ubean-test/         # 完整全栈示例 + 测试（virtual 模式）
│   ├── client-only-spa/    # 纯客户端 SPA 示例（复用 @ubean/vue 内核，无 SSR/API）
│   ├── frontend-only/      # 纯前端示例（无 API/SSR）
│   └── routing-file-mode/  # 路由文件生成模式示例
├── skills/ubean/            # AI Skill（CLI 命令文档与 agent 提示词）
├── docs/                     # 仓库级工程文档（ADR、领域词汇表、结构评估报告、产品方案）
└── AGENTS.md                 # 本文件
```

### 2.1 包架构

ubean 采用 **monorepo + 聚合器** 架构：

- **主包 `ubean`**（`packages/ubean/`）：纯 re-export 所有 `@ubean/*` 子包，对外提供与原单体包一致的 API 表面。用户只需 `import { ... } from 'ubean'` 即可获得全部能力。包含多个子路径导出（见下文）。
- **子包 `@ubean/*`**（其余 27 个包）：按职责拆分，各自独立构建、类型检查。子包之间通过 `@ubean/` scope 互相引用。
- **扩展包**（`ai`/`auth`/`icon`/`image`/`content` 独立包，`pwa`/`fonts`/`electron`/`pinia`/`ui` 为 `@ubean/integrations` 子路径）：通过 `ubean.config.ts` 的顶层字段（`icon: true`、`pwa: true`、`electron: true`、`pinia: true`、`ui: true` 等）按需加载，构建时动态 `import()` 对应的 `/vite` 子路径；**不**进入主包硬依赖。
- **客户端内核分层**：`@ubean/vue`（精简内核，vue + vue-router only）→ `@ubean/client`（框架运行时，app 工厂/unhead/i18n/数据层）→ `ubean/client`（主包一等客户端入口）。独立 SPA 可直接依赖 `@ubean/vue` 或 `ubean/client`，不拉入服务端构建依赖。

### 2.2 主包子路径导出

`ubean` 主包除 `.` 主入口外，提供以下子路径：

| 子路径               | 说明                                                                                                        | 典型用途                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `ubean`              | 主入口，re-export 所有子包                                                                                  | 服务端代码、API 路由     |
| `ubean/vite`         | 默认 Vite 插件组合（build + vue + islands + server actions）                                                | `vite.config.ts`         |
| `ubean/client`       | 一等客户端入口（re-export `@ubean/client` 内核 + `createServerHead`）                                       | 客户端代码、SPA 自动导入 |
| `ubean/runtime/vue`  | 浏览器端 Vue 客户端运行时（re-export `ubean/client` 全部导出 + Server Actions 运行时 + islands 注册表桥接） | 客户端自动导入           |
| `ubean/runtime/app`  | 服务端 Hono 应用入口（`createUbeanApp`/`defineServer`）                                                     | `src/server.ts`          |
| `ubean/runtime/i18n` | 服务端纯函数 i18n                                                                                           | 构建时 i18n              |
| `ubean/vue-ssr`      | Vue SSR 渲染器（`createVueRenderer`）                                                                       | 自定义 SSR               |

> **注意**：客户端自动导入必须用 `ubean/runtime/vue` 或 `ubean/client` 入口，不能从 `ubean` 主入口导入（会触发 Vite 在浏览器环境预构建服务端依赖）。`ubean/runtime/vue` 在 `@ubean/client` 之上额外提供 Server Actions 运行时（`callAction`/`useAction`/`useFormAction`）与 islands 注册表桥接的 `hydrateIslands`；`ubean/client` 额外含 `createServerHead`（供框架 SSR 构建使用）。独立 SPA 可直接依赖 `@ubean/vue`（仅 vue + vue-router）。详见第 8 节陷阱 #8。

### 2.3 `@ubean/server` 语义聚合子路径（ADR-0003 OPT-06）

`@ubean/server` 除主入口 `.`（barrel 便利入口）外，提供以下语义聚合子路径。新代码推荐按能力域从子路径导入，避免 barrel 触发全量子模块类型解析。

| 子路径                          | 聚合自                                                                          | 能力域                     |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| `@ubean/server/cache`           | `cache` + `cache-directive`                                                     | 路由级缓存 + 组件级缓存    |
| `@ubean/server/db`              | `database`                                                                      | 数据库（db0/drizzle 集成） |
| `@ubean/server/realtime`        | `websocket` + `sse`                                                             | 实时通信（WS + SSE）       |
| `@ubean/server/security`        | `security-headers` + `csrf` + `sessions`                                        | 安全（CSP/CSRF/Sessions）  |
| `@ubean/server/queue`           | `queue`                                                                         | 消息队列                   |
| `@ubean/server/cron`            | `cron` + `cron-scheduler`                                                       | 定时任务                   |
| `@ubean/server/storage`         | `storage`                                                                       | KV / 对象存储              |
| `@ubean/server/observability`   | `observability`                                                                 | 链路追踪 / OpenTelemetry   |
| `@ubean/server/email`           | `email`                                                                         | 邮件发送                   |
| `@ubean/server/analytics`       | `analytics` + `feature-flags`                                                   | 分析 / A-B 实验            |
| `@ubean/server/static`          | `static`                                                                        | 静态文件服务               |
| `@ubean/server/middleware`      | `cors` + `rate-limit` + `after` + `fetch-memo` + `draft-mode` + `single-flight` | 请求生命周期中间件         |
| `@ubean/server/cache-directive` | `cache-directive`                                                               | 组件级缓存                 |

> 主入口 `@ubean/server` 保持 re-export 全部符号（便利入口），行为不变。子路径与内部文件非 1:1（`./cache` 聚合两个内部文件，`./realtime`/`./security`/`./cron`/`./analytics`/`./middleware` 同理）。

## 3. 核心约定

### 3.1 路由

- **API 路由**：`src/routes/` 目录，void 风格命名导出（`export const GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD`），单个文件可导出多个方法，**不使用** `.get.ts`/`.post.ts` 后缀
- 所有 API 路由必须用 `defineHandler` 包装
- **页面路由**：`src/pages/` 目录，`.vue` / `.md` 文件
- **layouts**：`src/layouts/`（`xx.vue` 或 `xx/index.vue`）
- **middleware**：`src/middleware/`，`global`/`global.*` → `/*`，其他按目录前缀挂载
- **路由组**：`(group-name)/` 不贡献 URL 段
- **并行路由 (Parallel Routes, P9-18)**：`@slotName/` 目录约定，同一路径下多个页面渲染到布局的不同命名插槽；虚拟模块按路径分组为 Vue Router named views (`components: { default, slotName }`)；布局中使用 `<SlotView name="slotName" />` 渲染对应插槽
- **拦截路由 (Intercepting Routes, P9-18)**：`(..)target/`、`(.)target/`、`(...)target/` 目录约定，拦截导航到 `target` 路由（分别从父级、同级、根级拦截）；虚拟模块注册为 `__intercept_` 前缀的独立路由，`meta` 含 `interceptFrom`/`interceptTarget`/`isIntercepting`
- **reuse 路由**：`xxx.reuse.ts` / `xxx.reuse.vue`；未显式声明 `cache` 时自动继承 target 的 `cache` 值，可显式 `cache: false` 关闭
- **动态路由**：`[id].vue` → `/user/:id`
- **动态路由 matchers（Task 7, P1）**：`[id=matcherName].vue` 语法，使用名为 `matcherName` 的 matcher 校验参数；matcher 通过 `defineMatcher(name, fn)` 注册到进程单例，返回 falsy 视为不匹配（路由跳过，走下一候选或 404）。支持 `[id=numeric].vue`（页面）、`[...slug=any].vue`（catch-all）、`[[page=numeric]].vue`（optional）、`[id=numeric].get.ts`（API 路由）。服务端由 Hono 中间件校验（matcher 拒绝返回 404）；客户端需在 `defineApp({ router: { setup } })` 中调用 `router.beforeEach(createMatcherGuard())` 启用校验（纯 SSR 应用可省略）
- **预设页面**（`src/pages/` 根目录下自动检测，不作为常规路由注册）：
  - `404.vue`（或 `.ts`/`.md`）→ Vue Router catch-all `/:pathMatch(.*)*` + Hono `GET *` 兜底处理器；未匹配的浏览器导航返回 404 状态码并渲染该组件；API/`_` 前缀路径仍走默认 JSON 404
  - `loading.vue`（或 `.ts`/`.md`）→ `<Suspense>` fallback 组件，在 SPA 导航懒加载页面组件期间显示；仅客户端生效（SSR 同步解析无需 loading）
  - `error.vue`（或 `.ts`/`.md`）→ 错误边界（ErrorBoundary）组件，当页面组件渲染/异步解析/setup 抛出错误时显示，接收 `error` prop；路由切换时自动重置；仅客户端生效
  - 仅根目录文件被视为特殊页面；`users/404.vue` 仍为常规路由 `/users/404`
- **crons**：`src/crons/`，`defineScheduled()`，数字前缀排序
- **Server Actions（表单 action）**：页面模块可 `export const actions = { name: defineAction(...) }`，POST 表单通过 `?/<actionName>` URL 分发（SvelteKit 风格，渐进增强）；详见第 4 节 Server Actions
- `definePage` 宏字段：`name`、`path`、`layout`、`reuse`、`meta`、`requiresAuth`、`cache`、`head`、`ssr`（**没有** 顶层 `title` 字段）。客户端导航守卫用 `defineApp({ router: { setup } })`，不要发明第二套 `middleware/*.global` 文件约定
  - `layout` 支持 `string`（单层）、`string[]`（多层嵌套，P9-17）或 `false`（禁用）；数组按外→内顺序嵌套：`['default', 'admin', 'dashboard']` → `default` 包裹 `admin` 包裹 `dashboard` 包裹页面；数组中的 `'default'` 是字面布局名（引用 `layouts/default.vue`），而单独字符串 `'default'` 表示使用默认布局
  - `cache: true` 启用页面 KeepAlive 缓存，框架自动用路由名作为组件 `name`（通过 `getNamedPageWrapper` 包装），`<script setup>` SFC 无需手动 `defineOptions({ name })`
  - 运行时控制：`useCacheViews()` / `enablePageCache(name)` / `disablePageCache(name)` / `excludePageCache(name)` / `invalidatePageCache(name)`

### 3.2 验证与 OpenAPI

- 请求验证使用 `import { validator } from 'hono-openapi'`（ubean 重新导出）
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

- **i18n**：`ubean.config.ts` 的 `i18n`；Vue 端 `vue-i18n` 11（`legacy: false`），handler 端 `@intlify/core` + ALS；语言路由 Hono 与 vue-router 共用 `compileLocalePaths`
- 路由策略：`prefix` / `prefix_except_default` / `prefix_and_default` / `no_prefix`；中间件由 `createUbeanApp` 自动挂载，cookie **写入**
- 检测顺序：URL path → cookie（`ubean_locale`）→ Accept-Language → defaultLocale；默认 `redirectOn: 'root'`
- 切换语言走框架 `setLocale`（load + cookie + 导航）；客户端从 `ubean/runtime/vue` 导入 `useI18n` / `setLocale`

### 3.5 配置

- `srcDir` 默认值：`{rootDir}/src`
- `UbeanConfig` 的 `modules` 字段支持字符串包名、元组和实例
- 平台预设：`standard`、`node`、`cloudflare`、`vercel`、`vercel-edge`、`netlify`、`bun`、`deno`（`default` → `standard`，`cf` → `cloudflare`，`node-server` → `node`，`vercel-serverless`/`vercel-node` → `vercel`，`netlify-functions` → `netlify`，`bun-runtime` → `bun`，`deno-deploy`/`deno-runtime` → `deno`）；`detectPreset()` 自动识别 `vercel.json`/`netlify.toml`/`deno.json`/`deno.jsonc` 配置文件、`VERCEL`/`NETLIFY` 环境变量、`globalThis.Deno`/`globalThis.Bun`/`process.versions.bun` 运行时全局,以及 `package.json` 中的 `vercel`/`@vercel/*`/`netlify-cli` 依赖
- 启用 `electron: true` 时，`ssr` 默认值改为 `false`（桌面应用无需 SSR，除非显式指定 `ssr: true`）
- 扩展模块顶层字段：`ai`/`auth`/`icon`/`image`/`content` 为独立包，`pwa`/`fonts`/`electron`/`pinia`/`ui` 为 `@ubean/integrations` 子路径；均支持 `true` 或选项对象形式启用
- SSR 配置 `ssr` 字段支持 `boolean | SsrOptions`：`ssr: true`（默认全部 SSR）/ `ssr: false`（关闭 SSR）/ `ssr: { exclude: ['/admin/**'], streaming: true }`（排除指定页面走 CSR / 启用流式）；`SsrOptions.all` 默认 `true`，`exclude` 支持 glob（`*` 单段、`**` 多段），`streaming` 启用全局流式 SSR
- Per-route 渲染规则（P9-03 + P9-04）：`routeRules` 顶层字段 `ssr`（`boolean | 'streaming' | 'data-only'`）/ `prerender`（`boolean`）/ `isr`（`number | { ttl, swr? }`）/ `ppr`（`boolean`）覆盖全局设置；优先级 `definePage({ ssr })` > `routeRule.ssr` > 全局 `ssr.exclude`/`SsrOptions.streaming`；`ssr: false` 跳过 loader，`'data-only'` 跑 loader 但 HTML 为 CSR shell；`ppr: true` 隐含 `prerender: true` + 强制流式 SSR（等价 `ssr: 'streaming'`）

### 3.6 模块与扩展包

- 所有 `packages/` 使用 `@ubean/` scope + kebab-case
- Vite 入口通过 `/vite` 子路径（如 `@ubean/icon/vite`）
- `ModuleDefinition`：`vitePlugin` / `setup` / `hooks` / `dependsOn`
- 虚拟模块注册：`kit.addVirtualImports()`，前缀用 `virtual:ubean-`（`#ubean-` 会因 URL hash 导致 404）

## 4. 核心 API 速查

以下均从 `ubean` 主包导出。

### 路由与处理器

| API                                                                | 说明                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `defineHandler(...handlers)`                                       | 包装 API 路由处理器，返回 `UbeanHandlerChain`                                                                  |
| `defineHandlerMeta(meta)`                                          | 路由元数据（`requiresAuth`/`cache`/`rateLimit`），返回带 `.__meta` 的 pass-through 中间件                      |
| `defineMiddleware(handler)`                                        | 包装中间件                                                                                                     |
| `definePage(meta)`                                                 | 编译时宏，页面 meta（`name`/`path`/`layout`/`reuse`/`meta`/`requiresAuth`/`cache`/`head`/`ssr`）               |
| `defineMeta(meta)`                                                 | 定义路由 meta                                                                                                  |
| `validator` / `describeRoute` / `resolver`                         | 来自 `hono-openapi`，请求验证 + OpenAPI                                                                        |
| `defineMatcher(name, fn)`                                          | 注册动态路由 matcher（Task 7），`fn: (value: string) => boolean \| null \| undefined`，返回 falsy 跳过路由     |
| `getMatcher` / `hasMatcher` / `listMatcherNames` / `clearMatchers` | matcher 注册表读取/清理（`clearMatchers` 仅供测试）                                                            |
| `validateParams(matchers, params)`                                 | 批量校验参数（服务端中间件与客户端守卫复用）                                                                   |
| `createMatcherGuard(options?)`                                     | 创建 vue-router `beforeEach` 守卫，校验 `route.meta.matchers`，失败跳转 `notFoundRouteName`（默认 `NotFound`） |
| `registerRoutes(app, scanResult)`                                  | 路由挂载（内部用 `app.on(method, path, ...)` 注册）                                                            |

### 应用入口

| API                                                             | 说明                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `defineApp(options): ResolvedAppConfig`                         | 基于选项的应用配置（**不是**工厂函数）                                                |
| `applyAppConfig(app, config, mode)`                             | 应用配置到 Vue 实例                                                                   |
| `createUbeanApp(options)`（`@ubean/app` / `ubean/runtime/app`） | 创建 ubean **Hono** 应用（`UbeanApp`）。`createUbeanApp` 全仓专指 Hono 工厂           |
| `createUbeanClientApp(options)`（`@ubean/client`）              | 创建 **Vue** 客户端应用（`{ app, router, head, page }`）。主入口 `ubean` 不导出此函数 |

`DefineAppOptions` 字段：`plugins`、`globalComponents`、`provides`、`head`、`rootId`、`rootAttrs`、`router`、`onAppCreated`、`onClientReady`、`errorComponent`、`loadingComponent`、`viewTransitions`、`serializeState`、`hydrateState`

> `errorComponent` / `loadingComponent` 说明：
>
> - `loadingComponent`：页面懒加载期间的 `<Suspense>` fallback 组件。优先级：`defineApp({ loadingComponent })` > `pages/loading.vue` 自动检测。仅客户端生效。
> - `errorComponent`：渲染错误兜底组件，通过 Vue `errorCaptured` 实现错误边界（ErrorBoundary）。当页面组件渲染、异步解析或 setup 抛出错误时显示。接收 `error` prop。优先级：`defineApp({ errorComponent })` > `pages/error.vue` 自动检测。路由切换时自动重置。
> - 两者均通过 `provide`/`inject` 注入到 `PageView` 组件，无需手动处理。

> `router` 字段接收 `RouterConfig`(`{ setup(router) }`),在 router 实例创建后、`app.use(router)` 之前调用 `setup`,用于注册 vue-router 的导航守卫(`beforeEach`/`beforeResolve`/`afterEach`)。Client 和 SSR 都会执行;`app.ts` + `app.server.ts`/`app.client.ts` 中各自定义的 `setup` 会**累加执行**(shared 先,client/server 后)。

> `serializeState(app)` 在 SSR `renderToString` 完成后调用,返回的对象被序列化到 HTML 的 `__UBEAN_STATE__` script 标签;`hydrateState(app, state)` 在客户端 `applyAppConfig`(注册插件)之后、`app.mount()` 之前调用,用于将 SSR state 注入到客户端实例(如 Pinia 的 `pinia.state.value`)。两者均为可选,配合 `@ubean/integrations/pinia` 等状态管理扩展使用。

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

平台非内存驱动（`@ubean/server/drivers`）：`createCloudflareD1Database` / `createCloudflareQueueDriver` / `createVercelPostgresDatabase` / `createVercelKvQueueDriver`。示例见 `examples/platform-drivers/`。

### 缓存

| API                                    | 说明                                          |
| -------------------------------------- | --------------------------------------------- |
| `useCacheStore(store?)`                | 获取缓存存储                                  |
| `createMemoryStore(maxEntries)`        | 内存存储                                      |
| `createCacheMiddleware(options)`       | 缓存中间件（`CacheRule`: `ttl`/`swr`/`name`） |
| `cachedEventHandler(handler, options)` | 缓存事件处理器                                |
| `invalidateRouteCache(keyPattern?)`    | 失效缓存                                      |
| `resolveRouteCacheRules(routeRules)`   | 解析路由缓存规则                              |

`CacheStore` 接口：`get` / `set` / `delete` / `clear` / `peek?`（P9-03:ISR SWR 用,不更新 LRU、不删除过期项）

**不存在的 API**：`useCache`、`defineCache`、标签/分组/`remember`

### 组件级缓存 (P9-08)

| API                                              | 说明                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `defineCachedFunction(fn, options)`              | 显式缓存包装器;对齐 Next.js 16 `unstable_cache`                                          |
| `cacheLife(seconds)`                             | 设置当前缓存作用域 TTL(秒),须在 `defineCachedFunction` 函数体内调用                      |
| `cacheTag(...tags)`                              | 为当前缓存作用域添加标签,用于 `revalidateTag()` 精确失效                                 |
| `revalidateTag(tag)` / `revalidateTags(...tags)` | 按标签失效组件缓存 + fetch Data Cache 条目,返回删除总数(Task 4 起 Data Cache 也参与失效) |
| `revalidatePath(pattern)`                        | 按 glob/正则失效组件缓存键 + fetch Data Cache 键匹配的条目                               |
| `useComponentCacheStore(store?)`                 | 获取/设置组件级缓存存储                                                                  |
| `createComponentMemoryStore(maxEntries)`         | 内存组件缓存存储(带标签反向索引)                                                         |
| `clearComponentCache()`                          | 清空所有组件级缓存                                                                       |

```typescript
// 显式缓存包装
const getUser = defineCachedFunction(async (id: string) => {
  cacheLife(3600); // 缓存 1 小时
  cacheTag('users', `user:${id}`);
  return await db.query.user.findById(id);
});

// 失效缓存
await revalidateTag('users');
await revalidatePath('getUser:*');
```

> `cacheLife()` / `cacheTag()` 通过 `AsyncLocalStorage` 传递作用域,在非缓存上下文中调用为空操作。组件级缓存与 HTTP 响应缓存(`CacheStore`)解耦,使用独立的 `ComponentCacheStore`(存储 JSON 可序列化值)。

### ISR (P9-03)

| API                                           | 说明                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `serveIsr(c, options)`                        | ISR 请求处理(HIT/STALE/MISS,设置 `X-ISR` header)    |
| `extractPrerenderRoutesFromRules(routeRules)` | 从 `routeRules` 中提取 `prerender: true` 的路由模式 |
| `normalizeIsrRule(rule)`                      | 把 `number                                          | IsrRule`归一化为`{ ttl, swr? }`或`undefined` |

`IsrRule`:`{ ttl: number; swr?: boolean }`;`routeRules` 顶层字段 `isr?: number | IsrRule`

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

| API                                                         | 说明                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `compileRouteRules(rules)` / `matchRouteRules(path, rules)` | 路由规则编译/匹配(按规则+路径特异性排序)                     |
| `createRouteRulesMiddleware(rules)`                         | 路由规则中间件(匹配后通过 `c.get('routeRule')` 暴露合并结果) |

`RouteRule` 字段(P9-03 + P9-04 扩展):`redirect` / `rewrite` / `proxy` / `headers` / `cache` / `ssr`(boolean \| `'streaming'` \| `'data-only'`) / `prerender`(boolean) / `isr`(number \| `{ ttl, swr? }`) / `ppr`(boolean)

通配符:`*` 单段,`**` 多段递归;处理顺序:redirect > rewrite（内部 `dispatch` 再匹配）> proxy（反向代理）> headers(合并) > cache;渲染字段 `ssr`/`isr`/`prerender`/`ppr` 由 router 在页面请求阶段处理,优先级:`definePage({ ssr })` > `routeRule.ssr` > 全局 `ssr.exclude`/`SsrOptions.streaming`;显式 `ssr: false` 跳过 loader,`'data-only'` 跑 loader + CSR shell;glob exclude 仍跑 loader;`ppr: true` 是强制流式 SSR + 预渲染发现的别名（**不是** Next 静态壳）,响应头 `X-SSR-Mode` + 可选 `X-PPR: streaming`

### Partial Prerendering / Server Islands (P9-04 + Task 9.4)

| API                                        | 说明                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routeRules: { '/path': { ppr: true } }`   | 强制流式 SSR + 预渲染发现（等价 `ssr: 'streaming'`，隐含 `prerender: true`）。不是 Next 静态壳                                                                                         |
| `defineServerIsland(Component, options?)`  | 运行时包装器:将异步组件包裹在 `<Suspense>` 中,`options.fallback` 指定 fallback(字符串/组件/默认占位);Task 9.4 起 `options.rerenderOnPropsChange: true` 启用 props 变化触发服务端重渲染 |
| `ServerIslandOptions`                      | `{ fallback?: Component \| string; rerenderOnPropsChange?: boolean }` 类型(Task 9.4 扩展)                                                                                              |
| `registerServerComponent(path, Component)` | Task 9.4:将组件注册到全局服务端组件注册表(路径 → 组件);SSR 构建中由 `defineServerIsland` 在 `rerenderOnPropsChange: true` 时自动调用                                                   |
| `getServerComponent(path)`                 | Task 9.4:从注册表取出组件(由 `createServerComponentMiddleware` 调用);未注册返回 `undefined`                                                                                            |
| `SERVER_COMPONENT_ENDPOINT`                | Task 9.4:`POST /__server-component` 端点常量                                                                                                                                           |
| `createServerComponentMiddleware()`        | Task 9.4:Hono 中间件,处理 `POST /__server-component` 请求,用新 props 重新渲染注册表中的组件并返回 HTML 片段(从 `@ubean/islands/server` 导入,由 `createUbeanApp()` 自动挂载)            |

- 传入 `defineServerIsland()` 的组件必须为异步(`async setup()` 或 `defineAsyncComponent`)才能触发 Suspense 流式
- 对齐 Next.js 16 PPR / Astro 5 `server:defer` 语义
- **Task 9.4 props 重渲染**:当 `rerenderOnPropsChange: true` 且 Vite 插件自动注入了组件绝对路径(第 3 参数)时:SSR 端将组件注册到全局注册表;客户端 `onMounted` 后立即 `POST {path, props}` 到 `/__server-component`,用返回的 HTML 替换 `<ubean-server-island>` 容器 `innerHTML`,`watch(attrs)` 在 props 变化时重复此流程。未注入路径时退化为 `false` 行为

```typescript
import { defineServerIsland } from 'ubean';
import SlowComp from './SlowComp.vue';
const SlowIsland = defineServerIsland(SlowComp, { fallback: 'Loading...' });

// Task 9.4:props 变化时重新请求服务端渲染
const ReactiveIsland = defineServerIsland(SlowComp, {
  fallback: 'Loading...',
  rerenderOnPropsChange: true // Vite 插件自动注入组件路径
});
```

### 中间件工厂

| API                                                                                                                                                                                        | 说明                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCorsMiddleware(options)` / `defineCors(options)`                                                                                                                                    | CORS                                                                                                                                                                                                                                                                                                                          |
| `createRateLimitMiddleware(options)` / `defineRateLimit(options)`                                                                                                                          | 限流                                                                                                                                                                                                                                                                                                                          |
| `createCsrfMiddleware(options)` / `defineCsrf(options)` / `generateCsrfToken(length)`                                                                                                      | CSRF 保护(P9-12):double-submit cookie 模式(默认)/origin 校验/both 模式;支持自定义 cookie/header/field 名、exclude 路径                                                                                                                                                                                                        |
| `createSecurityHeadersMiddleware(options)` / `defineSecurityHeaders(options)` / `serializeCsp(directives)`                                                                                 | 安全头(P9-13):CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy/Cross-Origin-*                                                                                                                                                                                                               |
| `createSessionMiddleware(options)` / `useSession(c)` / `createStorageSessionStore(...)`                                                                                                    | 通用 Sessions API(P9-11):cookie 模式(signed cookie) + storage 模式(SessionStore);`Session<T>` 接口(get/set/delete/has/all/save/destroy)                                                                                                                                                                                       |
| `after(callback)` / `createAfterMiddleware()`                                                                                                                                              | 响应后执行(P9-14):fire-and-forget 回调不阻塞 TTFB;AsyncLocalStorage 请求作用域                                                                                                                                                                                                                                                |
| `createFetchMemoizationMiddleware(options)` / `createMemoizedFetch(options)`                                                                                                               | 请求 memoization(P9-15):请求内相同 GET URL 自动去重                                                                                                                                                                                                                                                                           |
| `createDataCacheMiddleware(options)` / `FetchCacheOptions` / `FetchInitWithNext`                                                                                                           | fetch Data Cache(Task 4):跨请求缓存 GET 响应,识别 `next: { revalidate, tags, noStore }`;与 `revalidateTag`/`revalidatePath` 集成失效                                                                                                                                                                                          |
| `createDraftModeMiddleware(options)` / `defineDraftMode(options)` / `enableDraftMode(c)` / `disableDraftMode(c)` / `isDraftMode(c)` / `useDraftMode(c)` / `DraftModeOptions` / `DraftMode` | Draft/Preview Mode(Task 5/P9-23):对齐 Next.js `draftMode()`;HMAC-SHA256 签名 cookie(`ubean_draft`,默认 1h TTL)+ 时序安全比较;中间件读取并验证 cookie 后注入 `DraftModeController`;`enable/disable` 通过 pendingAction 在响应阶段设置/清除 cookie;未注册中间件时 `isDraftMode` 返回 false、`useDraftMode` 返回安全回退(零开销) |

### SEO 与可观测性

| API                                                                                               | 说明                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSeoMeta()` / `mergeMetadata()` / `mergeSeoLayers()` / `dedupeMetaTags()` / `dedupeLinkTags()` | SEO meta。`mergeMetadata`/`mergeSeoLayers` 自动对 `meta`/`link` 数组去重(last-wins):meta 按 `name`/`property`,link 按 `rel`+`hreflang`/`type`/`sizes`。`mergeSeoLayers(global, layout, page)` 三层合并(page>layout>global)。`dedupeMetaTags`/`dedupeLinkTags` 独立去重工具(Task 8) |
| `isBotUserAgent(ua)`                                                                              | 爬虫/社交预览 UA 检测(P9-24 / Task 6 流式 metadata):流式 SSR 启用时,router 自动为爬虫降级为缓冲渲染,保证动态 `<head>` metadata 出现在初始响应中(社交爬虫只解析初始 `<head>`)。`botFallback` 选项默认 `true`,仅在 `streaming: true` 时生效                                          |
| `createRobotsResponse()` / `createSitemapResponse()`                                              | robots.txt / sitemap.xml                                                                                                                                                                                                                                                           |
| `defineManifest()` / `createManifestResponse()`                                                   | PWA manifest                                                                                                                                                                                                                                                                       |
| `getRequestId()` / `createObservabilityTracer()`                                                  | 请求 ID / 可观测性                                                                                                                                                                                                                                                                 |
| `createTracingMiddleware(options)`                                                                | tracing 中间件                                                                                                                                                                                                                                                                     |
| `registerSeoConventions(app, {srcDir})`                                                           | P9-05 文件约定 SEO:扫描 `src/sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.ts`/`icon.ts`/`apple-icon.ts`,自动注册 GET 路由                                                                                                                                                |
| `listSeoConventions({srcDir})`                                                                    | 列出 srcDir 下存在的约定文件 kind(不加载)                                                                                                                                                                                                                                          |
| `defineJsonLd()` / `useSchemaOrg()` / `renderJsonLdScript()`                                      | P9-07 JSON-LD 结构化数据:`defineJsonLd(schema)` 定义、`useSchemaOrg(schema)` Vue composable、`renderJsonLdScript(schema)` 序列化为 `<script type="application/ld+json">` 标签(自动转义 `</script>`/U+2028/U+2029)                                                                  |
| `schemaOrg.*`                                                                                     | Schema.org 工厂:`organization`/`website`/`article`/`breadcrumb`/`product`                                                                                                                                                                                                          |
| `ImageResponse` / `renderOgImage()` / `renderArticleOgImage()`                                    | P9-06 OG Image 动态生成(`@ubean/seo/og-image`):`ImageResponse` 类对齐 Next.js(ReadableStream 懒渲染)、`renderOgImage(input, options)` 一步到位渲染默认模板、`renderArticleOgImage(input, options)` 文章模板。`satori`/`@resvg/resvg-js` 为 optional peer 依赖                      |
| `defaultTemplate()` / `articleTemplate()` / `renderToImage()`                                     | P9-06 Satori VDOM 模板(渐变背景/标题自适应字号/可选描述/站点名/logo/作者日期)与底层渲染(返回 `{ body, contentType }`)                                                                                                                                                              |
| `loadDefaultFont()` / `loadFontFromUrl()` / `loadFontFromFile()` / `isOgImageSupported()`         | P9-06 字体加载辅助(默认 Inter from Google Fonts / URL / 本地文件)与能力检测                                                                                                                                                                                                        |

### 日志

| API                                       | 说明                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `logger`                                  | 默认全局 tslog 实例(名称 `ubean`),从 `ubean` 主入口导出                                                                    |
| `createUbeanLogger(options)`              | 创建命名 tslog 实例;`options` 透传 tslog v5 分组 settings(type/pretty/json/mask/stack/meta/minLevel)                       |
| `getLogger(scope?, options?)`             | 获取 scope 子 logger(继承父 logger 的 settings/minLevel);不传 scope 返回全局 `logger`                                      |
| `createRequestLoggerMiddleware(options?)` | Hono 请求日志中间件;记录 method/path/status/duration/error;支持 `exclude`(glob/regex/谓词)、`slowThreshold`、`logQuery`    |
| `@ubean/shared/logger/hono`               | `createRequestLoggerMiddleware` 所在子路径;不从 `@ubean/shared` 主入口导出，避免浏览器 barrel 拉入 tslog                   |
| 环境变量控制                              | `LOG_LEVEL`/`TSLOG_LEVEL` 设 minLevel(silly/trace/debug/info/warn/error/fatal);`TSLOG_TYPE` 设输出格式(json/pretty/hidden) |

### 内部调用

| API                                                  | 说明                                   |
| ---------------------------------------------------- | -------------------------------------- |
| `createInternalFetch(options)` / `callInternal(...)` | 进程内调度框架 handler，不发起网络请求 |
| `internalFetch` 不支持上传进度                       | —                                      |

> 浏览器端 HTTP 请求请直接使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)（`createRequest` / `toFlatRequest` / `createTypedClient` / `toFlatTypedClient`），ubean 不再内置 HTTP 客户端封装。页面侧用 `useFetch(key, url, options)` 包 `useAsyncData`，经 `setDefaultFetch(createRequest())` 注入该 client。

### Server Actions（P9-02）

| API                                                | 说明                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `defineAction(handlerOrSchema, handler?, opts?)`   | 定义服务端 action，支持 Standard Schema / `safeParse`；返回带 `ACTION_BRAND` 的 `ServerAction` |
| `defineServerFn(...)`                              | `defineAction` 别名：同一 ID 与 `POST /__actions`，供 loader/查询与 mutation 共用              |
| `invokeServerFn(fn, input?)`                       | 同构调用（服务端走 handler + schema；客户端走 RPC stub）；从 `ubean/runtime/vue` 导入          |
| `describeActionsOpenApi()`                         | 可选 OpenAPI 片段，仍指向同一 `POST /__actions`，不另开端点                                    |
| `fail(status, errors)`                             | 在 action handler 中返回字段级验证错误（SvelteKit 风格）                                       |
| `ActionError`                                      | 用户可读错误类（含 `code`/`status`），在 handler 中 throw                                      |
| `isServerAction(value)` / `isActionFailure(value)` | 类型守卫                                                                                       |
| `callAction(id, args)`                             | 客户端 RPC 调用（POST `/__actions`）                                                           |
| `useAction(actionOrId)`                            | Vue composable：`pending`/`data`/`error`/`errors`/`status`/`result`/`submit`/`reset`           |
| `useFormAction(actionName)`                        | Vue composable：表单 action URL + SPA 提交（渐进增强）                                         |
| `?/<actionName>` URL 约定                          | 页面模块 `export const actions = { name: defineAction(...) }` → POST 表单分发                  |

> Server Actions 通过 `@ubean/actions` 包实现，Vite 插件 `ubeanServerActionsPlugin` 已包含在默认 `ubeanPlugin()` 中。action ID 由 `base32(sha1(filePath:exportName))` 生成，client/server 自动一致。`@ubean/shared` 提供 `ServerAction`/`ActionContext`/`ActionResult`/`ActionFailure` 等共享类型。

```typescript
const addToCart = defineAction(async (itemId: string) => {
  /* ... */
});
```

### 全局 Hooks（P9-09）

SvelteKit 风格的全局 hooks，通过 `defineServer({ globalHooks })` 注册。对齐 SvelteKit `hooks.server.ts` / Nuxt server plugins / Astro middleware。

| API                                                                   | 说明                                                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `defineServer({ globalHooks: { handle, handleFetch, handleError } })` | 注册全局 hooks（在 `src/server.ts` 中导出）                                                                |
| `setGlobalHooks(hooks)` / `getGlobalHooks()` / `clearGlobalHooks()`   | 全局 hooks 注册表（通常由 `applyServerConfig` 自动调用）                                                   |
| `applyHandleHook(c, next)`                                            | 应用 `handle` hook（内部由 `app.ts` 中间件调用；无 hook 时返回 `false` 并正常 `next()`）                   |
| `applyHandleFetchHook(request, defaultFetch, serverContext?)`         | 应用 `handleFetch` hook（内部包裹 `setInternalFetcher`，拦截 `internalFetch`/`createInternalAdapter`）     |
| `applyHandleErrorHook(c, error, status)`                              | 应用 `handleError` hook（内部由 `app.ts` 的 `onError` 调用，fire-and-forget）                              |
| `createHandleEvent(c)` / `extractErrorMessage(error, status)`         | 辅助函数：构建请求事件 / 脱敏错误消息（404→"Not Found"、5xx→"Internal Server Error"、4xx→`error.message`） |
| `wrapResolve(c, next)`                                                | 封装 Hono `next()` 为 `resolve(event): Promise<Response>`                                                  |

**三个 hook 的职责**：

- **`handle({ event, resolve })`**：包裹每个请求（覆盖所有路由 + 静态资源 + 404 + 错误响应）。必须调用 `resolve(event)` 让请求继续处理，或返回自定义 `Response` 短路。用于：统一添加 header、请求日志、A/B 测试、认证预处理。
- **`handleFetch({ request, fetch, serverContext? })`**：拦截服务端 `internalFetch`/`createInternalAdapter` 调用。可修改请求头/URL/注入认证 token，然后调用 `fetch(request)`。用于：内部 API 鉴权、请求改写。
- **`handleError({ event, error, status, message })`**：未捕获错误的统一处理入口（仅副作用，不影响返回给客户端的响应）。用于：日志记录、Sentry 上报。

**用法示例**：

```typescript
// src/server.ts
import { defineServer } from '@ubean/app';

export default defineServer({
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const start = Date.now();
      const response = await resolve(event);
      response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
      return response;
    },
    handleFetch: async ({ request, fetch }) => {
      request.headers.set('X-Internal-Auth', process.env.INTERNAL_TOKEN!);
      return fetch(request);
    },
    handleError: async ({ event, status, message }) => {
      console.error(`[${status}] ${message}`, event.request.url);
    }
  }
});
```

> `mergeServerConfigs` 会自动合并 shared + mode-specific 的 `globalHooks`（浅合并，mode-specific 覆盖 shared 的同名字段）。`applyHandleHook` 在中间件链最前注册，无 `handle` hook 时零开销降级为正常 `next()`。

### 平台预设（P9-10）

`@ubean/preset` 内置 9 个平台预设（合并原 P5-06），均通过 `definePreset()` 定义,新平台预设 `extends: 'node'` 继承基础配置。

| 预设                  | 别名                                                             | 说明                                                                                     |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `standardPreset`      | `default`                                                        | 默认预设（Node 兼容）                                                                    |
| `nodePreset`          | `node-server`                                                    | Node.js 运行时                                                                           |
| `cloudflarePreset`    | `cloudflare-pages`/`cloudflare-module`/`cf`/`wrangler`/`workers` | Cloudflare Workers                                                                       |
| `cloudflareDevPreset` | `cf-dev`/`wrangler-dev`                                          | Cloudflare 开发模式（miniflare）                                                         |
| `vercelPreset`        | `vercel-serverless`/`vercel-node`                                | Vercel Serverless Functions（Node 运行时）                                               |
| `vercelEdgePreset`    | `vercel-edge-function`                                           | Vercel Edge Functions（关闭 `nodeCompat`/`database`/`queues`/`cronTriggers`，开启 `kv`） |
| `netlifyPreset`       | `netlify-functions`/`netlify-node`                               | Netlify Serverless Functions                                                             |
| `bunPreset`           | `bun-runtime`                                                    | Bun 运行时（原生 TypeScript + `bun:sqlite`）                                             |
| `denoPreset`          | `deno-deploy`/`deno-runtime`                                     | Deno 运行时（Deno KV / Deno.cron / Deno.Queue）                                          |

| API                                                                         | 说明                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `definePreset(definition, meta)`                                            | 定义预设（支持 `extends` 继承）                                |
| `registerPreset(preset)` / `resolvePreset(name)` / `getRegisteredPresets()` | 预设注册表                                                     |
| `resolvePresetByName(name)`                                                 | 按名称/别名解析预设（未找到时 fallback 到 `standard`）         |
| `registerBuiltinPresets()`                                                  | 注册所有内置预设（模块加载时自动调用）                         |
| `detectPreset(hints?)` / `resolvePresetWithDetection(name?, cwd?)`          | 自动检测平台（explicit > config-file > environment > default） |
| `listDetectablePresets()`                                                   | 列出所有可检测预设（9 个）                                     |
| `getPresetAliases()` / `getPresetNames()`                                   | 别名/名称映射                                                  |
| `generateWranglerConfig(opts)` / `serializeWranglerToml(config)`            | Cloudflare `wrangler.toml` 生成/序列化                         |
| `generateVercelConfig(opts)` / `serializeVercelConfig(config)`              | Vercel `vercel.json` 生成/序列化                               |
| `generateNetlifyConfig(opts)` / `serializeNetlifyConfig(config)`            | Netlify `netlify.toml` 生成/序列化                             |
| `generateBunfigConfig(opts)` / `serializeBunfigConfig(config)`              | Bun `bunfig.toml` 生成/序列化                                  |
| `generateDenoConfig(opts)` / `serializeDenoConfig(config)`                  | Deno `deno.json` 生成/序列化                                   |

**自动检测优先级**：

1. **explicit**:`resolvePresetWithDetection('vercel')` 显式指定
2. **config-file**:检测 `wrangler.toml`/`wrangler.json`(Cloudflare)、`vercel.json`(Vercel)、`netlify.toml`(Netlify)、`deno.json`/`deno.jsonc`(Deno),以及 `package.json` 中的 `wrangler`/`@cloudflare/workers-types`/`vercel`/`@vercel/*`/`netlify-cli`/`netlify-lambda` 依赖
3. **environment**:`CF_WORKERS`/`WRANGLER`/`CLOUDFLARE_WORKER`(Cloudflare)、`VERCEL`/`VERCEL_ENV`/`NOW_ID`(Vercel)、`NETLIFY`/`NETLIFY_DEV`(Netlify)、`globalThis.Deno`(Deno)、`globalThis.Bun`/`process.versions.bun`(Bun)、`globalThis.process.versions.node`(Node)
4. **default**:fallback 到 `standard` 预设

**用法示例**：

```typescript
// ubean.config.ts —— 显式指定 Vercel Edge 预设
import { defineConfig } from 'ubean';

export default defineConfig({
  preset: 'vercel-edge'
});

// 自动检测（推荐）：在 Vercel 平台部署时,框架会自动检测 VERCEL 环境变量
export default defineConfig({
  // 不指定 preset,运行时自动检测
});
```

```typescript
// 生成 Vercel 配置文件
import { generateVercelConfig, serializeVercelConfig } from 'ubean';

const config = generateVercelConfig({
  name: 'my-app',
  functions: { 'api/**': { memory: 1024, maxDuration: 60 } }
});
const json = serializeVercelConfig(config);
// 写入 vercel.json
```

### Vue 运行时

| API                                                                                                                                                               | 说明                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRouter()` / `createUbeanRouter(options)`                                                                                                                      | 路由                                                                                                                                                                                                                                     |
| `useCacheViews()` / `enablePageCache` / `disablePageCache` / `excludePageCache` / `includePageCache` / `invalidatePageCache` / `isPageCached` / `resetRouteCache` | 页面 KeepAlive 缓存运行时控制（自动导入自 `ubean/runtime/vue`）；`getNamedPageWrapper` 从 `@ubean/vue` 导出                                                                                                                              |
| `useHead()` / `useSeoMeta()`                                                                                                                                      | 动态 head/SEO（响应式）；静态 head 用 `definePage({ head })`                                                                                                                                                                             |
| `useData(options)` / `useAsyncData(key, fn, options?)` / `useFetch(key, url, options?)` / `invalidateData(key)` / `invalidateAll()`                               | 页面数据：`useFetch` 包 `useAsyncData`，经 `setDefaultFetch` 注入 `@soybeanjs/fetch`（不自研 client）                                                                                                                                    |
| `defer(factory)` / `useDeferredData(key, deferred)`                                                                                                               | 流式延迟数据:P0 — SSR 不阻塞初始渲染,数据在主内容后流式注入;客户端水合时从 `__UBEAN_DEFERRED__` 立即读取                                                                                                                                 |
| `withViewTransition(fn)` / `supportsViewTransitions()`                                                                                                            | View Transitions                                                                                                                                                                                                                         |
| `<Link to="...">` / `<Head>`                                                                                                                                      | 全局注册组件（无需导入）                                                                                                                                                                                                                 |
| `<Comp v-client.load / v-client.idle / v-client.visible / v-client.media="'...'" / v-client.only />`                                                              | Islands 指令(**推荐** Vue 指令语法,P9-29;框架自动水合,无需手动调用 `hydrateIslands`)                                                                                                                                                     |
| `defineIsland(Component, strategy, options?)`                                                                                                                     | 客户端 island 运行时包装器(编程式);`strategy`: 'load'\|'idle'\|'visible'\|'media'\|'only';`options`: `{ mediaQuery?, props? }`                                                                                                           |
| `defineServerIsland(Component, options?)`                                                                                                                         | 服务端 island 运行时包装器(P9-04);`options.fallback` 指定 Suspense fallback;Task 9.4 起 `options.rerenderOnPropsChange: true` 启用 props 变化触发服务端重渲染(Vite 插件自动注入组件路径)                                                 |
| `hydrateIslands(options?)`                                                                                                                                        | Islands 水合(**框架自动调用**,无需手动执行;`components` 可选,手动传入优先于自动注册)                                                                                                                                                     |
| `.server.vue` / `.client.vue` 文件约定                                                                                                                            | Server Components (Task 9,P1.5):`.server.vue` 仅 SSR 渲染(客户端不发送 JS);`.client.vue` SSR 渲染 `<div data-client-only>` 占位符,客户端 `onMounted` 后替换为真实组件。Vite 插件自动处理 `resolveId`/`load`/`transform`,用户无需手动调用 |
| `defineClientComponent(Component)`                                                                                                                                | `.client.vue` 在客户端构建中的运行时包装器(Task 9.2);通常由 Vite 插件自动生成,无需手动调用                                                                                                                                               |
| `definePairedComponent(ServerComp, ClientComp)`                                                                                                                   | Task 9.3 配对组件运行时包装器:`isClient` ref + `onMounted` 切换,初始渲染 ServerComp(SSR 输出)→ 水合后切换 ClientComp;通常由 Vite 插件在检测到同名 `.server.vue` + `.client.vue` 时自动生成虚拟包装模块,无需手动调用                      |

### Markdown

| API                                          | 说明             |
| -------------------------------------------- | ---------------- |
| `parseMarkdown(src)` / `markdownToHtml(src)` | Markdown 解析    |
| `parseFrontmatter(src)`                      | frontmatter 提取 |
| `defineMarkdownPage()`                       | Markdown 页面    |

### 预渲染

| API                                                                  | 说明                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `prerender(options)` / `collectPrerenderRoutes(pages, options)`      | SSG;`options.routeRules` 自动发现 `prerender: true` / `ppr: true` 路由(P9-03 + P9-04)                  |
| `extractPrerenderRoutesFromRules(routeRules)`                        | 从 `routeRules` 提取 `prerender: true` / `ppr: true` 模式(与 `include` 合并,受 `exclude` 过滤)         |
| `extractContentPageRoutes(docs)` / `discoverContentPageRoutes(root)` | `@ubean/content`：集合文档 → 预渲染 URL；`ubean build` 在 `content` 启用时自动发现                     |
| `extractDataPayload(html, route)` / `routeToDataFilePath(...)`       | SSG payload 提取(Task 3):从 HTML 中提取 `__UBEAN_DATA__` 为 `__data.json`,返回 `{data, html, dataUrl}` |
| `generatePrerenderManifest(result, baseUrl)`                         | 生成清单                                                                                               |
| `routeToFilePath(route, outputDir)` / `writePrerenderedFile(...)`    | 路由 → 文件路径映射/写入                                                                               |
| `extractLinks(html)` / `matchGlob(path, pattern)` / `matchAnyGlob`   | 链接提取/通配符匹配                                                                                    |
| `resolvePrerenderConfig(config)`                                     | 配置解析与默认值(`extractDataPayload` 默认 `true`)                                                     |

### i18n

| API                                                                | 说明                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `useI18n()` / `t` / `d` / `n`                                      | vue-i18n Composition API（经 `ubean/runtime/vue`）                 |
| `setLocale(code)`                                                  | 框架切换：loadLocale + cookie + `router.replace(switchLocalePath)` |
| `useLocalePath` / `useSwitchLocalePath` / `useLocaleHead`          | 路径与 SEO head composable                                         |
| `t()` / `d()` / `n()`（handler）                                   | `ubean/runtime/i18n`，读请求 ALS                                   |
| `compileLocalePaths` / `createI18nMiddleware` / `getRequestLocale` | 约束前缀路径编译 + 自动检测中间件                                  |

## 5. 扩展包 API

### @ubean/ai

```typescript
import { ubeanAiPlugin, defineAiConfig } from '@ubean/ai/vite';
import { defineAgent, defineAgentTool, defineProvider, configureAI, resolveModel } from '@ubean/ai';
import { useChat, useAgent, useAIProvider } from '@ubean/ai/runtime/vue';
import { deepseek, openrouter, openai, anthropic, google, groq, allGatewayProviders } from '@ubean/ai/gateway';
```

- **底层实现**：[Vercel AI SDK](https://ai-sdk.dev/)（`ai` + `@ai-sdk/openai-compatible`，ubean 仅提供薄编排层，agent loop / tool-calling / streaming 由 AI SDK 代理）
- `ubean.config.ts` 中 `ai: true` 或 `ai: { ... }` 启用
- **kernel**：`defineAgent(config)`（声明式配置，代理循环委托 AI SDK）、`defineAgentTool(fn)`；`defineProvider` / `configureAI` / `resolveModel` 负责 provider 解析与注册
- **Vue runtime**（`@ubean/ai/runtime/vue`）：`useChat`（自研轻量实现，直接消费 `UbeanAgent.asHandler()` 输出的 SSE 流，SSR-safe）、`useAgent`、`useAIProvider`
- **gateway 适配器**（`@ubean/ai/gateway`）：仅提供 provider 预设（DeepSeek / OpenRouter / OmniRoute / OpenAI / Anthropic / Google / Groq），**不**实现网关服务（路由/回退/成本优化留待外部网关，如 OmniRoute）
- 可选 peer 依赖：`ai` / `@ai-sdk/openai-compatible` / `hono` / `vite` / `vue`（均 optional，缺失时通过懒加载优雅降级并给出安装指引）

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

### @ubean/integrations/pwa（PWA）

> `pwa`/`fonts`/`electron`/`ui`/`pinia` 原为独立扩展包，现合并进 `@ubean/integrations`（子路径导出）。Vite 插件在 `@ubean/integrations/<name>`，浏览器安全的运行时/类型在 `@ubean/integrations` 主入口。

```typescript
import { ubeanPwaPlugin, definePwaConfig } from '@ubean/integrations/pwa';
import { usePwa } from '@ubean/integrations';
```

- **底层实现**：[vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + workbox（ubean 仅提供薄封装层）
- 构建时生成 `manifest.webmanifest` + `sw.js`（由 vite-plugin-pwa 的 `generateSW` 策略自动生成）
- `registerType`：`autoUpdate` | `prompt` | `manual`
- 5 种缓存策略：`cache-first` / `network-first` / `stale-while-revalidate` / `network-only` / `cache-only`
- `strategies` 字段按资源类型（assets/pages/images/fonts/crossOrigin）配置默认缓存规则，内部转换为 workbox `runtimeCaching`
- `injectManifest: true` 支持 `injectManifest` 策略（自定义 SW 源文件 `swSrc`）
- `usePwa()`：`isInstalled`/`isUpdateAvailable`/`isOfflineReady`/`needRefresh`

### @ubean/integrations/electron（Electron）

```typescript
import { ubeanElectronPlugin, defineElectronConfig } from '@ubean/integrations/electron';
import { DEFAULT_MAIN_ENTRY, DEFAULT_PRELOAD_INPUT } from '@ubean/integrations/electron';
import type { ElectronOptions, ElectronMainOptions, ElectronPreloadOptions } from '@ubean/integrations/electron';
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

### @ubean/integrations/pinia（Pinia）

```typescript
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/integrations/pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/integrations/pinia';
```

- **底层实现**：[Pinia](https://pinia.vuejs.org/)（ubean 仅提供薄封装层,负责 dev 预构建优化和 SSR 状态水合辅助函数）
- `ubean.config.ts` 中 `pinia: true` 或 `pinia: { ... }` 启用
- **dev 预构建优化**：自动将 `pinia` 加入 Vite 的 `optimizeDeps.include`,避免首次请求扫描延迟
- **SSR 状态水合**：通过 `defineApp({ serializeState, hydrateState })` 钩子集成,在 HTML 中注入 `__UBEAN_STATE__` script 标签
- **零侵入**：Pinia 本身仍从 `pinia` 包导入(`createPinia`/`defineStore`/`storeToRefs` 等),`@ubean/integrations` 仅提供集成胶水
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
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

> Pinia 本身请直接从 `pinia` 导入(`import { createPinia, defineStore } from 'pinia'`),`@ubean/integrations/pinia` 仅负责构建集成和 SSR 水合辅助。

### @ubean/integrations/ui（@soybeanjs/ui）

```typescript
import { ubeanUiPlugin, defineUiConfig } from '@ubean/integrations/ui';
import type { UiOptions } from '@ubean/integrations/ui';
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

> 组件库本身请直接从 `@soybeanjs/ui` 导入（`import { SButton } from '@soybeanjs/ui'`），`@ubean/integrations/ui` 仅负责构建集成。

| 模块                             | 内容                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ubean:pages`                    | 页面路由数据                                                                                                                       |
| `ubean:routes`                   | API 路由数据                                                                                                                       |
| `ubean:meta`                     | 路由元数据                                                                                                                         |
| `ubean:app-config`               | 应用配置                                                                                                                           |
| `ubean:locales`                  | 区域设置数据                                                                                                                       |
| `virtual:ubean-pages`            | Vue Router 路由表 + 页面/布局 loader + `resolveLoadingComponent`/`hasNotFoundPage`（自动检测 `pages/loading.vue`/`pages/404.vue`） |
| `virtual:ubean-islands-registry` | Islands 组件自动注册表（由 `@ubean/islands` Vite 插件生成）                                                                        |

## 7. 内置路由

| 路由                       | 说明                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/_health`                 | 健康检查                                                                                                      |
| `/_openapi.json`           | OpenAPI schema                                                                                                |
| `/_scalar`                 | Scalar UI                                                                                                     |
| `/_iconify`                | 本地 SVG 服务（dev）                                                                                          |
| `/_devtools`               | DevTools（dev）                                                                                               |
| `POST /__actions`          | Server Actions RPC 端点(P9-02,由 `createActionsMiddleware` 处理)                                              |
| `POST /__server-component` | Task 9.4:Server Component props 重渲染端点(由 `createServerComponentMiddleware` 处理,`@ubean/islands/server`) |

## 8. 注意事项

1. **包名**：发布包名为 `ubean`（非 `@ubean/core`）
2. **API 路由**：使用 void 风格命名导出（`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS`/`HEAD`），不使用 `.get.ts`/`.post.ts` 后缀
3. **`defineApp`**：基于选项调用 `defineApp(options)`（返回 `ResolvedAppConfig`）；通过 `onAppCreated`/`onClientReady` 回调获取命令式访问
4. **`definePage`**：静态 head 通过 `head` 字段声明，不使用顶层 `title`
5. **虚拟模块前缀**：用 `virtual:ubean-`（`#ubean-` 会因 URL hash 导致 404）
6. **客户端导入入口**：客户端自动导入用 `ubean/runtime/vue` 或 `ubean/client`；从 `ubean` 主入口导入会触发 Vite 在浏览器环境预构建服务端依赖（unocss、oxc-parser WASM）
7. **`createUbeanApp` 消歧**：`@ubean/app` / `ubean/runtime/app` 的 `createUbeanApp` 返回 Hono `UbeanApp`；`@ubean/client` 的 Vue 工厂为 `createUbeanClientApp`（返回 `{ app, router, head, page }`）。服务端入口用 `ubean/runtime/app`（Hono），客户端用 `createUbeanClientApp`
8. **中间件注册**：将 async 函数传给 `server.middlewares.use()` 时包装在 `Promise.resolve().then().catch()` 中
9. **Service Worker**：生成 RUNTIME 全局时用硬编码字符串 `'ubean-runtime'`，避免模板替换
10. **宏处理**：`macros.ts` 的 `MACRO_NAMES` 只保留 `definePage`；包含 `defineHandlerMeta`/`defineMiddleware` 会被 build strip，导致运行时函数调用语法错误
11. **路由挂载**：`registerRoutes` 内部用 `app.on(method.toLowerCase(), path, ...)`，避免直接调用 `app[honoMethod(method)]`
12. **测试工作目录**：CRUD 测试用临时目录 + `afterEach` 清理，避免 `process.cwd()` 依赖
13. **SSR 渲染**：layout 循环中在块作用域内 `const child = vnode` 引用，避免闭包捕获导致无限递归
14. **参考实现**：参考 void/nitro 时学习架构模式后重新实现，保证 API 一致
15. **i18n**：配置写在 `ubean.config.ts` 的 `i18n`；客户端从 `ubean/runtime/vue` 导入 `useI18n`/`setLocale`（vue-i18n 11，必须 `legacy: false`）；不要从 `ubean` 主入口导入 Vue `useI18n`
16. **临时文件**：用项目根目录下的 `.temp` 目录存储临时文件
17. **Islands 水合**：常规 islands 由框架在客户端入口自动水合（双重 rAF 时机 + SPA 导航后）；仅在需要传入手动注册组件（escape hatch）时在 `onClientReady` 中额外调用 `hydrateIslands()`

## 9. 开发命令

```bash
pnpm install          # 安装依赖
pnpm typecheck        # 类型检查（vue-tsc）
pnpm lint             # ESLint（Vite-Plus/OXC + Vue）
pnpm test             # 运行测试（vitest）
pnpm analyze          # 读 Vite client manifest，写 `.ubean/bundle-baseline.json`（需先 build 示例）
pnpm dev              # 启动开发服务器（examples/ubean-test）
pnpm build            # 构建
```

要求：Node.js、pnpm `11.22.0`（见根 `packageManager`）

## 10. 文档导航

| 资源                      | 路径                                                                                                               | 内容                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 文档索引                  | [docs/README.md](docs/README.md)                                                                                   | 仓库级工程文档索引                                                                     |
| 路线图（2026Q4–2027H1）   | [docs/roadmap.md](docs/roadmap.md)                                                                                 | i18n 落地后还债与用户缺口（ADR-0010；任务 ID 不进站点）                                |
| 领域词汇表                | [docs/glossary.md](docs/glossary.md)                                                                               | 领域建模词汇表 + ADR 决策索引                                                          |
| i18n 决策                 | [docs/adr/0009-i18n-engine-and-compact-locale-routing.md](docs/adr/0009-i18n-engine-and-compact-locale-routing.md) | vue-i18n 11 + 约束前缀；任务清单已删                                                   |
| 竞品北极星                | [docs/adr/0010-competitive-north-star-and-gap-filter.md](docs/adr/0010-competitive-north-star-and-gap-filter.md)   | 对标 Next 能力 / Nuxt 约定；RSC 刻意不做                                               |
| 架构 / 指南 / API（正文） | [apps/docs/src/content/](apps/docs/src/content/)                                                                   | 中英文档源（overview / routing / runtime / framework-comparison / guide / reference…） |
| CLI 命令                  | [skills/ubean/command/ubean.md](skills/ubean/command/ubean.md)                                                     | CLI 命令文档                                                                           |
| AI Skill                  | [skills/ubean/SKILL.md](skills/ubean/SKILL.md)                                                                     | Agent 技能入口                                                                         |
| 示例项目                  | [examples/ubean-test/](examples/ubean-test/)                                                                       | 完整全栈示例 + 测试（virtual 路由模式）                                                |
| 示例项目                  | [examples/platform-drivers/](examples/platform-drivers/)                                                           | Cloudflare D1/Queue 与 Vercel Postgres/KV 非内存驱动                                   |
| 示例项目                  | [examples/client-only-spa/](examples/client-only-spa/)                                                             | 纯客户端 SPA 示例（复用 @ubean/vue 内核）                                              |
| 示例项目                  | [examples/frontend-only/](examples/frontend-only/)                                                                 | 纯前端示例（无 API/SSR）                                                               |
| 示例项目                  | [examples/routing-file-mode/](examples/routing-file-mode/)                                                         | 路由文件生成模式示例                                                                   |
