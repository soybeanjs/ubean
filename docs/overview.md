# 项目概览与约定

## 1. 项目概述

**ubean** 是一个基于 Vite-Plus 的 Vue 专属全栈元框架，融合了 void 的 Inertia 式 SSR 页面路由和 nitro 的跨平台部署能力。

### 1.1 核心定位

- **Vue 专属**: 仅支持 Vue 3，深度集成 Vue 生态
- **基于 Vite-Plus**: 使用 vite-plus 作为构建工具链核心
- **跨平台部署**: 借鉴 nitro 的 preset 系统，支持 Node.js、Bun、Deno、Cloudflare、Vercel 等多平台
- **函数式编程**: 严格遵循 TypeScript 函数式编程范式
- **完整测试**: 基于 vitest 实现全量测试覆盖

### 1.2 本地参考项目

| 项目                   | 本地路径                                                                                                            | 参考内容                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **void**               | [/Users/soybean/Web/Projects/OpenSource/void](file:///Users/soybean/Web/Projects/OpenSource/void)                   | 主要参考对象：文件式路由、defineHandler 中间件链模式、Islands 架构、Markdown 页面、Better Auth 集成、Queues Proxy 动态绑定、Cron Jobs、Skills/Agent 系统、DevTools 风格、Vite-Plus 构建、Inertia 式 SSR 页面渲染（请求验证改用 hono-openapi 的 validator/describeRoute） |
| **@void/vue**          | [/Users/soybean/Web/Projects/OpenSource/void](file:///Users/soybean/Web/Projects/OpenSource/void-vue)               | void针专属vue插件                                                                                                                                                                                                                                                        |
| **nitro**              | [/Users/soybean/Web/Projects/OpenSource/nitro](file:///Users/soybean/Web/Projects/OpenSource/nitro)                 | 多平台 preset 系统（30+ 部署平台）、routeRules（缓存/headers/重定向/代理）、OpenAPI 自动生成（Scalar UI）、Storage 层（unstorage）、Database 层（db0）、预渲染/SSG、运行时插件生命周期                                                                                   |
| **hono-ssr**           | [/Users/soybean/Web/Projects/SoybeanJS/hono-ssr](file:///Users/soybean/Web/Projects/SoybeanJS/hono-ssr)             | `createDefineRoute` 多重重载类型推导模式，中间件链 Input 类型通过 `IntersectNonAnyTypes` 从左到右累积，确保 validator 定义的 params/query/json 类型流向后续 handler                                                                                                      |
| **elegant-router**     | [/Users/soybean/Web/Projects/SoybeanJS/elegant-router](file:///Users/soybean/Web/Projects/SoybeanJS/elegant-router) | 类型化路由名称（RouteName 联合类型）、reuse 路由（`xxx.reuse.ts` 复用页面组件）、CLI 路由增删改（交互式命令）、虚拟模块暴露全量路由数据、路由组命名转换                                                                                                                  |
| **@soybeanjs/request** | [/Users/soybean/Web/Projects/SoybeanJS/request](file:///Users/soybean/Web/Projects/SoybeanJS/request)               | 基于 axios 的类型安全 fetch client 设计，标准模式（throw on error）与 flat 模式（`{ data, error }`）双模式，基于 openapi-typescript 生成的 paths 类型推导请求/响应类型                                                                                                   |

### 1.3 参考项目融合策略

| 特性           | void                        | nitro                    | ubean 取舍                                                  |
| -------------- | --------------------------- | ------------------------ | ----------------------------------------------------------- |
| HTTP 框架      | Hono                        | h3                       | ✅ Hono（轻量、现代、类型友好）                             |
| 构建工具       | Vite-Plus                   | Vite/Rollup/Rolldown     | ✅ Vite-Plus                                                |
| 页面路由       | Inertia 式 SSR + 框架适配器 | renderer 抽象            | ✅ Inertia 式，仅 Vue 适配器                                |
| API 路由       | 文件式路由 (routes/)        | 文件式路由 (server/api/) | ✅ 文件式路由 (routes/)                                     |
| 平台适配       | Cloudflare 为主             | 30+ 平台 preset          | ✅ nitro 风格 preset 系统                                   |
| 部署平台       | Void Cloud (自有平台)       | 各平台独立部署           | ❌ 移除，改为通用部署                                       |
| 登录认证       | Better Auth 内置            | 无内置                   | ✅ 独立扩展包 `@ubean/auth`（Better Auth集成+内置fallback） |
| 数据库         | Drizzle ORM + D1/PG         | db0 抽象层               | ✅ Drizzle ORM + 多数据库驱动                               |
| 环境变量       | defineEnv + Schema 验证     | runtimeConfig            | ✅ defineEnv + 类型安全验证                                 |
| 缓存/ISR       | KV + Edge Cache             | routeRules 缓存          | ✅ 融合两者                                                 |
| Skills 系统    | ✅ Agent 路由               | ❌                       | ✅ 保留并增强                                               |
| 插件系统       | Vite 插件                   | 运行时插件 + 模块系统    | ✅ Vite 插件 + 运行时插件                                   |
| Hooks 系统     | Wrangler hooks              | Hookable 生命周期        | ✅ Hookable 完整生命周期                                    |
| 类型安全客户端 | typed fetch                 | 无内置                   | ✅ 自动生成类型安全客户端                                   |
| OpenAPI 文档   | ❌                          | ✅ Scalar/Swagger UI     | ✅ nitro 风格 OpenAPI 自动生成                              |
| App 实例定制   | ❌ 硬编码入口               | ❌                       | ✅ defineApp 暴露 Vue 实例                                  |

---

## 2. 技术栈

### 2.1 工作区计划依赖

下列为工作区聚合清单，实际归属必须遵循 §2.4；它不是 `packages/ubean` 的单包依赖清单。

```json
{
  "hono": "^4.x",
  "vite": "catalog:",
  "vite-plus": "catalog:",
  "defu": "^6.x",
  "pathe": "^2.x",
  "hookable": "^6.x",
  "citty": "^0.2.x",
  "c12": "^4.x",
  "consola": "^3.x",
  "tinyglobby": "^0.2.x",
  "magic-string": "^0.30.x",
  "estree-walker": "^3.x",
  "ofetch": "^2.x",
  "ohash": "^2.x",
  "ufo": "^1.x",
  "unstorage": "^2.x",
  "db0": "^0.3.x",
  "drizzle-orm": "^0.45.x",
  "crossws": "^0.4.x",
  "unimport": "^6.x",
  "unenv": "^2.x",
  "std-env": "^4.x",
  "knitwork": "^1.x",
  "mlly": "^1.x",
  "scule": "^1.x",
  "confbox": "^0.2.x",
  "@scalar/openapi-types": "^0.2.x",
  "@standard-schema/spec": "^1.x",
  "enquirer": "^2.x",
  "ts-morph": "^24.x",
  "birpc": "^0.2.x",
  "fuse.js": "^7.x",
  "@soybeanjs/ui": "^0.x",
  "@soybeanjs/headless": "^0.x",
  "@codemirror/state": "^6.x",
  "@codemirror/view": "^6.x",
  "@codemirror/commands": "^6.x",
  "@codemirror/language": "^6.x",
  "@codemirror/lang-json": "^6.x",
  "@codemirror/lang-javascript": "^6.x",
  "@codemirror/lang-vue": "^0.x",
  "@codemirror/theme-one-dark": "^6.x",
  "unplugin-vue-components": "^28.x",
  "@iconify/vue": "^5.x",
  "@iconify/utils": "^3.x",
  "markdown-exit": "^1.x",
  "@shikijs/markdown-exit": "^4.x",
  "front-matter": "^4.x"
}
```

### 2.2 开发依赖

```json
{
  "@vitejs/plugin-vue": "^6.x",
  "vitest": "catalog:",
  "@vitest/coverage-v8": "^4.x",
  "@playwright/test": "^1.x",
  "typescript": "^7.x",
  "vue": "^3.x",
  "vue-tsc": "^3.x",
  "@types/enquirer": "^2.x"
}
```

### 2.3 包管理器

- **<pnpm@11.x>** (monorepo + catalog 管理)

### 2.4 依赖与包边界

依赖按运行时边界拆分，核心包不得因为可选功能或单个平台实现而携带额外运行时代码：

| 范围                  | 依赖策略                                                                     | 示例                                                            |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/ubean` 核心 | 仅保留 Node 与 edge 共用的依赖                                               | Hono、Hookable、rou3、Standard Schema 类型                      |
| Vue 集成              | Vue 及 Vue Router 使用 `peerDependencies`；SSR renderer 按 server entry 引入 | `vue`、`vue-router`、`@vue/server-renderer`                     |
| preset 包             | 每个平台独立包和 CI；不被核心包静态导入                                      | `@ubean/preset-cloudflare`                                      |
| 浏览器传输适配器      | 仅在浏览器 client entry 打包；不进入 Node、edge 或 SSR bundle                | `ubean/client-xhr`（上传进度）、数据库驱动                      |
| DevTools 与 Auth/PWA  | 独立包，默认不进入生产 bundle                                                | `@ubean/devtools`、`@ubean/auth`、`@ubean/pwa`                  |
| 资源与内容扩展        | 独立包；依赖及平台实现按功能拆分，核心不静态引入                             | `@ubean/icon`、`@ubean/image`、`@ubean/content`、`@ubean/fonts` |

- 文档示例若使用 `zod`，必须标记为用户项目依赖；框架核心仅依赖 Standard Schema 规范，不绑定某个验证库。
- `@ubean/icon` 将 `@iconify/vue` 作为 Vue peer dependency，`@iconify-json/<collection>` 由用户按需安装为开发依赖；禁止将全量 `@iconify/json` 加入框架或应用默认依赖。
- `rou3`、`env-runner`、`@vue/server-renderer`、`vue-router`、Scalar UI 以及端到端测试工具必须在实现对应功能前写入实际 package manifest，并确定 `dependencies`、`peerDependencies` 或 `devDependencies` 归属。
- 每个新增依赖需说明目标包、运行时、许可、bundle 影响和替代方案；禁止使用 `latest` 作为发布依赖版本。

---

## 3. 目录结构设计

```
ubean/
├── packages/
│   └── ubean/                          # 主包
│       ├── src/
│       │   ├── core/                   # 核心模块
│       │   │   ├── config/             # 配置系统
│       │   │   │   ├── loader.ts       # 配置加载器 (c12)
│       │   │   │   ├── defaults.ts     # 默认配置
│       │   │   │   ├── resolvers/      # 配置解析器
│       │   │   │   │   ├── paths.ts
│       │   │   │   │   ├── assets.ts
│       │   │   │   │   ├── imports.ts
│       │   │   │   │   ├── route-rules.ts
│       │   │   │   │   ├── runtime-config.ts
│       │   │   │   │   ├── storage.ts
│       │   │   │   │   ├── database.ts
│       │   │   │   │   └── tsconfig.ts
│       │   │   │   └── update.ts       # 配置更新
│       │   │   │
│       │   │   ├── app/                # 应用实例
│       │   │   │   ├── ubean.ts        # createUbean 主函数
│       │   │   │   ├── hooks.ts        # 生命周期 hooks 定义
│       │   │   │   └── types.ts        # 核心类型 (Ubean, UbeanOptions)
│       │   │   │
│       │   │   ├── routing/            # 路由系统
│       │   │   │   ├── router.ts       # 路由器 (基于 rou3)
│       │   │   │   ├── scan.ts         # 文件扫描 (AST 检测 HTTP 命名导出)
│       │   │   │   ├── detect-exports.ts # detectHttpExports: AST 检测 GET/POST 等命名导出
│       │   │   │   ├── pages.ts        # Pages 路由扫描 (pages/**/*.vue + .reuse.ts)
│       │   │   │   ├── layouts.ts      # Layouts 扫描 (layouts/**/*.vue + index.vue)
│       │   │   │   ├── define-page.ts  # definePage 宏 AST 提取
│       │   │   │   ├── page-meta.ts    # 页面 meta 解析 (PageMeta 合并)
│       │   │   │   ├── route-name.ts   # 路由名称推导 (文件名 → PascalCase)
│       │   │   │   ├── websocket.ts    # WebSocket 路由扫描
│       │   │   │   ├── cron.ts         # Cron 任务扫描
│       │   │   │   ├── compile.ts      # 路由编译 (生成虚拟模块代码)
│       │   │   │   ├── handler.ts      # handler 类型
│       │   │   │   └── middleware.ts   # 中间件处理
│       │   │   │
│       │   │   ├── cli/                # CLI 命令
│       │   │   │   ├── index.ts        # CLI 入口 (citty)
│       │   │   │   ├── dev.ts          # ubean dev: 启动开发服务器
│       │   │   │   ├── build.ts        # ubean build: 生产构建
│       │   │   │   ├── prepare.ts      # ubean prepare: 类型生成 (dev/build 前自动执行)
│       │   │   │   ├── preview.ts      # ubean preview: 预览生产构建
│       │   │   │   ├── init.ts         # ubean init: 交互式初始化项目
│       │   │   │   ├── backup.ts       # 备份/恢复通用逻辑 (.ubean/backup/)
│       │   │   │   ├── page/           # 页面路由命令 (ubean page *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   ├── add-reuse.ts
│       │   │   │   │   ├── delete.ts
│       │   │   │   │   ├── update.ts
│       │   │   │   │   ├── recovery.ts
│       │   │   │   │   └── list.ts
│       │   │   │   ├── api/            # API 接口命令 (ubean api *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   ├── delete.ts
│       │   │   │   │   ├── update.ts
│       │   │   │   │   ├── list.ts
│       │   │   │   │   └── test.ts     # 命令行接口测试
│       │   │   │   ├── env/            # 环境变量命令 (ubean env *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   ├── delete.ts
│       │   │   │   │   ├── update.ts
│       │   │   │   │   ├── list.ts
│       │   │   │   │   └── validate.ts
│       │   │   │   ├── layout/         # 布局命令 (ubean layout *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   ├── delete.ts
│       │   │   │   │   └── list.ts
│       │   │   │   ├── cron/           # 定时任务命令 (ubean cron *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   ├── delete.ts
│       │   │   │   │   ├── update.ts
│       │   │   │   │   ├── list.ts
│       │   │   │   │   └── run.ts       # 手动触发
│       │   │   │   ├── config/         # 配置命令 (ubean config *)
│       │   │   │   │   ├── get.ts
│       │   │   │   │   └── set.ts
│       │   │   │   ├── middleware/     # 中间件命令 (ubean middleware *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   └── list.ts
│       │   │   │   ├── plugin/         # 插件命令 (ubean plugin *)
│       │   │   │   │   ├── add.ts
│       │   │   │   │   └── list.ts
│       │   │   │   ├── devtools/       # DevTools 命令 (ubean devtools *)
│       │   │   │   │   ├── enable.ts
│       │   │   │   │   ├── disable.ts
│       │   │   │   │   └── ai-setup.ts  # AI provider 配置
│       │   │   │   └── shared/         # CLI 共享工具
│       │   │   │       ├── enquirer.ts # 交互式选择
│       │   │   │       ├── fs-ops.ts   # 文件 AST 操作
│       │   │   │       └── templates/  # 代码模板
│       │   │   │
│       │   │   ├── devtools/           # DevTools 开发面板
│       │   │   │   ├── server/         # DevTools 服务端 (Vite 插件端)
│       │   │   │   │   ├── index.ts    # DevTools Vite 插件
│       │   │   │   │   ├── rpc.ts      # RPC handler 注册与分发
│       │   │   │   │   ├── hooks.ts    # DevTools hooks 系统 (hookable)
│       │   │   │   │   ├── fs-ops.ts   # 文件操作 (AST + 备份)
│       │   │   │   │   ├── config.ts   # 配置 CRUD (ubean.config.ts)
│       │   │   │   │   ├── env.ts      # 环境变量 CRUD (.env)
│       │   │   │   │   ├── pages.ts    # 页面路由 CRUD (复用 CLI 逻辑)
│       │   │   │   │   ├── api.ts      # API 路由 CRUD (复用 CLI 逻辑)
│       │   │   │   │   ├── cron.ts     # Cron 任务 CRUD
│       │   │   │   │   ├── storage.ts  # KV/Storage 浏览
│       │   │   │   │   ├── database.ts # 数据库面板
│       │   │   │   │   ├── terminal.ts  # 内嵌终端
│       │   │   │   │   ├── ai.ts       # AI 工具调用层 (LLM function calling)
│       │   │   │   │   └── tabs.ts     # 自定义 Tab 注册
│       │   │   │   ├── client/         # DevTools 客户端 (iframe 内 Vue 应用, UI基于@soybeanjs/ui)
│       │   │   │   │   ├── App.vue     # DevTools 主应用
│       │   │   │   │   ├── rpc.ts      # RPC Client (postMessage Proxy)
│       │   │   │   │   ├── views/      # 各 Tab 视图
│       │   │   │   │   │   ├── Overview.vue
│       │   │   │   │   │   ├── Pages/
│       │   │   │   │   │   ├── ApiRoutes/
│       │   │   │   │   │   ├── Config.vue
│       │   │   │   │   │   ├── Env.vue
│       │   │   │   │   │   ├── Layouts.vue
│       │   │   │   │   │   ├── Middlewares.vue
│       │   │   │   │   │   ├── Plugins.vue
│       │   │   │   │   │   ├── CronJobs.vue
│       │   │   │   │   │   ├── Storage.vue
│       │   │   │   │   │   ├── Database.vue
│       │   │   │   │   │   ├── Hooks.vue
│       │   │   │   │   │   ├── VirtualFiles.vue
│       │   │   │   │   │   ├── Terminal.vue
│       │   │   │   │   │   └── AI/
│       │   │   │   │   ├── components/ # UI 组件 (表单/树/代码编辑器)
│       │   │   │   │   └── composables/# DevTools composables
│       │   │   │   ├── overlay/        # 宿主端浮动按钮 (注入到应用)
│       │   │   │   │   └── DevToolsButton.vue
│       │   │   │   ├── define-tab.ts   # defineDevToolsTab API
│       │   │   │   └── types.ts        # DevTools 类型定义
│       │   │   │
│       │   │   ├── build/              # 构建系统
│       │   │   │   ├── build.ts        # 构建入口
│       │   │   │   ├── prepare.ts      # 构建准备
│       │   │   │   ├── plugins/        # Rollup/Vite 插件
│       │   │   │   │   ├── externals.ts
│       │   │   │   │   ├── raw.ts
│       │   │   │   │   ├── server-main.ts
│       │   │   │   │   ├── sourcemap-min.ts
│       │   │   │   │   ├── virtual.ts
│       │   │   │   │   ├── route-meta.ts   # 路由 meta 提取 (defineHandlerMeta/export const meta AST 解析)
│       │   │   │   │   └── app-entry.ts    # defineApp 入口生成
│       │   │   │   ├── virtual/        # 虚拟模块生成
│       │   │   │   │   ├── app.ts
│       │   │   │   │   ├── routing.ts
│       │   │   │   │   ├── routing-meta.ts  # 路由 meta (OpenAPI 用)
│       │   │   │   │   ├── pages.ts         # ubean:pages 虚拟模块 (全量路由数据)
│       │   │   │   │   ├── layouts.ts       # 布局组件懒加载映射
│       │   │   │   │   ├── page-types.ts    # .ubean/pages.d.ts 类型生成
│       │   │   │   │   ├── openapi.ts       # OpenAPI JSON 端点处理
│       │   │   │   │   ├── plugins.ts
│       │   │   │   │   ├── error-handler.ts
│       │   │   │   │   ├── public-assets.ts
│       │   │   │   │   ├── runtime-config.ts
│       │   │   │   │   ├── storage.ts
│       │   │   │   │   ├── polyfills.ts
│       │   │   │   │   └── _all.ts
│       │   │   │   ├── vite/           # Vite 集成
│       │   │   │   │   ├── plugin.ts   # ubean Vite 插件
│       │   │   │   │   ├── dev.ts      # 开发服务器
│       │   │   │   │   ├── build.ts    # Vite 构建
│       │   │   │   │   ├── bundler.ts
│       │   │   │   │   ├── env.ts      # 环境配置
│       │   │   │   │   ├── services.ts
│       │   │   │   │   └── types.ts
│       │   │   │   ├── rolldown/       # Rolldown 构建支持
│       │   │   │   │   ├── build.ts
│       │   │   │   │   ├── config.ts
│       │   │   │   │   ├── dev.ts
│       │   │   │   │   └── prod.ts
│       │   │   │   └── rollup/         # Rollup 构建支持
│       │   │   │       ├── build.ts
│       │   │   │       ├── config.ts
│       │   │   │       ├── dev.ts
│       │   │   │       ├── error.ts
│       │   │   │       └── prod.ts
│       │   │   │
│       │   │   ├── dev/                # 开发服务器
│       │   │   │   ├── server.ts       # 开发服务器实例
│       │   │   │   ├── app.ts          # 开发请求处理
│       │   │   │   └── vfs.ts          # 虚拟文件系统
│       │   │   │
│       │   │   ├── preset/             # 平台预设系统
│       │   │   │   ├── _utils/
│       │   │   │   │   ├── preset.ts   # definePreset 工具
│       │   │   │   │   └── fs.ts
│       │   │   │   ├── _resolve.ts     # preset 解析逻辑
│       │   │   │   ├── _all.gen.ts     # 自动生成的 preset 索引
│       │   │   │   ├── _types.gen.ts   # 自动生成的 preset 类型
│       │   │   │   ├── node/           # Node.js 平台
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   ├── cluster.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       ├── node-server.ts
│       │   │   │   │       └── node-cluster.ts
│       │   │   │   ├── bun/            # Bun 平台
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       └── bun.ts
│       │   │   │   ├── deno/           # Deno 平台
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       ├── deno-server.ts
│       │   │   │   │       └── deno-deploy.ts
│       │   │   │   ├── cloudflare/     # Cloudflare Workers
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   ├── types.ts
│       │   │   │   │   ├── utils.ts
│       │   │   │   │   ├── unenv/
│       │   │   │   │   │   └── node-compat.ts
│       │   │   │   │   └── entry-exports.ts
│       │   │   │   ├── vercel/         # Vercel
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   ├── types.ts
│       │   │   │   │   ├── utils.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       ├── isr.ts
│       │   │   │   │       ├── vercel.node.ts
│       │   │   │   │       ├── cron-handler.ts
│       │   │   │   │       └── queue.dev.ts
│       │   │   │   ├── netlify/        # Netlify
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   ├── types.ts
│       │   │   │   │   ├── utils.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       ├── netlify.ts
│       │   │   │   │       └── netlify-edge.ts
│       │   │   │   ├── _ubean/         # 内部 preset (dev, prerender)
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   ├── ubean-dev.ts
│       │   │   │   │   ├── ubean-prerender.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       └── ubean-dev.ts
│       │   │   │   ├── _static/
│       │   │   │   │   └── preset.ts
│       │   │   │   ├── standard/
│       │   │   │   │   ├── preset.ts
│       │   │   │   │   └── runtime/
│       │   │   │   │       └── server.ts
│       │   │   │   ├── aws-lambda/
│       │   │   │   ├── azure/
│       │   │   │   ├── firebase/
│       │   │   │   ├── digitalocean/
│       │   │   │   ├── edgeone/
│       │   │   │   ├── render/
│       │   │   │   ├── heroku/
│       │   │   │   └── ... (其他平台)
│       │   │   │
│       │   │   ├── pages/              # Pages 路由系统 (Inertia 式)
│       │   │   │   ├── index.ts        # Pages 核心逻辑
│       │   │   │   ├── define-page.ts  # definePage 编译时宏 (AST 提取 + 类型定义)
│       │   │   │   ├── layout.ts       # Layout 解析 (layouts/ 目录扫描 + 嵌套布局)
│       │   │   │   ├── reuse.ts        # Reuse 路由处理 (.reuse.ts 文件)
│       │   │   │   ├── protocol.ts     # Pages 通信协议
│       │   │   │   ├── serialize.ts    # 服务端序列化
│       │   │   │   ├── head.ts         # Head 管理
│       │   │   │   ├── client.ts       # 客户端运行时
│       │   │   │   ├── prefetch.ts     # 预取
│       │   │   │   ├── use-page.ts     # usePage composable
│       │   │   │   └── islands-plugin.ts # Islands 架构插件
│       │   │   │
│       │   │   │   ├── codegen/            # 代码生成 (类型推导)
│       │   │   │   ├── route-types.ts  # .ubean/routes.d.ts 生成 (API paths 类型)
│       │   │   │   ├── page-types.ts   # .ubean/pages.d.ts 生成 (RouteName/LayoutName 类型)
│       │   │   │   ├── env-types.ts    # env.d.ts 生成
│       │   │   │   ├── queue-types.ts  # .ubean/queues.d.ts 生成
│       │   │   │   ├── auto-imports.ts # .ubean/auto-imports.d.ts 生成
│       │   │   │   ├── components.ts   # .ubean/components.d.ts 生成
│       │   │   │   └── tsconfig.ts     # tsconfig 自动合并
│       │   │   │
│       │   │   ├── runtime/            # 运行时模块
│       │   │   │   ├── app.ts          # 运行时应用实例
│       │   │   │   ├── handler.ts      # 请求处理器 (defineHandler, defineHandlerMeta, defineMiddleware; validator/describeRoute/resolver 从 hono-openapi 重导出)
│       │   │   │   ├── response.ts     # 响应工具
│       │   │   │   ├── client.ts       # axios 类型安全客户端 (createClient)
│       │   │   │   ├── client-flat.ts  # 扁平模式客户端 (createFlatClient)
│       │   │   │   ├── cron.ts         # defineScheduled 定时任务
│       │   │   │   ├── internal-fetch.ts # 服务端内部 fetch
│       │   │   │   ├── fetch-stream.ts # 流式 fetch
│       │   │   │   ├── cache.ts        # ISR 缓存
│       │   │   │   ├── isr-cache.ts    # ISR 缓存实现
│       │   │   │   ├── env.ts          # 服务端环境变量
│       │   │   │   ├── env-public.ts   # 公共环境变量
│       │   │   │   ├── env-helpers.ts  # 环境变量 Schema 构建器
│       │   │   │   ├── log.ts          # 日志
│       │   │   │   ├── plugin.ts       # 运行时插件系统
│       │   │   │   ├── context.ts      # AsyncLocalStorage 上下文
│       │   │   │   ├── error.ts        # 错误处理
│       │   │   │   ├── headers.ts      # Headers/重定向/重写
│       │   │   │   ├── router.ts       # 运行时路由
│       │   │   │   ├── static.ts       # 静态资源服务
│       │   │   │   ├── task.ts         # 定时任务
│       │   │   │   ├── websocket.ts    # WebSocket 支持
│       │   │   │   ├── ws-server.ts    # WebSocket 服务端
│       │   │   │   ├── storage.ts      # Storage (unstorage)
│       │   │   │   ├── database.ts     # 数据库抽象
│       │   │   │   ├── kv.ts           # KV 存储
│       │   │   │   ├── queue.ts        # 队列
│       │   │   │   ├── i18n.ts         # i18n 国际化运行时
│       │   │   │   ├── sse.ts          # Server-Sent Events
│       │   │   │   ├── sse-client.ts   # SSE 客户端
│       │   │   │   ├── validator.ts    # 通用验证器支持
│       │   │   │   ├── internal/       # 内部运行时模块
│       │   │   │   │   ├── app.ts
│       │   │   │   │   ├── plugin.ts
│       │   │   │   │   ├── routing.ts
│       │   │   │   │   ├── route-rules.ts
│       │   │   │   │   ├── cache.ts
│       │   │   │   │   ├── storage.ts
│       │   │   │   │   ├── task.ts
│       │   │   │   │   ├── routes/      # 内置路由处理器
│       │   │   │   │   │   ├── openapi.ts  # /_openapi.json
│       │   │   │   │   │   └── scalar.ts    # /_scalar UI
│       │   │   │   │   └── ...
│       │   │   │   └── virtual/        # 虚拟运行时模块
│       │   │   │       ├── app.ts
│       │   │   │       ├── routing.ts
│       │   │   │       ├── routing-meta.ts
│       │   │   │       ├── plugins.ts
│       │   │   │       ├── polyfills.ts
│       │   │   │       ├── public-assets.ts
│       │   │   │       ├── runtime-config.ts
│       │   │   │       ├── server-assets.ts
│       │   │   │       ├── storage.ts
│       │   │   │       ├── error-handler.ts
│       │   │   │       ├── database.ts
│       │   │   │       ├── tasks.ts
│       │   │   │       ├── tracing.ts
│       │   │   │       ├── renderer-template.ts
│       │   │   │       └── feature-flags.ts
│       │   │   │
│       │   │   ├── vue/                # Vue 专属适配器
│       │   │   │   ├── plugin.ts       # Vue Vite 插件 (ubeanVue)
│       │   │   │   ├── client.ts       # Vue 客户端运行时
│       │   │   │   ├── router.ts       # 客户端路由 (Link, useRouter)
│       │   │   │   ├── head.ts         # Vue Head 管理
│       │   │   │   ├── islands.ts      # Vue Islands 支持
│       │   │   │   ├── server-renderer.ts # 服务端渲染
│       │   │   │   ├── app-entry.ts    # defineApp 处理 (SSR/Client 入口生成)
│       │   │   │   ├── view-transition.ts # 视图过渡
│       │   │   │   ├── composables/    # Vue Composables
│       │   │   │   │   ├── usePage.ts
│       │   │   │   │   ├── useRouter.ts
│       │   │   │   │   ├── useHead.ts
│       │   │   │   │   └── useApp.ts
│       │   │   │   └── components/     # Vue 内置组件
│       │   │   │       ├── Link.ts
│       │   │   │       ├── Head.ts
│       │   │   │       └── ClientOnly.ts
│       │   │   │
│       │   │   ├── plugins/            # 内置 Vite 插件
│       │   │   │   ├── client-stubs.ts     # 客户端 stub
│       │   │   │   ├── env-schema.ts      # 环境变量 Schema
│       │   │   │   ├── env-client-guard.ts # 客户端守卫
│       │   │   │   ├── binding-runtime.ts # 平台 binding 运行时
│       │   │   │   ├── dev-triggers.ts    # 开发触发器
│       │   │   │   ├── drizzle.ts         # Drizzle 集成
│       │   │   │   ├── markdown.ts        # Markdown/MDX 页面处理 (markdown-exit + @shikijs/markdown-exit)
│       │   │   │   ├── islands.ts         # Islands client:* 指令转换
│       │   │   │   ├── auto-imports.ts    # Composables 自动导入 (unimport)
│       │   │   │   ├── components.ts      # Vue 组件自动导入 (unplugin-vue-components)
│       │   │   │   ├── i18n.ts            # i18n 路由前缀/locale 检测中间件
│       │   │   │   ├── queues.ts          # 队列扫描 + 类型生成
│       │   │   │   └── link-typed.ts      # <Link> 组件类型增强
│       │   │   │
│       │   │   └── prerender/         # 预渲染/SSG
│       │   │       ├── prerender.ts
│       │   │       └── utils.ts
│       │   │
│       │   ├── types/                # 类型定义
│       │   │   ├── config.ts         # UbeanConfig, UbeanOptions
│       │   │   ├── nitro.ts          # Ubean 实例类型
│       │   │   ├── handler.ts        # EventHandler 类型
│       │   │   ├── openapi.ts        # OpenAPI 类型 (OpenAPI3, OperationObject, etc.)
│       │   │   ├── openapi-ts.ts     # @scalar/openapi-types 类型重导出
│       │   │   ├── hooks.ts          # Hook 类型
│       │   │   ├── preset.ts         # Preset 类型
│       │   │   ├── route-rules.ts    # RouteRules 类型
│       │   │   ├── app.ts            # defineApp、Vue App 类型
│       │   │   ├── runtime/
│       │   │   │   ├── nitro.ts      # 运行时 App 类型
│       │   │   │   └── index.ts
│       │   │   ├── module.ts         # 模块类型
│       │   │   ├── prerender.ts      # 预渲染类型
│       │   │   ├── build.ts          # 构建类型
│       │   │   └── runner.ts
│       │   │
│       │   ├── utils/                # 工具函数 (纯函数)
│       │   │   ├── fs.ts             # 文件系统操作
│       │   │   ├── path.ts           # 路径处理
│       │   │   ├── env.ts            # 环境变量
│       │   │   ├── route.ts          # 路由工具
│       │   │   ├── hash.ts           # 哈希
│       │   │   ├── import.ts         # 导入工具
│       │   │   ├── serialize.ts      # 序列化
│       │   │   ├── tsconfig.ts       # tsconfig 处理
│       │   │   └── info.ts           # 构建信息
│       │   │
│       │   ├── meta.ts               # 包元数据 (版本、路径等)
│       │   ├── builder.ts            # 构建器导出
│       │   ├── module.ts             # 模块系统
│       │   ├── index.ts              # 主入口
│       │   └── cli.mjs               # CLI 二进制入口
│       │
│       ├── skills/                   # Skills 系统
│       │   └── ubean/
│       │       ├── SKILL.md          # Skill 路由定义
│       │       ├── command/
│       │       │   └── ubean.md      # CLI 命令文档
│       │       └── docs/             # 内置文档
│       │           ├── guide/
│       │           │   ├── quickstart.md
│       │           │   ├── pages-routing/
│       │           │   │   ├── overview.md
│       │           │   │   ├── loaders.md
│       │           │   │   ├── actions-and-forms.md
│       │           │   │   ├── layouts.md
│       │           │   │   ├── head.md
│       │           │   │   ├── islands.md
│       │           │   │   ├── markdown.md
│       │           │   │   └── view-transitions.md
│       │           │   ├── server-routing.md
│       │           │   ├── ssr.md
│       │           │   ├── ssg.md
│       │           │   ├── edge/
│       │           │   │   ├── headers.md
│       │           │   │   ├── redirects.md
│       │           │   │   ├── rewrites.md
│       │           │   │   ├── prerendering.md
│       │           │   │   ├── revalidation.md
│       │           │   │   └── static-assets.md
│       │           │   ├── env-vars.md
│       │           │   ├── type-safety.md
│       │           │   ├── typed-fetch.md
│       │           │   ├── database.md
│       │           │   ├── storage.md
│       │           │   ├── kv.md
│       │           │   ├── queues.md
│       │           │   ├── jobs.md
│       │           │   ├── sse.md
│       │           │   ├── websockets.md
│       │           │   ├── app-types.md
│       │           │   └── index.md
│       │           ├── integrations/
│       │           │   ├── platforms/
│       │           │   │   ├── nodejs-bun-deno.md
│       │           │   │   ├── cloudflare.md
│       │           │   │   └── overview.md
│       │           │   ├── database/
│       │           │   │   ├── drizzle.md
│       │           │   │   └── overview.md
│       │           │   ├── hono.md
│       │           │   └── agents.md
│       │           └── reference/
│       │               ├── api.md
│       │               ├── cli.md
│       │               ├── config.md
│       │               ├── structure.md
│       │               └── resource-inference.md
│       │
│       ├── scripts/                  # 构建脚本
│       │   ├── gen-presets.ts        # 生成 preset 索引
│       │   ├── sync-skill-docs.mjs   # 同步 skill 文档
│       │   └── bump-version.ts
│       │
│       ├── test/                     # 测试目录
│       │   ├── unit/                 # 单元测试
│       │   │   ├── config-loader.test.ts
│       │   │   ├── routing.test.ts
│       │   │   ├── preset-resolve.test.ts
│       │   │   ├── env-helpers.test.ts
│       │   │   ├── router.test.ts
│       │   │   ├── cache.test.ts
│       │   │   ├── virtual-modules.test.ts
│       │   │   ├── public-assets.test.ts
│       │   │   ├── chunks.test.ts
│       │   │   ├── default-preset.test.ts
│       │   │   ├── route-meta.test.ts
│       │   │   ├── detect-exports.test.ts
│       │   │   ├── pages-scan.test.ts       # pages 扫描测试
│       │   │   ├── layouts-scan.test.ts     # layouts 扫描测试
│       │   │   ├── define-page.test.ts      # definePage AST 提取测试
│       │   │   ├── route-name.test.ts       # 路由名称推导测试
│       │   │   ├── reuse-route.test.ts      # reuse 路由测试
│       │   │   ├── codegen-page-types.test.ts # .ubean/pages.d.ts 生成测试
│       │   │   ├── cli-page.test.ts         # CLI page 命令测试
│       │   │   ├── cli-api.test.ts          # CLI api 命令测试
│       │   │   ├── cli-env.test.ts          # CLI env 命令测试
│       │   │   ├── cli-config.test.ts       # CLI config 命令测试
│       │   │   ├── openapi.test.ts
│       │   │   ├── app-entry.test.ts
│       │   │   ├── client.test.ts
│       │   │   ├── cron.test.ts
│       │   │   ├── queues-scan.test.ts      # queues 扫描测试
│       │   │   ├── queues.test.ts           # defineQueue 运行时测试
│       │   │   ├── locales-scan.test.ts     # locales 扫描测试
│       │   │   ├── i18n.test.ts             # i18n 运行时测试
│       │   │   ├── markdown.test.ts         # Markdown 解析/frontmatter 测试
│       │   │   ├── islands.test.ts          # Islands client:* 指令转换测试
│       │   │   ├── auto-imports.test.ts     # 自动导入类型生成测试
│       │   │   ├── components-auto-import.test.ts # 组件自动导入测试
│       │   │   ├── link-typed.test.ts       # 类型安全 Link 测试
│       │   │   ├── codemirror-editor.test.ts # CodeMirror 编辑器组件测试（Vue Test Utils）
│       │   │   ├── handler.test.ts
│       │   │   ├── codegen-route-types.test.ts
│       │   │   └── ...
│       │   ├── integration/          # 集成测试
│       │   │   ├── build.test.ts
│       │   │   ├── dev-server.test.ts
│       │   │   ├── api-routes.test.ts       # 命名导出 GET/POST 等测试
│       │   │   ├── route-meta-auth.test.ts  # meta.public 鉴权中间件测试
│       │   │   ├── pages-ssr.test.ts
│       │   │   ├── pages-layouts.test.ts    # layouts 集成测试
│       │   │   ├── pages-reuse.test.ts      # reuse 路由集成测试
│       │   │   ├── virtual-pages.test.ts    # ubean:pages 虚拟模块测试
│       │   │   ├── middleware.test.ts
│       │   │   ├── openapi.test.ts
│       │   │   ├── typed-client.test.ts     # 类型安全客户端测试
│       │   │   ├── cron-jobs.test.ts
│       │   │   ├── define-app.test.ts
│       │   │   ├── cli-commands.test.ts     # CLI 命令集成测试 (page/api/env/config)
│       │   │   ├── devtools-rpc.test.ts     # DevTools RPC 通信测试
│       │   │   ├── devtools-hooks.test.ts   # DevTools hooks 测试
│       │   │   ├── devtools-crud.test.ts    # DevTools CRUD 操作测试
│       │   │   ├── devtools-ai.test.ts      # DevTools AI 工具调用测试
│       │   │   ├── markdown-pages.test.ts   # Markdown 页面 SSR 集成测试
│       │   │   ├── islands-hydration.test.ts # Islands hydration 集成测试
│       │   │   ├── i18n-routing.test.ts     # i18n 路由前缀/切换集成测试
│       │   │   ├── queues-runtime.test.ts   # 队列运行时集成测试
│       │   │   ├── auto-imports.test.ts     # 自动导入集成测试
│       │   │   ├── typed-link.test.ts       # 类型安全 Link 组件集成测试
│       │   │   ├── preset-cloudflare.test.ts
│       │   │   ├── preset-node.test.ts
│       │   │   ├── preset-vercel.test.ts
│       │   │   └── ...
│       │   ├── fixtures/             # 测试夹具
│       │   │   ├── hello-world/
│       │   │   ├── api-routes/
│       │   │   ├── pages/
│       │   │   ├── middleware/
│       │   │   ├── with-database/
│       │   │   └── ...
│       │   └── utils.ts
│       │
│       ├── AGENT_PROMPT.md           # Agent 提示词
│       ├── schema.json               # 配置 Schema
│       ├── package.json
│       ├── build.config.ts
│       └── tsconfig.json
│
├── examples/                       # 示例项目
│   ├── hello-world/
│   ├── api-routes/
│   ├── pages-basic/
│   ├── with-layouts/
│   ├── with-middleware/
│   ├── with-database/
│   ├── with-storage/
│   ├── with-websocket/
│   └── vite-ssr-vue/
│
├── docs/                          # 文档网站
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
└── .editorconfig
```

---
