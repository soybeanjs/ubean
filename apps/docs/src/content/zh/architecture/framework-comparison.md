---
title: 框架对比
description: ubean 与 Next.js、Nuxt、SvelteKit、SolidStart、Astro、TanStack Start、Analog 的对比——按源码成熟度，而非功能清单满格。
---

# 框架对比

截至 **2026-08**。对照：**Next.js 16**、**Nuxt 4**、**SvelteKit 2**、**SolidStart**、**Astro 5/6**、**TanStack Start**、**Analog 2.7**。矩阵帮助判断 ubean 何时合适，以及何时其它框架更合适。

ubean 列按**默认路径是否真的做了**来标，而不是「类型里有字段」。`⚠️` 表示部分实现、默认内存、或未挂进 `createUbeanApp`。

## 总览对比矩阵

| 维度 | Next.js | Nuxt | SvelteKit | SolidStart | Astro | TanStack Start | Analog | **ubean** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI 框架 | React 19 | Vue 3 | Svelte 5 | Solid | 多框架 | React（Router 一等） | Angular | **Vue 3** |
| 构建工具 | Turbopack | Vite | Vite | Vite / Nitro 系 | Vite | Vite / Rsbuild | Vite + Nitro | **Vite** |
| HTTP 层 | 自有 runtime | Nitro | 适配器 | Nitro | 适配器 | Start server | Nitro | **Hono** |
| 流式 SSR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ 实验 | ✅ |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅（默认） | ✅ | ✅ | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅ SWR | ⚠️ | ⚠️ | ⚠️ 规则在，默认进程内存 |
| 每路由渲染规则 | ⚠️ 部分 | ✅ routeRules | ⚠️ | ⚠️ | ✅ | ✅ `ssr` / `data-only` | ⚠️ | ✅ `ssr`/`isr`/`prerender`/`rewrite`/`proxy` |
| PPR / 静态壳 | ✅ | ❌ | ❌ | ❌ | ✅ Server Islands | ❌ | ❌ | ⚠️ `ppr: true` = 强制流式 SSR，不是 Next 级静态壳 |
| Server Components | ✅ RSC | ✅ `.server.vue` | ❌ | ❌ | ❌ | ❌（用 server functions） | ❌ | ✅ `.server.vue`（**不是** RSC） |
| Server Actions / 服务端函数 | ✅ | ❌ 一等 | ✅ form actions | ✅ | ✅ | ✅ `createServerFn` | ✅ 2.7 | ✅ `defineAction` + `?/<name>` |
| Islands（部分水合） | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ `v-client.*` |
| 内置 DB / Queue / Cron / WS | ❌ | ⚠️ 部分 | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ API 有；DB/Queue/Storage **默认内存** |
| 内置 Auth | ❌ Auth.js | ⚠️ 模块 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ 扩展（Better Auth） |
| 内置 i18n | ❌ | ⚠️ 模块 | ❌ | ❌ | ⚠️ 路由 | ❌ | ❌ | ✅ vue-i18n 11 + 约束前缀 |
| 内置 DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ❌ | ❌ | ✅ + AI 助手 |
| 平台预设 | Vercel 优先 | 12+ | 6+ | 多 runtime | 4+ | 多 host | Nitro | **9**（Node / CF / Vercel / Edge / Netlify / Bun / Deno + cf-dev） |

## 如何读 ubean 这一列

- **已接线**：流式 SSR、SSG、文件路由（含并行 / 拦截路由）、Server Actions、`.server.vue`、Islands、vue-i18n 11、OpenAPI + Scalar、平台预设生成器。
- **有 API、默认不完整**：ISR / 组件缓存默认仍是**进程内存**（可用 `cache: { store: 'fs' }`）；Sessions 仍 opt-in。CSRF（origin）与安全头、fetch Data Cache 中间件默认挂载。图片开发态 `/_ipx` 读本地文件；无变换库时透传原图（`X-IPX-Mode: passthrough`）。
- **刻意不做**：React Server Components、多 UI 运行时、自研第二套 i18n 引擎。需要 RSC 请用 Next.js；需要多框架内容站请用 Astro。

## 功能亮点

### 渲染

覆盖流式 SSR、SSG、ISR（规则层），以及 `routeRules` 的 `ssr` / `prerender` / `isr`。`ppr: true` 当前等于强制流式 SSR，并参与预渲染发现；**不要把它理解成 Next.js 的 Partial Prerendering 静态壳**。纯服务端组件走 `.server.vue`（可与 `.client.vue` 配对）；客户端少发 JS 走 `v-client.*` islands。`defineServerIsland()` 把异步组件放进 `<Suspense>`，这是流式洞，不是静态壳。

### 数据与变更

- **Server Actions / Form Actions**：`defineAction()` + SvelteKit 风格 `?/<name>`，稳定 action ID，客户端 `callAction` / `useAction` / `useFormAction`。
- **`useData` / `useAsyncData` / `defer`**：SSR payload 水合；浏览器 HTTP 请用 [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)，框架不内置客户端。
- **`after()`**：响应后回调，不阻塞 TTFB。
- CSRF、Sessions、跨请求 Data Cache 需要在服务端显式启用，不是新项目默认。

### 路由

文件式路由：并行路由（`@slotName/` → Vue Router named views + `<SlotView>`）、拦截路由、路由组、嵌套布局、`404` / `loading` / `error`。`routeRules.redirect` / `rewrite` / `proxy` / headers 均已执行。`rewrite` 内部再匹配路由；`proxy` 转发到目标 URL。

### 国际化

配置只在 `ubean.config.ts` 的 `i18n`。Vue 端 vue-i18n 11（`legacy: false`）；Hono 与 vue-router 共用 `compileLocalePaths()`。中间件由 `createUbeanApp` 自动挂载。客户端从 `ubean/runtime/vue` 导入 `useI18n` / `setLocale`。

### 开发者体验

- **OpenAPI**（`/_openapi.json` + Scalar）——多数元框架没有一等支持。
- **Islands**（`v-client.*` + 运行时包装器）——Vue 元框架里少见。
- **Electron、PWA、Pinia、UI** 走 `ubean.config.ts` 扩展字段，按需加载，不进主包硬依赖。
- CLI 脚手架：`page` / `api` / `layout` / `middleware` / `cron` 等。

## 部署平台

| 平台 | ubean |
| --- | --- |
| Node.js | ✅ |
| Cloudflare | ✅ 预设；KV / Queue 等需接平台驱动，默认不是内存替代品 |
| Vercel | ✅ Serverless + Edge |
| Netlify | ✅ Functions |
| Bun | ✅ 原生 TS + `bun:sqlite` |
| Deno | ✅ 预设；Deno KV / cron / Queue 需显式接线 |

每个预设 `extends: node`，并生成对应配置文件。平台可通过配置文件、环境变量或 `package.json` 依赖自动检测。

## 何时选 ubean

1. 要 **Vue 专属**全栈（页面 + API + SSR），而不是 React / Angular / 多框架。
2. 要 **Islands** 减少客户端 JS，同时保留可选的 `.server.vue`。
3. 要 **Hono 原生** + Vite，部署面覆盖 Node / Bun / Deno / CF / Vercel / Netlify。
4. 要框架内的 **OpenAPI** 与 **vue-i18n 11 语言路由**，而不是再接一套模块拼图。

## 何时选别人

| 需求 | 更合适 |
| --- | --- |
| React Server Components / 成熟 PPR 静态壳 | Next.js |
| Vue 生态最大模块市场、`useFetch` 习惯、Nitro 预设数量 | Nuxt |
| 表单渐进增强 + `load` 函数极简模型 | SvelteKit |
| 类型安全 Router + `createServerFn` 为中心 | TanStack Start |
| 默认 Islands 的内容站、多 UI | Astro |
| Angular + Vite 元框架 | Analog |
| 细粒度响应式 + Solid | SolidStart |

TanStack Start 与 Analog **不是** ubean 的替代品（UI 不同），列在这里是因为它们代表 2026 年「Vite 元框架」的另一条路径：Router 一等、server function 类型安全、select SSR。ubean 在 Vue 侧对标的是这些**能力**，而不是移植它们的运行时。
