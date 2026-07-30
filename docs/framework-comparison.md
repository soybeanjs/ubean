# 元框架对比与差距分析

> 对比对象：**Next.js 16**、**Nuxt 4**、**SvelteKit 2 (Svelte 5)**、**SolidStart 1.x**、**Astro 5/6** vs **ubean v0.1.x**
> 数据来源：各框架官方文档（截至 2026-07）+ ubean 源码
> 用途：作为 [roadmap.md](roadmap.md) Phase 9 任务规划的事实依据，定期随竞品大版本更新复核

---

## 一、总览对比矩阵

| 维度 | Next.js 16 | Nuxt 4 | SvelteKit 2 | SolidStart 1.x | Astro 5/6 | **ubean** |
|---|---|---|---|---|---|---|
| UI 框架 | React 19 | Vue 3 | Svelte 5 | Solid | 多框架 | Vue 3 |
| 构建工具 | Turbopack | Vite | Vite | Vinxi(Vite+Nitro) | Vite | Vite-Plus |
| HTTP 层 | Node/Runtime | Nitro(Hono) | Node/Hono | Nitro | Node/Hono | Hono |
| SSR 流式 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ P9-01 |
| SSG | ✅ | ✅ | ✅ | ✅ | ✅ 默认 | ✅ |
| ISR | ✅ | ✅ routeRules | ⚠️ | ⚠️ | ✅(SWR) | ✅ P9-03(routeRules.isr + SWR) |
| per-route 渲染规则 | ⚠️(部分) | ✅ routeRules | ❌ | ❌ | ✅ `export const prerender` | ✅ P9-03(routeRules.ssr/prerender/isr) |
| PPR / Server Islands | ✅ 稳定 | ❌ | ❌ | ❌ | ✅ `server:defer` | ❌ (P9-04 待办) |
| Server Components | ✅ RSC | ✅ | ❌ | ❌ | ❌(Islands) | ❌ |
| Server Actions | ✅ | ❌ | ✅ form actions | ✅ | ✅ Actions | ❌ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ P9-01 |
| Islands | ❌ | ❌ | ❌ | ❌ | ✅ 原创 | ✅ |
| 多框架 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 内置 DB | ❌ | ❌ | ❌ | ❌ | ⚠️(已弃) | ✅ db0 |
| 内置 Queue/Cron/WS | ❌ | ⚠️ 部分 | ❌ | ❌ | ❌ | ✅ |
| 内置 Auth | ❌(Auth.js) | ⚠️ | ❌ | ❌ | ❌ | ✅ Better Auth |
| 内置 i18n | ❌ | ⚠️ 模块 | ❌ | ❌ | ⚠️ 路由 | ✅ 零依赖 |
| 内置 DevTools | ⚠️ | ✅ | ❌ | ❌ | ✅ Toolbar | ✅ AI 助手 |
| 平台预设 | Vercel/Node/Edge | 12+ | 6+ | 20+ | 4+ | 2 (P5-06 待补) |

---

## 二、详细功能对比

### 2.1 渲染模式（最关键差异）

| 能力 | 各框架情况 | ubean | 差距 |
|---|---|---|---|
| **SSR 流式渲染** | Next/Nuxt/SvelteKit/Solid/Astro 全部支持 `renderToStream`/`pipe`/Suspense 流式 | ✅ P9-01(`renderToNodeStream` + `ReadableStream`,`SsrOptions.streaming`) | 已具备 |
| **Partial Prerendering** | Next.js 16 已稳定（静态壳 + Suspense 流式动态）；Astro 5 `server:defer` Server Islands | ❌ | **缺失**(P9-04 待办,依赖 P9-01 ✅) |
| **ISR** | Next.js 内置；Nuxt `routeRules: { swr: 600 }`；Astro 5 实验 | ✅ P9-03(`routeRules.isr` + SWR,`peek` 保留过期项) | 已具备 |
| **per-route 渲染规则** | Nuxt `routeRules` 可 per-route 切换 SSR/SSG/ISR/CSR + cors/headers；Astro `export const prerender = false` | ✅ P9-03(`routeRules.ssr`/`prerender`/`isr`,覆盖全局 `ssr.exclude`) | 已具备 |
| **Server Components** | Next.js RSC 默认；Nuxt `<ServerComponent>` | ❌ | 设计差异（Vue 生态） |
| **Hydration 错误恢复** | Next/Nuxt 有详细错误边界 + 流式 fallback | ✅ `error.vue` | 已具备 |

ubean 渲染层差距已大幅缩小:流式 SSR(P9-01)、ISR + per-route 渲染规则(P9-03)均已落地。剩余的 PPR/Server Islands(P9-04)是唯一未补齐的渲染层能力,且其前置依赖(流式 SSR)已具备。

### 2.2 数据获取与变更

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **Server Actions / Form Actions** | Next.js `"use server"`；SvelteKit `actions`；SolidStart `action()`；Astro `defineAction` | ❌ 无 |
| **`useFetch`/`useAsyncData` 等价** | Nuxt 全套（dedupe/refresh/payload/CSP）；SvelteKit `load` 函数 | ⚠️ `useData`/`useAsyncData` 较薄 |
| **`defer()` 流式非关键数据** | Next.js Suspense + `defer`；SvelteKit 流式 promise | ❌ |
| **单飞变更 (Single-flight mutations)** | SolidStart 独有，避免变更后瀑布 | ❌ |
| **请求 memoization** | Next.js 自动 fetch memoization | ❌ |
| **Payload 提取（SSG）** | Nuxt 自动提取 `__NUXT_DATA__` | ⚠️ `__UBEAN_STATE__` 但无 SSG payload 提取 |
| **Hooks (handle/handleFetch/handleError)** | SvelteKit 全局 hooks；Nuxt server plugins | ⚠️ 仅 middleware |
| **`after()` 响应后执行** | Next.js 16 `after()` 用于日志/分析/缓存失效不阻塞 TTFB | ❌ |

ubean 选择 `useData`/`depends`/`invalidate` 路线（TBD-10），但**缺少 Server Actions 这一现代范式**——这是 Next/SvelteKit/Solid/Astro 共同趋势。

### 2.3 路由

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **文件约定路由** | 全部支持 | ✅ |
| **并行路由 (Parallel Routes)** | Next.js `@folder` slots | ❌ |
| **拦截路由 (Intercepting Routes)** | Next.js `(..)` 模态路由 | ❌ |
| **Route Groups** | 全部支持 `(group)` | ✅ |
| **动态路由 + matchers** | SvelteKit matchers；其余 `[param]` | ⚠️ 无 matchers |
| **嵌套布局** | Next/Nuxt/SvelteKit 多层嵌套 | ⚠️ 单层 `layout` |
| **404/loading/error 约定文件** | Next.js `not-found.tsx`/`loading.tsx`/`error.tsx`/`global-error.tsx`；SvelteKit `+error.svelte` | ✅ `404.vue`/`loading.vue`/`error.vue` |
| **typed routes** | Nuxt/SvelteKit `$types` 自动生成 | ✅ TBD-08 |
| **View Transitions** | Next/Nuxt/Astro/SvelteKit | ✅ |

### 2.4 缓存体系

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **组件级缓存指令** | Next.js `"use cache"` + `cacheLife()`/`cacheTag()`/`updateTag()` | ❌ |
| **fetch 自动 memo + 缓存** | Next.js Data Cache + revalidateTag/revalidatePath | ❌ |
| **per-route 缓存规则** | Nuxt `routeRules.cache`；Astro `routeRules` | ✅ `resolveRouteCacheRules` + `routeRules.cache`(P9-03 增强) |
| **SWR** | Nuxt `swr: 600`；Astro `swr` | ✅ CacheRule.swr + ISR SWR(P9-03,`peek` 保留过期项) |
| **标签化失效** | Next.js `cacheTag`/`updateTag`；Astro tags | ⚠️ `invalidateRouteCache(keyPattern)` |
| **cachedEventHandler** | Nuxt `defineCachedEventHandler`/`defineCachedFunction` | ✅ |
| **CDN/Edge 缓存集成** | Next Full Route Cache；Astro adapter providers | ❌ |

### 2.5 SEO 文件约定

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **`sitemap.ts` 文件约定** | Next.js `app/sitemap.ts` 自动生成 `/sitemap.xml` | ❌ 仅 `createSitemapResponse()` 编程式 |
| **`robots.ts` 文件约定** | Next.js `app/robots.ts` | ❌ 仅 `createRobotsResponse()` |
| **`manifest.ts` 文件约定** | Next.js `app/manifest.ts` | ⚠️ `defineManifest` 但非文件约定 |
| **`opengraph-image.tsx` 动态生成** | Next.js `ImageResponse`；SvelteKit `@vercel/og` | ❌ |
| **`icon.tsx`/`apple-icon.tsx`** | Next.js 动态图标 | ❌ |
| **`metadata`/`generateMetadata`** | Next.js Metadata API（自动 dedupe + 流式） | ⚠️ `useSeoMeta`/`definePage({head})` 无自动 dedupe |
| **流式 metadata** | Next.js 流式 metadata（爬虫禁用） | ❌ |
| **JSON-LD / Schema.org** | Nuxt `nuxt-schema.org`；Astro 手动 | ❌ |

### 2.6 内容与媒体

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **Content Collections** | Astro Content Layer API（pluggable loaders, 5x 提速）；Nuxt Content | ✅ `@ubean/content` |
| **Live Collections（请求时拉取）** | Astro 5.10+ 实验，6 稳定 | ❌ |
| **MDX** | Next/Nuxt/Astro/SvelteKit 都支持 | ⚠️ 类型注册但无 MDX 编译器 |
| **Image 优化** | Next `next/image`；Nuxt `@nuxt/image`；Astro `astro:assets`；SvelteKit `enhanced-img` | ✅ `@ubean/image` 多 provider |
| **字体优化** | Next `next/font`；Nuxt `@nuxt/fonts`；Astro `astro:fonts` | ✅ `@ubean/fonts` |
| **响应式图片 srcset** | Astro 5.10 稳定；Next 自动 | ✅ |
| **远程图片域名白名单** | Next/Astro | ✅ |

### 2.7 平台部署

| 平台 | Next.js | Nuxt | SvelteKit | SolidStart | Astro | **ubean** |
|---|---|---|---|---|---|---|
| Node | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cloudflare | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vercel | ✅ 原生 | ✅ | ✅ | ✅ | ✅ | ❌ P5-06 |
| Netlify | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ P5-06 |
| Bun | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ P5-06 |
| Deno | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ❌ P5-06 |
| AWS/Azure | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ |

ubean 平台预设明显最少（仅 Node + Cloudflare），roadmap P5-06 待补。

### 2.8 安全与会话

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **CSRF 保护** | Astro 5 默认开启；Next/SvelteKit 中间件 | ❌ |
| **CSP 头生成** | Astro 6 稳定；Next.js headers | ❌ |
| **安全头（HSTS/X-Frame 等）** | Next/Nuxt/Astro 配置 | ❌ |
| **通用 Sessions API** | Astro 5.7+ `Astro.session`；SvelteKit locals | ⚠️ 仅 auth session |
| **Rate limiting** | 第三方 | ✅ |
| **CORS** | 全部 | ✅ |

### 2.9 开发者体验

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **DevTools** | Nuxt DevTools；Astro Toolbar | ✅ AI 助手 + 13 views（**最强**） |
| **CLI 脚手架** | Next create-next-app；Nuxt nuxi；Astro create-astro | ✅ 14 命令 |
| **auto-imports** | Nuxt 默认；Astro 部分 | ✅ |
| **HMR** | 全部 | ✅ |
| **Typed routes** | Nuxt/SvelteKit | ✅ |
| **Module 系统** | Nuxt Kit | ✅ |
| **OpenAPI 自动生成** | ❌ 多数无 | ✅ **独有** |
| **Drizzle Studio 集成** | ❌ | ✅ **独有** |
| **AI 助手集成** | ❌ | ✅ **独有** |

### 2.10 状态与扩展

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **Pinia SSR 水合** | Nuxt 默认 | ✅ `@ubean/pinia` |
| **Electron** | Nuxt `nuxt-electron` | ✅ `@ubean/electron` |
| **PWA** | Nuxt `@vite-pwa/nuxt`；Astro | ✅ `@ubean/pwa` |
| **WebSocket/SSE** | 第三方 | ✅ 内置 |
| **Queue/Cron** | 第三方 | ✅ 内置 |
| **Color mode (深浅色)** | Nuxt `@nuxtjs/color-mode` | ❌ 委托 @soybeanjs/ui |
| **第三方脚本优化** | Nuxt `@nuxtjs/scripts`；Astro partytown | ❌ |
| **Email 发送** | 第三方 | ❌ |
| **全文搜索** | Astro Pagefind；Nuxt | ❌ |
| **Analytics** | Vercel Analytics；Nuxt | ❌（仅 observability） |
| **A/B 测试 / Feature flags** | 第三方 | ❌ |
| **Draft mode / Preview** | Next.js `draftMode()`；Astro | ❌ |

---

## 三、ubean 功能缺失分析（按优先级）

> 任务 ID 与状态请以 [roadmap.md](roadmap.md) Phase 9 为准，本表仅作分析索引。

### P0 战略级缺失（影响核心竞争力）

#### 1. ❌ 流式 SSR (Streaming SSR)
- **现状**：[packages/ssr/src/index.ts](../packages/ssr/src/index.ts) 用 `renderToString`（L173、L187）
- **竞品**：Next/Nuxt/SvelteKit/Solid/Astro 全部支持流式
- **影响**：TTFB/LCP 劣势，长任务阻塞首字节
- **方案**：改用 `@vue/server-renderer` 的 `renderToNodeStream`/`pipeToWritable`，配合 Vue Suspense
- **任务**：P9-01

#### 2. ❌ Server Actions / Form Actions
- **现状**：仅有 `useData` fetcher 模式
- **竞品**：Next.js `"use server"`、SvelteKit `actions`、SolidStart `action()`、Astro `defineAction`
- **影响**：表单/变更逻辑需手写 API 路由，缺少渐进增强
- **方案**：实现 `defineAction` + `'use server'` 指令转换
- **任务**：P9-02

#### 3. ✅ ISR + per-route 渲染规则 (P9-03 已完成)
- **现状**:`RouteRule` 扩展 `ssr`/`prerender`/`isr` per-route 字段;`route-rules` 中间件按规则+路径特异性排序并通过 `c.get('routeRule')` 暴露;router 按每路由 `ssr` 覆盖全局设置(`false`/`true`/`'streaming'`);GET 请求走 ISR(TTL + SWR,`peek` 保留过期条目供 stale 回源);`prerender` 自动从 `routeRules` 发现 `prerender: true` 路由
- **竞品**:Next.js ISR、Nuxt `routeRules: { swr: 600 }`、Astro SWR
- **任务**:P9-03 ✅

#### 4. ❌ Partial Prerendering / Server Islands
- **现状**：无静态壳 + 动态流式
- **竞品**：Next.js 16 PPR 稳定、Astro 5 `server:defer`
- **影响**：个性化页面无法享受静态加速
- **方案**：依赖流式 SSR + Suspense 边界实现
- **任务**：P9-04（依赖 P9-01）

### P1 重要缺失（影响对齐度）

#### 5. ❌ 文件约定 SEO（`sitemap.ts`/`robots.ts`/`opengraph-image.tsx`）
- **现状**：仅编程式 `createSitemapResponse()`
- **竞品**：Next.js 完整文件约定
- **方案**：在 `src/` 增加 `sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.tsx` 约定文件扫描
- **任务**：P9-05

#### 6. ❌ OG Image 动态生成
- **竞品**：Next.js `ImageResponse`（基于 Satori + resvg）、Astro
- **方案**：集成 `@vercel/og` 或 Satori
- **任务**：P9-06

#### 7. ❌ JSON-LD / Schema.org 结构化数据
- **竞品**：Nuxt `nuxt-schema.org`
- **方案**：在 `@ubean/seo` 增加 `useSchemaOrg()`/`defineJsonLd()`
- **任务**：P9-07

#### 8. ❌ 组件级缓存指令（`"use cache"`/`cacheLife`/`cacheTag`）
- **竞品**：Next.js 16
- **方案**：宏 + AST 转换实现组件/函数级缓存标记
- **任务**：P9-08

#### 9. ❌ SvelteKit 式全局 Hooks（`handle`/`handleFetch`/`handleError`）
- **现状**：仅 middleware
- **方案**：在 `@ubean/app` 增加全局 hooks 入口
- **任务**：P9-09

#### 10. ❌ 平台预设补全（Vercel/Netlify/Bun/Deno）
- **现状**：P5-06 pending，仅 Node + Cloudflare
- **方案**：基于 Nitro 预设或自研 preset
- **任务**：P9-10（合并 P5-06）

### P2 增强级缺失（提升完整度）

| # | 缺失能力 | 任务 ID |
|---|---|---|
| 11 | 通用 Sessions API（`Astro.session` 式） | P9-11 |
| 12 | CSRF 保护中间件 | P9-12 |
| 13 | 安全头（CSP/HSTS/X-Frame-Options） | P9-13 |
| 14 | `after()` 响应后执行 API | P9-14 |
| 15 | 请求 memoization（fetch 自动去重） | P9-15 |
| 16 | Single-flight mutations | P9-16 |
| 17 | 嵌套布局（多层） | P9-17 |
| 18 | 并行路由 / 拦截路由 | P9-18 |
| 19 | Live Content Collections（请求时拉取） | P9-19 |
| 20 | MDX 真实编译（当前仅类型注册） | P9-20 |
| 21 | Color mode（深浅色） | P9-21 |
| 22 | 第三方脚本优化（Partytown 集成） | P9-22 |
| 23 | Draft / Preview mode | P9-23 |
| 24 | 流式 metadata | P9-24 |
| 25 | Email 发送 | P9-25 |
| 26 | 全文搜索（Pagefind 集成） | P9-26 |
| 27 | Analytics（页面访问统计） | P9-27 |
| 28 | A/B 测试 / Feature flags | P9-28 |

---

## 四、ubean 独有优势（不应丢失）

ubean 有若干竞品**没有**的差异化能力，是其核心竞争力：

| 优势 | 说明 |
|---|---|
| **内置全栈原语** | DB/Queue/Cron/WS/SSE/Cache 一站式，竞品均需第三方 |
| **AI 助手 DevTools** | 内置 ai-sdk 集成，13 个视图含 Drizzle Studio、Terminal |
| **OpenAPI 自动生成** | `/_openapi.json` + Scalar UI，竞品均无 |
| **零依赖 i18n** | 4 策略 + Intl + plural + linked messages，无需 vue-i18n |
| **Better Auth + fallback** | 内置认证降级方案 |
| **Islands 架构** | Vue 生态罕见的 Astro 式 `client:*` 指令 |
| **Electron 内置** | 桌面应用开箱即用 |
| **多 provider 图片优化** | ipx/cloudinary/imgix/vercel/netlify 等 10+ |
| **CLI 脚手架完整** | page/api/layout/middleware/cron/plugin 全套 |
| **Hono 原生** | 边缘运行时友好 |

---

## 五、优先级建议

**建议路线图排序**（按 ROI）：

1. **流式 SSR**（P0，解锁 PPR 前置）—— 改 `@ubean/ssr` 用 `renderToNodeStream`
2. **per-route 渲染规则 + ISR**（P0）—— 扩展 `routeRules`
3. **Server Actions**（P0）—— `defineAction` + `'use server'`
4. **PPR / Server Islands**（P0，依赖 1+3）
5. **文件约定 SEO**（P1）—— sitemap.ts/robots.ts/opengraph-image
6. **OG Image 生成**（P1）—— Satori 集成
7. **JSON-LD/Schema.org**（P1）
8. **平台预设补全**（P1，P5-06）
9. **CSRF + 安全头**（P2）
10. **Sessions API + after()**（P2）

ubean 的架构（Hono + Vite-Plus + 模块系统）足以支撑上述补全，关键缺口集中在**渲染层**与**变更层**，这是 Vue 元框架追赶 Next.js 16 的必经之路。

---

## 六、复核机制

- 每当竞品发布大版本（Next.js 17、Nuxt 5、Astro 7、SvelteKit 3、SolidStart 2）时，更新本文档对应小节
- ubean 完成 Phase 9 任务后，在 [roadmap.md](roadmap.md) 标记 ✅ 并同步更新本表格状态列
- 新增的差异化能力（ubean 独有）应补入第四节
