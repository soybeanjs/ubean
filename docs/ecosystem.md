# 生态能力演进

本文件记录对 Nuxt、Next.js、SvelteKit 与 Analog 的能力调研结论，以及 ubean 的采纳顺序。它描述计划中的设计，不代表当前已提供的 API。

## 1. 设计原则

ubean 已覆盖文件路由、SSR/SSG、islands、route rules/ISR、OpenAPI、类型化客户端、Pages loader/action、DevTools、i18n、队列、WebSocket 与 SSE。后续不以功能数量为目标，而是补齐这些能力之间的协议、性能与可运维性。

- **Node-first**：所有能力先在 Node preset 提供可验证的完整语义；其他 preset 通过 capability matrix 声明支持、降级或拒绝。
- **核心轻量**：图片、内容、字体、图标与 PWA 是官方可选扩展，不得将原生依赖、远程 SDK 或大数据集静态带入 `packages/ubean`。
- **默认离线、显式远程**：生产构建不得因未声明的 CDN、公共 API 或远程资源静默退化；开发期远程 fallback 必须显式配置并提示。
- **统一页面协议**：新能力应复用 Pages loader/action、`internalFetch`、Head 管理和 Hookable 生命周期，而非创建并行的 RPC、路由或缓存模型。
- **安全优先**：远程资源采用精确 allowlist；内容、SVG 和 metadata 的不可信输入均须经过边界处理。

## 2. 参考框架与采纳重点

| 参考      | 可借鉴能力                                                               | ubean 决策                                                          |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Nuxt      | 运行时插件、route middleware、`waitUntil`、模块化资源能力                | 补足插件生命周期依赖图；Image、Content、Fonts、Icon 以官方扩展实现  |
| Next.js   | 图片/字体优化、类型化 metadata、动态 OG 图片、OpenTelemetry              | 将 SEO/OG 与可观测性提升为框架级公共契约                            |
| SvelteKit | loader 依赖追踪、精确失效、流式 Promise、请求/错误 hooks、Service Worker | 先完成页面数据协议，再评估 PPR；PWA 保持 opt-in                     |
| Analog    | 内容集合、frontmatter、类型化表单 action、Markdown 内容路由              | `@ubean/content` 提供 collection 与 renderer；继续复用 Pages action |

## 3. 核心协议优先级

### 3.1 页面数据、失效与流式传输（M2）

Pages 的 loader/action 必须形成单一数据协议：

- loader 使用 `depends('domain:key')` 声明逻辑依赖；框架收集路由、参数、URL、fetch 与显式 dependency。
- `invalidate(key)`、`invalidateRoute(route)` 与 action 的 `invalidate` 选项只重跑受影响 loader；导航必须复用未失效的父 layout 数据。
- loader 使用请求级 fetch：同源 API 调用优先 `internalFetch`，仅转发允许的认证上下文，避免无条件透传 header/cookie。
- `defer()` 或序列化 Promise 标记非关键数据，支持 SSR 流式传输；不支持 streams 的 preset 必须在 capability matrix 中声明 buffered 行为。
- 流开始后禁止变更 status/header 或抛出 redirect；错误边界、取消、超时与 hydration 使用统一结果模型。

这优先于泛用 Server Functions/RPC。现有 OpenAPI typed client 与 Pages action 已覆盖大部分读写场景，提前引入第二条调用语义会扩大鉴权、缓存和序列化维护面。

### 3.2 可观测性（M3）

提供可选的 `@ubean/observability`，默认只暴露抽象和 hooks，不绑定厂商：

- 请求 ID 贯穿 HTTP handler、SSR、loader/action、`internalFetch`、队列与日志。
- 以 Hookable 生命周期构建 `request`、`route`、`loader`、`action`、`render`、`fetch` spans，并提供 OpenTelemetry exporter adapter。
- `reportError` 与 `onError` 生成安全的 public error ID；客户端不得接收 stack、密钥或内部请求上下文。
- DevTools 展示瀑布、缓存命中、慢路由、插件/中间件耗时及关联 request ID。

### 3.3 SEO、metadata 与 OG（M3）

在现有 Head 管理之上提供结构化、可合并的 SEO 层：

- `useSeoMeta()` 或 `defineSeo()` 支持 title template、description、canonical、robots、alternate locale、Open Graph 与 Twitter 字段。
- root layout、嵌套 layout、page 与 content frontmatter 采用确定的由低到高合并顺序；重复 tag 用 key 去重。
- 支持约定式 `sitemap.ts`、`robots.ts`、`manifest.ts`、icons 与 `og-image.ts`。
- 动态 OG 图为可选 `@ubean/og`，基于 Satori/resvg 等实现；其字体与图片仅通过 `@ubean/fonts`、`@ubean/image` 的受控资产接口访问。

## 4. 官方资源与内容扩展（M5）

### 4.1 `@ubean/image`：参考 Nuxt Image

提供 `<UbeanImg>`、`<UbeanPicture>` 与 `useImage()`，由 provider 负责生成图片转换 URL；组件本身只输出标准 `img`/`picture`，不引入布局包装。

```vue
<UbeanPicture src="/images/cover.jpg" alt="Article cover" sizes="100vw md:720px" :formats="['avif', 'webp']" preload />
```

```typescript
export default defineConfig({
  image: {
    provider: 'ipx',
    remotePatterns: [{ protocol: 'https', hostname: 'images.example.com', pathname: '/assets/**' }],
    formats: ['avif', 'webp'],
    presets: { avatar: { width: 96, height: 96, fit: 'cover' } }
  }
});
```

- Node 使用可选 IPX/sharp 自托管转换；它们不得进入 Edge bundle。
- SSG 通过 crawl/manifest 预生成使用过的变换；动态未声明尺寸必须诊断，不能静默产生 404。
- provider 支持平台图片服务和外部 CDN；remote URL 必须校验 protocol、hostname、port 与 pathname，防止 SSRF 和开放代理。
- 自动生成 `width`/`height`、`srcset`、`sizes`、lazy loading、placeholder 和 LCP preload，优先改善 CLS/LCP。

### 4.2 `@ubean/content`：参考 Nuxt Content v3

现有 `pages/**/*.md` 是零配置页面快捷方式；复杂文档、博客和数据目录使用独立 collection，而不是把内容查询散落在 loader 中。

```typescript
// content.config.ts
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: { include: 'docs/**/*.md', prefix: '/docs' },
      schema: z.object({ title: z.string(), updatedAt: z.coerce.date() }),
      indexes: [{ columns: ['updatedAt'] }]
    })
  }
});
```

- `page` collection 建立内容文件到 URL 的一对一映射并提供 path、title、description、seo、body、navigation 字段；`data` collection 仅用于结构化查询。
- Markdown、YAML、JSON 与 CSV 通过统一 source、schema、AST 和类型生成管线处理；查询使用 `queryCollection().where().order().select().all()`。
- 生产构建将解析结果写为内容 dump；Node/Edge 通过驱动恢复查询库，避免冷启动全量读文件。浏览器 SQLite、全文搜索、远程 Git source 与可视化编辑器不进入初版。
- `<ContentRenderer>`、Prose 组件、Shiki、目录与导航属于 `@ubean/content` Vue 层。Markdown 中可嵌入 Vue 组件，但只能使用显式注册的 allowlist，props 必须可校验；默认消毒原始 HTML，禁止任意表达式执行。

### 4.3 `@ubean/fonts`：参考 Nuxt Fonts

构建期扫描 CSS/Vue SFC 中实际使用的 `font-family`，按 `local -> provider` 解析并将使用到的字体自托管到带 hash 的公共资产。

- 初版仅提供 `local` 与 `google` provider；其他 provider 以 adapter 扩展。
- 自动生成 `@font-face`、unicode range、`font-display: swap` 与预加载；构建必须下载字体，生产首访不依赖第三方字体服务。
- 可选 font metric fallback 使用 fontaine/capsize 等能力降低 CLS；无法取得 metrics 时正常生成字体声明，不使构建失败。
- 字体 URL 和 preload manifest 应提供给 Head 与 `@ubean/og`，确保普通页面和 OG 图使用一致资产。

### 4.4 `@ubean/icon`：参考 Nuxt Icon

基于 Iconify 的按需 collection、本地 SVG collection（Custom Local Collections）、静态扫描与离线 client bundle；默认 SVG 输出，生产禁止静默回退公共 Iconify API。

```ts
// vite.config.ts
import { ubeanIconPlugin } from '@ubean/icon/vite';

export default {
  plugins: [
    ubeanIconPlugin({
      // 本地自定义图标集合（对标 @nuxt/icon Custom Local Collections）
      customCollections: {
        // 简写：key 为 prefix，value 为 SVG 目录路径
        'my-icons': './assets/icons',
        // 完整配置：自定义 normalizeIconName
        brand: {
          dir: './assets/brand-svgs',
          prefix: 'brand',
          normalizeIconName: name => name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        }
      }
    })
  ]
};
```

- `<Icon name="lucide:home" />` 使用远程 Iconify 集合（需安装对应的 `@iconify-json/lucide`）
- `<Icon name="my-icons:auth-login" />` 使用本地 SVG（嵌套目录 `assets/icons/auth/login.svg` → 前缀连字符命名）
- 自动提取 SVG 的 width/height/viewBox 属性，开发期 HMR 支持本地 SVG 增删改
- Dev server `/_iconify` 路由优先查找本地 custom collection，命中则直接返回 SVG，否则 fallback 到 Iconify API
- Node SSR 可本地按需服务，SSG/Edge 使用离线 bundle 或明确 remote provider

### 4.5 `@ubean/pwa`：参考 vite-plugin-pwa / Nuxt PWA

提供渐进式 Web 应用支持，包括 Web App Manifest 生成、Service Worker 注册与缓存策略，默认 opt-in。

```ts
// vite.config.ts
import { ubeanPwaPlugin } from '@ubean/pwa/vite';

export default {
  plugins: [
    ubeanPwaPlugin({
      enabled: true,
      manifest: {
        name: 'My Ubean App',
        short_name: 'Ubean',
        description: 'A Ubean PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/'
      },
      registerType: 'autoUpdate', // 'autoUpdate' | 'prompt' | 'manual'
      workbox: {
        precacheManifest: true,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{ urlPattern: /^https:\/\/fonts\.googleapis\.com/, handler: 'stale-while-revalidate' }]
      }
    })
  ]
};
```

```vue
<script setup lang="ts">
import { usePwa } from '@ubean/pwa';

const { needRefresh, updateServiceWorker, isOfflineReady, isInstalled } = usePwa();
</script>

<template>
  <div v-if="needRefresh">
    有新版本可用
    <button @click="updateServiceWorker()">刷新</button>
  </div>
  <div v-if="isOfflineReady">已可离线使用</div>
</template>
```

- 构建时自动生成 `manifest.webmanifest` 和带版本 hash 的 `sw.js`
- 内置缓存策略：`cache-first`、`network-first`、`stale-while-revalidate`、`network-only`、`cache-only`
- 默认 runtimeCaching 规则覆盖 images/fonts/assets/api/pages
- HTML 自动注入 manifest link、theme-color meta、内联注册脚本（inline 模式）或自动注册
- `usePwa()` 提供响应式状态（isInstalled/isUpdateAvailable/isOfflineReady/needRefresh/registration）
- Workbox 集成、Prompt UI 组件、dev 模式 SW 调试、更多 manifest 字段（shortcuts/share_target）待后续完善

### 4.6 `@ubean/auth`：参考 Nuxt Auth / Better Auth

基于 [Better Auth](https://better-auth.com) 的认证插件，提供零配置认证方案，内置 email/password fallback 实现。

```ts
// vite.config.ts
import { ubeanAuthPlugin } from '@ubean/auth/vite';

export default {
  plugins: [
    ubeanAuthPlugin({
      enabled: true,
      basePath: '/api/auth',
      secret: process.env.AUTH_SECRET,
      trustedOrigins: ['https://example.com'],
      session: {
        cookieName: 'ubean_session',
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24 // 1 day
      },
      // Better Auth 完整配置（可选，不提供则使用内置fallback）
      betterAuth: {
        emailAndPassword: { enabled: true },
        socialProviders: { github: { clientId: '...', clientSecret: '...' } }
      }
    })
  ]
};
```

```vue
<script setup lang="ts">
import { useAuth } from '@ubean/auth';

const { user, isAuthenticated, isLoading, signIn, signUp, signOut, session } = useAuth();
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <template v-else-if="isAuthenticated">
    <span>你好，{{ user?.name }}</span>
    <button @click="signOut()">退出</button>
  </template>
  <button v-else @click="signIn(email, password)">登录</button>
</template>
```

- 服务端 `createAuthHandler()` 动态 import `better-auth`，未安装时自动降级到内置 email/password 实现
- Vite 插件自动在 dev server 挂载 `/api/auth/*` 路由（Hono 中间件）
- 虚拟模块提供 `ubean/auth/client` 类型安全的 auth client
- `useAuth()` Vue composable 提供响应式 session/user/isLoading/isAuthenticated 状态
- 自动注册 fetchSession（onMounted + focus/visibilitychange 监听）
- 支持 Better Auth 全部特性：OAuth 社交登录、session 管理、账号关联等

### 4.7 `@ubean/pinia`：参考 Nuxt Pinia / Pinia 官方 SSR

[Pinia](https://pinia.vuejs.org/) 是 Vue 官方推荐的状态管理库。ubean 通过 `@ubean/pinia` 提供薄封装层,负责 dev 预构建优化和 SSR 状态水合辅助,不重新导出 Pinia API。

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true // 启用 dev 预构建优化
});
```

```ts
// src/app.ts — 注册 Pinia 插件 + SSR 水合钩子
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

```ts
// src/stores/counter.ts — Store 定义与常规 Pinia 完全一致
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  actions: {
    increment() { this.count++; }
  }
});
```

- `ubean.config.ts` 中 `pinia: true` 或 `pinia: { ... }` 启用,自动将 `pinia` 加入 `optimizeDeps.include`
- SSR 状态水合通过 `defineApp({ serializeState, hydrateState })` 钩子集成,状态序列化到 HTML 的 `__UBEAN_STATE__` script 标签
- `serializePiniaState(app)` 从 `app.config.globalProperties.$pinia.state.value` 提取状态
- `hydratePiniaState(app, state)` 在 `applyAppConfig`(注册 `createPinia()` 插件)后、`app.mount()` 前调用,将 SSR state 注入客户端 pinia 实例
- **零侵入**:Pinia 本身仍从 `pinia` 包导入,`@ubean/pinia` 仅提供集成胶水和 SSR 水合辅助
- **安全降级**:未检测到 `$pinia` 时序列化返回空对象;`state` 为 null 或不含 `pinia` 字段时水合 no-op

## 5. 延后能力

| 能力                                                 | 决策                                | 原因                                                                           |
| ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Partial Prerendering                                 | 暂缓                                | 需先验证 loader 失效、streams、Suspense 错误边界、缓存与 hydration 语义        |
| 通用 Remote Functions/RPC                            | 暂缓                                | OpenAPI client 与 Pages action 已覆盖主要需求，避免并行鉴权/缓存模型           |
| PWA / Service Worker                                 | ✅ `@ubean/pwa` 已提供 opt-in 扩展  | 仅提供版本化 asset manifest、注册入口和显式 cache strategy；不默认缓存业务数据 |
| 认证 (Auth)                                          | ✅ `@ubean/auth` 已提供 opt-in 扩展 | Better Auth 集成 + 内置fallback，支持email/password与社交登录                  |
| 状态管理 (Pinia)                                     | ✅ `@ubean/pinia` 已提供 opt-in 扩展 | dev 预构建优化 + SSR 状态水合辅助;Pinia 本身由用户直接安装                     |
| 内容浏览器 SQLite、全文搜索、远程 Git source、Studio | 后续扩展                            | 初版优先保证 collection、类型查询、renderer 与静态 dump 的稳定性               |

## 6. 验收要求

- 页面数据协议：SSR hydration、导航复用、精确 invalidate、defer 流、buffered fallback、取消和错误边界的浏览器端到端 fixture。
- 可观测性：trace/request ID 跨 `internalFetch` 与队列传播，错误脱敏和 exporter adapter 单元测试。
- SEO/OG：layout/page/frontmatter 合并、tag 去重、robots/sitemap/OG handler 的 snapshot 与安全测试。
- Image/Fonts/Icon：Node SSR、SSG、Cloudflare 实验 preset 与组件测试均不得有未声明网络请求；分别验证远程 allowlist、字体自托管、SVG 消毒和 bundle size 限制。
- Content：schema 反例、AST/renderer、dump 完整性、索引查询与 raw HTML/组件 allowlist 安全测试。
