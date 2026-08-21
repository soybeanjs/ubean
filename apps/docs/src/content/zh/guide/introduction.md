---
title: 简介
description: ubean 是基于 Vite、Hono 和 Vue 构建的全栈 Vue 元框架。
---

# 简介

**ubean** 是一个全栈 Vue 元框架，融合了 Vite 的开发体验、Hono 的可移植服务端运行时和 Vue 的 SSR 能力。

## 什么是 ubean？

ubean 基于 Vite、Hono 与 Vue 3 构建，融合了 void 的 Inertia 式 SSR 页面路由和 Nitro 的跨平台部署能力。它旨在为 Vue 开发者提供一个开箱即用的框架，具备一流的 TypeScript 支持、文件式路由和模块化扩展系统。

## 核心特性

- **全栈 SSR** — Vue SSR 配合 Inertia 式页面路由、群岛架构和原生视图过渡。
- **文件式路由** — 类型安全的 API 路由（`defineHandler`）和页面路由（`definePage` 宏），自动生成类型安全的路由助手。
- **群岛架构** — 通过 `v-client.*` 指令（`v-client.load|idle|visible|media|only`）实现部分水合，自动注册并自动水合。
- **多平台部署** — 支持 Node、Cloudflare、Vercel、Netlify、Bun、Deno 预设及能力矩阵。
- **开发者工具** — 基于 iframe 的检查面板，包含页面、API、中间件、定时任务、环境变量和 AI 助手。
- **内置国际化** — vue-i18n 11，四种约束前缀路由策略和 SSR 水合。
- **Markdown 页面** — 一流的 `.md` 页面支持，包含 frontmatter、shiki 代码高亮和逐页 SEO。
- **SSG / 预渲染** — 为 SEO 关键和以阅读为主的页面生成静态站点。

## 扩展包

ubean 在 `@ubean/` 作用域下提供了可选的扩展包（`pwa` / `fonts` / `electron` / `ui` / `pinia` 为 `@ubean/integrations` 的子路径）：

| 包名 | 用途 |
| --- | --- |
| `@ubean/auth` | 身份认证（集成 better-auth，支持邮箱/密码降级） |
| `@ubean/icon` | 本地 SVG 图标集，支持 Iconify API 回退 |
| `@ubean/integrations/pwa` | 渐进式 Web 应用（manifest + service worker） |
| `@ubean/image` | 图片优化与转换 |
| `@ubean/content` | 内容集与 Markdown 处理 |
| `@ubean/integrations/fonts` | 字体优化与子集化 |
| `@ubean/integrations/electron` | Electron 桌面应用集成 |
| `@ubean/integrations/ui` | SoybeanUI 集成（组件解析器 + 样式） |
| `@ubean/integrations/pinia` | Pinia 状态管理，支持 SSR 水合助手 |

## 下一步

- [快速开始](/zh/guide/quickstart) — 创建你的第一个 ubean 项目。
- [应用模式](/zh/guide/app-modes) — 了解 SSG、SSR 和 SPA 模式。
- [路由模式](/zh/guide/routing-modes) — 深入了解文件式路由。
