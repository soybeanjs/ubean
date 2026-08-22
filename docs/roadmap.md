# 路线图 · 2026 Q4 – 2027 H1

> 开发任务型。口径见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)。公开选型对比见站点 [框架对比](../apps/docs/src/content/zh/architecture/framework-comparison.md)，**不含**本文件的任务 ID。
>
> 评估基线：2026-08-21。CodeGraph `codegraph status`：645 files / 6540 nodes / 24806 edges。i18n 已按 ADR-0009 落地，本周期不回头再造引擎。

## 1. 北极星（写死）

| 对标 | 学什么 | 明确不学 |
| --- | --- | --- |
| Next.js 16 | 流式 SSR、缓存层次、Server Actions、每路由渲染规则 | React Server Components |
| Nuxt 4 | 文件约定、模块、i18n、`routeRules` 作为一等配置 | Nitro 20+ 预设清单、再造 `@nuxtjs/i18n` |
| Astro 5/6 | Islands / 内容站的部分水合语义 | 多 UI 运行时 |
| TanStack Start | 类型安全 server function、select SSR、可见的服务端边界 | React Query 默认数据层 |
| Analog | 元框架切口（Vite + 服务端函数），不是产品面 | Angular |

权重：**架构健康 40% / 用户可见缺口 35% / 性能 25%**。前一季还债，后一季才堆新原语。

「值得做」=（用户习惯缺口 **或** 架构还债）**且**（性能 **或** 差异化）。单独「竞品有」→ 刻意不做 / 暂缓。

## 2. 架构评估（对照源码，不对照营销表）

请求链（`packages/app/src/app.ts` → `registerRoutes` → `packages/routes/src/router.ts` → `packages/client/src/ssr.ts`）：`handle` hook → requestId → i18n ALS → routeRules+cache → WS → static → 路由 → SSR。这条链是健康的：Hono 一等、页面与 API 同进程、中间件由工厂挂载。

真正的风险不在「功能清单缺一项」，而在**声明的能力宽于默认路径**。Q4/H1 已收口的不要再当未做债：

| 现象 | 现状 |
| --- | --- |
| 24 包 + 聚合器 | 卫生合并完成（Wave 1+2）；`@ubean/vue` 保持独立 |
| 单份 SSR runtime | `ssrSingletonDevPolicy` / `ssrSingletonProdSsr` 共用 |
| `routeRules.rewrite` / `proxy` | 已执行（内部再匹配 / 反向代理） |
| `ppr: true` | 强制流式别名，不是 Next 静态壳 |
| CSRF / security headers / Data Cache | 默认挂载；sessions 仍 opt-in |
| ISR 缓存 | Node 生产 `fs`（`.ubean/cache`）；serverless/edge 仍内存 |
| i18n 消息编译 | 按 locale fingerprint 缓存；不池化 Vue app |
| Islands `data-hydrated` | 已跳过；SPA 导航无 pending 岛时跳过第二帧 rAF（首次 mount 仍强制双 rAF） |
| DB / Queue / Storage 默认内存 | 仍宽于预设能力矩阵；CF / Vercel / Bun sqlite / Deno KV / Netlify Blobs 有非内存示例 |
| SEO `src/sitemap.ts` 等约定 | `registerSeoConventions` 由 `createUbeanApp` 默认调用 |
| 生产 `/_ipx` | `image: true` 时生产 server-entry 挂同一处理器 |
| 生产 `src/crons` | 生产 eager glob；Node/bun/deno 启动 `startCronScheduler`，serverless 不装进程内调度器 |

**结论：** 能力面已经够宽（SSR/SSG/ISR/Actions/Islands/`.server.vue`/i18n/OpenAPI/presets）。2026 Q4 的工作是把「类型里有」收成「默认路径真的做」——这同时服务架构健康（40%）和性能（25%），用户可见缺口（35%）放到 2027 H1。

## 3. 竞品对照（官方文档，2026-08）

| 维度 | Next 16 | Nuxt 4 | SvelteKit 2 | SolidStart | Astro 5/6 | TanStack Start | Analog 2.7 | ubean 诚实状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI | React 19 | Vue 3 | Svelte 5 | Solid | 多框架 | React（Router 一等） | Angular | Vue 3 only |
| 构建 | Turbopack | Vite | Vite | Vite / Nitro 系 | Vite | Vite / Rsbuild | Vite + Nitro | Vite |
| HTTP | 自有 runtime | Nitro | 适配器 / Hono 可选 | Nitro | 适配器 | Start server | Nitro | Hono 原生 |
| 流式 SSR | ✅ | ✅（实验可关） | ✅ | ✅ | ✅ | ✅ | ⚠️ 2.7 实验 | ✅ |
| 每路由 SSR | 部分 | ✅ routeRules | `+page.server` / adapters | 部分 | ✅ | ✅ `ssr` / `data-only` | route rules | ✅ `ssr`/`exclude`/`data-only`；rewrite/proxy 已执行 |
| ISR / SWR | ✅ | ✅ | ⚠️ 适配器 | ⚠️ | ✅ | ⚠️ | ⚠️ Nitro | ⚠️ 规则在；**Node 生产 fs**；serverless 仍内存 |
| PPR / 静态壳 | ✅ | ❌ | ❌ | ❌ | Server Islands | ❌ | ❌ | ⚠️ **名称为 PPR，实为强制流式** |
| Server Components | RSC | `.server.vue` | ❌ | ❌ | ❌ | ❌（server functions） | ❌ | ✅ `.server.vue`（非 RSC） |
| Actions / 服务端函数 | Server Actions | ❌ 一等 | form actions | server fn | actions | **`createServerFn` 类型一等** | 2.7 Server Functions | ✅ `defineAction` / `defineServerFn` + `?/<name>`；同一 `POST /__actions` |
| 数据层 | fetch cache / `'use cache'` | `useAsyncData` / `useFetch` | `load` | query 生态 | 内容集合 | Router loaders + server fn | `load` | `useData` / `useAsyncData` / `useFetch` / `defer`；HTTP client 仍是 `@soybeanjs/fetch` |
| Islands | ❌ | ❌ | ❌ | ❌ | ✅ 默认 | ❌ | ❌ | ✅ `v-client.*` |
| i18n | 生态 | `@nuxtjs/i18n` | 生态 | 生态 | 路由辅助 | 生态 | 生态 | ✅ 框架字段 + vue-i18n 11 |
| 内置 DB/Queue | ❌ | ⚠️ Nitro 存储 | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ **API 有，默认内存** |
| OpenAPI | ❌ | ⚠️ 模块 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ `/_openapi.json` + Scalar |
| 预设数量 | Vercel 优先 | 12+ | 6+ | 多 runtime | 4+ | 多 host | Nitro 部署 | 9（standard/node/cf/vercel/edge/netlify/bun/deno + cf-dev） |

TanStack Start 的切口不是「再做一个 loader 品牌」，而是：**调用点可见的、带校验的 server function**，以及 **select SSR（`true` / `data-only` / `false`）**。Analog 的切口是 Vite 元框架如何把 server functions 接到文件路由；产品面仍是 Angular，不搬。

## 4. 刻意不做 / 暂缓

满足「竞品有」但不满足 ADR-0010 过滤器：

| 项 | 理由 |
| --- | --- |
| React Server Components | 北极星否决。Vue 路径是 `.server.vue` + Islands，不是 RSC 语义 |
| 多 UI 运行时（React / Svelte / Solid） | 与「Vue 专属」冲突；Astro 已经做这件事 |
| 再造 i18n 引擎 / `petite-vue-i18n` / Legacy | ADR-0009 |
| 把 TanStack Query 做成默认数据层 | 切口是类型安全 RPC，不是再绑一个 query 库 |
| Analog / Angular 运行时 | 只作对照 |
| 追 Nitro「20+ 预设」数字 | 预设要能跑，不要清单竞赛 |
| 自研 HTTP 客户端 | 继续 `@soybeanjs/fetch` |
| 把 studio 排进本路线图 | studio 独立私有仓；开源侧只留开口 |
| Nuxt 式客户端 `middleware/*.global` 文件约定（RM-U03） | `defineApp({ router: { setup } })` 已覆盖导航守卫；服务端中间件仍是 `src/middleware` |

## 5. 值得做（已过过滤器）

每条都标了门槛位。Q4 还债（D01–D08）已落地。H1：U01/U02/U04–U08 ✅；**U03 刻意不做**（见下表）。

### 5.1 2026 Q4 · 还债（架构 40% 优先）

| ID | 任务 | 门槛 | 完成定义 |
| --- | --- | --- | --- |
| **RM-D01** ✅ | 单份 runtime 策略：`ssrSingletonDevPolicy` / `ssrSingletonProdSsr` 供 Vite 与 production 共用 | 架构还债 + 性能 | 开发与生产对「必须单例的包」同一策略 |
| **RM-D02** ✅ | 接线 `routeRules.rewrite`：`dispatch` 内部再匹配 | 用户习惯缺口 + 架构还债 | 中间件 + 单测 + 生产模板注入 `routeRules` |
| **RM-D03** ✅ | 接线 `routeRules.proxy`：反向代理 + hop-by-hop 头过滤 | 架构还债 | 类型、merge、运行时一致 |
| **RM-D04** ✅ | PPR 名实：`ppr` 明确为流式别名；`X-SSR-Mode` / `X-PPR: streaming` | 架构还债 + 差异化 | 不再暗示 Next 静态壳 |
| **RM-D05** ✅ | 默认 CSRF（origin）+ security headers；`csrf: false` / `security: false` opt-out | 用户习惯缺口 + 差异化 | 注册断言覆盖默认挂载 |
| **RM-D06** ✅ | `dataCache` 默认挂载（仍需 `fetch(..., { next })` 才缓存） | 用户习惯缺口 + 性能 | 一键 `dataCache: false` 关闭 |
| **RM-D07** ✅ | `createFsCacheStore` / `createStorageCacheStore`；默认仍是内存 | 架构还债 + 性能 | `cache: { store: 'fs', dir }` |
| **RM-D08** ✅ | `/_ipx` 开发态读本地文件；无变换库时 `X-IPX-Mode: passthrough`，远程仍 302 | 架构还债 | 不再静默 302 到原图路径 |

### 5.2 2027 H1 · 用户可见缺口

| ID | 任务 | 门槛 | 完成定义 |
| --- | --- | --- | --- |
| **RM-U01** ✅ | 类型安全 server function 切口（学 Start 的 `createServerFn` 边界，复用 `defineAction` ID 机制）：从组件/loader 调用，带 Standard Schema，禁止再发明第二套 RPC | 用户习惯缺口 + 差异化 | `defineServerFn` = `defineAction`；`invokeServerFn`；同一 `POST /__actions`；`describeActionsOpenApi()` 可选暴露 |
| **RM-U02** ✅ | `useFetch` 级 DX：对 `useAsyncData` + `@soybeanjs/fetch` 做约定封装（key、SSR payload、refresh），不自研 client | 用户习惯缺口 + 差异化 | `useFetch` + `setDefaultFetch`；无 client 时 fallback 原生 `fetch`+JSON |
| **RM-U03** 刻意不做 | Vue 导航中间件文件约定（对齐 Nuxt `middleware/*.global` 的**客户端**一半） | — | 现有 `defineApp({ router: { setup } })` 已能挂 `beforeEach` / `beforeResolve` / `afterEach`；服务端仍用 `src/middleware`。不再做第二套文件约定 |
| **RM-U04** ✅ | select SSR：`routeRules` / 页面级 `ssr: false \| 'data-only' \| true` | 用户习惯缺口 + 性能 | `false` 跳过 loader；`'data-only'` 跑 loader + CSR shell；glob exclude 仍跑 loader |
| **RM-U05** ✅ | 平台驱动补齐：Queue / DB 在 Cloudflare、Vercel 上各有一条**非内存**示例 | 用户习惯缺口 | `@ubean/server/drivers` + `examples/platform-drivers/` |
| **RM-U06** ✅ | SSR 实例成本：locale 消息编译缓存；Islands 水合跳过已 `data-hydrated` 的岛 | 性能 | **不**池化带状态的 Vue app / `app.use(i18n)` 实例 |
| **RM-U07** ✅ | 客户端 JS 预算：`ubean analyze` 读 Vite client manifest，写 `.ubean/bundle-baseline.json` | 性能 + 差异化 | contributing 写清命令与基线文件；禁止无数字的「更轻」 |
| **RM-U08** ✅ | 内容集合与 Markdown 页：`@ubean/content` 接到文件路由 / 预渲染发现 | 用户习惯缺口 + 差异化 | `extractContentPageRoutes` / `discoverContentPageRoutes`；catch-all `pages/blog/[...slug].vue` |

### 5.3 开源侧给 studio 的开口（不排 studio 里程碑）

studio 在独立私有仓。本路线图只承认两条开源契约：

| ID | 开口 | 说明 |
| --- | --- | --- |
| **RM-S01** ✅ | 稳定脚手架 CLI / `ubean/scaffold`：`page` / `api` / `layout` / `middleware` 的机器可读描述（JSON schema 或现有 CLI 的结构化输出） | studio 私有仓调用，不在本仓做 GUI |
| **RM-S02** ✅ | `.ubean/` 生成物契约（`routes.d.ts`、i18n types）保持可被外部 IDE 插件消费 | 不在本仓实现 studio |

生产默认存储、content `queryCollection` 生产接线、Actions 并进 `/_openapi.json`、以及 `ubean analyze --out` 的 committed gzip 基线（`examples/ubean-test/benchmarks/`）已随 RM-S01/S02 一起落地。

## 6. 不做的伪缺口（避免 Q4 被带偏）

- 「把 28 包合成 5 个」——blast radius 过大；卫生包已并入 shared/config/build，不合并 `@ubean/vue`。
- 「默认挂 sessions」——有状态、cookie 密钥，opt-in 正确；只默认 CSRF/headers（RM-D05）。
- 「Next `after()` 再包一层」——已经有 `after()`。
- 「i18n 再加 custom paths / differentDomains」——ADR-0009 明确不做。

## 7. 验收

1. Q4 结束：公开 `framework-comparison.md` 的 ubean 列与源码一致（rewrite/PPR/IPX/内存存储不再满格）。
2. Q4 结束：RM-D01–D08 中至少 D01、D02、D04、D05 合并；其余可顺延但不得重新打满营销 ✅。
3. H1：RM-U01 + U02 数据层切口与 select SSR（U04）已落地；U03 不另做客户端文件中间件。
4. 全程：CodeGraph `impact` 对 `createUbeanApp` / `registerRoutes` / `ubeanPlugin` 在相关 PR 留下证据；不把任务人天写进文档。
