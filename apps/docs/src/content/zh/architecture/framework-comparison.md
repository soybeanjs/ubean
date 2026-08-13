---
title: 框架对比
description: ubean 与 Next.js、Nuxt、SvelteKit、SolidStart、Astro 的对比，以及它的差异化优势所在。
---

# 框架对比

ubean 与主流元框架（截至 2026 年）**Next.js 16**、**Nuxt 4**、**SvelteKit 2**、**SolidStart 1.x**、**Astro 5/6** 的高层对比。该矩阵帮助你判断 ubean 何时合适，以及何时其它框架可能是更优选择。

## 总览对比矩阵

| 维度 | Next.js | Nuxt | SvelteKit | SolidStart | Astro | **ubean** |
| --- | --- | --- | --- | --- | --- | --- |
| UI 框架 | React 19 | Vue 3 | Svelte 5 | Solid | 多框架 | **Vue 3** |
| 构建工具 | Turbopack | Vite | Vite | Vinxi (Vite+Nitro) | Vite | **Vite** |
| HTTP 层 | Node/Runtime | Nitro (Hono) | Node/Hono | Nitro | Node/Hono | **Hono** |
| 流式 SSR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅（默认） | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅ (SWR) | ✅ routeRules.isr + SWR |
| 每路由渲染规则 | ⚠️ 部分 | ✅ routeRules | ❌ | ❌ | ✅ | ✅ routeRules |
| PPR / Server Islands | ✅ 稳定 | ❌ | ❌ | ❌ | ✅ | ✅ |
| Server Components | ✅ RSC | ✅ | ❌ | ❌ | ❌ | ❌（Vue 生态） |
| Server Actions / Form Actions | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Islands（部分水合） | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 内置 DB / Queue / Cron / WS | ❌ | ⚠️ 部分 | ❌ | ❌ | ❌ | ✅ |
| 内置 Auth | ❌ (Auth.js) | ⚠️ | ❌ | ❌ | ❌ | ✅ 扩展 |
| 内置 i18n | ❌ | ⚠️ 模块 | ❌ | ❌ | ⚠️ 路由 | ✅ 零依赖 |
| 内置 DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ✅ + AI 助手 |
| 平台预设 | Vercel/Node/Edge | 12+ | 6+ | 20+ | 4+ | **8**（Node/CF/Vercel/Netlify/Bun/Deno） |

## 功能亮点

### 渲染

ubean 覆盖完整的渲染谱系：流式 SSR、SSG、ISR（含 SWR）、通过 `routeRules` 实现每路由渲染规则（`ssr` / `prerender` / `isr` / `ppr`），以及通过 `defineServerIsland()` 将异步组件包裹进 `<Suspense>` 实现的 Partial Prerendering。Vue 的 SFC / `<script setup>` 生态意味着没有 Server Components —— 部分水合以 islands 为模型。

### 数据与变更

- **Server Actions / Form Actions**：`defineAction()` 显式包装器 + SvelteKit 风格 `?/<name>` 表单 action，带稳定的 action ID（`base32(SHA-1)`）与客户端运行时（`callAction` / `useAction` / `useFormAction`）。
- **请求 memoization 与单飞变更**：请求作用域内 fetch 去重，以及请求作用域内 revalidation（`defineRevalidation` / `invalidate`），避免变更后的瀑布请求。
- **`after()`**：响应后回调（日志、分析、缓存失效），不阻塞 TTFB。

### 路由

文件式路由，支持并行路由（`@slotName/` → Vue Router 命名视图 + `<SlotView>`）、拦截路由（`(..)target`）、路由组、嵌套布局、`404`/`loading`/`error` 约定文件、类型安全路由与 View Transitions。

### 安全与会话

Sessions API（cookie 或存储后端）、CSRF 保护（double-submit cookie + origin 校验）、可配置安全头（CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy）。

### 开发者体验

- **OpenAPI 自动生成**（`/_openapi.json` + Scalar UI）——多数框架缺少的差异化能力。
- **零依赖 i18n**（4 种路由策略 + Intl + plural + linked messages，无需 vue-i18n）。
- **Islands 架构**（`v-client.*` 指令 + `defineIsland()` / `defineServerIsland()` 包装器）。
- **Electron** 桌面应用开箱即用；多 provider 图片优化；完整 CLI 脚手架（`page` / `api` / `layout` / `middleware` / `cron` / `plugin` / `env` / `config`）。

## 部署平台

| 平台 | ubean |
| --- | --- |
| Node.js | ✅ |
| Cloudflare | ✅ |
| Vercel | ✅ Serverless + Edge |
| Netlify | ✅ Functions |
| Bun | ✅ 原生 TS + `bun:sqlite` |
| Deno | ✅ KV / cron / Queue |

每个预设都 `extends: node`，并提供各自的能力矩阵、构建配置与配置文件生成器。平台通过配置文件、环境变量或 `package.json` 依赖自动检测。

## ubean 的独特优势

| 差异化 | 说明 |
| --- | --- |
| **内置全栈原语** | DB / Queue / Cron / WebSocket / SSE / Cache 一站式，竞品多需第三方拼接 |
| **AI 驱动 DevTools** | 内置 ai-sdk 集成，多个视图 |
| **OpenAPI 自动生成** | `/_openapi.json` + Scalar UI —— 元框架中罕见 |
| **零依赖 i18n** | 4 种策略 + Intl + plural + linked messages |
| **Vue 生态 Islands** | `v-client.*` 指令 + 运行时包装器 —— Vue 生态中少见 |
| **Electron 内置** | 桌面应用开箱即用 |
| **Hono 原生** | 边缘运行时友好、轻量 |

## 适用场景清单

当你想满足以下条件时，考虑 ubean：

1. **Vue 专属**的全栈框架（页面 + API + SSR 一站式）
2. **Islands** 部分水合，减少客户端 JavaScript
3. **内置**全栈原语（DB、queue、cron、WebSocket、SSE、cache、i18n），无供应商锁定
4. **多平台部署**（Node / Bun / Deno / Cloudflare / Vercel / Netlify），单一代码库
5. 框架内集成的 **DevTools + AI** 工作流

如需 React Server Components（选 Next.js）或框架无关的内容站点（Astro），那些仍是更优选择。
