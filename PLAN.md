# ubean - Vue 元框架项目规划文档

## 1. 项目概述

**ubean** 是一个基于 Vite-Plus 的 Vue 专属全栈元框架，融合了 void 的 Inertia 式 SSR 页面路由和 nitro 的跨平台部署能力。

### 1.1 核心定位

- **Vue 专属**: 仅支持 Vue 3，深度集成 Vue 生态
- **基于 Vite-Plus**: 使用 vite-plus 作为构建工具链核心
- **跨平台部署**: 借鉴 nitro 的 preset 系统，支持 Node.js、Bun、Deno、Cloudflare、Vercel 等多平台
- **函数式编程**: 严格遵循 TypeScript 函数式编程范式
- **完整测试**: 基于 vitest 实现全量测试覆盖

### 1.2 本地参考项目

| 项目                   | 本地路径                                                                                                            | 参考内容                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **void**               | [/Users/soybean/Web/Projects/OpenSource/void](file:///Users/soybean/Web/Projects/OpenSource/void)                   | 主要参考对象：文件式路由、defineHandler/defineValidator 模式、Islands 架构、Markdown 页面、Better Auth 集成、Queues Proxy 动态绑定、Cron Jobs、Skills/Agent 系统、DevTools 风格、Vite-Plus 构建、Inertia 式 SSR 页面渲染 |
| **nitro**              | [/Users/soybean/Web/Projects/OpenSource/nitro](file:///Users/soybean/Web/Projects/OpenSource/nitro)                 | 多平台 preset 系统（30+ 部署平台）、routeRules（缓存/headers/重定向/代理）、OpenAPI 自动生成（Scalar UI）、Storage 层（unstorage）、Database 层（db0）、预渲染/SSG、运行时插件生命周期                                   |
| **hono-ssr**           | [/Users/soybean/Web/Projects/SoybeanJS/hono-ssr](file:///Users/soybean/Web/Projects/SoybeanJS/hono-ssr)             | `createDefineRoute` 多重重载类型推导模式，中间件链 Input 类型通过 `IntersectNonAnyTypes` 从左到右累积，确保 validator 定义的 params/query/json 类型流向后续 handler                                                      |
| **elegant-router**     | [/Users/soybean/Web/Projects/SoybeanJS/elegant-router](file:///Users/soybean/Web/Projects/SoybeanJS/elegant-router) | 类型化路由名称（RouteName 联合类型）、reuse 路由（`xxx.reuse.ts` 复用页面组件）、CLI 路由增删改（交互式命令）、虚拟模块暴露全量路由数据、路由组命名转换                                                                  |
| **@soybeanjs/request** | [/Users/soybean/Web/Projects/SoybeanJS/request](file:///Users/soybean/Web/Projects/SoybeanJS/request)               | 基于 axios 的类型安全 fetch client 设计，标准模式（throw on error）与 flat 模式（`{ data, error }`）双模式，基于 openapi-typescript 生成的 paths 类型推导请求/响应类型                                                   |

### 1.3 参考项目融合策略

| 特性           | void                        | nitro                    | ubean 取舍                      |
| -------------- | --------------------------- | ------------------------ | ------------------------------- |
| HTTP 框架      | Hono                        | h3                       | ✅ Hono（轻量、现代、类型友好） |
| 构建工具       | Vite-Plus                   | Vite/Rollup/Rolldown     | ✅ Vite-Plus                    |
| 页面路由       | Inertia 式 SSR + 框架适配器 | renderer 抽象            | ✅ Inertia 式，仅 Vue 适配器    |
| API 路由       | 文件式路由 (routes/)        | 文件式路由 (server/api/) | ✅ 文件式路由 (routes/)         |
| 平台适配       | Cloudflare 为主             | 30+ 平台 preset          | ✅ nitro 风格 preset 系统       |
| 部署平台       | Void Cloud (自有平台)       | 各平台独立部署           | ❌ 移除，改为通用部署           |
| 登录认证       | Better Auth 内置            | 无内置                   | ❌ 移除，提供插件接口           |
| 数据库         | Drizzle ORM + D1/PG         | db0 抽象层               | ✅ Drizzle ORM + 多数据库驱动   |
| 环境变量       | defineEnv + Schema 验证     | runtimeConfig            | ✅ defineEnv + 类型安全验证     |
| 缓存/ISR       | KV + Edge Cache             | routeRules 缓存          | ✅ 融合两者                     |
| Skills 系统    | ✅ Agent 路由               | ❌                       | ✅ 保留并增强                   |
| 插件系统       | Vite 插件                   | 运行时插件 + 模块系统    | ✅ Vite 插件 + 运行时插件       |
| Hooks 系统     | Wrangler hooks              | Hookable 生命周期        | ✅ Hookable 完整生命周期        |
| 类型安全客户端 | typed fetch                 | 无内置                   | ✅ 自动生成类型安全客户端       |
| OpenAPI 文档   | ❌                          | ✅ Scalar/Swagger UI     | ✅ nitro 风格 OpenAPI 自动生成  |
| App 实例定制   | ❌ 硬编码入口               | ❌                       | ✅ defineApp 暴露 Vue 实例      |

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

- **pnpm@11.x** (monorepo + catalog 管理)

### 2.4 依赖与包边界

依赖按运行时边界拆分，核心包不得因为可选功能或单个平台实现而携带额外运行时代码：

| 范围                  | 依赖策略                                                                     | 示例                                        |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| `packages/ubean` 核心 | 仅保留 Node 与 edge 共用的依赖                                               | Hono、Hookable、rou3、Standard Schema 类型  |
| Vue 集成              | Vue 及 Vue Router 使用 `peerDependencies`；SSR renderer 按 server entry 引入 | `vue`、`vue-router`、`@vue/server-renderer` |
| preset 包             | 每个平台独立包和 CI；不被核心包静态导入                                      | `@ubean/preset-cloudflare`                  |
| 浏览器传输适配器      | 仅在浏览器 client entry 打包；不进入 Node、edge 或 SSR bundle                | `ubean/client-xhr`（上传进度）、数据库驱动  |
| DevTools 与 Auth      | 独立包，默认不进入生产 bundle                                                | `@ubean/devtools`、`@ubean/auth`            |

- 文档示例若使用 `zod`，必须标记为用户项目依赖；框架核心仅依赖 Standard Schema 规范，不绑定某个验证库。
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
│       │   │   │   │   ├── route-meta.ts   # 路由 meta 提取 (defineMeta/export const meta AST 解析)
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
│       │   │   │   ├── handler.ts      # 请求处理器 (defineHandler, defineMeta, defineValidator, defineMiddleware)
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

## 4. 核心架构设计

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ubean 框架架构                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     CLI 层 (citty)                          │   │
│  │  ubean dev | ubean build | ubean prepare | ubean preview    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                   核心层 (Core)                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Config   │  │ Routing  │  │  Build   │  │  Preset  │   │   │
│  │  │ Loader   │  │  Scan    │  │  System  │  │ Resolver │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │  Hooks   │  │ Dev      │  │ Prerender│  │  Types   │   │   │
│  │  │ System   │  │ Server   │  │  / SSG   │  │  System  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 Vite 插件层 (Vite-Plus)                      │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ ubeanPlugin()           │ ubeanVue()                 │  │   │
│  │  │ - Virtual modules       │ - Vue SFC 处理             │  │   │
│  │  │ - Client stubs          │ - SSR 渲染                 │  │   │
│  │  │ - Env schema            │ - 客户端路由               │  │   │
│  │  │ - Dev triggers          │ - Islands                  │  │   │
│  │  │ - Binding injection     │ - Head 管理                │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                  运行时层 (Runtime)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Hono Server │  │  Router     │  │ Route Rules         │ │   │
│  │  │             │  │  (rou3)     │  │ (cache/headers/     │ │   │
│  │  │             │  │             │  │  redirects/ISR)     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Plugins     │  │ Storage     │  │ Database/Drizzle    │ │   │
│  │  │ (hookable)  │  │ (unstorage) │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ WebSocket   │  │ SSE/Streams │  │ Cache/ISR           │ │   │
│  │  │ (crossws)   │  │             │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 平台适配层 (Presets)                         │   │
│  │  Node.js │ Bun │ Deno │ Cloudflare │ Vercel │ Netlify │ ...│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心数据流

#### 4.2.1 开发模式流程

```
ubean dev
  │
  ├─► 加载配置 (ubean.config.ts)
  │    └─► 解析 preset (自动检测或手动指定)
  │
  ├─► 扫描项目文件
  │    ├─► routes/        → API 路由
  │    ├─► pages/         → 页面路由 + .server.ts
  │    ├─► middleware/    → 全局中间件
  │    ├─► plugins/       → 运行时插件
  │    └─► public/        → 静态资源
  │
  ├─► 启动 Vite 开发服务器 (vite-plus)
  │    ├─► ubeanPlugin()
  │    │    ├─► 虚拟模块注册
  │    │    ├─► 客户端 stub 注入
  │    │    └─► 环境变量 schema 验证
  │    └─► ubeanVue()
  │         ├─► Vue SFC 处理
  │         └─► SSR/HMR 配置
  │
  ├─► 启动 Worker 运行时 (env-runner)
  │    └─► Hono 服务端处理请求
  │
  └─► 文件监听 → 热更新 → 自动刷新
```

#### 4.2.2 构建模式流程

```
ubean build
  │
  ├─► 加载配置 + 解析 preset
  ├─► 扫描项目文件
  ├─► 生成虚拟模块
  │    ├─► 路由清单
  │    ├─► 运行时配置
  │    ├─► 插件注册表
  │    └─► 平台 polyfills
  │
  ├─► 客户端构建 (Vite)
  │    └─► Vue SSR 客户端包
  │
  ├─► 服务端构建 (Rollup/Rolldown)
  │    ├─► 入口: preset 对应的 server entry
  │    ├─► 打包所有路由/中间件/插件
  │    ├─► 平台特定处理
  │    └─► 输出到 .output/server/
  │
  ├─► 静态资源处理
  │    └─► 输出到 .output/public/
  │
  ├─► 预渲染 (如启用 SSG)
  │    └─► 生成静态 HTML
  │
  └─► 生成平台配置文件
       └─► vercel.json / wrangler.toml / netlify.toml / ...
```

### 4.3 配置系统

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  // 平台预设: 自动检测或手动指定
  preset: 'node-server', // node-server | bun | deno | cloudflare | vercel | ...

  // 源代码目录
  srcDir: './',
  routesDir: './routes',
  pagesDir: './pages',
  middlewareDir: './middleware',
  publicDir: './public',

  // 服务端目录
  serverDir: './server',

  // 输出配置
  output: {
    dir: './.output',
    serverDir: './.output/server',
    publicDir: './.output/public'
  },

  // 路由规则
  routeRules: {
    '/**': { cache: { maxAge: 60 } },
    '/api/**': { cors: true },
    '/blog/**': { isr: 3600 },
    '/old-page': { redirect: '/new-page' }
  },

  // 运行时配置 (可通过 useRuntimeConfig() 访问)
  runtimeConfig: {
    apiSecret: '', // 仅服务端
    public: {
      apiBase: '/api' // 客户端可访问
    }
  },

  // 环境变量验证 Schema
  env: {
    DATABASE_URL: { type: 'string', required: true },
    API_KEY: { type: 'string', secret: true }
  },

  // 存储配置
  storage: {
    data: { driver: 'fs', base: './data' },
    redis: { driver: 'redis', url: '...' }
  },

  // 数据库配置
  database: {
    default: {
      connector: 'sqlite', // sqlite | postgresql | mysql | d1 | libsql
      options: {
        /* ... */
      }
    }
  },

  // 插件
  plugins: [],

  // 模块
  modules: [],

  // Vue 配置
  vue: {
    ssr: true,
    islands: false
  },

  // OpenAPI 文档配置
  openAPI: {
    meta: {
      title: 'My Ubean App',
      description: 'API documentation',
      version: '1.0.0'
    },
    route: '/_openapi.json', // OpenAPI JSON 端点
    production: 'runtime', // 'runtime' | 'prerender' | false
    ui: {
      scalar: { route: '/_scalar' }, // Scalar UI (默认开启, false 禁用)
      swagger: false // Swagger UI (默认关闭)
    }
  },

  // 构建配置
  build: {
    minify: true,
    sourcemap: false
  },

  // 开发服务器
  devServer: {
    port: 3000,
    host: 'localhost',
    watch: []
  },

  // 框架信息
  framework: {
    name: 'ubean',
    version: '0.1.0'
  }
});
```

### 4.4 应用约定式目录结构

用户项目使用 ubean 时的目录结构:

```
my-ubean-app/
├── routes/                    # API 路由 (文件式，单文件多方法命名导出)
│   ├── index.ts              # GET/POST /
│   ├── users.ts              # GET/POST/PUT/DELETE /users
│   ├── users/
│   │   └── [id].ts           # GET/PATCH/DELETE /users/:id
│   ├── auth/
│   │   └── login.ts          # POST /auth/login
│   └── api/
│       └── health.ts         # GET /api/health
│
├── pages/                     # 页面路由 (Vue SSR)
│   ├── index.vue             # /
│   ├── about.vue             # /about
│   ├── about.server.ts       # about 页面的 loader/action
│   ├── users/
│   │   ├── index.vue         # /users
│   │   ├── index.server.ts
│   │   ├── [id].vue          # /users/:id
│   │   ├── [id].reuse.ts     # reuse 路由配置: 复用已定义的路由 name
│   │   └── [id].server.ts
│   └── (auth)/               # 路由组 (不生成路径段)
│       ├── login.vue
│       └── register.vue
│
├── layouts/                   # 页面布局 (与 pages 同级)
│   ├── default.vue           # 默认布局 (或 default/index.vue)
│   ├── blank.vue             # 空白布局 (登录页等)
│   └── admin/
│       └── index.vue         # admin 布局
│
├── crons/                     # 定时任务 (cron 表达式)
│   └── daily-cleanup.ts      # 定时清理任务
│
├── queues/                    # 异步队列任务
│   └── email.ts              # 邮件队列
│
├── locales/                   # i18n 国际化消息文件
│   ├── en.ts
│   ├── zh-CN.ts
│   └── ja.ts
│
├── middleware/                # 中间件 (按数字前缀排序)
│   ├── 01.logger.ts
│   └── 02.auth.ts
│
├── plugins/                   # 运行时插件
│   ├── my-plugin.ts
│   └── auth.ts               # Better Auth 插件
│
├── db/                        # 数据库 (可选)
│   ├── schema.ts             # Drizzle schema
│   └── migrations/           # SQL 迁移文件
│
├── public/                    # 静态资源
│   └── favicon.ico
│
├── src/                       # 共享代码
│   ├── components/           # 自动导入 Vue 组件
│   ├── composables/          # 自动导入 Composables
│   └── utils/                # 工具函数
│
├── .ubean/                    # ubean 自动生成 (类型、路由数据等)
│   ├── routes.d.ts           # API routes OpenAPI 类型
│   ├── pages.d.ts            # pages 路由类型 + RouteName/LayoutName
│   ├── queues.d.ts           # 队列类型定义
│   ├── auto-imports.d.ts     # 自动导入类型声明
│   └── components.d.ts       # 组件自动导入类型声明
│
├── ubean.config.ts            # ubean 配置
├── app.ts                     # Vue App 配置 (defineApp)
├── env.ts                     # 环境变量定义
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 4.5 API 路由设计

采用 void 的**命名导出约定**：单个文件内通过 `export const GET`、`export const POST` 等命名导出定义多个 HTTP 方法处理函数，构建时通过 AST 静态扫描检测导出方法。

#### 路由文件约定

- 文件名不包含方法后缀（不同于 nitro 的 `.get.ts`/`.post.ts`）
- 方法由顶层命名导出决定：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`、`HEAD`
- 支持 `export default` 作为兜底处理器（匹配所有未显式定义的方法）
- 文件以 `_` 开头的为私有文件，不会被注册为路由
- 支持环境后缀：`.dev.ts`（仅开发）、`.prod.ts`（仅生产）

#### defineHandler API 设计

参考 hono-ssr 的 `createDefineRoute` 类型推导模式，`defineHandler` 默认接受**多个 handler 组成的中间件链**（单个 handler 是链长度为 1 的特例）。`defineMeta` 和 `defineValidator` 作为独立的 handler 函数导出，直接传入 `defineHandler` 链中，不再使用 `defineHandler.withMeta()`/`defineHandler.withValidator()` 的柯里化形式。

**核心设计原则**：

- 所有 handler（包括 meta、validator、业务逻辑）在调用形式上统一为 `defineHandler(h1, h2, ..., finalHandler)`
- 类型从左到右累积：`defineValidator` 定义的 params/query/body/json 类型会流向后续所有 handler
- `defineMeta` 运行时是透传中间件（`(c, next) => next()`），仅在构建时被 AST 提取
- `defineValidator` 运行时执行验证并将验证后的数据挂载到 `c.req.valid(target)`，类型通过泛型链推导

```typescript
// routes/users/[id].ts
import { defineHandler, defineMeta, defineValidator, defineMiddleware } from 'ubean/handler';
import { z } from 'zod';

// 权限中间件示例
const requireAdmin = defineMiddleware(async (c, next) => {
  if (c.get('user')?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});

// GET /users/:id — 获取用户详情
// defineMeta 和 defineValidator 作为 handler 链的一部分传入
export const GET = defineHandler(
  defineMeta({
    public: false,
    cache: { ttl: 60 },
    rateLimit: { max: 100, window: 60 },
    openAPI: {
      tags: ['Users'],
      summary: 'Get user by ID',
      description: 'Retrieve a single user by their unique ID',
      responses: {
        200: { description: 'User found' },
        404: { description: 'User not found' }
      }
    }
  }),
  defineValidator({
    params: z.object({ id: z.string() }),
    query: z.object({ include: z.string().optional() })
  }),
  async c => {
    // ✅ 类型推导: c.req.valid('param') → { id: string }
    // ✅ 类型推导: c.req.valid('query') → { include?: string }
    const { id } = c.req.valid('param');
    const { include } = c.req.valid('query');
    const user = await db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ user });
  }
);

// PATCH /users/:id — 更新用户（需要管理员权限）
export const PATCH = defineHandler(
  defineMeta({
    public: false,
    openAPI: {
      tags: ['Users'],
      summary: 'Update user',
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UserUpdate' } } } },
      responses: { 200: { description: 'Updated' } }
    }
  }),
  defineValidator({
    params: z.object({ id: z.string() }),
    json: z.object({ name: z.string().optional(), email: z.string().email().optional() })
  }),
  async c => {
    // ✅ c.req.valid('param') → { id: string }
    // ✅ c.req.valid('json') → { name?: string; email?: string }
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db.update(users).set(body).where(eq(users.id, id));
    return c.json({ success: true });
  }
);

// DELETE /users/:id — 删除用户（管理员 + 中间件链 + 类型推导）
export const DELETE = defineHandler(
  defineMeta({
    openAPI: { tags: ['Users'], summary: 'Delete user', responses: { 200: { description: 'Deleted' } } }
  }),
  defineValidator({ params: z.object({ id: z.string() }) }),
  requireAdmin, // 自定义中间件在 validator 之后，可以访问 c.req.valid('param')
  async c => {
    // ✅ requireAdmin 中也可以使用 c.req.valid('param') 获取 id
    const { id } = c.req.valid('param');
    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true });
  }
);
```

> **设计要点**：`defineMeta` 和 `defineValidator` 位置灵活——通常放在链的最前面（meta 用于 AST 提取，validator 尽早验证失败快），但也可以放在特定中间件之后。运行时按链顺序执行，类型按链顺序累积。

#### 文件级共享 meta（可选 export const meta）

当同一文件内多个方法共享相同 meta（如 tags、`$global` components）时，可通过顶层 `export const meta` 定义文件级默认值，`defineMeta` 中同名字段深度覆盖：

```typescript
// routes/users/[id].ts
import { defineHandler, defineMeta } from 'ubean/handler';

export const meta = {
  openAPI: {
    tags: ['Users'],
    $global: {
      components: {
        schemas: { User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }
      }
    }
  }
};

// GET 继承文件级 tags + $global，defineMeta 补充 per-method 字段
export const GET = defineHandler(
  defineMeta({ public: true, openAPI: { summary: 'Get user', responses: { 200: { description: 'OK' } } } }),
  async c => {
    /* ... */
  }
);
```

#### 公开路由示例（无需鉴权）

```typescript
// routes/auth/login.ts
import { defineHandler, defineMeta, defineValidator } from 'ubean/handler';
import { z } from 'zod';

export const POST = defineHandler(
  defineMeta({
    public: true, // auth middleware 跳过此路由
    openAPI: { tags: ['Auth'], summary: 'User login' }
  }),
  defineValidator({
    json: z.object({ email: z.string().email(), password: z.string().min(6) })
  }),
  async c => {
    const { email, password } = c.req.valid('json');
    return c.json({ token: '...' });
  }
);
```

#### defineHandler 完整 API 与类型推导

类型推导参考 hono-ssr 的多重重载模式：通过 1~10 个 handler 的函数重载，每个 handler 的 `Input` 类型（即 `c.req.valid()` 可用的 key）通过 `IntersectNonAnyTypes` 从左到右累积，确保 validator 定义的类型可以流向后续所有 handler。

```typescript
// src/runtime/handler.ts

// Validator 插槽类型（支持 Standard Schema v1 兼容库: zod/valibot/arktype 等）
interface ValidatorSlots {
  params?: StandardSchemaV1;
  query?: StandardSchemaV1;
  json?: StandardSchemaV1;
  form?: StandardSchemaV1;
  header?: StandardSchemaV1;
  cookie?: StandardSchemaV1;
}

// 从 ValidatorSlots 推导 validated input 类型
type ValidatedInput<V extends ValidatorSlots> = {
  [K in keyof V as V[K] extends StandardSchemaV1 ? K : never]: V[K] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<V[K]>
    : never;
};

// defineMeta: 运行时透传中间件，构建时 AST 提取 meta
function defineMeta<M extends RouteMeta>(meta: M): UbeanMiddleware<{}, { __meta: M }>;

// defineValidator: 运行时验证中间件，类型上累积 validated input
function defineValidator<V extends ValidatorSlots>(
  validators: V
): UbeanMiddleware<ValidatedInput<V>, { __validators: V }>;

// defineHandler: 1~N 个 handler 链，类型从左到右累积
// 1 个 handler（最简形式）
function defineHandler<H extends UbeanHandler<{}>>(handler: H): ComposedHandler;
// 2 个 handlers (middleware + final)
function defineHandler<I1 extends Input = {}, I2 extends Input = I1>(
  h1: UbeanMiddleware<I1>,
  h2: UbeanHandler<I1 & I2>
): ComposedHandler;
// 3~10 个 handlers 类似重载，通过 IntersectNonAnyTypes 累积 Input
// ... (最多 10 层重载，足够覆盖绝大多数场景)
// 超过 10 个时退化为 rest 参数 + 基础类型（无完整推导但不报错）
function defineHandler(...handlers: UbeanHandlerLike[]): ComposedHandler;
```

**类型推导关键点**：

1. `defineValidator({ params: z.object({ id: z.string() }) })` 返回的 middleware 携带 `Input = { param: { id: string } }` 类型
2. 当该 middleware 传入 `defineHandler` 后，后续 handler 的 `c` 参数自动获得 `c.req.valid('param')` 的完整类型
3. 多个 `defineValidator` 的 Input 类型通过交叉类型（`&`）合并，实现类型累积
4. 自定义中间件若需要访问 validated data，应使用 `defineMiddleware` 包装以保持类型链不断裂
5. `defineMeta` 的 `__meta` 属性是 phantom type（仅类型层面存在），运行时通过函数属性挂载供 AST 提取

**meta 合并优先级**：`defineMeta` 中定义的 meta > 文件级 `export const meta` > 全局默认值。合并策略为深度 merge（数组替换而非拼接）。构建时 AST 扫描从链中第一个 `defineMeta()` 调用提取 meta。

#### RouteMeta 类型设计

```typescript
// src/types/handler.ts
export interface RouteMeta {
  /**
   * 是否为公开路由（auth middleware 跳过鉴权）
   * @default false
   */
  public?: boolean;

  /**
   * 缓存配置
   */
  cache?: {
    ttl?: number;
    swr?: boolean;
  };

  /**
   * 限流配置
   */
  rateLimit?: {
    max: number;
    window: number;
  };

  /**
   * 是否禁用此路由（构建时跳过注册）
   */
  disabled?: boolean;

  /**
   * OpenAPI 文档定义（per-method）
   */
  openAPI?: OperationObject & {
    $global?: Pick<OpenAPI3, 'components'> & Extensable;
  };

  /**
   * 允许用户通过 TypeScript 模块扩展自定义 meta
   */
  [key: string]: unknown;
}
```

#### 中间件中访问 route meta

在全局 middleware 中可以通过 `c.route.meta` 访问当前路由匹配方法的 meta（已合并文件级默认值）：

```typescript
// middleware/02.auth.ts
import { defineMiddleware } from 'ubean/handler';

export default defineMiddleware(async (c, next) => {
  const meta = c.route.meta;

  // 公开路由跳过鉴权
  if (meta?.public) {
    await next();
    return;
  }

  // 验证 token
  const token = c.req.header('Authorization');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 验证并注入用户信息
  const user = await verifyToken(token);
  c.set('user', user);

  await next();
});
```

#### OpenAPI 自动生成

- 构建时通过 AST 扫描提取各 handler 链中 `defineMeta({ openAPI: {...} })` 调用，以及文件级 `export const meta`
- `defineValidator` 使用的 Standard Schema 是请求参数的唯一可推导来源；响应 body 必须通过 `openAPI.responses` 显式声明 schema
- AST 仅支持字面量对象、可静态解析的导入和受限的 `$global.components` 合并；动态表达式、变量展开或无法解析的调用必须发出构建诊断，不能生成不完整文档
- 自动生成 OpenAPI 3.1 规范 JSON，端点默认 `/_openapi.json`
- 自动推导路由参数（`:param` → `{param}`, `**` → catch-all）
- 自动将方法名映射为 OpenAPI operation（GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD）
- 自动按路径前缀分类 tags：`/api/**` → "API Routes", `/_*` → "Internal"
- `$global.components` 在所有方法间共享（schema 去重）
- 内置 Scalar UI（默认 `/_scalar`）和 Swagger UI 支持
- 生产模式支持 runtime（运行时生成）和 prerender（构建时预渲染）两种策略

#### 请求分派与 HTTP 契约

API 路由和 Pages 路由由同一个已规范化的路由清单驱动。构建期必须拒绝同一方法、同一路径的重复注册，并输出冲突来源；框架不通过文件扫描顺序隐式决定覆盖关系。

| 场景                 | 规范行为                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| 命中 API 路由        | 按方法分派到 `routes/` 中的命名导出；API 路由优先于同路径 Pages 路由       |
| 命中 Pages 路由      | `GET`/`HEAD` 执行 SSR 或客户端页面协议；页面 action 仅接受其显式声明的方法 |
| 路径存在但方法不支持 | 返回 `405` 和 `Allow`；自动处理 `OPTIONS` 时同样返回 `Allow`               |
| 路径不存在           | 返回 `404`；在 Pages 模式下可交由 `error.404.vue` 渲染                     |
| URL 规范化           | 统一解码规则、尾斜杠策略和 catch-all 参数编码；重定向只在配置明确时发生    |

页面 action、表单增强与客户端导航共享一个协议：请求携带框架版本和页面导航标识，服务端按协商格式返回页面数据、重定向或字段错误；不满足协议的普通表单请求仍返回标准 HTML/HTTP 响应。所有改变服务端状态的 Pages action 必须具备可配置的 CSRF 防护。

### 4.6 Pages 路由设计

采用文件式约定路由，融合 elegant-router 的类型化路由、reuse 路由、CLI 路由管理能力，同时保留 void 的 Inertia 风格 loader/action 模式。

#### 核心概念

- **文件即路由**：`pages/` 目录下的 `.vue` 文件自动映射为路由
- **definePage 宏**：在页面 `<script setup>` 或 `.reuse.ts` 中使用，配置 meta、layout、name、path 覆盖等
- **Layouts 系统**：`layouts/` 目录与 `pages/` 同级，支持 `xx.vue` 或 `xx/index.vue` 两种布局文件形式
- **Reuse 路由**：通过 `.reuse.ts` 文件复用已定义页面的组件，避免重复创建空壳页面
- **虚拟路由模块**：构建时生成全量路由数据，通过 `ubean:pages` 虚拟模块暴露
- **CLI 路由管理**：`ubean page add/delete/update` 等命令增删改页面路由，`ubean api add/delete/update` 管理接口

#### 页面文件约定

| 文件模式                            | 说明                           |
| ----------------------------------- | ------------------------------ |
| `pages/index.vue`                   | 首页 `/`                       |
| `pages/about.vue`                   | `/about`                       |
| `pages/users/index.vue`             | `/users`                       |
| `pages/users/[id].vue`              | 动态参数 `/users/:id`          |
| `pages/users/[...all].vue`          | Catch-all `/users/:all(.*)*`   |
| `pages/(group)/page.vue`            | 路由组，括号部分不生成路径段   |
| `pages/page.vue` + `page.server.ts` | 页面 + 同名 loader/action 文件 |
| `pages/page.reuse.ts`               | reuse 路由配置文件             |

#### definePage 宏

在页面 `<script setup>` 或 `.reuse.ts` 中调用 `definePage` 配置页面元信息，替代 void 的 `export const layout = 'landing'`：

```vue
<!-- pages/users/[id].vue -->
<script setup lang="ts">
import { definePage } from 'ubean/pages';
import type { loader } from './[id].server';

definePage({
  // 路由名称（默认自动推导为 UsersId，可覆盖）
  name: 'UserDetail',
  // 路由路径（默认自动推导，可覆盖）
  path: '/users/:id',
  // 指定布局（类型化，自动从 layouts/ 目录推导可用布局名）
  layout: 'default',
  // 路由 meta（完全类型化）
  meta: {
    title: '用户详情',
    requiresAuth: true,
    roles: ['admin', 'user'],
    keepAlive: true
  }
});

const props = defineProps<{
  user: Awaited<ReturnType<typeof loader>>['user'];
}>();
</script>

<template>
  <div class="user-detail">
    <h1>{{ props.user.name }}</h1>
  </div>
</template>
```

#### definePage 类型定义

```typescript
// src/pages/define-page.ts
export interface PageMeta {
  /** 页面标题 */
  title?: string;
  /** 是否需要鉴权 */
  requiresAuth?: boolean;
  /** 需要的角色 */
  roles?: string[];
  /** 是否缓存页面（keep-alive） */
  keepAlive?: boolean;
  /** 允许用户扩展 */
  [key: string]: unknown;
}

export interface DefinePageOptions<TName extends string = string, TLayout extends string = string> {
  /**
   * 路由名称，默认从文件路径自动推导
   * 例如 pages/users/[id].vue → 'UsersId'
   */
  name?: TName;

  /**
   * 路由路径，默认从文件路径自动推导
   * 例如 pages/users/[id].vue → '/users/:id'
   */
  path?: string;

  /**
   * 指定布局组件名，类型从 layouts/ 目录自动推导
   * 不指定时使用 'default' 布局
   * 设为 false 表示不使用任何布局（空白页）
   * @default 'default'
   */
  layout?: TLayout | false;

  /** 路由元信息 */
  meta?: PageMeta;
}

export function definePage(options?: DefinePageOptions): void;
```

> **编译时宏**：`definePage` 是编译时宏（类似 `defineProps`），仅在构建阶段被扫描提取，不会运行时执行。AST 静态分析提取其参数用于生成路由数据。

#### Loader / Action (服务端数据)

```typescript
// pages/users/[id].server.ts
import { defineLoader, defineAction } from 'ubean/pages';
import { db } from 'ubean/database';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Server-side loader (GET 请求自动调用)
export const loader = defineLoader(async ({ params }) => {
  const user = await db.select().from(users).where(eq(users.id, params.id)).get();
  return { user };
});

// Server-side action (POST/PUT/DELETE 请求自动调用)
export const action = defineAction(async ({ params, request }) => {
  const formData = await request.formData();
  return { success: true };
});

// 可选: 禁用 SSR
export const ssr = true;

// 可选: 预渲染
export const prerender = false;
```

#### Layouts 系统

布局文件位于与 `pages/` 同级的 `layouts/` 目录，支持两种文件形式：

- `layouts/xx.vue` — 直接在 layouts 下创建 Vue 文件
- `layouts/xx/index.vue` — 以目录形式组织布局组件及子组件

```
layouts/
├── default.vue          # 默认布局（pages 不指定 layout 时使用）
├── blank.vue            # 空白布局（登录页等）
├── landing.vue          # 落地页布局
└── admin/
    ├── index.vue        # admin 布局（自动推导名称为 'admin'）
    ├── Sidebar.vue      # admin 布局的子组件
    └── Header.vue
```

布局组件使用 `<slot />` 渲染页面内容，并支持嵌套布局：

```vue
<!-- layouts/default.vue -->
<script setup lang="ts">
import { usePage } from 'ubean/pages';

const page = usePage();
</script>

<template>
  <div class="layout-default">
    <header>
      <nav>...</nav>
    </header>
    <main>
      <slot />
    </main>
    <footer>...</footer>
  </div>
</template>
```

**布局推导规则**：

1. 扫描 `layouts/` 目录，`xx.vue` 或 `xx/index.vue` 中 `xx` 即为布局名
2. 必须存在 `default.vue` 或 `default/index.vue`，作为不指定 layout 时的默认布局
3. `definePage({ layout: false })` 表示不使用任何布局，页面直接渲染
4. 布局名类型自动推导，`definePage({ layout: '...' })` 有完整类型提示

#### Reuse 路由

参考 elegant-router 的 `reuseRoutes` 能力，通过 `xxx.reuse.ts` 文件定义复用路由——路由存在但不需要创建独立的 Vue 页面文件，而是复用其他已有页面组件（适用于如 Tab 页签复用同一路由组件场景）：

```typescript
// pages/users/detail.reuse.ts
// 此文件创建后，ubean 会自动注册路由 /users/detail，复用 UserDetail 页面组件
import { definePage } from 'ubean/pages';

export default definePage({
  // reuse: 指定复用的已定义路由 name（类型化，自动从所有页面路由名推导）
  reuse: 'UserDetail',
  // 覆盖路径（可选，默认从文件名推导）
  path: '/users/detail',
  // 覆盖布局
  layout: 'default',
  // 独立 meta
  meta: {
    title: '用户详情（复用）',
    keepAlive: true
  }
});
```

**Reuse 路由规则**：

1. `xxx.reuse.ts` 与同名 `.vue` 文件互斥，`.reuse.ts` 优先级更高（若存在则不注册同名 `.vue` 路由）
2. `reuse` 字段指向的路由 name 必须是已定义的其他页面路由（类型检查）
3. reuse 路由默认使用被复用页面的组件作为 `component`，但 meta、layout、path 可以独立配置
4. 可通过 CLI 命令 `ubean page add-reuse` 交互式创建 reuse 路由

#### 路由组 (Route Groups)

使用括号目录 `(group-name)/` 组织相关页面，括号部分不生成 URL 路径段：

```
pages/
├── (auth)/                # 不生成 /(auth) 路径段
│   ├── login.vue          # → /login
│   └── register.vue       # → /register
└── (dashboard)/
    ├── home.vue           # → /home
    └── settings.vue       # → /settings
```

路由组还可以用于给一组页面统一指定默认 layout（通过在组目录放置 layout 配置或 definePage meta 约定）。

#### 虚拟路由模块

构建时通过虚拟模块 `ubean:pages` 暴露全量路由数据，可在客户端路由初始化、菜单生成、面包屑导航等场景使用：

```typescript
// 在客户端代码中使用
import { routes, layouts, routeNames } from 'ubean:pages';
import type { RouteRecordRaw } from 'vue-router';

// routes: 完整路由记录数组（Vue Router 格式）
const router = createRouter({
  routes: routes as RouteRecordRaw[]
  // ...
});

// layouts: 布局组件映射（懒加载）
// layouts = { default: () => import('/layouts/default.vue'), admin: () => import('/layouts/admin/index.vue'), ... }

// routeNames: 所有路由名称的类型联合
type RouteName = (typeof routeNames)[number]; // 'Home' | 'About' | 'UsersId' | ...
```

生成的 `.ubean/pages.d.ts` 包含完整类型：

```typescript
// .ubean/pages.d.ts (自动生成)
declare module 'ubean:pages' {
  import type { Component } from 'vue';
  import type { RouteRecordRaw } from 'vue-router';

  export const routes: UbeanRouteRecord[];
  export const layouts: Record<string, () => Promise<Component>>;
  export const routeNames: readonly ['Home', 'About', 'Users', 'UserDetail', 'Login', ...];

  export type LayoutName = 'default' | 'blank' | 'admin' | 'landing';
  export type RouteName = (typeof routeNames)[number];

  export interface UbeanRouteRecord {
    name: RouteName;
    path: string;
    component?: () => Promise<Component>;
    components?: Record<string, () => Promise<Component>>;
    layout?: LayoutName | false;
    meta: PageMeta;
    children?: UbeanRouteRecord[];
    redirect?: string;
  }
}
```

#### CLI 路由管理

参考 elegant-router 的 CLI 命令，提供交互式路由增删改能力。页面路由使用 `ubean page *` 命令族（API 接口使用 `ubean api *`），详见 [§4.13 CLI 命令系统](#413-cli-命令系统)。

**CLI 实现要点**：

- 使用 `citty` 构建 CLI 框架，`enquirer` 做交互式选择
- 使用 `tinyglobby` 扫描 pages/、routes/、layouts/ 等目录
- 使用 `ts-morph` 做 AST 操作，安全修改文件
- 删除操作自动备份到 `.ubean/backup/`，支持恢复
- 支持添加 `.vue` 页面/API handler 文件时自动选择模板
- 文件重命名时自动更新路由配置
- CLI 与 DevTools 共享底层 CRUD 逻辑（`cli/shared/fs-ops.ts`）

#### 自动生成流程

1. **开发/构建启动时**：
   - 扫描 `pages/**/*.vue`，排除 `components/`、`modules/` 等子目录
   - 扫描 `pages/**/*.reuse.ts`，提取 `definePage()` 调用
   - 扫描 `layouts/**/*.vue` 和 `layouts/**/index.vue`，推导布局名
   - AST 解析每个 `.vue` 文件中 `<script setup>` 里的 `definePage()` 调用
   - 解析每个 `.server.ts` 文件中的 `loader`/`action` 导出
   - 合并生成路由树结构
   - 生成 `.ubean/pages.d.ts` 类型文件（LayoutName 联合、RouteName 联合、routes 类型）
   - 生成 `virtual:ubean-pages` 虚拟模块的运行时代码

2. **HMR 热更新**：
   - 监听 pages/ 目录文件变化
   - 新增/删除/重命名文件时增量更新路由数据
   - 修改 `definePage()` 参数时热更新路由

3. **路由名称推导规则**：
   - `pages/index.vue` → `'Home'`
   - `pages/about.vue` → `'About'`
   - `pages/users/index.vue` → `'Users'`
   - `pages/users/[id].vue` → `'UserId'`
   - `pages/users/[...all].vue` → `'UsersAll'`
   - 路由组 `(auth)/login.vue` → `'Login'`（括号部分忽略）
   - `.reuse.ts` 文件默认按文件名推导，可通过 `name` 覆盖

#### 与 void 对比

| 方面         | void                              | ubean                                                         |
| ------------ | --------------------------------- | ------------------------------------------------------------- |
| 布局配置     | `export const layout = 'landing'` | `definePage({ layout: 'landing' })`                           |
| 布局位置     | `pages/layout.vue`（单个）        | `layouts/` 目录（多布局）                                     |
| 布局形式     | 单一根布局                        | `xx.vue` + `xx/index.vue`                                     |
| 页面 meta    | `export const loader` 等独立导出  | 统一在 `definePage({ meta: {...} })`                          |
| 路由自定义   | 不支持 name/path 覆盖             | `definePage({ name, path })` 可覆盖                           |
| Reuse 路由   | 不支持                            | `.reuse.ts` 文件 + `definePage({ reuse: 'TargetRoute' })`     |
| CLI 路由管理 | 无                                | `ubean page/api/env/config/cron/layout/middleware *` 全面 CLI |
| 虚拟路由模块 | 无                                | `ubean:pages` 暴露全量路由数据                                |
| 类型安全     | 部分                              | 布局名、路由名、reuse 目标全类型化                            |

### 4.7 Vue App 实例定制 (defineApp)

与 void 硬编码 `createSSRApp(App)` 不同，ubean 提供 `defineApp` 函数让用户完全控制 Vue 应用实例的创建和配置，支持注册插件、全局组件、指令、provide/inject 等。

#### 设计理念

用户在项目根目录创建 `app.ts`（或 `app.ts`/`app.server.ts`/`app.client.ts` 区分服务端/客户端），通过 `defineApp` 导出一个工厂函数，该函数接收必要参数（如 Vue App 实例、router、运行时配置等）并返回配置后的 app 实例。

```typescript
// app.ts
import { defineApp } from 'ubean/vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createHead } from '@unhead/vue';
import GlobalComponent from './src/components/GlobalComponent.vue';

export default defineApp(({ app, router, ssrContext }) => {
  // 注册插件
  const pinia = createPinia();
  app.use(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': { hello: '你好' },
      'en-US': { hello: 'Hello' }
    }
  });
  app.use(i18n);

  // 全局组件注册
  app.component('GlobalComponent', GlobalComponent);

  // 全局指令
  app.directive('focus', {
    mounted(el) {
      el.focus();
    }
  });

  // provide/inject
  app.provide('appVersion', '1.0.0');

  // 全局错误处理
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Error]', err, info);
  };

  // SSR 特有: 可以访问 ssrContext
  if (ssrContext) {
    ssrContext.teleports = {};
  }

  // 返回 app 实例 (支持链式创建或替换 app)
  return app;
});
```

#### 服务端/客户端分离

```typescript
// app.server.ts — 仅在 SSR 时执行
import { defineApp } from 'ubean/vue';

export default defineApp(({ app, ssrContext }) => {
  // SSR 特有逻辑，如注入 SSR 状态
  return app;
});

// app.client.ts — 仅在客户端水合时执行
import { defineApp } from 'ubean/vue';

export default defineApp(({ app, router }) => {
  // 客户端特有逻辑，如 PWA 注册、客户端分析埋点等
  return app;
});
```

#### defineApp 参数类型

```typescript
// src/types/app.ts
import type { App as VueApp } from 'vue';
import type { Router } from 'vue-router';
import type { UbeanRuntimeConfig } from './runtime';

export interface DefineAppContext {
  /** Vue 应用实例 (createSSRApp 创建) */
  app: VueApp;
  /** 客户端路由器（仅客户端） */
  router?: Router;
  /** SSR 上下文（仅服务端） */
  ssrContext?: {
    teleports?: Record<string, string>;
    [key: string]: unknown;
  };
  /** 运行时配置 */
  runtimeConfig: UbeanRuntimeConfig;
  /** Page 组件（根组件，即 App.vue 或自动生成的 Pages 包装器） */
  rootComponent: unknown;
}

export type DefineApp = (ctx: DefineAppContext) => VueApp | void | Promise<VueApp | void>;
export function defineApp(fn: DefineApp): DefineApp;
```

#### 入口生成流程

1. 构建时扫描项目根目录是否存在 `app.ts` / `app.server.ts` / `app.client.ts`
2. 如果不存在，使用默认入口（createSSRApp + 自动 mount/hydrate）
3. 如果存在，生成虚拟入口模块：
   - 服务端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); await appConfig({ app, ssrContext, runtimeConfig, rootComponent }); renderToString(app)`
   - 客户端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); appConfig({ app, router, runtimeConfig, rootComponent }); app.mount('#app')`
4. 支持 app.server.ts 和 app.client.ts 的条件合并（服务端执行 app.ts + app.server.ts，客户端执行 app.ts + app.client.ts）

#### 与 void 对比

| 方面              | void (硬编码)                  | ubean (defineApp)                      |
| ----------------- | ------------------------------ | -------------------------------------- |
| App 实例创建      | 内部硬编码 `createSSRApp(App)` | 用户可通过 defineApp 完全控制          |
| 插件注册          | 不支持（需手动改入口）         | 原生支持 `app.use(plugin)`             |
| 全局组件          | 不支持                         | 支持 `app.component()`                 |
| SSR 上下文        | 无法访问                       | 通过 `ssrContext` 参数暴露             |
| 服务端/客户端分离 | 不支持                         | `app.server.ts` / `app.client.ts` 分离 |
| 默认行为          | 固定模板                       | 无 app.ts 时自动降级为默认行为         |

### 4.8 类型安全 Fetch 客户端 (ofetch + XHR upload adapter)

提供以 `ofetch` 为默认传输层、基于标准 Fetch API 语义的强类型 HTTP 客户端，支持两种使用模式：

**模式 A：直接使用 OpenAPI 生成的 paths 类型**（推荐，零额外类型定义）
**模式 B：手动创建 request 实例 + 自定义类型映射**

核心设计：

- 默认通过 `$fetch.create()` 发起请求，兼容浏览器、Node、Deno 与 edge runtime
- 复用 ofetch 的 `onRequest`、`onResponse`、`onRequestError`、`onResponseError`、超时、重试和响应解析能力
- 运行时零依赖 OpenAPI spec，仅在 TypeScript 层面消费由 ubean 自动生成的 `./ubean/routes.d.ts` 中的 `paths` 类型
- 支持标准模式（throw on error）和扁平模式（`{ data, error }` never throws）
- 自动将路径参数（`{id}`/`:id`）从 params 中提取替换
- `internalFetch` 直接调度当前 Hono handler，不经过网络
- 上传请求提供 `onUploadProgress` 时，浏览器客户端自动选择 `XMLHttpRequest.upload` 传输；未提供时始终使用 ofetch
- XHR 适配器仅支持浏览器环境；在 Node、Deno、edge runtime 或 SSR 中传入 `onUploadProgress` 必须抛出 `UbeanTransportUnsupportedError`，不得静默忽略回调
- XHR 适配器与 ofetch 共用 URL、query、headers、body、超时、取消、响应解析和 `UbeanFetchError` 契约；`internalFetch` 不支持上传进度

```typescript
// src/api/client.ts
import { createClient } from 'ubean/client';
import type { paths } from '../../.ubean/routes'; // ubean 自动生成

// 标准客户端（抛异常模式）
export const client = createClient<paths>({
  baseURL: '/api',
  // ofetch 客户端配置
  timeout: 10000,
  // 请求中间件
  onRequest(config) {
    // 自动注入 token
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  onError(error) {
    if (error.status === 401) {
      // 跳转到登录页
    }
  }
});

// 扁平客户端（不抛异常，返回 { data, error }）
export const flatClient = createFlatClient<paths>({ baseURL: '/api' });
```

#### 使用方式

```typescript
// 在 Vue 组件/composable 中使用
import { client } from '@/api/client';

// 路径、参数、请求体、响应类型全部自动推导
const user = await client.get('/users/{id}', {
  params: {
    path: { id: '123' }, // 路径参数
    query: { include: 'posts' } // query 参数
  }
});
// user 的类型自动从 OpenAPI schema 推导：{ id: string; name: string; email: string }

const result = await client.post('/auth/login', {
  body: { email: 'user@example.com', password: '123456' } // body 自动类型检查
});

const upload = await client.post('/assets', {
  body: formData,
  onUploadProgress(event) {
    // total 可能未知；仅在 lengthComputable 为 true 时计算百分比
    const percent = event.total ? Math.round((event.loaded / event.total) * 100) : undefined;
    updateUploadProgress({ loaded: event.loaded, total: event.total, percent });
  }
});

// 扁平模式：不 try-catch，通过返回值判断
const { data, error } = await flatClient.get('/users/{id}', {
  params: { path: { id: '123' } }
});
if (error) {
  console.error('请求失败:', error.message);
} else {
  console.log('用户:', data);
}
```

#### 浏览器文件上传进度

浏览器标准 Fetch API 仍未提供可互操作的上传进度事件，因此上传进度不能由 ofetch 自身实现。`onUploadProgress` 是显式的传输能力开关：仅该字段存在时由 `ubean/client-xhr` 使用 `XMLHttpRequest.upload.onprogress`；普通 JSON、下载和无进度回调的上传继续使用 ofetch。

```typescript
export interface UploadProgressEvent {
  loaded: number;
  total?: number;
  lengthComputable: boolean;
}

export interface UbeanRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  onUploadProgress?: (event: UploadProgressEvent) => void;
}
```

- `FormData` 直接传给 XHR；适配器不得手动设置 `Content-Type`，以保留浏览器生成的 multipart boundary。
- XHR 必须实现 `AbortSignal`、timeout、network error、HTTP error、`responseType` 和响应 headers 的映射，并将结果归一为与 ofetch 相同的 `UbeanFetchError` / flat result。
- XHR 不支持 Fetch 的 `Request`/`Response` 流式 body 语义；传入 `ReadableStream`、Fetch 专属 `dispatcher` 或不可映射选项时必须在调用前诊断。
- 下载进度不是本期 API；如后续加入，使用独立 `onDownloadProgress` 并明确 XHR 与 Fetch 流读取的兼容范围。

#### 服务端使用 (loader/action 中)

```typescript
// routes/users.ts
import { defineHandler } from 'ubean/handler';
import { internalFetch } from 'ubean/internal';

export const GET = defineHandler(async c => {
  // 服务端直接调用内部路由，无需经过 HTTP
  const result = await internalFetch(c).get('/api/health');
  return c.json(result);
});
```

#### 自动类型生成

ubean 在构建/开发时扫描 `routes/` 目录，自动生成 `.ubean/routes.d.ts`：

- 从 `defineMeta({ openAPI: { ... } })` 和文件级 `export const meta` 提取 OpenAPI Operation 定义
- 从 handler 的 TypeScript 类型推导参数和响应类型（辅助）
- 生成符合 OpenAPI 3.1 `paths` 结构的类型文件
- 兼容 `openapi-typescript` 生成的格式，可直接被 `ubean/client` 的 ofetch/XHR typed client 消费
- 开发模式下 HMR 自动更新类型

```typescript
// .ubean/routes.d.ts (自动生成)
export interface paths {
  '/users/{id}': {
    get: {
      parameters: {
        path: { id: string };
        query?: { include?: string };
      };
      responses: {
        200: { content: { 'application/json': { user: User } } };
        404: { content: { 'application/json': { error: string } } };
      };
    };
    patch: {
      parameters: { path: { id: string } };
      requestBody: { content: { 'application/json': Partial<User> } };
      responses: { 200: { content: { 'application/json': { success: boolean } } } };
    };
  };
  '/auth/login': {
    post: {
      requestBody: { content: { 'application/json': { email: string; password: string } } };
      responses: { 200: { content: { 'application/json': { token: string } } } };
    };
  };
}
```

### 4.9 定时任务系统 (Cron Jobs)

参考 nitro 的 scheduledTasks 和 void 的 defineScheduled 设计：

- 在 `crons/` 目录下定义定时任务
- 使用 `export const cron = "<cron expression>"` 定义调度表达式
- 使用 `defineScheduled()` 定义任务处理函数
- 在支持 cron trigger 的平台（Cloudflare Workers Cron Triggers、Vercel Cron）自动配置
- 其他平台通过内置的 cron 调度器或外部触发（`/_cron/<name>` 端点）实现

```typescript
// crons/daily-cleanup.ts
import { defineScheduled } from 'ubean/cron';
import { db } from 'ubean/database';

export const cron = '0 0 * * *'; // 每天凌晨执行

export default defineScheduled(async ({ lastExecutionTime, scheduledTime }) => {
  // 清理过期数据
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  console.log(`[Cron] Cleaned up expired sessions at ${scheduledTime}`);
});
```

#### Cron 配置

```typescript
// ubean.config.ts
export default defineConfig({
  cron: {
    // 任务运行时的超时时间
    timeout: 30_000,
    // 是否在开发模式下启用 cron
    enabled: process.env.NODE_ENV === 'production'
  },
  // 也可以通过 scheduledTasks 配置映射 cron 到任务名（nitro 风格）
  scheduledTasks: {
    '*/5 * * * *': ['tasks/heartbeat']
  }
});
```

### 4.10 环境变量系统

```typescript
// env.ts
import { defineEnv, string, number, boolean, url } from 'ubean/env';

export const env = defineEnv({
  // 服务端密钥
  DATABASE_URL: string().secret(),
  API_SECRET: string().secret().optional(),

  // 公共变量 (VITE_ 前缀自动暴露到客户端)
  VITE_APP_NAME: string().default('My App'),
  VITE_API_URL: url(),

  // 类型转换
  PORT: number().default(3000),
  DEBUG: boolean().default(false),

  // 可选 + 默认值
  NODE_ENV: string().oneOf(['development', 'production', 'test']).default('development')
});
```

### 4.11 Preset 系统设计

```typescript
// src/preset/_utils/preset.ts
import type { UbeanPreset, UbeanPresetMeta } from 'ubean/types';

export function definePreset<P extends UbeanPreset, M extends UbeanPresetMeta>(
  preset: P,
  meta?: M
): P & { _meta: UbeanPresetMeta } {
  if (typeof preset !== 'function' && preset.entry && preset.entry.startsWith('.')) {
    preset.entry = resolve(presetsDir, preset.entry);
  }
  return { ...preset, _meta: meta } as P & { _meta: M };
}
```

```typescript
// src/preset/node/preset.ts
import { definePreset } from '../_utils/preset';
import { nodeCluster } from './cluster';

const nodeServer = definePreset(
  {
    entry: './node/runtime/node-server',
    serveStatic: true,
    commands: {
      preview: 'node ./server/index.mjs'
    }
  },
  {
    name: 'node-server' as const,
    aliases: ['node'],
    stdName: 'node'
  }
);

export default [nodeServer, nodeCluster] as const;
```

Preset 自动解析逻辑:

1. 用户配置中明确指定 `preset` 选项
2. 环境变量 `UBEAN_PRESET`
3. 自动检测 (std-env provider 检测):
   - `process.versions.bun` → bun
   - `Deno` 全局变量 → deno
   - Vercel 环境变量 → vercel
   - Netlify 环境变量 → netlify
   - Cloudflare Pages 环境变量 → cloudflare-pages
   - 等等
4. 回退到 `defaultPreset` (通常为 node-server)

### 4.12 DevTools 开发工具面板

参考 Nuxt DevTools 的 iframe + RPC 架构模式，为 ubean 内置可视化开发工具面板，提供配置/环境变量/页面路由/API 接口的 UI 化管理，并暴露钩子函数支持数据持久化到数据库，同时集成 AI 大模型辅助开发操作。

#### 设计理念

- **In-App 面板**：应用内浮动按钮唤起 DevTools（`Shift+Alt+D` 快捷键），通过 iframe 隔离 UI 与应用
- **仅开发模式可用**：生产构建自动 tree-shake 移除所有 DevTools 代码，零运行时开销
- **双向 RPC 通信**：DevTools iframe 与宿主应用通过 `postMessage` + 类型安全 RPC 通道通信
- **可扩展 Tab 系统**：内置核心 Tab，同时支持自定义 Tab 插件扩展
- **钩子系统**：所有 CRUD 操作前后触发 hooks，用户可监听以将数据同步到数据库/外部系统
- **AI 驱动**：集成 LLM，自然语言驱动路由/接口/配置的增删改

#### DevTools 面板架构

```
┌──────────────────────────────────────────────────┐
│               ubean App (Host)                    │
│  ┌────────────────────────────────────────────┐  │
│  │  DevTools Floating Button (small Vue widget)│  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  DevTools Iframe (独立 Vue 应用)            │  │
│  │  ┌────────┬────────┬────────┬────────────┐ │  │
│  │  │Overview│ Pages  │ Routes │ Config ... │ │  │
│  │  ├────────┴────────┴────────┴────────────┤ │  │
│  │  │           Tab Content                  │ │  │
│  │  │  ┌──────────────┐  ┌────────────────┐  │ │  │
│  │  │  │  CRUD UI     │  │  AI Chat Panel │  │ │  │
│  │  │  └──────────────┘  └────────────────┘  │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────┘  │
│         ▲                    ▲                    │
│         │ RPC (postMessage)  │ Hook Events        │
│         ▼                    ▼                    │
│  ┌────────────────────────────────────────────┐  │
│  │  ubean DevTools Server (Vite plugin)       │  │
│  │  - File system operations (read/write)     │  │
│  │  - Route/API meta extraction               │  │
│  │  - Code generation (d.ts updates)          │  │
│  │  - Hook dispatch (before/after CRUD)       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

#### 内置 Tab 功能

| Tab               | 功能                                                                            | 操作能力        |
| ----------------- | ------------------------------------------------------------------------------- | --------------- |
| **Overview**      | 项目概览：ubean 版本、Vue 版本、路由/API 数量、插件列表、构建状态、启动时间     | 只读            |
| **Pages**         | 页面路由可视化管理：列表/树形展示所有页面路由、布局、meta、reuse 关系           | CRUD + 跳转预览 |
| **API Routes**    | API 接口管理：所有 GET/POST/... 端点列表、OpenAPI 文档、内置接口测试 playground | CRUD + 在线测试 |
| **Config**        | 项目配置编辑：可视化修改 `ubean.config.ts`，实时预览效果                        | 编辑            |
| **Env**           | 环境变量管理：`.env` 文件编辑、schema 校验、服务端/客户端变量分离展示           | CRUD + 校验     |
| **Layouts**       | 布局组件预览：所有 layouts 的组件树、slot 结构、使用情况统计                    | 只读 + 创建     |
| **Middlewares**   | 中间件链可视化：执行顺序、meta 匹配情况、耗时监控                               | 只读 + 创建     |
| **Plugins**       | 插件列表：加载顺序、hook 注册情况、执行耗时                                     | 只读            |
| **Cron Jobs**     | 定时任务管理：cron 表达式可视化编辑、手动触发、执行历史                         | CRUD + 触发     |
| **Storage/KV**    | 存储浏览器：unstorage 数据浏览、编辑、清理                                      | CRUD            |
| **Database**      | 数据库面板：Drizzle 表结构浏览、简单 SQL 查询（可选）                           | 只读 + 查询     |
| **Hooks**         | 钩子监控：所有 hookable 事件监听、耗时、调用链追踪                              | 只读            |
| **Virtual Files** | 虚拟文件查看：`.ubean/routes.d.ts`、`.ubean/pages.d.ts`、虚拟模块源码           | 只读            |
| **Terminal**      | 终端面板：内嵌终端，运行 `ubean page add`、`ubean api add` 等 CLI 命令          | 交互            |
| **AI Assistant**  | AI 聊天面板：自然语言驱动所有 CRUD 操作                                         | 对话            |

#### 配置管理 (Config Tab)

```typescript
// DevTools 中可视化编辑 ubean.config.ts
// 通过 AST 操作（ts-morph）安全修改配置文件，支持：
// - preset 切换
// - 路由/页面目录配置
// - 构建选项
// - 环境变量 schema
// - DevTools 自身配置
```

配置编辑通过 RPC 调用服务端接口：

```typescript
// DevTools Server RPC handlers
interface DevToolsRPC {
  // Config
  'config:get': () => Promise<ResolvedConfig>;
  'config:update': (patch: Partial<UbeanConfig>) => Promise<{ success: boolean; diff: string }>;

  // Env
  'env:list': () => Promise<EnvVarInfo[]>;
  'env:create': (key: string, value: string, options: EnvVarOptions) => Promise<void>;
  'env:update': (key: string, value: string) => Promise<void>;
  'env:delete': (key: string) => Promise<void>;
  'env:validate': () => Promise<EnvValidationResult>;
}
```

#### 页面路由 CRUD (Pages Tab)

完整的页面路由增删改查能力，底层复用 CLI Shared Layer 的 `page add/delete/update` 逻辑（与 `ubean page *` 命令共用）：

```typescript
interface DevToolsRPC {
  // Pages CRUD
  'pages:list': () => Promise<PageRouteInfo[]>;
  'pages:get': (name: string) => Promise<PageRouteDetail>;
  'pages:create': (input: CreatePageInput) => Promise<CreatePageResult>;
  'pages:update': (name: string, patch: UpdatePageInput) => Promise<void>;
  'pages:delete': (name: string, options?: { backup?: boolean }) => Promise<void>;

  // Reuse routes
  'pages:createReuse': (input: CreateReuseInput) => Promise<void>;

  // Layouts
  'layouts:list': () => Promise<LayoutInfo[]>;
  'layouts:create': (name: string) => Promise<void>;
}

interface PageRouteInfo {
  name: string;
  path: string;
  filePath: string;
  layout: string | false;
  meta: PageMeta;
  hasLoader: boolean;
  hasAction: boolean;
  isReuse: boolean;
  reuseTarget?: string;
  children?: PageRouteInfo[];
}

interface CreatePageInput {
  path: string; // 如 '/users/[id]'
  layout?: string; // 布局名
  withLoader?: boolean; // 是否创建 .server.ts
  withServerFile?: boolean;
  template?: 'vue' | 'tsx';
}
```

页面创建时自动生成模板文件：

```vue
<!-- DevTools 创建 pages/users/[id].vue 时生成 -->
<script setup lang="ts">
import { definePage } from 'ubean/pages';

definePage({
  layout: 'default',
  meta: {
    title: 'User Detail'
  }
});
</script>

<template>
  <div>User Detail</div>
</template>
```

#### API 接口 CRUD (API Routes Tab)

```typescript
interface DevToolsRPC {
  // API Routes CRUD
  'api:list': () => Promise<ApiRouteInfo[]>;
  'api:get': (method: string, path: string) => Promise<ApiRouteDetail>;
  'api:create': (input: CreateApiInput) => Promise<void>;
  'api:update': (method: string, path: string, patch: UpdateApiInput) => Promise<void>;
  'api:delete': (method: string, path: string) => Promise<void>;

  // API Testing
  'api:test': (input: ApiTestInput) => Promise<ApiTestResult>;

  // OpenAPI
  'openapi:generate': () => Promise<string>; // 返回 OpenAPI JSON
}

interface ApiRouteInfo {
  methods: string[]; // ['GET', 'PATCH', 'DELETE']
  path: string; // '/users/:id'
  filePath: string;
  meta?: RouteMeta;
  openapi?: OperationObject;
}

interface CreateApiInput {
  path: string; // '/users'
  methods: string[]; // ['GET', 'POST']
  withOpenAPI?: boolean; // 是否生成 OpenAPI 文档骨架
  withValidator?: boolean; // 是否生成 defineValidator 骨架
}
```

API 创建时自动生成 handler 文件：

```typescript
// DevTools 创建 routes/users.ts 时生成
import { defineHandler, defineMeta } from 'ubean/handler';

export const GET = defineHandler(
  defineMeta({
    openAPI: {
      tags: ['Users'],
      summary: 'List users',
      responses: { 200: { description: 'OK' } }
    }
  }),
  async c => {
    return c.json({ users: [] });
  }
);

export const POST = defineHandler(
  defineMeta({
    openAPI: {
      tags: ['Users'],
      summary: 'Create user'
    }
  }),
  async c => {
    const body = await c.req.json();
    return c.json({ success: true }, 201);
  }
);
```

API 测试 Playground：在 DevTools 中直接填写参数、发送请求、查看响应（自动携带 cookie/auth header），类似 Postman 但零配置。

#### 钩子系统 (Hooks)

DevTools 所有操作前后触发 hookable 事件，用户可以注册钩子将数据同步到数据库、触发 CI/CD、或做权限校验：

```typescript
// app.ts 或 plugins/devtools-hooks.ts
import { defineApp } from 'ubean/vue';
import { useDevToolsHooks } from 'ubean/devtools';

export default defineApp(({ app }) => {
  const hooks = useDevToolsHooks();

  // 页面路由创建前：可做权限校验、数据预存到 DB
  hooks.hook('page:beforeCreate', async (input, context) => {
    // 例如：记录到数据库
    await db.pages.create({
      data: { name: input.name, path: input.path, createdBy: context.user.id }
    });
  });

  // 页面路由创建后：可触发 Git 提交、通知等
  hooks.hook('page:afterCreate', async (result, context) => {
    console.log(`Page ${result.name} created by ${context.user?.name}`);
  });

  // API 接口创建前
  hooks.hook('api:beforeCreate', async input => {
    // 校验接口路径规范
    if (!input.path.startsWith('/api/')) {
      throw new Error('API path must start with /api/');
    }
  });

  // 环境变量更新前
  hooks.hook('env:beforeUpdate', async (key, value) => {
    // 例如：同步到外部密钥管理服务
    await secretsManager.set(key, value);
  });

  return app;
});
```

**完整钩子列表**：

| Hook 名称                                | 参数                         | 说明                          |
| ---------------------------------------- | ---------------------------- | ----------------------------- |
| `page:beforeCreate`                      | `(input, ctx)`               | 页面创建前，可 throw 阻止操作 |
| `page:afterCreate`                       | `(result, ctx)`              | 页面创建后                    |
| `page:beforeUpdate`                      | `(name, patch, ctx)`         | 页面更新前                    |
| `page:afterUpdate`                       | `(name, ctx)`                | 页面更新后                    |
| `page:beforeDelete`                      | `(name, ctx)`                | 页面删除前                    |
| `page:afterDelete`                       | `(name, ctx)`                | 页面删除后                    |
| `api:beforeCreate`                       | `(input, ctx)`               | API 创建前                    |
| `api:afterCreate`                        | `(result, ctx)`              | API 创建后                    |
| `api:beforeUpdate`                       | `(method, path, patch, ctx)` | API 更新前                    |
| `api:afterUpdate`                        | `(method, path, ctx)`        | API 更新后                    |
| `api:beforeDelete`                       | `(method, path, ctx)`        | API 删除前                    |
| `api:afterDelete`                        | `(method, path, ctx)`        | API 删除后                    |
| `config:beforeUpdate`                    | `(patch, ctx)`               | 配置更新前                    |
| `config:afterUpdate`                     | `(config, ctx)`              | 配置更新后                    |
| `env:beforeCreate`                       | `(key, value, opts, ctx)`    | 环境变量创建前                |
| `env:afterCreate`                        | `(key, ctx)`                 | 环境变量创建后                |
| `env:beforeUpdate`                       | `(key, value, ctx)`          | 环境变量更新前                |
| `env:afterUpdate`                        | `(key, ctx)`                 | 环境变量更新后                |
| `env:beforeDelete`                       | `(key, ctx)`                 | 环境变量删除前                |
| `env:afterDelete`                        | `(key, ctx)`                 | 环境变量删除后                |
| `cron:beforeCreate` / `cron:afterCreate` | ...                          | Cron 任务 CRUD                |
| `devtools:ready`                         | `(ctx)`                      | DevTools 面板加载完成         |
| `ai:beforeToolCall`                      | `(toolName, args, ctx)`      | AI 调用工具前，可做权限/审计  |
| `ai:afterToolCall`                       | `(toolName, result, ctx)`    | AI 调用工具后                 |

> **Ctx 对象**包含当前用户信息（若配置了 DevTools 认证）、请求来源、时间戳等。

#### AI 助手 (AI Assistant Tab)

集成 LLM 大模型，通过自然语言对话驱动 DevTools 操作。AI 不直接写文件，而是调用 DevTools 的 RPC 方法（即 CRUD 接口），确保所有操作经过钩子校验：

```typescript
// AI 可用的 Tool 定义（基于 RPC 方法自动生成）
const devtoolsTools = [
  {
    name: 'create_page',
    description: '创建一个新的页面路由',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '路由路径，如 /users/[id]' },
        layout: { type: 'string', description: '布局名', enum: ['default', 'blank', 'admin'] },
        withLoader: { type: 'boolean', description: '是否创建 server loader' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_api_route',
    description: '创建 API 接口',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        methods: { type: 'array', items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] } },
        withOpenAPI: { type: 'boolean' }
      },
      required: ['path', 'methods']
    }
  },
  {
    name: 'list_pages',
    description: '列出所有页面路由'
  },
  {
    name: 'list_api_routes',
    description: '列出所有 API 接口'
  },
  {
    name: 'update_env',
    description: '更新环境变量',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' }
      },
      required: ['key', 'value']
    }
  }
  // ... 所有 RPC 方法映射为 AI Tools
];
```

**AI 对话交互示例**：

> **用户**：帮我创建一个产品管理模块，需要产品列表页和产品详情页，还有对应的 CRUD 接口
>
> **AI**：好的，我将为你创建以下内容：
>
> 1. 页面：`/products`（列表页）和 `/products/[id]`（详情页）
> 2. API：`GET/POST /api/products`、`GET/PATCH/DELETE /api/products/:id`
> 3. 都使用 default 布局
>
> 确认执行吗？
>
> **用户**：确认
>
> **AI**：✅ 已创建：
>
> - `pages/products/index.vue` (Products)
> - `pages/products/[id].vue` (ProductId)
> - `routes/products.ts` (GET/POST)
> - `routes/products/[id].ts` (GET/PATCH/DELETE)
>
> 需要为这些接口添加 OpenAPI 文档吗？

**AI 集成配置**：

```typescript
// ubean.config.ts
export default defineConfig({
  devtools: {
    enabled: true, // dev 默认 true，prod 强制 false
    ai: {
      enabled: true,
      // 支持多种 LLM provider
      provider: 'openai', // 'openai' | 'anthropic' | 'custom'
      apiKey: process.env.OPENAI_API_KEY, // 也可在 DevTools UI 中填写
      model: 'gpt-4o'
      // 自定义 provider
      // provider: 'custom',
      // endpoint: 'https://your-llm-proxy.com/v1/chat/completions',
    }
  }
});
```

#### RPC 通信层

基于 `postMessage` 实现类型安全的 RPC。DevTools 仅在开发模式与 loopback host 启用；RPC 握手生成一次性 session token，并将 iframe window、允许 origin 与 token 绑定。生产构建不得包含 DevTools RPC handler 或 AI provider 配置。

```typescript
// src/devtools/rpc.ts
// Host 侧（应用内）
export function createDevToolsServer({ iframeWindow, devtoolsOrigin, sessionToken }) {
  const handlers = createRpcHandlers();

  window.addEventListener('message', async event => {
    const { id, method, params, token } = event.data ?? {};
    if (
      event.origin !== devtoolsOrigin ||
      event.source !== iframeWindow ||
      token !== sessionToken ||
      !isAllowedDevToolsMethod(method)
    ) {
      return;
    }
    try {
      await hooks.callHook(`${methodToHook(method)}:before`, ...params);
      const result = await handlers[method](...params);
      await hooks.callHook(`${methodToHook(method)}:after`, result);
      iframeWindow.postMessage({ __ubean_devtools__: true, id, result }, devtoolsOrigin);
    } catch (error) {
      iframeWindow.postMessage({ __ubean_devtools__: true, id, error: toPublicError(error) }, devtoolsOrigin);
    }
  });
}

// Client 侧（DevTools iframe 内）
export function createDevToolsClient({ parentOrigin, sessionToken }) {
  let nextId = 0;
  const pending = new Map();

  window.addEventListener('message', event => {
    if (
      event.origin === parentOrigin &&
      event.source === window.parent &&
      event.data?.__ubean_devtools__ &&
      pending.has(event.data.id)
    ) {
      const { resolve, reject } = pending.get(event.data.id);
      pending.delete(event.data.id);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    }
  });

  return new Proxy(
    {},
    {
      get(_, method: string) {
        return (...params: unknown[]) =>
          new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            window.parent.postMessage(
              { __ubean_devtools__: true, id, method, params, token: sessionToken },
              parentOrigin
            );
          });
      }
    }
  ) as DevToolsRPC;
}
```

#### 文件操作安全

所有 DevTools 文件写入操作遵循以下安全策略：

1. **AST 操作优先**：修改 `.ts`/`.vue` 文件时使用 ts-morph 进行 AST 操作，而非字符串替换，保证代码格式正确
2. **操作前备份**：所有删除/覆写操作前自动备份到 `.ubean/backup/` 目录
3. **事务性写入**：先写临时文件，成功后 rename，避免写入中断导致文件损坏
4. **路径约束**：只允许读写项目根目录内、经 allowlist 允许的文件；拒绝符号链接逃逸、绝对路径与敏感文件
5. **最小权限**：AI 工具默认只读；每次写入、删除或执行命令前展示 diff 并要求用户明确确认
6. **操作确认**：涉及删除/批量修改时 UI 层二次确认
7. **Git 检测**：检测到 Git 仓库时建议用户先 commit；框架不自动创建 commit

#### DevTools 配置

```typescript
// ubean.config.ts
export default defineConfig({
  devtools: {
    /**
     * 是否启用 DevTools
     * @default true in dev, false in prod
     */
    enabled?: boolean;

    /**
     * DevTools 面板访问路径
     * @default '/__ubean_devtools__'
     */
    route?: string;

    /**
     * 自定义 Tab 插件
     */
    tabs?: DevToolsTab[];

    /**
     * AI 助手配置
     */
    ai?: {
      enabled?: boolean;
      provider?: 'openai' | 'anthropic' | 'custom';
      apiKey?: string;
      model?: string;
      endpoint?: string;
      /** AI 可使用的工具白名单，默认全部 */
      allowedTools?: string[];
    };
  },
});
```

#### UI 技术栈

DevTools 客户端（iframe 内的 Vue 应用）使用 **`@soybeanjs/ui` + `@soybeanjs/headless`** 构建：

- **`@soybeanjs/ui`**：提供 Button/Input/Select/Modal/Tree/Table/Tabs/Form/CodeEditor 等组件，统一设计语言
- **`@soybeanjs/headless`**：提供无样式的功能基元（组合式函数、状态管理）
- **CodeMirror 6**：代码编辑器（API Playground 编辑、虚拟文件查看），只读模式下也用于代码片段高亮显示
- **fuse.js**：路由/接口/组件模糊搜索
- DevTools 客户端作为独立 Vue 应用预构建为单文件（内联 CSS/JS），通过 Vite 虚拟模块注入，无需额外安装依赖

#### 可扩展自定义 Tab

用户/插件可以注册自定义 DevTools Tab：

```typescript
// plugins/my-devtools-tab.ts
import { defineDevToolsTab } from 'ubean/devtools';

export default defineDevToolsTab({
  name: 'my-feature',
  title: 'My Feature',
  icon: '🔧',
  // Tab 的 Vue 组件
  component: () => import('./devtools/MyFeatureTab.vue'),
  // 自定义 RPC 方法
  rpc: {
    'my-feature:get-data': async () => { return db.query(...); },
    'my-feature:update-data': async (data) => { ... },
  },
});
```

### 4.13 CLI 命令系统

基于 `citty` 构建类型安全的命令行工具，**所有 DevTools 可视化操作均有对应的 CLI 命令**，实现 GUI 与 CLI 的功能对等。DevTools 服务端 RPC 与 CLI 共享底层 CRUD 逻辑（`cli/shared/fs-ops.ts`），保证两边操作结果一致。

#### 命令总览

```bash
ubean              # 显示帮助
ubean dev          # 启动开发服务器
ubean build        # 构建生产版本
ubean prepare      # 准备类型生成 (dev 前自动执行)
ubean preview      # 预览生产构建

# ─── 页面路由 ───
ubean page add           # 交互式添加页面 (路径/布局/loader)
ubean page add-reuse     # 交互式添加 reuse 路由
ubean page delete <name> # 删除页面 (自动备份)
ubean page update <name> # 更新页面 (重命名/改布局/改路径)
ubean page list          # 列出所有页面路由
ubean page recovery      # 从备份恢复已删除的页面

# ─── API 接口 ───
ubean api add            # 交互式添加 API 接口 (路径/方法/OpenAPI)
ubean api delete <method> <path>  # 删除接口
ubean api update <method> <path>  # 更新接口
ubean api list           # 列出所有 API 接口
ubean api test <method> <path>    # 命令行接口测试 (发送请求查看响应)

# ─── 布局 ───
ubean layout add <name>  # 创建新布局
ubean layout delete <name>  # 删除布局
ubean layout list        # 列出所有布局

# ─── 环境变量 ───
ubean env add <key> [value] [--server|--public]
ubean env delete <key>
ubean env update <key> <value>
ubean env list           # 列出所有环境变量
ubean env validate       # 校验环境变量 schema

# ─── 配置 ───
ubean config get [key]   # 获取配置值
ubean config set <key> <value>  # 更新配置

# ─── 中间件 ───
ubean middleware add <name> [--order N]  # 创建中间件
ubean middleware list    # 列出所有中间件及执行顺序

# ─── 插件 ───
ubean plugin add <name>  # 创建插件
ubean plugin list        # 列出所有插件

# ─── 定时任务 ───
ubean cron add           # 交互式创建定时任务
ubean cron delete <name> # 删除定时任务
ubean cron update <name> # 更新定时任务
ubean cron list          # 列出所有定时任务
ubean cron run <name>    # 手动触发定时任务

# ─── DevTools ───
ubean devtools           # 在浏览器中打开 DevTools (自动启动 dev server)
ubean devtools enable    # 启用 DevTools
ubean devtools disable   # 禁用 DevTools
ubean devtools ai-setup  # 交互式配置 AI provider / API Key
```

#### CLI 与 DevTools 共享核心逻辑

```
┌─────────────┐     ┌──────────────┐
│  DevTools   │     │  CLI 命令行  │
│  (Vue UI)   │     │  (citty)     │
└──────┬──────┘     └──────┬───────┘
       │  RPC call        │  direct call
       ▼                  ▼
┌─────────────────────────────────┐
│  CLI Shared Layer               │
│  (cli/shared/fs-ops.ts)         │
│  - AST 文件操作 (ts-morph)      │
│  - 模板生成                     │
│  - 备份/恢复                    │
│  - hooks 触发                   │
└─────────────────────────────────┘
```

- DevTools 面板通过 RPC 调用到 Vite 插件端，Vite 插件端调用 CLI Shared Layer 执行操作
- CLI 命令直接调用 CLI Shared Layer 执行操作
- 两边操作都会触发同一套 hooks（page:beforeCreate 等），保证钩子一致性
- CLI `--json` flag 支持机器可读输出，便于 CI/CD 集成

#### CLI 示例：创建页面

```bash
$ ubean page add
? 路由路径: /products/[id]
? 选择布局: default
? 是否创建 server loader? Yes
? 是否创建 server action? No
? 模板类型: Vue SFC

✅ 已创建:
  - pages/products/[id].vue       (page: ProductId)
  - pages/products/[id].server.ts (loader)
```

#### CLI 示例：创建 API 接口

```bash
$ ubean api add
? API 路径: /api/products
? HTTP 方法 (空格多选): GET, POST, DELETE
? 生成 OpenAPI 文档骨架? Yes

✅ 已创建:
  - routes/api/products.ts (GET, POST)
  - routes/api/products/[id].ts (DELETE)? 哦，路径含 [id] 了，是否拆分到子文件? Yes

✅ 已创建:
  - routes/api/products.ts     (GET, POST)
  - routes/api/products/[id].ts (GET, PATCH, DELETE)
```

### 4.14 npm scripts

用户项目 `package.json` 中可用的脚本（`ubean init` 自动生成）：

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 4.15 错误处理

#### 错误类型

```typescript
// src/runtime/error.ts
class UbeanError extends Error {
  statusCode: number;
  statusMessage: string;
  data?: unknown;
}

// 预定义错误
throw createError({ statusCode: 404, statusMessage: 'Not Found' });
throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { field: 'email' } });
```

#### 错误页面

- `error.vue` — 在 pages/ 根目录创建自定义错误页
- `error.[statusCode].vue` — 特定状态码错误页（如 `error.404.vue`）
- 支持服务端和客户端错误统一展示
- DevTools 中提供错误详情面板（堆栈、请求信息）

#### 开发模式错误展示

- 编译错误：Vite 错误覆盖层（默认）
- 运行时错误：DevTools 错误面板 + 控制台结构化输出
- HMR 错误：不刷新页面，保留当前状态显示错误

### 4.16 Markdown/MDX 页面（内置）

参考 void 的 `.md` 页面支持，ubean 原生支持 Markdown 作为页面路由。

#### 文件约定

- `pages/**/*.md` — Markdown 页面文件，与 `.vue` 页面同级混放
- `pages/**/*.mdx` — MDX 页面（支持 Vue 组件嵌入，可选）
- Markdown 文件被扫描时自动标记为 island（需要客户端 JS 来 hydrate Vue 组件）

#### Frontmatter 支持

```markdown
---
title: About Us
description: Company introduction
layout: default
meta:
  requiresAuth: false
  order: 2
---

# About Us

Welcome to our company...

<Counter client:visible />
```

- YAML frontmatter 通过 `front-matter` 解析，提取 `title`/`description`/`layout`/`meta`
- `layout: false` 可指定不使用布局
- Markdown 正文通过 [`markdown-exit`](https://github.com/serkodev/markdown-exit) 渲染（markdown-it 的 TypeScript 重写版，原生支持 async），通过 `@shikijs/markdown-exit` 插件集成 Shiki 提供代码语法高亮，无需额外 async 补丁
- 支持嵌入 Vue 组件，组件通过 client 指令控制 hydration 策略

#### 配置选项

```typescript
// ubean.config.ts
export default defineConfig({
  markdown: {
    enabled: true, // 默认 true，设为 false 禁用
    mdx: false, // 是否启用 MDX 支持
    theme: 'vitesse-dark', // Shiki 代码高亮主题（支持双主题: { light, dark }）
    markdownExit: {
      // markdown-exit 配置（原生 async 渲染）
      html: true,
      linkify: true,
      breaks: false
    },
    headings: {
      // 标题锚点
      anchorLinks: true
    },
    components: {
      // 自动导入的 Vue 组件可在 md 中使用
      autoImport: true
    }
  }
});
```

### 4.17 Islands 孤岛架构

参考 void 的 islands 实现（Import Attributes 方式），ubean 采用更符合 Vue 习惯的 **Astro 风格 client 指令**，并在 Vite 插件层实现自动孤岛检测。

#### Client 指令

在 Vue 模板中通过指令标记孤岛组件的 hydration 策略：

```vue
<template>
  <!-- 页面加载后立即 hydrate -->
  <Counter client:load />

  <!-- 空闲时 hydrate (requestIdleCallback) -->
  <HeavyChart client:idle />

  <!-- 进入视口时 hydrate (IntersectionObserver) -->
  <Comments client:visible />

  <!-- 媒体查询匹配时 hydrate -->
  <MobileNav client:media="(max-width: 768px)" />

  <!-- 仅服务端渲染，不发送客户端 JS -->
  <StaticFooter client:only="server" />
</template>
```

#### 工作原理

1. **编译时扫描**：Vite 插件扫描 `.vue` 和 `.md` 文件，检测 `client:*` 指令
2. **自动 island 标记**：含 `client:*` 指令的组件自动作为孤岛组件，服务端渲染后客户端单独 hydrate
3. **客户端 JS 按需发送**：无孤岛组件的页面不发送客户端 JS（纯静态 HTML）
4. **Layout 链继承**：Layout 中的孤岛组件会传递给所有使用该 Layout 的页面
5. **Props 序列化**：孤岛组件的 props 通过协议序列化传递到客户端（仅支持 JSON 可序列化值）
6. **Markdown 自动孤岛**：含 Vue 组件或 `<script>` 的 `.md` 文件自动标记为需要客户端 bundle

#### 对比 void 的 Import Attributes

| 方案                                               | 优点                                                    | 缺点                                                              |
| -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| void `import X from "..." with { island: "idle" }` | 标准语法、编译时静态分析                                | Vue `<script setup>` 中写 import 加属性较突兀；需配合模板使用不便 |
| ubean `client:*` 指令                              | Vue 开发者熟悉（类似 Nuxt/Astro）、模板中直观、渐进增强 | 自定义指令需编译转换                                              |

### 4.18 自动导入（内置，可配置）

自动导入分为两类，默认均启用，均可通过配置关闭。

#### Composables 自动导入（unimport）

自动导入项目 `composables/`、`utils/` 目录及 ubean 内置 composables，无需手动 import：

```typescript
// 无需 import，自动可用
const { t, locale, setLocale } = useI18n();
const user = useUser();
const data = await useLoaderData<typeof loader>();
const router = useRouter();
```

**自动扫描目录**：

- `composables/` — 自动导入所有导出（支持嵌套目录扫描，默认只扫描一级）
- `composables/index.ts` — 命名导出
- `utils/` — 工具函数（需开启配置）

#### Vue 组件自动导入（unplugin-vue-components）

自动导入项目 `components/` 目录下的 Vue 组件，无需在 script 中 import：

```vue
<template>
  <!-- 无需 import，自动注册 -->
  <BaseButton>Click</BaseButton>
  <Icon name="home" />
</template>
```

**自动扫描目录**：

- `components/` — 扫描所有 `.vue` 组件（支持嵌套目录，目录名作为命名空间：`Foo/Bar.vue` → `<FooBar />`）
- ubean 内置组件（`<Link>`、`<Head>`、`<ClientOnly>` 等）始终可用

#### 配置

```typescript
// ubean.config.ts
export default defineConfig({
  imports: {
    autoImport: true, // composables 自动导入，默认 true
    dirs: ['composables', 'composables/*/index.{ts,vue}'],
    global: false // 是否注入到全局（false 则仅在类型中可见）
  },
  components: {
    autoImport: true, // 组件自动导入，默认 true
    dirs: ['components'],
    directoryAsNamespace: false // 目录作为命名空间
  }
});
```

#### 类型支持

自动生成 `.ubean/auto-imports.d.ts` 和 `.ubean/components.d.ts`，在 `tsconfig.json` 中自动引入。

### 4.19 i18n 国际化

void 和 nitro 均未内置 i18n，ubean 提供轻量内置国际化支持。

#### 文件约定

```
locales/
├── en.ts
├── zh-CN.ts
├── ja.ts
└── index.ts          // 配置入口（可选）
```

```typescript
// locales/zh-CN.ts
export default defineLocale({
  name: '简体中文',
  messages: {
    welcome: '欢迎',
    'nav.home': '首页',
    'user.greeting': '你好，{name}',
    'items.count': '{count} 个项目 | {count} 个项目' // 复数支持
  }
});
```

#### Locale 检测与路由策略

支持三种 locale 路由策略：

```typescript
// ubean.config.ts
export default defineConfig({
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en', 'ja'],
    strategy: 'prefix_except_default', // prefix | prefix_except_default | no_prefix
    detectBrowserLocale: true, // 检测 Accept-Language
    cookieName: 'ubean_locale', // locale cookie 名
    fallbackLocale: 'en'
  }
});
```

**策略说明**：

- `prefix_except_default`：默认语言无前缀（/about），其他语言前缀（/en/about）— 默认
- `prefix`：所有语言均有前缀（/zh-CN/about、/en/about）
- `no_prefix`：无 URL 前缀，通过 cookie/header 切换

#### Composables

```typescript
// 服务端/客户端通用
const { t, locale, locales, setLocale, getLocale } = useI18n();

t('welcome'); // '欢迎'
t('user.greeting', { name: '张三' }); // '你好，张三'
t('items.count', { count: 5 }, 5); // '5 个项目'（复数）

// 切换 locale
setLocale('en');
```

#### `<Link>` 组件自动处理 locale 前缀

```vue
<Link to="/about">About</Link>
<!-- 当前 locale=en 时渲染为 <a href="/en/about"> -->
<!-- 当前 locale=zh-CN 时渲染为 <a href="/about"> (default, prefix_except_default) -->
```

```vue
<Link :to="{ name: 'About', locale: 'ja' }">日本語</Link>
<!-- 强制指定 locale 前缀 -->
```

#### Loader 中获取 locale

```typescript
export const loader = defineLoader(c => {
  const locale = getLocale(c);
  // 根据 locale 返回不同数据
});
```

### 4.20 跨平台队列（Queues）

参考 void 的 Proxy 动态绑定模式，ubean 提供跨平台队列抽象。

#### 定义队列

```typescript
// queues/email.ts
import { defineQueue } from 'ubean/queue';

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
}

export const emailQueue = defineQueue<EmailJob>(
  {
    name: 'email',
    retry: { maxAttempts: 3, backoff: 'exponential' }
  },
  async job => {
    // 处理队列任务
    await sendEmail(job.to, job.subject, job.body);
  }
);
```

#### 发送任务

```typescript
// routes/api/signup.ts
export const POST = defineHandler(defineValidator({ json: z.object({ email: z.string().email() }) }), async c => {
  const { email } = c.req.valid('json');
  // ... 创建用户
  await emailQueue.send({ to: email, subject: 'Welcome', body: '...' });
  return c.json({ success: true });
});
```

#### 平台适配

| 平台               | 底层实现                          |
| ------------------ | --------------------------------- |
| Node.js            | BullMQ / 内存队列（开发模式）     |
| Cloudflare Workers | Cloudflare Queues（通过 binding） |
| Vercel             | Vercel Queues                     |
| Bun                | Bun 内置 Worker                   |
| Deno               | Deno Queue                        |

各 preset 在构建时根据平台注入对应的队列驱动实现，开发模式默认使用内存队列。

#### 类型生成

自动生成 `.ubean/queues.d.ts`，增强 `queues` 全局对象的类型（参考 void 的 Proxy 模式）：

```typescript
// 自动生成的类型
interface QueueMap {
  email: Queue<EmailJob>;
}
```

### 4.21 Better Auth 集成插件

参考 void 的 Better Auth 集成，以官方插件形式提供（非内置核心），遵循 ubean 的 meta.public 中间件鉴权模式。

```typescript
// plugins/auth.ts
import betterAuth from 'ubean-auth/better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export default betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  trustedOrigins: ['http://localhost:3000'],
  socialProviders: {
    github: { clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET }
  }
});
```

- 插件自动注册 `/api/auth/*` 路由
- 自动注入 auth 中间件，处理鉴权状态
- 提供 `useAuth()` composable（服务端/客户端通用）
- `c.get('user')` / `c.get('session')` 在 handler 中获取当前用户
- 与 `meta.public` 配合：`public: false` 的路由自动要求登录
- Vue 客户端导出 `authClient` 实例（参考 void 的 auth-client-vue 模式）

### 4.22 类型安全 `<Link>` 组件

`<Link>` 组件的 `to` 属性类型化为项目中已定义的路由名称联合类型。

```vue
<script setup lang="ts">
import { Link } from 'ubean/pages';
</script>

<template>
  <!-- to 只能传已定义的 RouteName，TS 自动补全 -->
  <Link to="UserDetail" :params="{ id: '123' }">用户详情</Link>

  <!-- 字符串路径也支持，但 params 类型推导 -->
  <Link to="/users/123">用户详情</Link>

  <!-- 对象形式 -->
  <Link :to="{ name: 'UserDetail', params: { id: '123' }, query: { tab: 'profile' } }">用户详情</Link>
</template>
```

类型由自动生成的 `.ubean/pages.d.ts` 中的 `RouteName` 联合类型驱动，CLI/DevTools 添加/删除路由时自动更新。

---

## 5. TypeScript 函数式编程规范

### 5.1 核心原则

1. **纯函数优先**: 所有工具函数必须是纯函数，相同输入产生相同输出，无副作用
2. **不可变性**: 使用 `const`、`readonly`、`Object.freeze()`、展开运算符而非突变
3. **函数组合**: 使用 pipe/compose 模式组合函数，避免深层嵌套
4. **高阶函数**: 使用高阶函数抽象通用模式
5. **类型安全**: 严格 TypeScript，避免 `any`，充分利用泛型
6. **无类设计**: 优先使用工厂函数和闭包而非 class；必要时仅在运行时核心使用 class (如 Router、DevServer)
7. **核心纯函数**: 路由解析、配置归并、代码生成与类型计算保持纯函数；Hono app、Hookable、文件系统、网络和可变上下文位于明确的 adapter/effect 边界，并通过参数注入依赖

### 5.2 文件组织规范

```typescript
// 1. 类型导入放最前
import type { Config, ResolvedConfig } from '../types';
import type { Preset } from '../preset/types';

// 2. 外部依赖
import { resolve, join } from 'pathe';
import { defu } from 'defu';
import { consola } from 'consola';

// 3. 内部依赖
import { readConfig } from './loader';
import { resolvePaths } from './resolvers/paths';

// 4. 常量定义 (纯数据)
const DEFAULT_CONFIG = {
  srcDir: './',
  output: {
    dir: './.output'
  }
} as const;

// 5. 纯工具函数 (不依赖外部状态)
// - 命名: 动词开头，小写驼峰
// - 必须有 JSDoc 注释说明用途、参数、返回值
// - 必须有类型标注
/**
 * 合并用户配置与默认配置
 * @param userConfig - 用户配置
 * @param defaults - 默认配置
 * @returns 合并后的配置
 */
function mergeConfig<T extends Record<string, unknown>>(userConfig: Partial<T>, defaults: T): T {
  return defu(userConfig, defaults) as T;
}

// 6. 主要导出函数
// - 命名: 具名导出优先
// - 复杂函数内部拆分为小的纯函数
/**
 * 加载并解析 ubean 配置
 * @param rootDir - 项目根目录
 * @param opts - 加载选项
 * @returns 解析后的配置
 */
export async function loadOptions(rootDir: string, opts: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const rawConfig = await readConfig(rootDir, opts);
  const preset = await resolvePreset(rawConfig.preset, { dev: opts.dev });
  const withDefaults = mergeConfig(rawConfig, DEFAULT_CONFIG);

  return resolvePaths(withDefaults, rootDir);
}

// 7. 避免: 默认导出、class、let 突变、any 类型
```

### 5.3 异步函数规范

```typescript
// ✅ 好的做法: 返回 Promise，使用 async/await
async function readJsonFile<T>(path: string): Promise<T> {
  const content = await fsp.readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

// ✅ 好的做法: 错误处理返回 Result 类型或抛出特定错误
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

### 5.4 类型设计规范

```typescript
// ✅ 使用 interface 定义对象形状，type 定义联合类型/工具类型
export interface UbeanOptions {
  readonly rootDir: string;
  readonly preset: PresetName;
  readonly dev: boolean;
}

// ✅ 使用字面量类型 + as const
export const PRESET_NAMES = ['node-server', 'bun', 'deno', 'cloudflare', 'vercel'] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

// ✅ 使用泛型保持类型安全
function createHandler<T extends EventHandler>(handler: T): T {
  return handler;
}

// ✅ 条件类型做类型推断
type InferLoaderData<T> = T extends () => Promise<{ data: infer D }> ? D : never;
```

---

## 6. 测试策略

### 6.1 测试框架

- **vitest** (vite-plus 集成版本)
- **@vitest/coverage-v8** (覆盖率)

### 6.2 测试类型

1. **单元测试** (`test/unit/`)
   - 纯函数测试: 工具函数、配置解析、路由匹配
   - 不依赖文件系统或网络
   - 快速执行，覆盖率目标 > 90%

2. **集成测试** (`test/integration/`)
   - 构建流程测试
   - 开发服务器测试
   - Preset 适配测试
   - 使用 test/fixtures 中的完整项目

3. **浏览器端到端测试** (`test/e2e/`)

- 使用 Playwright 验证 SSR hydration、客户端导航、表单 action 与错误页
- 只对正式支持的 preset 执行，不以模拟器替代正式平台 smoke test

4. **类型测试**
   - 使用 `expectTypeOf` 验证类型推导

5. **打包与部署 smoke test**

- `pnpm pack` 后在独立 fixture 安装并验证公开 exports、CLI 与类型声明
- 对每个正式 preset 执行 `dev`、`build`、`preview` 和目标平台部署 smoke test

### 6.3 持续验收门槛

测试不是最后阶段的收尾任务。每个实现阶段都必须新增或更新对应 fixture，并在合并前满足以下门槛：

1. 单元测试覆盖新增的纯计算、扫描和代码生成逻辑。
2. 至少一个真实 fixture 覆盖新增能力的 `dev`、`build` 和 `preview` 路径。
3. 公开 TypeScript API 添加正反类型测试；生成文件变更需验证增量更新与冷启动结果一致。
4. 改动 SSR、路由或页面协议时添加浏览器端到端测试。
5. 改动 preset 能力时更新能力矩阵，并运行该 preset 的本地或远程 smoke test。
6. 改动客户端传输时，覆盖 ofetch 默认路径、XHR `FormData` 上传进度、取消、超时、未知 total、HTTP/网络错误归一化，以及 SSR/edge 的不支持诊断。

覆盖率用于发现盲区，不作为替代契约测试的发布标准。核心运行时与公开 API 默认纳入统计；仅生成代码、平台不可执行的 shim 和经批准的适配器分支可排除，并在配置旁说明原因。

### 6.4 测试配置

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

### 6.5 测试示例

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

## 7. CLI 命令设计

### 7.1 命令列表

```bash
# 开发
ubean dev                    # 启动开发服务器
ubean dev --port 3000        # 指定端口
ubean dev --host 0.0.0.0     # 指定主机

# 构建
ubean build                  # 构建生产版本
ubean build --preset vercel  # 指定 preset 构建
ubean build --minify         # 压缩构建
ubean build --sourcemap      # 生成 sourcemap

# 准备/类型生成
ubean prepare                # 生成类型文件 (.ubean/ 目录)
ubean prepare --force        # 强制重新生成

# 预览
ubean preview                # 预览生产构建

# 初始化
ubean init                   # 在当前目录初始化 ubean 项目
ubean init my-app            # 创建新项目
```

### 7.2 CLI 框架使用 citty

```typescript
// src/cli/index.ts
import { defineCommand, runMain } from 'citty';
import { devCommand } from './commands/dev';
import { buildCommand } from './commands/build';
import { prepareCommand } from './commands/prepare';
import { previewCommand } from './commands/preview';

const main = defineCommand({
  meta: {
    name: 'ubean',
    version: version,
    description: 'Vue meta framework'
  },
  subCommands: {
    dev: devCommand,
    build: buildCommand,
    prepare: prepareCommand,
    preview: previewCommand
  }
});

void runMain(main);
```

---

## 8. 导出设计

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

### 8.2 发布范围与平台能力契约

为避免“声明支持”与实际运行时语义不一致，版本支持分为**正式支持**、**实验性**和**社区/按需**三档。只有通过对应部署 smoke test 的 preset 才能进入正式支持列表。

| 版本  | 正式支持                 | 实验性                               | 不在承诺范围                          |
| ----- | ------------------------ | ------------------------------------ | ------------------------------------- |
| v0.1  | Node.js (`node-server`)  | Cloudflare Workers（完成单独验收后） | Bun、Deno、Vercel、Netlify 及其他平台 |
| v0.2+ | 由能力矩阵与 CI 结果决定 | 新增 preset 先以实验性发布           | 未通过矩阵验收的平台                  |

每个 preset 必须显式声明 `capabilities`，例如 `fs`、`cronTrigger`、`longLivedProcess`、`websocket`、`queue`、`isr` 和 `nodeCompat`。构建器根据已启用功能和 preset 能力做预检查：

- 能力缺失时在构建期给出功能、配置位置、目标 preset 与替代方案，不静默降级。
- cron 仅在具备平台 trigger 或长生命周期进程能力时启用；serverless preset 不提供“内置常驻调度器”。
- ISR、WebSocket、Queue、文件存储等功能必须在每个 preset 中声明其一致语义、限制和测试环境；不能保证一致语义时应作为 preset 扩展而非核心能力。

### 8.3 客户端与公开 API 边界

核心 HTTP 客户端以标准 Fetch API 为基础，确保浏览器、Node、Deno 与 edge runtime 的行为一致。`createClient` 与 `internalFetch` 共享请求、响应、错误和重试的中间件模型；`internalFetch` 直接调度框架 handler，不依赖网络或 axios adapter。

- `axios`/`axios-retry` 仅作为可选的浏览器或 Node 适配器包，不得进入 edge server bundle。
- OpenAPI 类型仅用于编译期参数与响应推导，运行时不加载 OpenAPI 文档。
- `exports` 分为稳定公开入口、`./experimental/*` 入口和私有实现；`./internal`、`./_env` 不作为稳定用户 API。
- 每次发布前使用 `pnpm pack` 安装到独立 fixture，验证所有公开入口、条件导出和类型声明。

---

## 9. 实现阶段规划

### 9.1 纵向交付里程碑

阶段按模块组织，但发布决策以纵向里程碑为准；后续能力不得跳过前一里程碑的验收门槛。

| 里程碑            | 可交付能力                                                                | 必须通过的验收                                         |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| M0：路由契约      | 配置加载、路由 IR、文件扫描、错误模型与 Node fixture                      | 路径规范化、冲突检测、`404/405/OPTIONS` 单元与集成测试 |
| M1：API beta      | Hono、命名导出 API、验证、OpenAPI、Fetch client、Node `dev/build/preview` | 真实 Node fixture、类型测试、`pnpm pack` 安装测试      |
| M2：Vue SSR beta  | Pages、单层 layout、loader、hydrate、页面错误边界                         | 浏览器 SSR hydration、导航与 action 端到端测试         |
| M3：Node v0.1     | 静态资源、基础 route rules、可观测性与发布文档                            | CI 全绿、Node 部署 smoke test、公开 API 审核           |
| M4：第二个 preset | 一个实验性 preset 升级为正式支持                                          | 能力矩阵、目标平台 smoke test 与降级诊断               |
| M5：生态扩展      | DevTools、数据库、队列、WebSocket、i18n 等可选能力                        | 各能力独立 fixture、权限审计与稳定性评估               |

### 9.2 模块实施阶段

### Phase 1: 基础框架 (Week 1-2)

- [ ] 项目初始化 (monorepo 结构、pnpm catalog、tsconfig)
- [ ] 核心类型定义 (UbeanConfig, UbeanOptions, UbeanPreset, etc.)
- [ ] 配置加载系统 (c12 集成、默认配置、resolver 框架)
- [ ] CLI 基础框架 (citty、dev/build/prepare/preview 命令骨架)
- [ ] 工具函数层 (fs/path/route/hash 等纯函数)
- [ ] 项目 meta 模块 (版本、路径常量)
- [ ] 单元测试基础设施搭建
- [ ] Node 路由契约 fixture（含冲突、`404/405/OPTIONS`）与 CI 基础检查

### Phase 2: 构建核心 (Week 3-4)

- [ ] 文件扫描系统 (routes/pages/layouts/middleware/plugins/public/crons 扫描)
- [ ] HTTP 命名导出检测 (detectHttpExports: AST 扫描 GET/POST/PUT/PATCH/DELETE 等)
- [ ] Pages 扫描 (pages/\*_/_.vue + .reuse.ts，排除 components/modules 子目录)
- [ ] Layouts 扫描 (layouts/**/\*.vue + layouts/**/index.vue，推导布局名)
- [ ] 路由名称推导 (文件名 → PascalCase name，支持路由组括号忽略、动态参数)
- [ ] 路由系统 (Router 类、路由匹配、基于 rou3)
- [ ] 文件名 → 路由路径转换 (`[id]` → `:id`, `index` → `/`, `(group)` → 忽略, etc.)
- [ ] 虚拟模块生成框架
- [ ] Vite 插件骨架 (ubeanPlugin)
- [ ] Rollup 构建基础
- [ ] 基础 preset 系统 (definePreset、\_resolve、standard preset)
- [ ] Node.js preset 实现
- [ ] defineMeta / defineValidator AST 提取（含自定义 meta: public/rateLimit/cache，及文件级 export const meta）
- [ ] definePage 宏 AST 提取（从 `<script setup>` 和 `.reuse.ts` 中提取 name/path/layout/meta/reuse）
- [ ] 代码生成基础 (codegen/route-types.ts: .ubean/routes.d.ts, codegen/page-types.ts: .ubean/pages.d.ts)
- [ ] M0 验收：路由清单、冲突诊断和 Node fixture 的 `dev/build/preview` 测试

### Phase 3: 运行时核心 (Week 5-6)

- [ ] Hono 集成与服务端入口
- [ ] 请求处理器 (defineHandler: 中间件链式组合 + 1~N handlers 多重重载类型推导)
- [ ] defineMeta / defineValidator 运行时实现（透传中间件 + 验证执行 + 类型链累积）
- [ ] route meta 运行时合并 (defineMeta meta + 文件级 export const meta → c.route.meta)
- [ ] 中间件系统 (middleware/ 目录 + 数字前缀排序 + c.route.meta 访问)
- [ ] 运行时插件系统 (基于 hookable)
- [ ] 静态资源服务
- [ ] 环境变量系统 (defineEnv、schema 验证、服务端/客户端分离)
- [ ] 响应工具函数 (redirect/rewrite/json/html etc.)
- [ ] 错误处理
- [ ] OpenAPI 运行时 (handlersMeta 收集、/\_openapi.json 端点、Scalar UI)
- [ ] Cron 运行时 (defineScheduled、cron 调度、平台 trigger 集成)
- [ ] 类型安全客户端 (createClient/createFlatClient，基于 ofetch + 中间件)
- [ ] 浏览器 XHR 上传适配器 (`ubean/client-xhr`：FormData、onUploadProgress、取消、超时与错误归一化)
- [ ] 客户端传输测试（ofetch 默认、XHR 进度与 SSR/edge 不支持诊断）
- [ ] M1 验收：API fixture、OpenAPI schema 诊断、类型测试与 `pnpm pack` 安装测试

### Phase 4: Vue Pages 系统 (Week 7-8)

- [ ] Pages 核心协议 (Inertia 风格)
- [ ] Pages 服务端序列化
- [ ] definePage 编译时宏 (definePage 调用的 AST 转换、类型注入)
- [ ] Layout 系统 (layouts/ 目录扫描、布局名推导、默认布局、layout: false 无布局)
- [ ] Reuse 路由 (.reuse.ts 文件处理、reuse 字段类型校验、组件复用)
- [ ] 路由组支持 ((group)/ 目录不生成路径段)
- [ ] 虚拟路由模块 (ubean:pages: routes/layouts/routeNames 数据)
- [ ] 页面路由类型生成 (.ubean/pages.d.ts: LayoutName/RouteName 联合类型)
- [ ] Vue 适配器插件 (ubeanVue)
- [ ] Vue SSR 渲染器
- [ ] defineApp 系统 (app.ts/app.server.ts/app.client.ts 扫描与入口生成)
- [ ] Vue 客户端运行时 (router、Link、useRouter、useParams、usePage)
- [ ] Head 管理
- [ ] Layout 嵌套渲染
- [ ] Loader/Action 类型推导
- [ ] View Transitions 支持
- [ ] 预取 (prefetch)
- [ ] CLI page 命令 (ubean page add/add-reuse/delete/update/recovery/list)
- [ ] CLI Shared Layer (fs-ops/backup/templates 与 DevTools 共享)
- [ ] CLI api 命令 (ubean api add/delete/update/list/test)
- [ ] CLI layout 命令 (ubean layout add/delete/list)
- [ ] CLI env 命令 (ubean env add/delete/update/list/validate)
- [ ] CLI config 命令 (ubean config get/set)
- [ ] CLI cron/middleware/plugin 基础命令
- [ ] M2 验收：SSR hydration、导航、action/CSRF 与错误页浏览器端到端测试

### Phase 5: 实验性 Preset (Week 9-10)

- [ ] Preset 生成脚本 (gen-presets)
- [ ] 能力矩阵与构建期 capability 诊断
- [ ] Cloudflare Workers preset（实验性；含 unenv node compat 与部署 smoke test）
- [ ] Dev 模式 worker runner 集成 (env-runner)
- [ ] 开发服务器热重载
- [ ] Bun、Deno、Vercel、Netlify 与其他平台仅在 v0.2+ 按能力矩阵逐个引入

### Phase 6: 高级特性 (Week 11-13)

- [ ] ISR/缓存系统 (routeRules cache)
- [ ] 预渲染/SSG
- [ ] Route Rules (headers/redirects/rewrites/proxy)
- [ ] Storage 集成 (unstorage)
- [ ] KV 抽象
- [ ] 数据库集成 (db0 + Drizzle ORM)
- [ ] WebSocket 支持 (crossws, void 风格 defineRoom/defineWebSocket)
- [ ] SSE 支持
- [ ] 服务端 internalFetch (内部路由调用，不经过 HTTP)
- [ ] 自动导入 (unimport)
- [ ] 客户端 HMR 类型更新 (.ubean/routes.d.ts)
- [ ] DevTools 基础架构 (Vite 插件、iframe 注入、birpc 通信、浮动按钮)
- [ ] DevTools 内置 Tab (Overview/Pages/API Routes/Config/Env/Layouts/Middlewares/Cron/Hooks/Virtual Files)
- [ ] DevTools CRUD (页面路由 CRUD + API 路由 CRUD + 配置/Env CRUD，复用 CLI 逻辑)
- [ ] DevTools Hooks 系统 (before/after hooks for all CRUD operations)
- [ ] DevTools API Playground (接口在线测试)
- [ ] DevTools AI Assistant (LLM function calling 驱动 CRUD，OpenAI/Anthropic/custom provider)
- [ ] DevTools 自定义 Tab 插件 (defineDevToolsTab)

### Phase 7: Skills & 文档 (Week 14)

- [ ] Skills 系统 (SKILL.md 路由)
- [ ] 内置文档 (guide/reference/integrations)
- [ ] AGENT_PROMPT.md
- [ ] ubean init 交互式初始化
- [ ] 示例项目 (examples/)

### Phase 8: 发布认证与测试完善 (Week 15-16)

- [ ] DevTools 单元测试 (rpc/hooks/fs-ops/crud)
- [ ] DevTools 集成测试 (iframe 通信/CRUD 端到端)
- [ ] DevTools AI 工具调用测试
- [ ] 单元测试补全（以公开 API 和核心运行时为重点；覆盖率只作辅助指标）
- [ ] 集成、浏览器端到端与 `pnpm pack` 测试矩阵
- [ ] Node 正式支持认证；仅对正式/实验性 preset 执行对应矩阵
- [ ] CI/CD 配置 (GitHub Actions，自 Phase 1 起持续运行)
- [ ] 所有 npm scripts 验证

---

## 10. 与参考项目的差异点

### 10.1 相对 void 的变化

1. **移除 Void Cloud 依赖**: 无登录、无部署平台绑定、无自有云服务
2. **Vue 专属**: 移除 React/Svelte/Solid 适配器，深度优化 Vue
3. **多平台支持**: 从仅 Cloudflare 扩展到 nitro 级别的多平台（Node/Bun/Deno/Cloudflare/Vercel/Netlify 等）
4. **通用部署**: 移除 void deploy 命令，改为各平台标准部署方式
5. **移除内置 Auth**: 不内置 Better Auth，用户可自由选择鉴权方案，通过 middleware + `meta.public` 实现
6. **Cron Jobs 保留并增强**: void 的 defineScheduled/crons 目录保留，参考 nitro 的 scheduledTasks 增加配置式映射
7. **命名导出路由约定**: 采用 void 的 `export const GET`/`POST` 单文件多方法模式（替代 nitro 的文件名后缀）
8. **Hooks 系统增强**: 采用 nitro 的 hookable 完整生命周期
9. **Preset 系统**: 完整的平台预设机制
10. **运行时插件**: 新增 nitro 风格的运行时插件系统
11. **构建工具**: 保留 vite-plus，同时支持 rolldown 构建
12. **defineHandler 增强**: 复用 void 的中间件链式组合，扩展 meta 支持自定义字段（public/rateLimit/cache）
13. **类型安全客户端**: 基于 ofetch 的强类型客户端，消费自动生成的 OpenAPI paths 类型；浏览器上传进度通过 XHR 适配器提供

### 10.2 void 平台特性集成评估

| 特性                 | void 实现                                                 | 集成决策                   | 理由                                                                                           |
| -------------------- | --------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Cron Jobs**        | `crons/` 目录 + `defineScheduled()` + `export const cron` | ✅ **核心集成**            | 通用需求，nitro 也有 scheduledTasks，跨平台可通过平台 cron trigger 或内置调度器实现            |
| **Queues**           | `queues/` 目录 + `defineQueue()` + Cloudflare Queues 绑定 | ⚠️ **Preset 可选**         | 强依赖 Cloudflare Queues/队列基础设施，作为 Cloudflare/Vercel 等平台的 preset 扩展，不纳入核心 |
| **AI (Workers AI)**  | `env.AI` 绑定 + `ai.run()`/`ai.stream()` + AI Gateway     | ❌ **不集成核心**          | Cloudflare 特有能力，用户可通过 plugin 自行注入 binding；不是通用元框架功能                    |
| **Sandboxes**        | `@cloudflare/sandbox` Durable Object + `env.SANDBOX`      | ❌ **不集成**              | Cloudflare Labs 实验性功能，非稳定 API，绑定特定平台，不适合核心                               |
| **WebSocket Rooms**  | `defineRoom()`/`defineWebSocket()` + `.ws.ts` 文件        | ✅ **核心集成**            | WebSocket 是通用需求，crossws 已支持跨平台，void 的 defineRoom 模式优雅                        |
| **KV 存储**          | `env.KV` + `kv.get()/put()/list()`                        | ✅ **通过 unstorage 集成** | 不绑定 Cloudflare KV，使用 unstorage 统一 KV 接口，各平台 preset 注入对应驱动                  |
| **D1/Database**      | `env.DB` Drizzle 集成                                     | ✅ **核心集成（抽象化）**  | 使用 db0 抽象数据库接口，Drizzle 作为一等 ORM，但不绑定 Cloudflare D1                          |
| **Basic Auth**       | 内置 `basicAuth()` middleware                             | ✅ **保留为内置中间件**    | 通用需求，作为可选 middleware 导出                                                             |
| **Better Auth 内置** | 内置 Better Auth 集成                                     | ❌ **移除**                | 鉴权方案多样（Better Auth/Auth.js/自建），不内置特定方案，通过 `meta.public` 支持中间件鉴权    |

### 10.3 相对 nitro 的变化

1. **Hono 替代 h3**: 使用 Hono 作为 HTTP 框架
2. **Inertia 式 Pages**: 内置 SSR 页面路由，无需额外 renderer
3. **Vue 深度集成**: 一等公民 Vue 支持，自动配置 Vue SSR
4. **简化 API**: 面向应用开发者的更简洁 API
5. **vite-plus 优先**: 使用 vite-plus 而非纯 Vite
6. **文件约定优化**: 采用 void 风格的目录约定 (routes/ pages/ middleware/)
7. **环境变量 Schema**: void 风格的 defineEnv 类型安全验证
8. **Skills 内置**: 内置 Agent Skills 系统
9. **客户端类型生成**: 自动生成类型安全的 fetch 客户端
10. **Vue 组件内置**: Link、Head、ClientOnly 等 Vue 组件
11. **OpenAPI 自动文档**: nitro 风格的 OpenAPI 自动生成 + Scalar UI 集成
12. **defineApp 定制**: 取代硬编码入口，支持完整 Vue 插件生态

---

## 11. 关键技术决策

| 决策点      | 选择                                   | 理由                                                 |
| ----------- | -------------------------------------- | ---------------------------------------------------- |
| HTTP 框架   | Hono                                   | 轻量、现代、边缘友好、类型安全、API 优雅             |
| 构建工具    | vite-plus                              | void 已验证、高性能、内置配置管理                    |
| 包管理器    | pnpm@11                                | monorepo 支持好、catalog 功能、性能优秀              |
| CLI 框架    | citty                                  | unjs 生态、轻量、类型安全                            |
| 配置加载    | c12                                    | unjs 生态、支持 ts 配置、watch 模式                  |
| 路由匹配    | rou3                                   | nitro 使用、高性能、支持编译优化                     |
| Hooks 系统  | hookable                               | unjs 生态、类型安全、同步异步支持                    |
| 存储抽象    | unstorage                              | nitro 使用、多驱动支持                               |
| 数据库抽象  | db0 + Drizzle                          | db0 统一接口 + Drizzle 类型安全 ORM                  |
| WebSocket   | crossws                                | nitro 使用、跨平台兼容                               |
| 测试框架    | vitest (vite-plus)                     | Vite 原生集成、高性能                                |
| 运行器      | env-runner                             | nitro 使用、支持多 runtime worker                    |
| Node 兼容   | unenv                                  | nitro 使用、Cloudflare/Edge 环境 Node API 兼容       |
| 自动导入    | unimport                               | unjs 生态、按需自动导入                              |
| 日志        | consola                                | unjs 生态、美观、可配置                              |
| OpenAPI类型 | @scalar/openapi-types                  | Scalar 维护的 OpenAPI 3.1 类型、nitro 已验证         |
| OpenAPI UI  | @scalar/api-reference (CDN)            | 现代化 API 文档 UI、零构建依赖                       |
| HTTP 客户端 | ofetch + 中间件；浏览器 XHR 上传适配器 | 默认跨 runtime 一致；仅上传进度切换为浏览器 XHR 传输 |

---

## 12. 风险与注意事项

1. **Vite-Plus 版本对齐**: catalog 必须锁定 vite-plus、vite 和 vitest 的兼容版本；升级通过独立兼容性 CI 后才可合并
2. **Preset 测试复杂度**: 多平台测试需要不同环境，部分可使用 miniflare 等模拟
3. **Vue SSR 性能**: 需要注意 SSR 流式渲染和 hydration 优化
4. **类型推导复杂度**: Pages loader/action 的类型推导需要精心设计
5. **Rolldown 稳定性**: Rolldown 仍在发展中，Rollup 作为稳定备选
6. **Hono vs h3 生态**: h3 与 nitro 生态绑定更深，Hono 需要一些适配工作
7. **env-runner 集成**: Worker 开发运行时需要处理好 HMR 和重启逻辑
8. **defineApp 类型兼容**: 需要确保 defineApp 的 async 返回值和 app 实例类型在 SSR/Client 两端一致
9. **OpenAPI meta 提取**: AST 解析 `defineMeta()` 调用和文件级 `export const meta` 需要处理各种写法（变量引用、展开等），初期可采用 void 方式仅支持字面量对象
10. **defineValidator 类型链完整性**: 多重重载（1~10 handlers）需要正确累积 Input 类型，自定义中间件通过 defineMiddleware 包装保持类型链不断裂，10+ handlers 场景的类型退化需测试验证
11. **definePage 宏转换**: `<script setup>` 中的 `definePage()` 编译时宏需要 Vite 插件在 Vue SFC 编译阶段拦截提取，避免运行时残留调用
12. **Reuse 路由类型闭环**: `reuse` 字段的类型需要引用已生成的 `RouteName` 联合，存在鸡生蛋问题，需采用两阶段生成（先生成 RouteName 类型，再校验 reuse 引用）
13. **CLI AST 操作安全性**: CLI 使用 ts-morph 修改生成文件时需做好备份，避免用户手动编辑的内容丢失
14. **SSR 序列化与 hydration 安全性**: 页面数据必须采用防 XSS 的序列化格式，并覆盖 `</script>`、Unicode 分隔符、循环引用和 hydration mismatch 测试
15. **路由协议兼容性**: Pages 协议、虚拟模块和生成类型均需带版本；客户端与服务端版本不兼容时应诊断并拒绝继续导航
16. **平台能力语义差异**: 任何新 preset 在进入实验性或正式支持前，都必须记录缓存、cron、WebSocket、Queue、文件系统和 Node 兼容的语义差异及降级行为
17. **DevTools 安全边界**: 必须测试跨 origin 消息拒绝、token 失效、路径逃逸、敏感文件访问与 AI 写操作确认，不能仅验证正常 RPC 路径
18. **公开 API 演进**: exports、配置 schema 和生成类型的变更需声明稳定性等级、迁移说明和弃用周期，避免内部入口成为事实公共 API
19. **上传进度传输差异**: `onUploadProgress` 触发 XHR 与 ofetch 的双传输路径，必须确保认证头、cookie、超时、取消、错误和响应解析一致；SSR、edge 和 internalFetch 必须明确拒绝该选项

---

## 13. 任务跟踪状态

> 状态图例：⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⏸️ 暂停 | ❌ 阻塞

### Phase 1: 项目骨架 (Week 1-2)

| ID    | 任务                             | 状态 | 优先级 | 产出文件                              | 备注                                    |
| ----- | -------------------------------- | ---- | ------ | ------------------------------------- | --------------------------------------- |
| P1-01 | monorepo 初始化 (pnpm + catalog) | ⬜   | P0     | `package.json`, `pnpm-workspace.yaml` | 使用 pnpm@11 catalog 管理版本           |
| P1-02 | 项目目录结构创建                 | ⬜   | P0     | `packages/ubean/src/` 各子目录        | 按 §3 目录结构创建                      |
| P1-03 | 基础依赖安装与配置               | ⬜   | P0     | `packages/ubean/package.json`         | hono/vite-plus/citty/c12/hookable 等    |
| P1-04 | tsconfig + eslint 配置           | ⬜   | P1     | `tsconfig.json`, `eslint.config.mjs`  | 严格 TS + 函数式编程规范                |
| P1-05 | vitest 测试框架搭建              | ⬜   | P0     | `vitest.config.ts`, `test/` 目录      |                                         |
| P1-06 | CLI 入口框架 (citty)             | ⬜   | P0     | `src/core/cli/index.ts`               | dev/build/prepare/preview/init 命令骨架 |
| P1-07 | 配置加载系统 (c12)               | ⬜   | P0     | `src/core/config/loader.ts`           | defineConfig + 默认配置合并             |
| P1-08 | 日志系统 (consola)               | ⬜   | P1     | `src/runtime/log.ts`                  | 统一日志输出                            |

### Phase 2: 构建核心 (Week 3-4)

| ID     | 任务                                | 状态 | 优先级 | 产出文件                                                         | 备注                                                                           |
| ------ | ----------------------------------- | ---- | ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P2-01  | 文件扫描系统 (tinyglobby)           | ⬜   | P0     | `src/core/routing/scan.ts`                                       | routes/pages/layouts/middleware/plugins/crons/queues/locales 扫描              |
| P2-02  | HTTP 命名导出 AST 检测              | ⬜   | P0     | `src/core/routing/detect-exports.ts`                             | detectHttpExports: GET/POST/PUT/PATCH/DELETE                                   |
| P2-03  | Pages 扫描                          | ⬜   | P0     | `src/core/routing/pages.ts`                                      | pages/\*_/_.vue + .reuse.ts                                                    |
| P2-04  | Layouts 扫描                        | ⬜   | P0     | `src/core/routing/layouts.ts`                                    | layouts/**/\*.vue + layouts/**/index.vue                                       |
| P2-04b | Queues 扫描                         | ⬜   | P1     | `src/core/routing/queues.ts`                                     | queues/\*_/_.ts 扫描，提取队列名称与类型                                       |
| P2-04c | Locales 扫描                        | ⬜   | P1     | `src/core/routing/locales.ts`                                    | locales/\*_/_.ts 扫描，注册语言包                                              |
| P2-05  | 路由名称推导                        | ⬜   | P1     | `src/core/routing/route-name.ts`                                 | 文件名→PascalCase，支持路由组                                                  |
| P2-06  | 路由系统 (rou3)                     | ⬜   | P0     | `src/core/routing/router.ts`                                     | 路由匹配、路径转换                                                             |
| P2-07  | 虚拟模块生成框架                    | ⬜   | P0     | `src/core/build/virtual/`                                        | virtual modules 注册                                                           |
| P2-08  | Vite 插件骨架                       | ⬜   | P0     | `src/core/build/vite/plugin.ts`                                  | ubeanPlugin 基础                                                               |
| P2-09  | Rollup 构建基础                     | ⬜   | P0     | `src/core/build/rollup/`                                         | 服务端 Rollup 构建                                                             |
| P2-10  | Preset 系统                         | ⬜   | P0     | `src/core/preset/`                                               | definePreset + \_resolve + standard preset                                     |
| P2-11  | Node.js preset                      | ⬜   | P0     | `src/core/preset/node/`                                          | Node.js 平台适配                                                               |
| P2-12  | defineMeta/defineValidator AST 提取 | ⬜   | P0     | `src/core/build/plugins/route-meta.ts`                           | AST 提取 meta + validators                                                     |
| P2-13  | definePage 宏 AST 提取              | ⬜   | P0     | `src/core/routing/define-page.ts`                                | 从 script setup 和 .reuse.ts 提取                                              |
| P2-14  | 代码生成框架                        | ⬜   | P1     | `src/core/codegen/`                                              | route-types + page-types + env-types + queue-types + auto-imports + components |
| P2-15  | CLI 命令骨架                        | ⬜   | P0     | `src/core/cli/dev.ts, build.ts, prepare.ts, preview.ts, init.ts` | 命令注册与执行                                                                 |

### Phase 3: 运行时核心 (Week 5-6)

| ID    | 任务                              | 状态 | 优先级 | 产出文件                                            | 备注                                                  |
| ----- | --------------------------------- | ---- | ------ | --------------------------------------------------- | ----------------------------------------------------- |
| P3-01 | Hono 集成与服务端入口             | ⬜   | P0     | `src/runtime/app.ts`                                | Hono 实例创建、请求分发                               |
| P3-02 | defineHandler 实现                | ⬜   | P0     | `src/runtime/handler.ts`                            | 中间件链式组合 + 多重重载类型推导                     |
| P3-03 | defineMeta/defineValidator 运行时 | ⬜   | P0     | `src/runtime/handler.ts, src/runtime/validator.ts`  | 透传中间件 + 验证执行 + 类型链累积                    |
| P3-04 | defineMiddleware                  | ⬜   | P0     | `src/runtime/handler.ts`                            | 身份函数保持类型链                                    |
| P3-05 | Route meta 运行时合并             | ⬜   | P0     | `src/runtime/handler.ts`                            | defineMeta meta + 文件级 meta → c.route.meta          |
| P3-06 | 中间件系统                        | ⬜   | P0     | `src/core/routing/middleware.ts`                    | middleware/ 目录扫描、数字前缀排序、c.route.meta 访问 |
| P3-07 | 运行时插件系统 (hookable)         | ⬜   | P0     | `src/runtime/plugin.ts`                             | before/after hooks                                    |
| P3-08 | 静态资源服务                      | ⬜   | P1     | `src/runtime/static.ts`                             | public/ 目录服务                                      |
| P3-09 | 环境变量系统                      | ⬜   | P0     | `src/runtime/env.ts, env-public.ts, env-helpers.ts` | defineEnv + schema 验证 + 服务端/客户端分离           |
| P3-10 | 响应工具函数                      | ⬜   | P0     | `src/runtime/response.ts, headers.ts`               | redirect/rewrite/json/html                            |
| P3-11 | 错误处理                          | ⬜   | P0     | `src/runtime/error.ts`                              | createError + UbeanError + 错误页                     |
| P3-12 | OpenAPI 运行时                    | ⬜   | P1     | `src/runtime/internal/routes/openapi.ts, scalar.ts` | handlersMeta 收集 + /\_openapi.json + Scalar UI       |
| P3-13 | Cron 运行时                       | ⬜   | P1     | `src/runtime/cron.ts, task.ts`                      | defineScheduled + cron 调度 + 平台 trigger            |
| P3-14 | 类型安全客户端 (axios)            | ⬜   | P1     | `src/runtime/client.ts, client-flat.ts`             | createClient/createFlatClient                         |
| P3-15 | Context 类型                      | ⬜   | P0     | `src/types/handler.ts`                              | UbeanContext 完整类型定义                             |
| P3-16 | i18n 运行时                       | ⬜   | P1     | `src/runtime/i18n.ts`                               | defineLocale/useI18n/t()/locale 检测/消息加载         |

### Phase 4: Vue Pages 系统 (Week 7-8)

| ID    | 任务                             | 状态 | 优先级 | 产出文件                                                                | 备注                                        |
| ----- | -------------------------------- | ---- | ------ | ----------------------------------------------------------------------- | ------------------------------------------- |
| P4-01 | Pages 核心协议                   | ⬜   | P0     | `src/core/pages/protocol.ts, serialize.ts`                              | Inertia 风格通信协议                        |
| P4-02 | definePage 编译时宏              | ⬜   | P0     | `src/core/pages/define-page.ts`                                         | definePage AST 转换 + 类型注入              |
| P4-03 | Layout 系统运行时                | ⬜   | P0     | `src/core/pages/layout.ts`                                              | layouts/ 扫描、默认布局、layout: false      |
| P4-04 | Reuse 路由处理                   | ⬜   | P1     | `src/core/pages/reuse.ts`                                               | .reuse.ts 文件 + reuse 字段校验             |
| P4-05 | 路由组支持                       | ⬜   | P1     | `src/core/routing/pages.ts`                                             | (group)/ 目录不生成路径段                   |
| P4-06 | ubean:pages 虚拟模块             | ⬜   | P0     | `src/core/build/virtual/pages.ts, layouts.ts, page-types.ts`            | routes/layouts/routeNames 数据              |
| P4-07 | .ubean/pages.d.ts 类型生成       | ⬜   | P0     | `src/core/codegen/page-types.ts`                                        | LayoutName/RouteName 联合类型               |
| P4-08 | Vue 适配器插件                   | ⬜   | P0     | `src/core/vue/plugin.ts`                                                | ubeanVue Vite 插件                          |
| P4-09 | Vue SSR 渲染器                   | ⬜   | P0     | `src/core/vue/server-renderer.ts`                                       | 服务端 Vue 渲染                             |
| P4-10 | defineApp 系统                   | ⬜   | P0     | `src/core/vue/app-entry.ts`                                             | app.ts/app.server.ts/app.client.ts 入口生成 |
| P4-11 | Vue 客户端运行时                 | ⬜   | P0     | `src/core/vue/client.ts, router.ts`                                     | router/Link/useRouter/useParams/usePage     |
| P4-12 | Head 管理                        | ⬜   | P1     | `src/core/vue/head.ts`                                                  | useHead + Head 组件                         |
| P4-13 | Layout 嵌套渲染                  | ⬜   | P0     | `src/core/pages/layout.ts`                                              | 布局嵌套 + slot 渲染                        |
| P4-14 | Loader/Action 类型推导           | ⬜   | P0     | `src/core/pages/protocol.ts`                                            | loader/action → props 类型推导              |
| P4-15 | View Transitions                 | ⬜   | P2     | `src/core/vue/view-transition.ts`                                       | 页面切换动画                                |
| P4-16 | Prefetch 预取                    | ⬜   | P2     | `src/core/pages/prefetch.ts`                                            | 链接悬停预取                                |
| P4-17 | CLI page 命令                    | ⬜   | P1     | `src/core/cli/page/`                                                    | add/add-reuse/delete/update/recovery/list   |
| P4-18 | CLI api/env/config/layout 等命令 | ⬜   | P2     | `src/core/cli/{api,env,config,layout,cron,plugin,middleware,devtools}/` | 各子命令                                    |
| P4-19 | CLI Shared Layer                 | ⬜   | P0     | `src/core/cli/shared/`                                                  | fs-ops/backup/templates 与 DevTools 共享    |

### Phase 5: 实验性 Preset (Week 9-10)

| ID    | 任务                        | 状态 | 优先级 | 产出文件                          | 备注                                                     |
| ----- | --------------------------- | ---- | ------ | --------------------------------- | -------------------------------------------------------- |
| P5-01 | capability 矩阵与构建期诊断 | ⬜   | P0     | `src/core/preset/capabilities.ts` | 对缺失能力给出明确构建错误，禁止静默降级                 |
| P5-02 | Cloudflare Workers preset   | ⬜   | P1     | `src/core/preset/cloudflare/`     | 实验性；Workers + Pages + 远程部署 smoke test            |
| P5-03 | Dev 模式 worker runner 集成 | ⬜   | P1     | `src/core/dev/`                   | env-runner、热重载与能力诊断                             |
| P5-04 | preset 自动检测             | ⬜   | P1     | `src/core/preset/_resolve.ts`     | 配置优先；自动检测不改变已声明的 capability 结果         |
| P5-05 | 平台配置文件生成            | ⬜   | P1     | `src/core/preset/cloudflare/`     | 仅生成已正式/实验性支持 preset 所需的配置                |
| P5-06 | 后续平台提案                | ⬜   | P3     | `docs/adr/presets/`               | Bun、Deno、Vercel、Netlify 等先完成能力矩阵和 ADR 再实现 |

### Phase 6: 高级特性 (Week 11-13)

| ID    | 任务                       | 状态 | 优先级 | 产出文件                                                          | 备注                                                                       |
| ----- | -------------------------- | ---- | ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P6-01 | ISR/缓存系统               | ⬜   | P1     | `src/runtime/cache.ts, isr-cache.ts`                              | routeRules cache                                                           |
| P6-02 | 预渲染/SSG                 | ⬜   | P1     | `src/core/prerender/`                                             | SSG 静态页面生成                                                           |
| P6-03 | Route Rules                | ⬜   | P1     | `src/core/config/resolvers/route-rules.ts`                        | headers/redirects/rewrites/proxy                                           |
| P6-04 | Storage (unstorage)        | ⬜   | P1     | `src/runtime/storage.ts, kv.ts`                                   | KV/存储抽象                                                                |
| P6-05 | 数据库集成 (db0 + Drizzle) | ⬜   | P1     | `src/runtime/database.ts`, `src/core/plugins/drizzle.ts`          | db0 + Drizzle ORM                                                          |
| P6-06 | WebSocket 支持 (crossws)   | ⬜   | P1     | `src/runtime/websocket.ts, ws-server.ts`                          | defineRoom/defineWebSocket + .ws.ts                                        |
| P6-07 | SSE 支持                   | ⬜   | P2     | `src/runtime/sse.ts, sse-client.ts`                               | Server-Sent Events                                                         |
| P6-08 | 服务端 internalFetch       | ⬜   | P2     | `src/runtime/internal-fetch.ts`                                   | 内部路由调用不经过 HTTP                                                    |
| P6-09 | 自动导入 (unimport)        | ⬜   | P2     | `src/core/plugins/`                                               | 自动导入 composables/utils                                                 |
| P6-10 | DevTools 基础架构          | ⬜   | P1     | `src/core/devtools/server/`                                       | Vite 插件 + birpc 通信 + iframe 注入 + 浮动按钮                            |
| P6-11 | DevTools 内置 Tab          | ⬜   | P1     | `src/core/devtools/client/views/`                                 | Overview/Pages/API/Config/Env/Layouts/Middlewares/Cron/Hooks/Virtual Files |
| P6-12 | DevTools CRUD              | ⬜   | P1     | `src/core/devtools/server/{config,env,pages,api,cron}.ts`         | 复用 CLI Shared Layer                                                      |
| P6-13 | DevTools Hooks 系统        | ⬜   | P1     | `src/core/devtools/server/hooks.ts`                               | before/after CRUD hooks                                                    |
| P6-14 | DevTools API Playground    | ⬜   | P2     | `src/core/devtools/client/views/ApiRoutes/`                       | 接口在线测试（集成 CodeMirror 6 编辑器）                                   |
| P6-15 | DevTools AI Assistant      | ⬜   | P2     | `src/core/devtools/server/ai.ts`                                  | LLM function calling 驱动 CRUD                                             |
| P6-16 | DevTools 自定义 Tab        | ⬜   | P2     | `src/core/devtools/define-tab.ts`                                 | defineDevToolsTab 插件 API                                                 |
| P6-17 | Markdown/MDX 页面支持      | ⬜   | P1     | `src/core/plugins/markdown.ts`, `src/core/routing/markdown.ts`    | markdown-exit + @shikijs/markdown-exit 代码高亮 + frontmatter 解析         |
| P6-18 | Islands 孤岛架构           | ⬜   | P1     | `src/core/plugins/islands.ts`, `src/core/pages/islands-plugin.ts` | client:\* 指令编译转换 + 按需 hydration                                    |
| P6-19 | Composables 自动导入       | ⬜   | P1     | `src/core/plugins/auto-imports.ts`                                | unimport 驱动 + `.ubean/auto-imports.d.ts` 类型生成                        |
| P6-20 | Vue 组件自动导入           | ⬜   | P1     | `src/core/plugins/components.ts`                                  | unplugin-vue-components + `.ubean/components.d.ts` 类型生成                |
| P6-21 | i18n 国际化                | ⬜   | P1     | `src/core/plugins/i18n.ts`, `src/runtime/i18n.ts`                 | locale 检测 + 路由前缀策略 + useI18n composable                            |
| P6-22 | 跨平台队列(Queues)         | ⬜   | P1     | `src/runtime/queue.ts`, `src/core/plugins/queues.ts`              | defineQueue + 各平台驱动 + `.ubean/queues.d.ts` 类型生成                   |
| P6-23 | Better Auth 插件           | ⬜   | P2     | `packages/ubean-auth/`                                            | better-auth 集成插件，注册 /api/auth/\*，提供 useAuth()                    |
| P6-24 | 类型安全 `<Link>` 组件     | ⬜   | P0     | `src/core/vue/Link.ts`, `src/core/plugins/link-typed.ts`          | to 属性类型化为 RouteName，自动处理 i18n locale 前缀                       |
| P6-25 | DevTools CodeMirror 编辑器 | ⬜   | P1     | `src/core/devtools/client/components/CodeEditor.vue`              | 基于 @codemirror/view 的代码编辑器（JSON/JS/Vue 语法 + One Dark 主题）     |

### Phase 7: Skills & 文档 (Week 14)

| ID    | 任务                    | 状态 | 优先级 | 产出文件                               | 备注                                  |
| ----- | ----------------------- | ---- | ------ | -------------------------------------- | ------------------------------------- |
| P7-01 | Skills 系统             | ⬜   | P2     | `packages/ubean/skills/ubean/SKILL.md` | Agent 路由定义                        |
| P7-02 | 内置文档                | ⬜   | P2     | `packages/ubean/skills/ubean/docs/`    | guide/reference/integrations          |
| P7-03 | AGENT_PROMPT.md         | ⬜   | P2     | `packages/ubean/AGENT_PROMPT.md`       | Agent 提示词                          |
| P7-04 | ubean init 交互式初始化 | ⬜   | P1     | `src/core/cli/init.ts`                 | 交互式创建项目                        |
| P7-05 | 示例项目                | ⬜   | P2     | `examples/`                            | hello-world/api-routes/pages-basic 等 |

### Phase 8: 发布认证与测试完善 (Week 15-16)

| ID    | 任务                        | 状态 | 优先级 | 产出文件                            | 备注                                              |
| ----- | --------------------------- | ---- | ------ | ----------------------------------- | ------------------------------------------------- |
| P8-01 | 单元测试补全                | ⬜   | P0     | `test/unit/`                        | 公开 API 与核心运行时优先；覆盖率仅作辅助指标     |
| P8-02 | DevTools 单元测试           | ⬜   | P1     | `test/unit/devtools-*.test.ts`      | rpc/hooks/crud/ai 权限边界                        |
| P8-03 | 集成与浏览器端到端测试      | ⬜   | P0     | `test/integration/`, `test/e2e/`    | build/dev/preview、SSR hydration、导航与 action   |
| P8-04 | 正式/实验性 preset 测试矩阵 | ⬜   | P1     | `test/integration/preset-*.test.ts` | Node 发布认证；Cloudflare 部署 smoke test         |
| P8-05 | CI/CD 配置                  | ⬜   | P1     | `.github/workflows/`                | 自 Phase 1 起运行；含 pack 安装与 Node smoke test |
| P8-06 | npm scripts 验证            | ⬜   | P1     |                                     | dev/build/preview/prepare/test/typecheck/lint     |

---

### 已决策事项（原 TBD）

| ID     | 事项                    | 决策      | 方案说明                                                                                                                                                                                                                                                                                                                                           | 对应任务    |
| ------ | ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| TBD-01 | DevTools 客户端 UI 方案 | ✅ 已决策 | UI 全部基于 @soybeanjs/ui 实现（Table 组件原生支持虚拟滚动，无需额外表格库）；代码编辑器选用 **CodeMirror 6**（轻量 ~200KB、模块化、专为嵌入式场景设计，DevTools iframe 场景远优于 Monaco 的 ~3MB 体积），支持 JSON/JS/Vue 语法 + One Dark 主题                                                                                                    | P6-25       |
| TBD-02 | 队列(Queues) 设计       | ✅ 已决策 | 参考 void 的 Proxy 动态绑定模式但跨平台抽象化：`queues/` 目录 + `defineQueue<T>()` 定义队列，各 preset 注入平台驱动（Node=BullMQ/内存、CF=Queues、Vercel=Queues、Bun=Worker、Deno=Queue），自动生成 `.ubean/queues.d.ts` 类型                                                                                                                      | P6-22       |
| TBD-03 | Islands 架构实现        | ✅ 已决策 | 参考 void 的 islands 编译时扫描思路，但采用更符合 Vue 习惯的 **Astro 风格 `client:*` 指令**（`client:load/idle/visible/media/only`）而非 Import Attributes；编译时扫描 `client:*` 指令自动标记孤岛组件，无孤岛的页面不发送客户端 JS                                                                                                                | P6-18       |
| TBD-04 | 国际化(i18n)集成        | ✅ 已决策 | void 和 nitro 均无内置 i18n，ubean 内置轻量 i18n：`locales/` 目录 + `defineLocale()` 定义消息，支持 `prefix/prefix_except_default/no_prefix` 三种路由策略，`useI18n()` composable，`<Link>` 自动处理 locale 前缀                                                                                                                                   | P6-21       |
| TBD-05 | 认证(Auth)插件方案      | ✅ 已决策 | 参考 void 的 Better Auth 集成模式，以官方插件 `ubean-auth` 形式提供（非核心内置）：注册 `/api/auth/*` 路由、提供 `useAuth()` composable、`c.get('user')` 获取用户、与 `meta.public` 配合实现路由鉴权                                                                                                                                               | P6-23       |
| TBD-06 | Markdown/MDX 支持       | ✅ 已决策 | **内置** Markdown 页面：`pages/**/*.md` 与 `.vue` 页面混放，`front-matter` 解析 YAML frontmatter，[`markdown-exit`](https://github.com/serkodev/markdown-exit)（markdown-it 的 TS 重写版，原生 async）渲染正文，通过 `@shikijs/markdown-exit` 集成 Shiki 代码高亮，支持嵌入 Vue 组件配合 islands client 指令；MDX 可选开启（`markdown.mdx: true`） | P6-17       |
| TBD-07 | 组件自动导入            | ✅ 已决策 | **内置**且默认启用，通过配置开关控制：Composables 使用 `unimport` 自动导入（`composables/`目录），Vue 组件使用 `unplugin-vue-components` 自动导入（`components/`目录），自动生成 `.d.ts` 类型文件                                                                                                                                                  | P6-19/P6-20 |
| TBD-08 | 类型安全 Link 组件      | ✅ 已决策 | **类型化**：`<Link>` 组件的 `to` 属性类型约束为 `RouteName` 联合类型，`:params` 类型推导与路由参数匹配，CLI/DevTools 修改路由时自动更新类型                                                                                                                                                                                                        | P6-24       |
