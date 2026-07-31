---
title: 快速开始
description: 几分钟内开始使用 ubean。
status: translated-stub
---

# 快速开始

几分钟内开始使用 ubean。

## 前置条件

- Node.js >= 18.0.0
- pnpm `11.11.0`（必需 — ubean 使用 pnpm catalog 和 workspace 功能）

## 创建项目

### 交互模式

```bash
pnpm create ubean@latest
```

按照提示配置你的项目。

### 非交互模式

```bash
pnpm create ubean@latest my-app --template starter --preset node -y
```

## 项目结构

```
my-app/
├── src/
│   ├── pages/          # 文件式页面路由
│   ├── api/            # API 路由（defineHandler）
│   ├── layouts/        # 布局组件
│   ├── components/     # Vue 组件（自动导入）
│   └── app.ts          # defineApp 入口
├── public/            # 静态资源
├── ubean.config.ts    # ubean 配置
├── uno.config.ts      # UnoCSS 配置
└── tsconfig.json
```

## 开发服务器

```bash
pnpm dev
```

开发服务器默认运行在 `http://localhost:3000`。

## 构建与预览

```bash
pnpm build      # 生产构建
pnpm preview    # 预览生产构建
```

## 下一步

- [应用模式](/zh/guide/app-modes) — 了解 SSG、SSR 和 SPA 模式
- [路由模式](/zh/guide/routing-modes) — 深入了解文件式路由
- [国际化](/zh/guide/i18n) — 多语言支持
