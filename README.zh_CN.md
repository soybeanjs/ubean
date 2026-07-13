# ubean

[English](README.md)

Vue 专属全栈元框架。

ubean 基于 Vite-Plus 构建，目标是将 Vue SSR Pages、Hono API 路由、类型安全客户端和可移植部署预设整合为一套一致的开发体验。

> 当前仓库处于设计与项目骨架阶段，尚未发布可用于生产项目的框架包。本文只描述已确定的方向和当前可用的开发命令；具体实现计划见[文档索引](docs/README.md)。

## 目标

- Vue 3 专属的 SSR 页面路由与应用入口定制。
- 基于 Hono 的文件式 API 路由，支持命名 HTTP 方法导出。
- 由验证 schema 与路由 meta 驱动的 OpenAPI 和类型安全客户端。
- 默认使用 `ofetch` 的跨运行时客户端；浏览器文件上传进度通过 XHR 适配器实现。
- Node.js 优先的部署体验，并以 capability 矩阵逐步扩展其他平台。
- 严格 TypeScript、显式副作用边界和持续的契约测试。

## 当前状态

v0.1 的正式目标平台为 Node.js（`node-server`）。Cloudflare Workers 仅在完成独立能力矩阵与部署 smoke test 后以实验性方式提供。Bun、Deno、Vercel、Netlify 等平台不属于 v0.1 承诺范围。

规划中的功能包括：

- `routes/` API 文件路由与 `GET`、`POST`、`PATCH` 等命名导出。
- `pages/` Vue SSR 页面、layout、loader/action 与类型化导航。
- `defineValidator`、`defineHandlerMeta`、OpenAPI 3.1 与生成的 `paths` 类型。
- `ofetch` typed client、flat client，以及仅浏览器可用的 `ubean/client-xhr` 上传进度适配器。
- route rules、预渲染、存储、数据库、队列、WebSocket、DevTools 等后续可选能力。

这些能力大部分尚未实现，不应作为现有 API 使用。

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

ubean 的核心实现遵循以下边界：

- 纯函数处理配置归并、文件扫描、路由解析、代码生成和类型推导。
- I/O、Hono、Vite、Hookable、文件系统与网络访问置于明确的 adapter/effect 边界。
- 对外 HTTP 客户端默认使用 `ofetch`；只有传入 `onUploadProgress` 的浏览器请求才切换为 `XMLHttpRequest.upload` 传输。
- `internalFetch` 直接调度框架 handler，不通过网络，也不支持上传进度。
- preset 必须声明能力；构建期对不支持的功能给出诊断，不能静默降级。

## 规划与贡献

- 完整架构、目录结构、公开 API 草案、测试策略和任务跟踪见[文档索引](docs/README.md)。
- 每项功能应随实现提交对应的单元测试、真实 fixture，以及适用的 `dev`、`build`、`preview` 或浏览器端到端验证。
- 对公开 API、preset 能力或生成类型的变更，需要同步更新规划、测试和迁移说明。

## 许可证

[MIT License](LICENSE)
