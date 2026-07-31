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
| PPR / Server Islands | ✅ 稳定 | ❌ | ❌ | ❌ | ✅ `server:defer` | ✅ P9-04(`routeRules.ppr` + `server:defer` 指令 → `<Suspense>`) |
| Server Components | ✅ RSC | ✅ | ❌ | ❌ | ❌(Islands) | ❌ |
| Server Actions | ✅ | ❌ | ✅ form actions | ✅ | ✅ Actions | ✅ P9-02(defineAction + 'use server' + form actions) |
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
| **Partial Prerendering** | Next.js 16 已稳定（静态壳 + Suspense 流式动态）；Astro 5 `server:defer` Server Islands | ✅ P9-04(`routeRules.ppr: true` 隐含 `prerender` + 强制流式 SSR;`server:defer` 指令编译时包裹 `<Suspense>` + 提取 `#fallback`) | 已具备 |
| **ISR** | Next.js 内置；Nuxt `routeRules: { swr: 600 }`；Astro 5 实验 | ✅ P9-03(`routeRules.isr` + SWR,`peek` 保留过期项) | 已具备 |
| **per-route 渲染规则** | Nuxt `routeRules` 可 per-route 切换 SSR/SSG/ISR/CSR + cors/headers；Astro `export const prerender = false` | ✅ P9-03(`routeRules.ssr`/`prerender`/`isr`,覆盖全局 `ssr.exclude`) | 已具备 |
| **Server Components** | Next.js RSC 默认；Nuxt `<ServerComponent>` | ❌ | 设计差异（Vue 生态） |
| **Hydration 错误恢复** | Next/Nuxt 有详细错误边界 + 流式 fallback | ✅ `error.vue` | 已具备 |

ubean 渲染层差距已基本补齐:流式 SSR(P9-01)、ISR + per-route 渲染规则(P9-03)、PPR/Server Islands(P9-04)均已落地,P0 战略级渲染与变更层能力对齐完成。

### 2.2 数据获取与变更

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **Server Actions / Form Actions** | Next.js `"use server"`；SvelteKit `actions`；SolidStart `action()`；Astro `defineAction` | ✅ P9-02(`defineAction` + `'use server'` + SvelteKit 风格 `?/name` 表单 action) |
| **`useFetch`/`useAsyncData` 等价** | Nuxt 全套（dedupe/refresh/payload/CSP）；SvelteKit `load` 函数 | ⚠️ `useData`/`useAsyncData` 较薄 |
| **`defer()` 流式非关键数据** | Next.js Suspense + `defer`；SvelteKit 流式 promise | ❌ |
| **单飞变更 (Single-flight mutations)** | SolidStart 独有，避免变更后瀑布 | ❌ |
| **请求 memoization** | Next.js 自动 fetch memoization | ❌ |
| **Payload 提取（SSG）** | Nuxt 自动提取 `__NUXT_DATA__` | ⚠️ `__UBEAN_STATE__` 但无 SSG payload 提取 |
| **Hooks (handle/handleFetch/handleError)** | SvelteKit 全局 hooks；Nuxt server plugins | ✅ `defineServer({ globalHooks })` |
| **`after()` 响应后执行** | Next.js 16 `after()` 用于日志/分析/缓存失效不阻塞 TTFB | ❌ |

ubean 选择 `useData`/`depends`/`invalidate` 路线（TBD-10），并已通过 P9-02 补齐 **Server Actions** 范式（`defineAction` + `'use server'` 指令 + SvelteKit 风格 `?/name` 表单 action），对齐 Next/SvelteKit/Solid/Astro 共同趋势。

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
| **组件级缓存指令** | Next.js `"use cache"` + `cacheLife()`/`cacheTag()`/`updateTag()` | ✅ P9-08(`"use cache"` 指令 + `cacheLife()`/`cacheTag()` 宏 + `wrapWithCache()` + Vite 插件 AST 转换) |
| **fetch 自动 memo + 缓存** | Next.js Data Cache + revalidateTag/revalidatePath | ❌ |
| **per-route 缓存规则** | Nuxt `routeRules.cache`；Astro `routeRules` | ✅ `resolveRouteCacheRules` + `routeRules.cache`(P9-03 增强) |
| **SWR** | Nuxt `swr: 600`；Astro `swr` | ✅ CacheRule.swr + ISR SWR(P9-03,`peek` 保留过期项) |
| **标签化失效** | Next.js `cacheTag`/`updateTag`；Astro tags | ✅ P9-08(`revalidateTag(tag)`/`revalidateTags(...)`/`revalidatePath(pattern)` 组件级缓存标签失效) |
| **cachedEventHandler** | Nuxt `defineCachedEventHandler`/`defineCachedFunction` | ✅ |
| **CDN/Edge 缓存集成** | Next Full Route Cache；Astro adapter providers | ❌ |

### 2.5 SEO 文件约定

| 能力 | 各框架情况 | ubean |
|---|---|---|
| **`sitemap.ts` 文件约定** | Next.js `app/sitemap.ts` 自动生成 `/sitemap.xml` | ✅ P9-05(`src/sitemap.ts` → `registerSeoConventions` 自动注册 GET `/sitemap.xml`) |
| **`robots.ts` 文件约定** | Next.js `app/robots.ts` | ✅ P9-05(`src/robots.ts` → GET `/robots.txt`) |
| **`manifest.ts` 文件约定** | Next.js `app/manifest.ts` | ✅ P9-05(`src/manifest.ts` → GET `/manifest.webmanifest`) |
| **`opengraph-image.tsx` 动态生成** | Next.js `ImageResponse`；SvelteKit `@vercel/og` | ✅ P9-05(约定文件)+ P9-06(`@ubean/seo/og-image`:`ImageResponse` 类 + `renderOgImage`/`renderArticleOgImage` + `defaultTemplate`/`articleTemplate` + 字体加载辅助;`satori`/`@resvg/resvg-js` 为 optional peer 依赖) |
| **`icon.tsx`/`apple-icon.tsx`** | Next.js 动态图标 | ✅ P9-05(`src/icon.ts`/`src/apple-icon.ts` → GET `/icon`/`/apple-icon`) |
| **`metadata`/`generateMetadata`** | Next.js Metadata API（自动 dedupe + 流式） | ⚠️ `useSeoMeta`/`definePage({head})` 无自动 dedupe |
| **流式 metadata** | Next.js 流式 metadata（爬虫禁用） | ❌ |
| **JSON-LD / Schema.org** | Nuxt `nuxt-schema.org`；Astro 手动 | ✅ P9-07(`@ubean/seo/json-ld`:`defineJsonLd`/`useSchemaOrg`/`renderJsonLdScript` + `schemaOrg.{organization,website,article,breadcrumb,product}` 工厂) |

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

#### 2. ✅ Server Actions / Form Actions (P9-02 已完成)
- **现状**:`@ubean/actions` 包提供 `defineAction`(支持 schema 验证)+ `fail()`/`ActionError` 错误模型 + 全局注册表 + 稳定 action ID(`base32(sha1(filePath:exportName))`)+ `/__actions` RPC 中间件 + SvelteKit 风格 `?/<name>` 表单 action(页面模块 `export const actions` map,渐进增强)+ 客户端 `useAction`/`useFormAction`/`callAction` + `'use server'` 指令 Vite 插件(server 端 `defineAction` 包裹,client 端 RPC stub 替换)
- **竞品**:Next.js `"use server"`、SvelteKit `actions`、SolidStart `action()`、Astro `defineAction`
- **任务**:P9-02 ✅

#### 3. ✅ ISR + per-route 渲染规则 (P9-03 已完成)
- **现状**:`RouteRule` 扩展 `ssr`/`prerender`/`isr` per-route 字段;`route-rules` 中间件按规则+路径特异性排序并通过 `c.get('routeRule')` 暴露;router 按每路由 `ssr` 覆盖全局设置(`false`/`true`/`'streaming'`);GET 请求走 ISR(TTL + SWR,`peek` 保留过期条目供 stale 回源);`prerender` 自动从 `routeRules` 发现 `prerender: true` 路由
- **竞品**:Next.js ISR、Nuxt `routeRules: { swr: 600 }`、Astro SWR
- **任务**:P9-03 ✅

#### 4. ✅ Partial Prerendering / Server Islands
- **现状**:`RouteRule` 扩展 `ppr: true` 字段(隐含 `prerender: true` + 强制流式 SSR,等价 `ssr: 'streaming'`);`route-rules` 中间件匹配 `ppr` 字段;router 对 PPR 路由强制流式输出并附加 `X-PPR: true` 响应头;`prerender` 自动发现 `ppr: true` 路由生成静态壳;`@ubean/islands` Vite 插件新增 `server:defer` 指令转换:编译时将组件包裹在 `<Suspense>` 中,提取 `#fallback` 插槽为 Suspense fallback(无 fallback 时注入 `<ubean-defer-fallback>` 占位);预渲染时仅渲染 fallback(静态壳),流式 SSR 时通过 Suspense 边界流式输出异步组件解析后的内容
- **竞品**:Next.js 16 PPR 稳定、Astro 5 `server:defer`
- **任务**:P9-04 ✅

### P1 重要缺失（影响对齐度）

#### 5. ✅ 文件约定 SEO（`sitemap.ts`/`robots.ts`/`opengraph-image.tsx`）
- **现状**:`@ubean/seo/conventions` 提供 `SEO_CONVENTIONS` 描述符表 + `registerSeoConventions(app,{srcDir})` 运行时扫描器,自动为 `src/sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.ts`/`icon.ts`/`apple-icon.ts` 注册 GET 路由;sitemap/robots/manifest 用 `create*Response` 包装,图像类约定 handler 直接返回 `Response`;`enabled`/`disabled` 过滤 + 多扩展名候选(`.ts/.js/.mjs/.mts/.cjs`)
- **竞品**:Next.js 完整文件约定
- **任务**:P9-05 ✅

#### 6. ✅ OG Image 动态生成 (P9-06 已完成)
- **现状**:`@ubean/seo/og-image` 提供 `ImageResponse` 类(对齐 Next.js,用 `ReadableStream` 实现懒渲染,可同步 `return new ImageResponse(node, { fonts })`) + `renderOgImage(input, options)`/`renderArticleOgImage(input, options)` 一步到位渲染 + `renderToImage(node, options)` 底层渲染(返回 `{ body, contentType }`) + `defaultTemplate(input)`/`articleTemplate(input)` 内置 Satori VDOM 模板(渐变背景/标题自适应字号/可选描述/站点名/logo/作者日期) + `shadeColor(hex, percent)` 颜色调亮/调暗 + `loadDefaultFont()`/`loadFontFromUrl()`/`loadFontFromFile()` 字体加载辅助 + `isOgImageSupported()` 能力检测;`satori`/`@resvg/resvg-js` 为 optional peer 依赖,运行时动态 `import()` 加载,未安装时抛出友好引导错误
- **竞品**:Next.js `ImageResponse`(基于 Satori + resvg)、SvelteKit `@vercel/og`、Astro `astro-og-image`
- **任务**:P9-06 ✅

#### 7. ✅ JSON-LD / Schema.org 结构化数据 (P9-07 已完成)
- **现状**:`@ubean/seo/json-ld` 提供 `defineJsonLd(schema)` 纯函数定义 + `useSchemaOrg(schema)` Vue composable(通过 `globalThis.__UBEAN_HEAD__` 注入 head) + `renderJsonLdScript(schema)`/`renderJsonLdScripts(schemas)` 序列化为 `<script type="application/ld+json">` 标签(自动转义 `<`/`>`/U+2028/U+2029 防注入) + `mergeJsonLd(schemas)` 合并为 `@graph` 数组 + `schemaOrg.{organization,website,article,breadcrumb,product}` 工厂函数
- **竞品**:Nuxt `nuxt-schema.org`(基于 `schema-dts` 类型);Astro 手动注入
- **任务**:P9-07 ✅

#### 8. ✅ 组件级缓存指令（`"use cache"`/`cacheLife`/`cacheTag`）
- **现状**：`@ubean/server/cache-directive` 提供 `cacheLife(seconds)`/`cacheTag(...tags)` 宏(通过 `AsyncLocalStorage` 传递作用域) + `wrapWithCache(fn,options)` 缓存包装器 + `revalidateTag(tag)`/`revalidateTags(...)`/`revalidatePath(pattern)` 失效 API + 独立 `ComponentCacheStore`(存储 JSON 可序列化值,带标签反向索引);`@ubean/server/vite` 的 `ubeanCacheDirectivePlugin()` Vite 插件检测 `"use cache"` 指令并 AST 转换为 `wrapWithCache()` 调用;已集成到 `ubean/vite` 默认插件组合
- **竞品**：Next.js 16 `"use cache"` + `cacheLife()`/`cacheTag()`/`revalidateTag()`
- **任务**：P9-08 ✅

#### 9. ✅ SvelteKit 式全局 Hooks（`handle`/`handleFetch`/`handleError`）
- **现状**：`@ubean/app/hooks` 提供三个全局 hook:`handle`(包裹每个请求,覆盖所有路由 + 静态资源 + 404 + 错误响应)、`handleFetch`(拦截服务端 `internalFetch`/`createInternalAdapter` 调用,可修改请求头/URL/注入认证)、`handleError`(未捕获错误的统一处理入口,用于日志/上报);通过 `defineServer({ globalHooks })` 注册,`mergeServerConfigs` 自动合并 shared + mode-specific hooks;`applyHandleHook` 在中间件链最前注册,无 hook 时零开销降级为正常 `next()`;30 单元 + 集成测试
- **竞品**：SvelteKit `hooks.server.ts` / Nuxt server plugins / Astro middleware
- **任务**：P9-09 ✅

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
3. **Server Actions**（P0，✅ 已完成 P9-02）—— `defineAction` + `'use server'`
4. **PPR / Server Islands**（P0，✅ 已完成 P9-04，依赖 1+3）—— `routeRules.ppr` + `server:defer` → `<Suspense>`
5. **文件约定 SEO**（P1）—— sitemap.ts/robots.ts/opengraph-image
6. **OG Image 生成**（P1）—— Satori 集成
7. **JSON-LD/Schema.org**（P1）
8. **平台预设补全**（P1，P5-06）
9. **CSRF + 安全头**（P2）
10. **Sessions API + after()**（P2）

ubean 的架构（Hono + Vite-Plus + 模块系统）足以支撑上述补全。P0 渲染层与变更层（流式 SSR、ISR、per-route 规则、Server Actions、PPR）已全部落地，Vue 元框架追赶 Next.js 16 的核心能力对齐完成，后续聚焦 P1/P2 的 SEO、缓存、安全与平台预设补全。

---

## 六、复核机制

- 每当竞品发布大版本（Next.js 17、Nuxt 5、Astro 7、SvelteKit 3、SolidStart 2）时，更新本文档对应小节
- ubean 完成 Phase 9 任务后，在 [roadmap.md](roadmap.md) 标记 ✅ 并同步更新本表格状态列
- 新增的差异化能力（ubean 独有）应补入第四节
