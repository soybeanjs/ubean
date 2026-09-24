---
title: 应用模式
description: 应用模式（fullstack / spa / ssg / backend）以及 mode 字段如何驱动构建。
---

# 应用模式

ubean 的 `mode` 配置字段声明应用形态，并决定构建过程执行哪些步骤。它与 `preset`（部署平台）和 `routing.mode`（路由数据生成）互不影响。

## 模式总览

| 模式 | 客户端产物 | SSR 产物 | 服务端产物 | 预渲染 | 典型场景 |
| --- | --- | --- | --- | --- | --- |
| `fullstack`（默认，`ssr: true`） | ✅ | ✅ | ✅ | 可选 | Vue 页面 + Hono API + SSR（默认行为） |
| `fullstack` + `ssr: false` | ✅ | ❌ | ✅ | ❌ | Vue 页面 + Hono API，不启用 SSR（后台管理台） |
| `spa` | ✅ | ❌ | ❌ | ❌ | 纯客户端渲染，静态 HTML + JS，无服务端 |
| `ssg` | ✅ | ✅（静态产物） | ❌ | ✅（强制） | 构建时通过直接渲染路径预渲染 —— 静态 HTML（营销页/博客/文档） |
| `backend` | ❌ | ❌ | ✅ | ❌ | 纯 Hono API 服务，无 Vue 页面、无 SSR |

## 配置

在 `ubean.config.ts` 中设置 `mode`（以及可选的 `ssr`）：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  mode: 'fullstack', // 'fullstack' | 'spa' | 'ssg' | 'backend'
  ssr: true // 仅在 mode === 'fullstack' 时生效
});
```

CLI 参数会覆盖配置文件：

```bash
ubean build --mode spa
ubean build --mode fullstack --no-ssr
ubean build --ssg          # --mode ssg 的简写
```

启用 `experimental.viteBuilder` 时，`mode` 同样决定 `vite build` 的产物 —— 插件会注册 `client` / `ubean` 两个环境，因此裸 `vite build` 产出相同的 `dist/{public,server}` 布局（外加为需要预渲染的路由生成的 HTML）。`vite build` 会忽略 `--outDir`，始终写入 `build.outputDir`。

## 模式详解

### `fullstack`（默认）

默认模式 —— Vue 页面 + Hono API + SSR，零配置即可使用。

- 构建输出：`dist/public/`（客户端）+ `dist/server/`（服务端）
- 开发：Vite 中间件模式 + Hono 应用
- 预览：Node 服务端（`server.mjs`）
- 预渲染：可选（由 `prerender.enabled` 控制）

### `fullstack` + `ssr: false`

全栈但不启用 SSR。适合没有 SEO 需求的应用（后台管理面板、内部工具）。

- 跳过 SSR 产物构建（构建时间约减少 40%）
- 仍会构建服务端产物（Hono 应用负责 API 路由）
- 页面在客户端渲染；API 路由正常响应
- 预览仍使用 Node 服务端

### `fullstack` + 排除 SSR（`ssr: { exclude: [...] }`）

大多数页面走 SSR，但排除特定路由（例如后台管理台、不需要 SEO 的高交互页面）。

```typescript
export default defineConfig({
  mode: 'fullstack',
  ssr: {
    exclude: ['/admin/**', '/dashboard/*', '/realtime']
  }
});
```

- 仍会构建 SSR 产物（全局 `ssr` 默认为 `true`）
- 命中排除规则的路由返回纯客户端 HTML 外壳（CSR），而不是 SSR
- 未排除的页面正常进行服务端渲染
- Glob 模式：`*`（单段）、`**`（多段递归）
- 适用场景：同一项目里内容型页面（SSR）与应用型页面（CSR）混用

### 通过 `routeRules` 按路由覆盖 SSR（P9-03）

如果 `ssr.exclude` 的粒度不够细，可以用 `routeRules.ssr` 按路由覆盖全局 SSR 设置，它的优先级高于 `ssr.exclude`：

```typescript
export default defineConfig({
  mode: 'fullstack',
  ssr: {
    exclude: ['/admin/**']           // 后台页面 → 默认走 CSR
  },
  routeRules: {
    '/admin/share-screen': { ssr: true },        // ...但这一条除外（强制 SSR）
    '/feed': { ssr: 'streaming' },                // 为 /feed 强制流式 SSR
    '/dashboard/realtime': { ssr: false }         // 即使不在 exclude 列表里也强制 CSR
  }
});
```

| `routeRules.ssr` 取值 | 行为                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `true`                | 命中路由强制 SSR（覆盖 `ssr.exclude`）                                            |
| `false`               | 命中路由强制 CSR（视同已加入 `ssr.exclude`）                                      |
| `'streaming'`         | 命中路由强制流式 SSR（覆盖 `SsrOptions.streaming`）                               |
| `'data-only'`         | 执行 loader/数据获取，但返回带脱水数据的 CSR 外壳                                 |

可与 `routeRules.isr` 组合实现增量静态再生，或用 `routeRules.prerender` 做构建时预渲染。完整字段参考见 <Link to="/guide/pages-routing/overview#按路由的渲染规则-p9-03">路由规则</Link>。

### `spa`

纯客户端渲染，无服务端。

- 构建输出：仅 `dist/public/`（静态 `index.html` + 资源）
- 无 SSR 产物、无服务端入口、无预渲染
- 开发：Vite dev server，`app.fetch()` 对所有路由返回客户端 HTML
- 预览：静态文件服务器，服务 `dist/public/`

### `ssg`

静态站点生成 —— 构建时通过**直接渲染路径**预渲染（不经过 HTTP 管道，见 ADR-0011）。

- 构建客户端产物 + **最小静态渲染产物**：不含 Hono 应用、API 路由、中间件、定时任务或 IPX —— 比 fullstack 预渲染更轻更快（单路由渲染约快 50%，整体构建快 6–11%）
- 强制 `prerender.enabled = true`
- 输出：`dist/public/**/*.html` 下的静态 HTML 文件
- `pages/404.vue`（若存在）渲染为 `404.html` —— GitHub Pages / Netlify / Cloudflare Pages 会将其作为自定义 404 页面
- i18n 路由按策略展开：`prefix_except_default` 下 `/about` → `/about` + `/zh/about`；hreflang / canonical / og:locale 标签自动产出
- 启用 `content: true` 时会自动生成全文搜索索引（见 <Link to="/guide/content">内容与搜索</Link>）：`dist/public/__search.json`（供 `useContentSearch()` 使用的分节数据），安装可选的 `pagefind` 开发依赖后还会在 `dist/public/pagefind/` 下生成分块 [Pagefind](https://pagefind.app/) 索引 —— 两者都支持 CJK
- 页面 `loader` **不会执行**（一次性警告）—— 数据来自内容集合、模块常量或客户端水合时发起的请求
- 静态产物不提供：server action、表单 POST、ISR / PPR / 流式、路由规则的 redirect/rewrite（静态文件里没有执行点）—— 需要这些能力时请用 `fullstack` + `prerender`
- 安全响应头（CSP/HSTS/…）不属于静态产物 —— 请在你的托管平台上配置（例如 Netlify / Cloudflare Pages 的 `_headers`）。开发态默认关闭以与之保持一致；在 `ubean.config.ts` 中设置 `security.headers` 可在开发态重新开启，把它当作 CSP 调试控制台
- 预渲染结束后会清理临时的 `dist/server/`（设置 `UBEAN_KEEP_SSR=1` 可保留以便调试）
- 预览：静态文件服务器，服务 `dist/public/`

### `backend`

纯 API 后端，无前端。

- 跳过页面相关虚拟模块与 Vue 插件
- 无客户端产物、无 SSR 产物
- 仅构建服务端产物（Hono 应用 + API 路由）
- 输出：仅 `dist/server/`
- 预览：Node 服务端（与 `fullstack` 相同）

## 与其他配置的关系

| 配置字段 | 与 `mode` 的关系 |
| --- | --- |
| `build.preset` | 互不影响 —— `mode` 控制架构，`preset` 控制部署平台（standard/node/cloudflare/vercel/vercel-edge/netlify/bun/deno） |
| `routing.mode` | 互不影响 —— 控制路由文件生成方式（virtual/file/both），与应用 `mode` 无关 |
| `prerender.enabled` | `ssg` 强制开启；`spa`/`backend`/`fullstack`+`ssr:false` 强制关闭 |
| `ssr` | 仅 `fullstack` 的子选项；其他模式忽略它 |
| `icon`/`pwa`/`auth`/`i18n` | 互不影响 —— 按需加载，不受 `mode` 影响 |

## 模式选择指南

| 场景 | 推荐模式 |
| --- | --- |
| 全栈应用（页面 + API + SEO） | `fullstack`（默认） |
| 全栈应用（页面 + API，无 SEO） | `fullstack` + `ssr: false` |
| 纯 API 服务（无前端） | `backend` |
| 营销站 / 博客（静态） | `ssg` |
| 纯前端应用（无 API、无 SEO） | `spa` |

## 注意事项

- `mode` 默认为 `fullstack`，`ssr` 默认为 `true` —— 现有项目无需改动（零破坏性变更）。
- `fullstack` + `ssr: true`（默认）的构建流程与引入 `mode` 之前完全一致。
- `fullstack` + `ssr: false` 仍会生成服务端产物，因为 API 路由需要它。如果既不需要 SSR 也不需要 API，请用 `spa`。
