<p align="center">
  <img src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.png" alt="ubean logo" width="120" />
</p>

<h1 align="center">ubean</h1>

<p align="center">
  <a href="README.md">English</a>
</p>

Vue 专属全栈元框架。

ubean 基于 Vite-Plus 构建，将 Vue SSR 页面、Hono API 路由、类型安全的路由元数据与可移植部署预设整合为一套一致的开发体验。

> ubean 正在积极开发中。核心运行时、文件式路由、Vue SSR、Hono API 路由、i18n、缓存、数据库/存储层、队列、Cron、WebSocket/SSE、OpenAPI/Scalar、DevTools 以及 `@ubean/auth`/`@ubean/icon`/`@ubean/pwa`/`@ubean/image`/`@ubean/content`/`@ubean/fonts`/`@ubean/electron`/`@ubean/ui` 等扩展包均已实现并附带测试。架构决策见[文档索引](docs/README.md)，使用指南与 API 参考见 [skills/ubean/docs](skills/ubean/docs)。

## 目标

- Vue 3 专属的 SSR 页面路由与应用入口定制。
- 基于 Hono 的文件式 API 路由，支持命名 HTTP 方法导出。
- 由 `hono-openapi` 验证 schema 驱动的 OpenAPI 3.1 与类型安全路由元数据。
- 浏览器 HTTP 请求使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)；进程内 handler 调度使用 `internalFetch`（不发起网络请求）。
- Node.js 优先的部署体验，并以 capability 矩阵逐步扩展其他平台。
- 严格 TypeScript、显式副作用边界和持续的契约测试。

## 当前状态

v0.1 的目标平台为 Node.js（`node-server`）和 Cloudflare Workers。Bun、Deno、Vercel、Netlify 等平台不属于 v0.1 承诺范围。

已实现的能力包括：

- `routes/` API 文件路由，支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`、`HEAD` 命名导出，由 `defineHandler` 包装。
- `pages/` Vue SSR 页面、layouts、路由组、reuse 路由、loader/action 与类型化导航。
- `defineHandlerMeta` 路由元数据（`requiresAuth`、`cache`、`rateLimit`），来自 `hono-openapi` 的 `validator`/`describeRoute`/`resolver` 用于请求验证与 OpenAPI 3.1 生成，并在 `.ubean/routes.d.ts` 生成 `paths` 类型。
- `defineApp` 基于选项的应用定制（含 `router.setup` 用于在 client 与 SSR 两端注册全局导航守卫）、`definePage` 宏、`defineMiddleware`、`defineLocale`、`defineEnv`、`defineScheduled`（Cron）、`defineQueue`。
- 内置数据库层（`defineDatabase`/`useDatabase`）、存储（`useStorage`/`useKV`）、缓存（`useCacheStore`/`cachedEventHandler`）、限流、CORS、route rules（重定向/重写/headers/cache）与 SSG 预渲染。
- WebSocket（`defineWebSocket`）、SSE 流，以及 `internalFetch`（直接在进程内调度框架 handler，不发起网络请求）。
- DevTools，包含 RPC、AI 助手、API playground 与 CRUD 脚手架。
- 扩展包：`@ubean/auth`（Better Auth 集成 + fallback）、`@ubean/icon`（Iconify 集成）、`@ubean/pwa`、`@ubean/image`、`@ubean/content`、`@ubean/fonts`、`@ubean/electron`（基于 vite-plugin-electron 的桌面应用，默认 main/preload 入口，自动关闭 SSR）、`@ubean/ui`（@soybeanjs/ui 集成，UiResolver + styles.css 自动注入）。

## 开发

要求：Node.js、pnpm `11.11.0`。

```bash
pnpm install
pnpm typecheck
pnpm lint
```

常用命令：

| 命令             | 说明                                      |
| ---------------- | ----------------------------------------- |
| `pnpm typecheck` | 使用 Vue TypeScript 检查项目源码          |
| `pnpm lint`      | 运行 Vite-Plus/OXC 与 Vue ESLint 自动修复 |
| `pnpm upkg`      | 检查依赖更新                              |
| `pnpm commit`    | 使用项目提交信息工具创建提交              |

## 架构方向

ubean 是一个 **monorepo**，包含 38 个子包。公开包 `ubean` 是**聚合器**，re-export 所有 `@ubean/*` 子包 —— 用户安装一个包即可获得完整 API 表面。子包按职责拆分（路由、构建、运行时、配置等），也可单独消费用于高级场景。

ubean 的核心实现遵循以下边界：

- 纯函数处理配置归并、文件扫描、路由解析、代码生成和类型推导。
- I/O、Hono、Vite、Hookable、文件系统与网络访问置于明确的 adapter/effect 边界。
- ubean 不内置浏览器 HTTP 客户端。浏览器请求使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)（`createRequest` / `toFlatRequest` / `createTypedClient`）；类型安全客户端消费 `.ubean/routes.d.ts` 生成的 paths 类型。
- `internalFetch` 直接在进程内调度框架 handler，不通过网络，也不支持上传进度。
- preset 必须声明能力；构建期对不支持的功能给出诊断，不能静默降级。

### 包结构

```
packages/
├── ubean/          # 主包 (npm: "ubean") — 聚合器，re-export 所有 @ubean/*
├── types/          # @ubean/types — 共享类型
├── routing/        # @ubean/routing — 路由扫描 + rou3 router
├── build/          # @ubean/build — 构建时核心（虚拟模块 + Vite 插件）
├── runtime/        # @ubean/runtime — Vue 客户端运行时
├── server/         # @ubean/server — cache/db/queue/cron/ws/sse
├── ...             # 另外 32 个子包
└── ui/             # @ubean/ui — @soybeanjs/ui 集成（UiResolver + styles.css）
```

子包拆分的原始设计方案见 [docs/subpackage-splitting.md](docs/subpackage-splitting.md)（已实施），完整且最新的包列表见 [AGENTS.md](AGENTS.md)。

## 规划与贡献

- 架构参考、历史设计记录与待办提案见[文档索引](docs/README.md)。
- 使用指南与 API 参考位于 [skills/ubean/docs](skills/ubean/docs)。
- 每项功能应随实现提交对应的单元测试、真实 fixture，以及适用的 `dev`、`build`、`preview` 或浏览器端到端验证。
- 对公开 API、preset 能力或生成类型的变更，需要同步更新规划、测试和迁移说明。

## 许可证

[MIT License](LICENSE)
