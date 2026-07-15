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

## 3. 目录结构

> 以下是仓库当前的**实际目录结构**（截至 2026-07）。早期规划曾列出更细的子目录（如 `core/app/`、`build/rollup/`、`build/vite/`、按域拆分的 `types/runtime/` 等），当前实现已将它们合并或精简，请以本文为准。

```
ubean/
├── packages/
│   ├── ubean/                       # 主包 (npm name: "ubean")
│   │   ├── bin/ubean.mjs            # CLI 二进制入口
│   │   ├── src/
│   │   │   ├── core/                # 构建时核心
│   │   │   │   ├── auto-imports/    # unimport 自动导入预设 (UBEAN_CLIENT/SERVER_PRESET)
│   │   │   │   ├── build/           # 生产构建
│   │   │   │   │   ├── virtual/     # 虚拟模块生成 (modules.ts, registry.ts)
│   │   │   │   │   └── vite/        # Vite 插件 (plugin.ts, build.ts, macros.ts)
│   │   │   │   ├── cli/             # ubean CLI (citty)
│   │   │   │   │   ├── shared/      # fs-ops, templates
│   │   │   │   │   ├── build.ts, dev.ts, preview.ts, prepare.ts
│   │   │   │   │   ├── init.ts, page.ts, env.ts, config.ts
│   │   │   │   │   ├── devtools.ts, scaffold-commands.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── codegen/         # 类型生成 (routes.d.ts, pages.d.ts)
│   │   │   │   ├── config/          # c12 配置加载 (loader.ts, types.ts)
│   │   │   │   ├── dev/             # 开发服务器 (runner.ts, server.ts, vite-server.ts, watcher.ts)
│   │   │   │   ├── devtools/        # DevTools 共享 (define-tab.ts, types.ts)
│   │   │   │   ├── islands/         # Islands 转换 (transform.ts, types.ts)
│   │   │   │   ├── markdown/        # Markdown/MDX 页面
│   │   │   │   ├── modules/         # 模块系统 (builtins.ts, kit.ts, index.ts)
│   │   │   │   ├── prerender/       # SSG 预渲染
│   │   │   │   ├── preset/          # 平台 preset (standard/node/cloudflare + _resolve.ts, capabilities.ts)
│   │   │   │   ├── routing/         # 路由扫描 (scan.ts, detect-exports.ts, define-page.ts, route-name.ts)
│   │   │   │   ├── utils/           # port 等工具
│   │   │   │   ├── vue/             # Vue SSR 插件 + renderer + 虚拟模块
│   │   │   │   └── log.ts
│   │   │   ├── runtime/             # 运行时（服务端 + 可客户端部分）
│   │   │   │   ├── internal/         # OpenAPI 内部路由
│   │   │   │   ├── pages/            # Pages 协议 (protocol.ts, data.ts)
│   │   │   │   ├── vue/              # Vue 运行时 (app.ts, client.ts, define-app.ts, composables.ts, i18n.ts, islands.ts, router.ts, view-transitions.ts, head.ts, page-macro.ts)
│   │   │   │   ├── app.ts            # createUbeanApp
│   │   │   │   ├── handler.ts        # defineHandler / defineHandlerMeta
│   │   │   │   ├── router.ts         # registerRoutes / 路由挂载
│   │   │   │   ├── cache.ts          # useCacheStore / createCacheMiddleware
│   │   │   │   ├── database.ts       # defineDatabase / useDatabase / runMigrations
│   │   │   │   ├── storage.ts        # useStorage / useKV (unstorage 封装)
│   │   │   │   ├── websocket.ts     # defineWebSocket / rooms
│   │   │   │   ├── sse.ts            # SSE 流
│   │   │   │   ├── queue.ts          # defineQueue
│   │   │   │   ├── cron.ts, cron-scheduler.ts  # defineScheduled
│   │   │   │   ├── rate-limit.ts, cors.ts  # 中间件工厂
│   │   │   │   ├── env.ts            # defineEnv
│   │   │   │   ├── error.ts, observability.ts, seo.ts
│   │   │   │   ├── route-rules.ts, static.ts, internal-fetch.ts
│   │   │   │   ├── i18n.ts, i18n-routing.ts    # 零依赖 i18n
│   │   │   │   └── client.ts        # 客户端入口辅助
│   │   │   ├── types/handler.ts
│   │   │   ├── utils/path.ts
│   │   │   └── index.ts             # 公共导出
│   │   ├── test/                    # 单元 + 集成 + e2e 测试
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   ├── devtools/                    # 独立 DevTools 包 (@ubean/devtools 风格)
│   │   ├── client/                  # iframe 内 Vue 应用 (views, components, composables)
│   │   ├── src/                     # 服务端 (rpc.ts, ai.ts, crud.ts, hooks.ts, middleware.ts)
│   │   └── package.json
│   │
│   ├── ubean-auth/                  # @ubean/auth (Better Auth 集成 + fallback)
│   ├── ubean-icon/                  # @ubean/icon (Iconify + 自定义集合)
│   ├── ubean-pwa/                   # @ubean/pwa (manifest + sw)
│   ├── ubean-image/                 # @ubean/image
│   ├── ubean-content/               # @ubean/content
│   └── ubean-fonts/                 # @ubean/fonts
│
├── examples/
│   └── ubean-test/                  # 完整示例项目 (pages/, routes/api/, crons/, middleware/, layouts/, locales/, app.ts, ubean.config.ts)
│
├── skills/
│   └── ubean/                       # ubean AI Skill
│       ├── SKILL.md                 # Skill 路由定义
│       ├── AGENT_PROMPT.md          # Agent 提示词
│       ├── command/ubean.md         # CLI 命令文档
│       └── docs/                    # 内置文档 (guide, integrations, reference/api)
│
├── docs/                            # 架构/工程/路线图文档
├── .github/workflows/ci.yml
├── README.md, README.zh_CN.md
├── eslint.config.mjs
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
└── tsconfig.json
```

### 用户应用目录结构

ubean 应用的 `srcDir`（默认 `<rootDir>/src`）约定：

```
my-app/
├── src/                        # 可配置的 srcDir
│   ├── pages/                  # 文件式页面路由 (*.vue / *.md)
│   │   ├── (group)/            # 路由组：不影响 URL
│   │   ├── dashboard/
│   │   │   ├── index.vue
│   │   │   ├── profile.vue
│   │   │   └── settings.vue
│   │   ├── user/[id].vue       # 动态参数
│   │   ├── about.vue
│   │   └── index.vue
│   ├── routes/                 # API 路由 (void-style 命名导出)
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── [id].ts     # export const GET / PATCH / DELETE
│   │   │   │   └── index.ts    # export const GET / POST
│   │   │   └── hello.ts
│   │   ├── sitemap.xml.ts
│   │   └── robots.txt.ts
│   ├── layouts/                # 布局 (default.vue 或 default/index.vue)
│   ├── middleware/             # 中间件 (global.* / <prefix>/*.ts)
│   ├── crons/                  # 定时任务 (defineScheduled)
│   ├── locales/                # i18n 消息 (en.json, zh-CN.json)
│   ├── components/             # 业务组件
│   ├── composables/            # 组合式函数
│   └── app.ts                  # 可选：defineApp(options)
├── public/                     # 静态资源
├── ubean.config.ts             # defineConfig(...)
├── env.d.ts
├── package.json
└── tsconfig.json
```

---
