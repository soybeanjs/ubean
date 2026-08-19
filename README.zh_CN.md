<p align="center">
  <img src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.png?v=202608192144" alt="ubean logo" width="120" />
</p>

<h1 align="center">ubean</h1>

<p align="center">
  基于 Vite-Plus 的 Vue 专属全栈元框架
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/soybeanjs/ubean)

> **警告 — 开发中，暂不可用于生产环境**
>
> ubean 当前处于活跃开发阶段，目标版本为 v0.1。版本间公开 API 可能未经通知即变更，可能存在破坏性 bug，部分子系统（数据库层、队列 worker、cron 调度器、DevTools）尚未在真实负载下经过验证。**请勿将 ubean 用于生产环境。** 当前版本仅适用于评估、实验和跟踪开发进度。生产就绪预计在 v1.0 里程碑前后达成。

---

## ubean 是什么？

ubean 将 Vue SSR 页面、Hono API 路由、类型安全的路由元数据与可移植部署预设整合为一套一致的开发体验。它基于 **Vite-Plus** 构建，借鉴了 [void](https://github.com/ubeanjs/void) 的 Inertia 风格 SSR 页面路由和 [nitro](https://github.com/unjs/nitro) 的跨平台部署能力矩阵。Vue 3 是唯一的前端适配器 —— 每个路由、验证和配置决策都在构建时进行类型检查。单个 npm 包 `ubean` 充当**聚合器**，re-export 所有 `@ubean/*` 子包，安装一个依赖即可获得完整 API 表面。

## 为什么还要再造一个元框架？

Nuxt、Next.js、SvelteKit 都已存在 —— ubean 带来了什么真正不同的东西？三大架构承诺定义了它的身份：

**1. Vue 专属深度，而非多框架广度。** ubean 仅针对 Vue 3。没有 React 适配器，没有 Svelte 渲染器，也没有牺牲 Vue 特定优化的通用抽象。这种单框架约束实现了深度集成 —— `definePage` 宏在构建时被编译消除，Vue Router 导航守卫在客户端和 SSR 上工作方式一致，SSR 渲染器（`@ubean/ssr` 的 `createVueRenderer`）专为 Vue 的 `@vue/server-renderer` 定制构建。其结果是更小、更快的运行时，零抽象开销。

**2. Hono 作为 HTTP 核心，而非 h3。** Nuxt 使用 **h3**（其自身的 HTTP 抽象），nitro 使用 h3 作为服务器处理程序，而 ubean 选择 **Hono** —— 一个更轻量、更现代、类型友好的 HTTP 框架。每个 API 路由都是一个 Hono 处理程序链；每个中间件都通过 Hono 原生中间件系统组合；请求验证直接接入 `hono-openapi` 生成 OpenAPI 3.1，无需中间层。Hono 的多运行时设计（Node.js、Cloudflare Workers、Bun、Deno）也与 ubean 的预设系统自然契合。

**3. 显式能力契约，而非静默降级。** 每个部署预设（`node-server`、`cloudflare` 等）都声明其能力矩阵。如果目标平台不支持某项功能，构建将产生诊断错误 —— 绝不静默降级。这种理念贯穿整个框架：`internalFetch` 在进程内调度框架处理程序而无需网络请求（且明确不支持上传进度）；核心仅依赖 Standard Schema 规范（而非 Zod）；`@ubean/icon` 要求用户安装单独的 `@iconify-json/<collection>` 包，而不是打包完整的 `@iconify/json` 数据集。

## 应用模式

ubean 支持由 `ubean.config.ts` 中 `mode` 字段控制的四种应用模式。默认为 **`fullstack`**，生成客户端 + SSR + 服务端包。其他三种模式会跳过不必要的构建步骤以减少输出大小和构建时间：

| 模式                           | 客户端 | SSR        | 服务端 | 预渲染     | 典型用例                          |
| ------------------------------ | ------ | ---------- | ------ | ---------- | --------------------------------- |
| `fullstack`（默认，ssr: true） | 是     | 是         | 是     | 可选       | 有 SEO 需求的全栈应用             |
| `fullstack` + `ssr: false`     | 是     | 否         | 是     | 否         | 无 SEO 需求的全栈应用（管理面板） |
| `spa`                          | 是     | 否         | 否     | 否         | 纯客户端渲染，无服务器            |
| `ssg`                          | 是     | 是（临时） | 否     | 是（强制） | 静态营销网站 / 博客               |
| `backend`                      | 否     | 否         | 是     | 否         | 纯 API 服务，无 Vue 页面          |

`ssr` 选项仅在 `fullstack` 模式内生效 —— `spa` 和 `backend` 始终跳过 SSR，而 `ssg` 始终要求它（用于构建时渲染）。模式与预设（部署平台）、路由模式（虚拟 / 文件生成）是**正交的**，可以自由组合 `mode: 'fullstack'` + `preset: 'cloudflare'` + `routing.mode: 'file'`。

## 功能一览

| 层       | 能力                                        | 关键 API                               | 包                              |
| -------- | ------------------------------------------- | -------------------------------------- | ------------------------------- |
| 路由     | 基于文件的 API 路由（命名 HTTP 方法导出）   | `defineHandler`                        | `@ubean/routes`                 |
| 路由     | 基于文件的 Vue SSR 页面                     | `definePage` 宏                        | `@ubean/vue` + `@ubean/scan`    |
| 路由     | 路由元数据（auth / cache / rateLimit）      | `defineHandlerMeta`                    | `@ubean/routes`                 |
| 路由     | OpenAPI 3.1 验证 + Scalar UI                | `validator` / `describeRoute`          | `hono-openapi`（重新导出）      |
| 路由     | 类型安全的路由路径（生成）                  | `.ubean/routes.d.ts`                   | `@ubean/codegen`                |
| 路由     | 动态路由 matchers（`[param=matcher]`）      | `defineMatcher` / `createMatcherGuard` | `@ubean/vue`                    |
| 应用     | Vue 应用定制（插件、守卫、head）            | `defineApp`                            | `@ubean/client`                 |
| 应用     | Hono 应用工厂                               | `createUbeanApp`                       | `@ubean/app`                    |
| 服务器   | 数据库层（多驱动）                          | `defineDatabase` / `useDatabase`       | `@ubean/server`                 |
| 服务器   | 存储（unstorage 封装）                      | `useStorage` / `useKV`                 | `@ubean/server`                 |
| 服务器   | 缓存（内存 + 外部）                         | `useCacheStore` / `cachedEventHandler` | `@ubean/server`                 |
| 服务器   | 队列处理                                    | `defineQueue`                          | `@ubean/server`                 |
| 服务器   | 定时任务（cron）                            | `defineScheduled`                      | `@ubean/server`                 |
| 服务器   | WebSocket（crossws）                        | `defineWebSocket`                      | `@ubean/server`                 |
| 服务器   | SSE 流                                      | SSE 工具                               | `@ubean/server`                 |
| 服务器   | 限流 + CORS                                 | 中间件工厂                             | `@ubean/server`                 |
| 服务器   | 路由规则（重定向 / 重写 / headers / cache） | `routeRules` 配置                      | `@ubean/server`                 |
| 服务器   | 进程内处理程序调度                          | `internalFetch`                        | `@ubean/pages`                  |
| 配置     | 类型化配置定义                              | `defineConfig`                         | `@ubean/config`                 |
| 配置     | 类型化环境变量                              | `defineEnv`                            | `@ubean/shared`                 |
| 配置     | 中间件定义                                  | `defineMiddleware`                     | `@ubean/routes`                 |
| i18n     | 零依赖国际化                                | `defineLocale` / `t` / `useI18n`       | `@ubean/i18n` + `@ubean/client` |
| SSR      | Vue 服务端渲染器                            | `createVueRenderer`                    | `@ubean/ssr`                    |
| Islands  | 局部水合边界                                | `ubeanIslandsPlugin`                   | `@ubean/islands`                |
| DevTools | RPC、AI 助手、API playground、CRUD 脚手架   | `devtools: true` 配置                  | `@ubean/devtools`               |
| 扩展     | Better Auth 集成 + fallback                 | `auth: true` 配置                      | `@ubean/auth`                   |
| 扩展     | Iconify + 自定义 SVG 集合                   | `icon: true` 配置                      | `@ubean/icon`                   |
| 扩展     | PWA manifest + service worker               | `pwa: true` 配置                       | `@ubean/integrations/pwa`       |
| 扩展     | 图片优化                                    | `image: true` 配置                     | `@ubean/image`                  |
| 扩展     | 内容集合 + Markdown                         | `content: true` 配置                   | `@ubean/content`                |
| 扩展     | 字体优化 + 自托管                           | `fonts: true` 配置                     | `@ubean/integrations/fonts`     |
| 扩展     | Electron 桌面应用                           | `electron: true` 配置                  | `@ubean/integrations/electron`  |
| 扩展     | @soybeanjs/ui 集成                          | `ui: true` 配置                        | `@ubean/integrations/ui`        |
| 扩展     | Pinia 集成 + SSR 水合                       | `pinia: true` 配置                     | `@ubean/integrations/pinia`     |

### 包入口点

`ubean` 主包除默认的 `.` 入口外，还提供多个子路径导出。该设计可防止浏览器通过 Vite 预构建拉入服务端依赖：

| 子路径               | 用途                                      | 典型用法             |
| -------------------- | ----------------------------------------- | -------------------- |
| `ubean`              | 主入口 —— re-export 所有子包              | 服务端代码、API 路由 |
| `ubean/vite`         | 组合式 Vite 插件（build + vue + islands） | `vite.config.ts`     |
| `ubean/client`       | 一等客户端入口（`@ubean/client`）         | 客户端代码、SPA 入口 |
| `ubean/runtime/vue`  | 浏览器 Vue 客户端运行时（无服务端依赖）   | 客户端自动导入       |
| `ubean/runtime/app`  | 服务端 Hono 应用入口（`createUbeanApp`）  | `src/server.ts`      |
| `ubean/runtime/i18n` | 服务端纯函数 i18n                         | 构建时语言环境处理   |
| `ubean/vue-ssr`      | Vue SSR 渲染器（`createVueRenderer`）     | 自定义 SSR 配置      |

**新手关键规则：** 客户端自动导入**必须**使用 `ubean/runtime/vue` 或 `ubean/client` 入口，**绝不能**使用 `ubean` 主入口。在浏览器代码中从 `ubean` 导入会触发 Vite 预构建服务端依赖（Hono、数据库驱动、存储适配器）—— 严重的性能损耗，且可能在非 Node 环境引发运行时错误。

**客户端内核分层：** `@ubean/vue` 是精简客户端内核（仅 vue + vue-router），拥有页面路由全部能力（文件扫描、虚拟模块、页面缓存、过渡、matchers）；`@ubean/client` 在其上叠加框架运行时（app 工厂、unhead/SEO、i18n、数据层、islands 水合）；`ubean/client` 子路径 re-export 之。独立 SPA 可直接依赖 `@ubean/vue`，不拉入框架构建工具链。

## 项目结构

### 仓库布局

ubean 是一个由 pnpm 工作区管理的 **33 包 monorepo**（`packages/*`、`apps/*`、`examples/*`）。公开包 `ubean`（`packages/ubean/`）是聚合器，re-export 所有 `@ubean/*` 子包。每个子包独立构建、类型检查，并可在高级场景中单独消费。工程文档索引见 [docs/README.md](docs/README.md)。

```
packages/
├── ubean/          # 主包 (npm: "ubean") — 聚合器，re-export 所有 @ubean/*
│
│   ── 基础 / 共享层 ──
├── shared/         # @ubean/shared — 共享类型、错误、环境变量、工具（合并 types/utils/error/env）
├── vue/            # @ubean/vue — 精简 Vue 客户端内核 + 页面路由所有者（仅 vue + vue-router）
├── markdown/       # @ubean/markdown — Markdown/MDX 页面解析
├── seo/            # @ubean/seo — SEO meta 管理
├── pages/          # @ubean/pages — 页面数据协议 (loader/action)
├── i18n/           # @ubean/i18n — 零依赖 i18n（纯函数）
├── logger/         # @ubean/logger — tslog 日志封装
│
│   ── 服务端运行时 ──
├── routes/         # @ubean/routes — 服务端路由运行时 (defineHandler + rou3 router + ISR + OpenAPI)
├── actions/        # @ubean/actions — Server Actions / Form Actions (defineAction)
├── server/         # @ubean/server — 服务端运行时 (cache/db/queue/cron/ws/sse)
├── app/            # @ubean/app — Hono 应用工厂 (createUbeanApp)
│
│   ── 构建时工具 ──
├── build-core/     # @ubean/build-core — 构建基础设施（virtual-registry/macros/registry，零依赖）
├── builder/        # @ubean/build — 核心 Vite 插件（框架无关 ubeanPlugin）
├── vite/           # @ubean/vite — Vue 专属 Vite 插件 (ubeanVite)
├── codegen/        # @ubean/codegen — 类型生成 (routes.d.ts + 自动导入预设)
├── config/         # @ubean/config — 配置加载器 (c12 + defu)
├── preset/         # @ubean/preset — 平台预设 (node/cloudflare + capabilities)
├── modules/        # @ubean/modules — 模块系统 (builtins + kit)
├── prerender/      # @ubean/prerender — SSG 预渲染
│
│   ── 路由扫描 ──
├── scan/           # @ubean/scan — 项目扫描器 + 路由元数据聚合（页面扫描委托 @ubean/vue）
│
│   ── 客户端运行时 ──
├── client/         # @ubean/client — 框架客户端运行时（基于 @ubean/vue 内核）
│
│   ── 服务 / 工具 ──
├── ssr/            # @ubean/ssr — Vue SSR 渲染器 (createVueRenderer)
├── islands/        # @ubean/islands — Islands 局部水合
├── dev-server/     # @ubean/dev-server — 开发服务器
├── cli/            # @ubean/cli — CLI 命令
├── devtools/       # @ubean/devtools — 开发者工具 (RPC、AI、CRUD 脚手架)
│
│   ── 扩展包 ──
├── ai/             # @ubean/ai — AI 集成（Vercel AI SDK 薄编排）
├── auth/           # @ubean/auth — Better Auth 集成 + fallback
├── icon/           # @ubean/icon — Iconify 集成 + 自定义集合
├── image/          # @ubean/image — 图片优化
├── content/        # @ubean/content — 内容集合
└── integrations/   # @ubean/integrations — pwa / fonts / electron / ui / pinia 子路径

apps/docs/          # 文档站（源码位于 src/content/{en,zh}/）
examples/           # ubean-test / client-only-spa / frontend-only / routing-file-mode
docs/               # 仓库级工程文档（ADR、领域词汇表、产品方案）
```

### 用户应用布局

创建 ubean 应用时，`srcDir`（默认 `<rootDir>/src`）遵循约定的目录结构。每个目录都有框架认可的用途 —— `pages/` 用于 Vue 路由，`routes/` 用于 API 端点，`layouts/` 用于页面包装器等。基于约定的方法意味着标准项目零配置，`ubean.config.ts` 提供自定义出口：

```
my-app/
├── src/                        # 可配置的 srcDir (默认: <rootDir>/src)
│   ├── pages/                  # 基于文件的页面路由 (*.vue / *.md)
│   │   ├── (group)/            # 路由组 —— 不贡献 URL
│   │   ├── dashboard/
│   │   │   ├── index.vue
│   │   │   ├── profile.vue
│   │   │   └── settings.vue
│   │   ├── user/[id].vue       # 动态路由参数
│   │   ├── about.vue
│   │   └── index.vue
│   ├── routes/                 # API 路由 (void 风格命名导出)
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── [id].ts     # export const GET / PATCH / DELETE
│   │   │   │   └── index.ts    # export const GET / POST
│   │   │   └── hello.ts
│   │   ├── sitemap.xml.ts
│   │   └── robots.txt.ts
│   ├── layouts/                # 页面布局 (default.vue 或 default/index.vue)
│   ├── middleware/             # 路由中间件 (global.* / <prefix>/*.ts)
│   ├── crons/                  # 定时任务 (defineScheduled)
│   ├── locales/                # i18n 消息 (en.json, zh-CN.json)
│   ├── components/             # 业务组件
│   ├── composables/            # 自动导入的组合式函数
│   └── app.ts                  # 可选: defineApp(options)
├── public/                     # 静态资源
├── ubean.config.ts             # defineConfig({...})
├── env.d.ts
├── package.json
└── tsconfig.json
```

## 快速开始

> **再次提醒：** ubean 暂不可用于生产环境，仅适用于评估与实验。

### 脚手架新项目

```bash
# 使用 pnpm（推荐）
pnpm dlx ubean init my-app

# 或使用 npm / yarn / bun
npx ubean init my-app
```

init 向导会询问模板（minimal / starter / blog）、预设（standard / node / cloudflare）和包管理器。

### 手动搭建

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add ubean vue
```

创建 `ubean.config.ts`：

```ts
import { defineConfig } from 'ubean';

export default defineConfig({
  srcDir: 'src',
  preset: 'standard'
});
```

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

### 开发命令

| 命令             | 说明                                               |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | 启动开发服务器（带 HMR）                           |
| `pnpm build`     | 生产构建（客户端 + 服务端 + 可选 SSR）             |
| `pnpm preview`   | 本地预览生产构建                                   |
| `pnpm prepare`   | 生成类型定义到 `.ubean/`（自动安装缺失的内置模块） |
| `pnpm typecheck` | 使用 vue-tsc 进行类型检查                          |

### 启用内置模块

内置模块（`icon`、`pwa`、`auth`、`image`、`fonts`、`electron`、`ui`、`pinia`）通过 `ubean.config.ts` 按需启用。启用某个模块时需要安装对应的 `@ubean/*` 包：

```ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: true, // @ubean/integrations/ui —— 自动注入 @soybeanjs/ui styles.css + UiResolver
  icon: true, // @ubean/icon —— Iconify 集成
  pwa: true, // @ubean/integrations/pwa —— manifest + service worker
  auth: true, // @ubean/auth —— Better Auth 集成
  electron: true // @ubean/integrations/electron —— 桌面应用（自动关闭 SSR）
});
```

运行 `ubean prepare` 会**自动检测并安装**缺失的内置模块包，使用项目自身的包管理器（pnpm / yarn / bun / npm）。使用 `ubean prepare --no-install` 可跳过自动安装（如 CI 环境）。如果运行 `ubean dev` 或 `ubean build` 时某模块已启用但未安装，会输出明确的 warning，告知该模块被跳过 —— 而不是让人困惑为什么 `ui: true` 没有生效。

## 架构方向

ubean 的核心实现遵循六大边界：

1. **纯函数核心。** 配置归并、文件扫描、路由解析、代码生成和类型推导都是纯函数。无 I/O、无 Hono 实例、无 Vite 插件 —— 它们都在显式 adapter 边界之后。这使得构建管道无需 mock 整个开发服务器即可测试。

2. **显式副作用边界。** 所有接触文件系统、网络、Hono、Vite 或 Hookable 的内容都隔离在专用层。核心层不能直接调用 `fs.readFile` 或 `app.use()` —— 它生成供插件/运行时层消费的数据结构。

3. **不打包浏览器 HTTP 客户端。** ubean 不在浏览器包中提供 fetch 包装器。浏览器 HTTP 请求使用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)（`createRequest` / `toFlatRequest` / `createTypedClient`）。类型安全客户端消费生成的 `.ubean/routes.d.ts` paths 类型。

4. **进程内调度优于网络往返。** `internalFetch` 在同一进程内直接调用框架处理程序 —— 不创建 HTTP 请求。更快且避免认证上下文泄漏，但明确不支持上传进度跟踪。

5. **声明能力，而非静默降级。** 每个预设都发布能力矩阵。不支持的功能在构建时产生诊断，绝不在运行时意外出现。Cloudflare Workers 预设无法运行 WebSocket 处理程序时会在构建时报错，而不是静默丢弃该功能。

6. **严格 TypeScript，函数式风格。** ubean 遵循 TypeScript 函数式编程约定 —— 框架 API 没有类层次结构，优先组合而非继承，每个公开的 `define*` 函数都返回由构建管道在结构上消费的类型化对象。

## 当前状态

v0.1 目标平台为 **Node.js**（`node-server`）和 **Cloudflare Workers**。Bun、Deno、Vercel、Netlify 等平台不在 v0.1 承诺范围内，但将通过预设能力矩阵陆续支持。

### 已实现的能力

- **路由：** `routes/` API 文件路由，支持 `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` / `HEAD` 命名导出，由 `defineHandler` 包装；`pages/` Vue SSR 页面、layouts、路由组、reuse 路由、并行/拦截路由、动态参数 matchers、特殊页面与类型化导航；`defineHandlerMeta` 路由元数据（`requiresAuth`、`cache`、`rateLimit`）；来自 `hono-openapi` 的 `validator` / `describeRoute` / `resolver` 用于请求验证和 OpenAPI 3.1 生成；在 `.ubean/routes.d.ts` 生成 `paths` 类型。
- **应用：** `defineApp` 基于选项的定制（含 `router.setup` 用于在 client 与 SSR 两端注册全局导航守卫）、`definePage` 宏、`defineMiddleware`、`defineLocale`、`defineEnv`、`defineScheduled`（cron）、`defineQueue`。
- **服务器：** 内置数据库层（`defineDatabase` / `useDatabase`）、存储（`useStorage` / `useKV`）、缓存（`useCacheStore` / `cachedEventHandler`）、限流、CORS、route rules（重定向 / 重写 / headers / cache）与 SSG 预渲染。WebSocket（`defineWebSocket`）、SSE 流、`internalFetch`（直接在进程内调度框架 handler，不发起网络请求）。
- **DevTools：** RPC、AI 助手、API playground 与 CRUD 脚手架。
- **扩展包：** `@ubean/auth`（Better Auth 集成 + fallback）、`@ubean/icon`（Iconify 集成）、`@ubean/image`、`@ubean/content`，以及 `@ubean/integrations`（PWA / 字体 / 基于 vite-plugin-electron 的 Electron 桌面应用，默认 main/preload 入口，自动关闭 SSR / @soybeanjs/ui 集成，UiResolver + styles.css 自动注入 / Pinia SSR 水合）。

> 注意：上述能力虽已实现并通过类型检查和基础测试，但部分子系统（尤其是数据库层、队列 worker 和 cron 调度器）尚未经过负载测试和生产硬化。请将 v0.1 视为预览版。

## 开发

要求：Node.js、pnpm `11.22.0`。

```bash
pnpm install
pnpm typecheck
pnpm lint
```

| 命令             | 说明                                        |
| ---------------- | ------------------------------------------- |
| `pnpm typecheck` | 使用 vue-tsc 进行类型检查                   |
| `pnpm lint`      | 运行 Vite-Plus/OXC 与 Vue ESLint 自动修复   |
| `pnpm test`      | 运行测试套件（vitest）                      |
| `pnpm dev`       | 启动示例开发服务器（`examples/ubean-test`） |
| `pnpm build`     | 构建所有子包                                |
| `pnpm upkg`      | 检查依赖更新                                |
| `pnpm commit`    | 使用项目提交信息工具创建提交                |

## 规划与贡献

- [文档索引](docs/README.md) 包含架构参考、历史设计记录与待办提案。
- 使用指南与 API 参考位于 [skills/ubean/SKILL.md](skills/ubean/SKILL.md) 以及文档站的 [apps/docs/src/content](apps/docs/src/content)。
- [AGENTS.md](AGENTS.md) 是 AI 助手和贡献者的权威快速参考 —— 包列表、核心 API、约定与常见陷阱。
- 每项功能应随实现提交对应的单元测试、真实 fixture，以及适用的 `dev`、`build`、`preview` 或浏览器端到端验证。
- 对公开 API、preset 能力或生成类型的变更，需要同步更新规划、测试和文档。

## 许可证

[MIT License](LICENSE)
