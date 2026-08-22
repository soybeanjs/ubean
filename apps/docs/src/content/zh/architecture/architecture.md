---
title: Architecture
description: ubean 的架构设计：五层职责划分、包布局与配置系统。
---

# 架构

## 1. 分层架构

ubean 是一个基于 Vite、Hono 与 Vue 3 的全栈元框架，按职责划分为五层。仓库以 **24 个单用途包**（ubean 聚合器 + 23 个 `@ubean/*` 子包）组织，主包 `ubean` 是纯聚合器，re-export 所有 `@ubean/*` 子包。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ubean 框架分层                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 CLI 层（@ubean/cli）                         │   │
│  │  ubean dev | build | preview | prepare                       │   │
│  │  init | page | env | config | devtools | scaffold            │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │              构建核心层（build-time）                          │   │
│  │  @ubean/config  配置加载 + 模块系统                           │   │
│  │  @ubean/scan 路由扫描（pages/routes/layouts/middleware）  │   │
│  │  @ubean/build   Vite 插件 + 生产构建 + prerender + codegen   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 Vite 插件层（@ubean/build）                  │   │
│  │  ubeanPlugin()  虚拟模块 / 客户端 stub / 宏转换             │   │
│  │  ubeanVite()     Vue SFC / islands / SSR 入口 / head 管理    │   │
│  │  扩展包 /vite 子路径：icon / pwa / auth / image / ...       │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                运行时层（runtime）                            │   │
│  │  @ubean/app     Hono 应用工厂（createUbeanApp）              │   │
│  │  @ubean/client Vue 客户端运行时 + SSR 渲染器                  │   │
│  │  @ubean/server  cache / db / queue / cron / ws / sse / ...   │   │
│  │  @ubean/pages   页面数据协议（loaders / actions）            │   │
│  │  @ubean/routes  API 路由 + Server Actions                    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │               平台预设层（@ubean/preset）                    │   │
│  │  standard │ node │ cloudflare │ vercel │ vercel-edge        │   │
│  │  netlify │ bun │ deno（detectPreset 自动识别）              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 包组织原则

- **聚合器主包**：`packages/ubean`（npm 名 `ubean`）不包含框架逻辑，仅 re-export 全部子包，保持与单体时代一致的 API 表面。
- **单职责子包**：其余 23 个包按能力域拆分（`@ubean/shared` / `@ubean/scan` / `@ubean/app` / `@ubean/client/ssr` …），各自独立构建与类型检查。
- **扩展包按需加载**：`auth` / `icon` / `image` / `content` 通过 `ubean.config.ts` 顶层字段启用，构建时动态 `import()` 对应 `/vite` 子路径，**不进入主包硬依赖**；`pwa` / `fonts` / `electron` / `pinia` / `ui` 是 `@ubean/integrations` 的子路径（`@ubean/integrations/pwa` 等），其 Vite 插件由子路径主入口导出。
- **入口边界**：服务端代码从 `ubean` 主入口或 `ubean/runtime/app` 导入；浏览器端必须从 `ubean/runtime/vue` 或 `ubean/client`（一等客户端子路径）导入，避免把服务端构建工具带入浏览器 bundle。

## 2. 核心数据流

### 2.1 开发模式

```
ubean dev
  │
  ├─► 加载配置（ubean.config.ts + 默认值合并，c12）
  │    └─► 解析 preset（detectPreset 自动识别或手动指定）
  │
  ├─► 扫描项目文件（@ubean/scan）
  │    ├─► src/routes/     → API 路由（defineHandler 命名导出）
  │    ├─► src/pages/      → Vue 页面路由（definePage 宏）
  │    ├─► src/layouts/    → 布局（按路径层级解析）
  │    ├─► src/middleware/ → Hono 中间件（global → /*，目录前缀 → 子路径）
  │    ├─► src/crons/      → 定时任务（defineScheduled）
  │    └─► public/         → 静态资源（ETag / Cache-Control）
  │
  ├─► 启动 Vite 开发服务器（@ubean/cli + @ubean/build）
  │    ├─► ubeanPlugin()   虚拟模块、客户端 stub、宏转换
  │    └─► ubeanVite()      Vue SFC、SSR 渲染管线、HMR
  │
  ├─► 启动 Hono 开发服务器（@ubean/app，路由规则 + 中间件 + ISR）
  │
  └─► 文件监听 → HMR / 路由重建 → 自动刷新
```

### 2.2 构建模式

```
ubean build
  │
  ├─► 加载配置 + 解析 preset + 扫描项目文件
  │
  ├─► 生成虚拟模块与类型
  │    ├─► 路由清单（virtual:ubean-pages / routes）
  │    ├─► 模块注册表（registry.ts）
  │    ├─► .ubean/routes.d.ts + typed-router.d.ts
  │    └─► islands 注册表
  │
  ├─► 客户端构建（Vite）
  │    └─► Vue 客户端 bundle（水合入口）
  │
  ├─► 服务端构建（Vite SSR / Rolldown）
  │    ├─► 入口：preset 对应的 server entry
  │    ├─► 打包全部路由 / 中间件 / 模块插件
  │    └─► 输出到 outputDir/server
  │
  ├─► 预渲染（mode: 'ssg' 或 routeRules.prerender / ppr）
  │    └─► 生成静态 HTML
  │
  └─► 生成平台产物（vercel.json / wrangler.toml / netlify.toml / …）
```

## 3. 配置系统

配置入口为 `ubean.config.ts`，通过 `defineConfig` 声明（配置加载与类型定义位于 `@ubean/config`）。默认值由 `loadUbeanConfig` 合并，全部字段见 [API 参考](/reference/api/config)。

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  // 应用模式：fullstack（默认）| spa | ssg | backend
  mode: 'fullstack',

  // 源码目录（默认 <rootDir>/src）
  srcDir: 'src',

  // SSR 配置：true（默认）| false | { exclude, streaming }
  ssr: true,

  // 目录约定（默认值即可，可按需覆盖）
  dir: {
    pages: 'src/pages',
    routes: 'src/routes',
    layouts: 'src/layouts',
    middleware: 'src/middleware',
    public: 'public'
  },

  // 路由规则：per-route 渲染控制（缓存 / 重定向 / ISR / PPR）
  routeRules: {
    '/blog/**': { isr: 3600 },
    '/old-page': { redirect: '/new-page' }
  },

  // 预渲染（SSG）：all: true 或 include 列表
  prerender: { all: true },

  // 模块系统：字符串包名 / 元组 / 实例
  modules: [],

  // 扩展包（按需启用，构建时动态加载对应 /vite 插件）
  icon: true,        // @ubean/icon
  pwa: true,         // @ubean/integrations/pwa
  auth: true,        // @ubean/auth
  ui: { css: false }, // @ubean/integrations/ui（UnoCSS 模式）
  pinia: true,       // @ubean/integrations/pinia

  // DevTools 面板（默认关闭）
  devtools: { enabled: true },

  // vue-i18n 11 + 约束前缀语言路由
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    strategy: 'prefix_except_default'
  },

  // Markdown 页面（unplugin-vue-markdown + shiki 高亮）
  markdown: {
    enabled: true,
    theme: { light: 'one-light', dark: 'one-dark-pro' }
  },

  // 开发服务器
  dev: { port: 9527, host: 'localhost' },

  // 构建选项
  build: { minify: true, sourcemap: false }
});
```

**要点**：

- 平台 preset 通过 `build.preset` 指定；未指定时 `detectPreset()` 会根据 `vercel.json` / `netlify.toml` / `deno.json` 及运行时全局自动识别。
- 扩展包顶层字段均支持 `true` 或选项对象两种形式。
- `routeRules` 支持 `ssr`（`boolean | 'streaming'`）/ `prerender` / `isr`（`number | { ttl, swr? }`）/ `ppr`，按规则与路径特异性排序，运行时可经 `c.get('routeRule')` 读取。

应用约定式目录结构详见 [项目概览与约定 §3](overview.md#3-目录结构)。
