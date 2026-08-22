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

请求链（`packages/app/src/app.ts` → `registerRoutes` → `packages/routes/src/router.ts` → `packages/ssr/src/index.ts`）：`handle` hook → requestId → i18n ALS → routeRules+cache → WS → static → 路由 → SSR。这条链是健康的：Hono 一等、页面与 API 同进程、中间件由工厂挂载。

真正的风险不在「功能清单缺一项」，而在**声明的能力宽于默认路径**：

| 现象 | 证据 | 为什么是债 |
| --- | --- | --- |
| 33 包 + 聚合器 barrel | `packages/*`；主包 `ubean` re-export | Vite client / SSR 双图；i18n 已踩过 ALS 双模块与客户端 runtime 双份 |
| `ssr.external` vs 生产 `ssr.noExternal: ['ubean']` | `packages/vite/src/plugin.ts` vs `packages/builder/src/production.ts` | 开发态为修 ALS 把 `@ubean/i18n` external；生产把 `ubean` 打进 bundle。规则未抽象成「单份 runtime」策略 |
| `@ubean/vue` vs `@ubean/client` 内核分裂 | vue 零 i18n（正确）；client 持有 unhead / i18n / 数据层 | 独立 SPA 路径与全栈路径的契约要写死，避免再从 vue 拉 i18n |
| `routeRules.rewrite` 只合并不执行 | `packages/routes/src/route-rules.ts` 写入 `matched.rewrite`；全仓无消费方 | 类型与文档像 Nuxt，运行时像没做 |
| `routeRules.proxy` 仅类型 | `packages/shared/src/types.ts` 有字段；无 merge、无执行 | 比 rewrite 更空 |
| `ppr: true` ≠ Next PPR | `router.ts`：强制 `ssr: 'streaming'` + `X-PPR` + prerender 发现 | 没有独立静态壳 / 动态洞。名称超卖 |
| CSRF / sessions / Data Cache 不在默认链 | `createUbeanApp` 未挂；API 在 `@ubean/server` | 「内置安全」要用户自己接线才算有 |
| DB / Queue / Storage 默认内存 | `@ubean/server` 连接器 | 预设声称 CF KV / Deno Queue，应用默认仍是进程内存 |
| ISR 默认进程内存 | `CacheStore` 默认 | 多实例 / serverless 下 HIT 不可跨请求 |
| 图片 `/_ipx` 开发态 302 原图 | `packages/image/src/vite.ts` | 不能当「多 provider 图片优化」卖 |
| 每请求新建 SSR Vue app + i18n | `packages/ssr/src/index.ts`；i18n `createUbeanI18n` | 正确隔离，但缺消息编译缓存 / 实例池的上限策略 |
| Islands 双 rAF + `afterEach` 再水合 | `@ubean/client` / islands | SPA 导航成本固定，未做路由级跳过 |

**结论：** 能力面已经够宽（SSR/SSG/ISR/Actions/Islands/`.server.vue`/i18n/OpenAPI/presets）。2026 Q4 的工作是把「类型里有」收成「默认路径真的做」——这同时服务架构健康（40%）和性能（25%），用户可见缺口（35%）放到 2027 H1。

## 3. 竞品对照（官方文档，2026-08）

| 维度 | Next 16 | Nuxt 4 | SvelteKit 2 | SolidStart | Astro 5/6 | TanStack Start | Analog 2.7 | ubean 诚实状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI | React 19 | Vue 3 | Svelte 5 | Solid | 多框架 | React（Router 一等） | Angular | Vue 3 only |
| 构建 | Turbopack | Vite | Vite | Vite / Nitro 系 | Vite | Vite / Rsbuild | Vite + Nitro | Vite |
| HTTP | 自有 runtime | Nitro | 适配器 / Hono 可选 | Nitro | 适配器 | Start server | Nitro | Hono 原生 |
| 流式 SSR | ✅ | ✅（实验可关） | ✅ | ✅ | ✅ | ✅ | ⚠️ 2.7 实验 | ✅ |
| 每路由 SSR | 部分 | ✅ routeRules | `+page.server` / adapters | 部分 | ✅ | ✅ `ssr` / `data-only` | route rules | ✅ `ssr`/`exclude`；**rewrite 未执行** |
| ISR / SWR | ✅ | ✅ | ⚠️ 适配器 | ⚠️ | ✅ | ⚠️ | ⚠️ Nitro | ✅ 规则在；**存储默认内存** |
| PPR / 静态壳 | ✅ | ❌ | ❌ | ❌ | Server Islands | ❌ | ❌ | ⚠️ **名称为 PPR，实为强制流式** |
| Server Components | RSC | `.server.vue` | ❌ | ❌ | ❌ | ❌（server functions） | ❌ | ✅ `.server.vue`（非 RSC） |
| Actions / 服务端函数 | Server Actions | ❌ 一等 | form actions | server fn | actions | **`createServerFn` 类型一等** | 2.7 Server Functions | ✅ `defineAction` + `?/<name>` |
| 数据层 | fetch cache / `'use cache'` | `useAsyncData` / `useFetch` | `load` | query 生态 | 内容集合 | Router loaders + server fn | `load` | `useData` / `useAsyncData` / `defer`；**无 Nuxt 级 `useFetch` 默认** |
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

## 5. 值得做（已过过滤器）

每条都标了门槛位。Q4 还债（D01–D08）已落地。H1 仍为 ⬜。

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
| **RM-U01** | 类型安全 server function 切口（学 Start 的 `createServerFn` 边界，复用 `defineAction` ID 机制）：从组件/loader 调用，带 Standard Schema，禁止再发明第二套 RPC | 用户习惯缺口 + 差异化 | 一个函数既能当 Action 又能当 loader 数据源；OpenAPI 可选暴露 |
| **RM-U02** | `useFetch` 级 DX：对 `useAsyncData` + `@soybeanjs/fetch` 做约定封装（key、SSR payload、refresh），不自研 client | 用户习惯缺口 + 差异化 | 文档主路径不再「请自己接 fetch 库」 |
| **RM-U03** | Vue 导航中间件文件约定（对齐 Nuxt `middleware/*.global` 的**客户端**一半）：与现有 `src/middleware` Hono 链并存、命名不打架 | 用户习惯缺口 | `definePage({ middleware })` 与文件中间件同一注册表 |
| **RM-U04** | select SSR：`routeRules` / 页面级 `ssr: false \| 'data-only' \| true`，对齐 Start 的三种，而不是只有 exclude 列表 | 用户习惯缺口 + 性能 | 营销页可 CSR、详情页 SSR、数据页只跑 loader |
| **RM-U05** | 平台驱动补齐：Queue / DB 在 Cloudflare、Vercel 上各有一条**非内存**示例，而不是只生成 `wrangler.toml` | 用户习惯缺口 | ubean-test 或独立 example 可跑 |
| **RM-U06** | SSR 实例成本：locale 消息编译缓存 + 可选 i18n/app 池上限；Islands 水合按路由跳过已水合岛 | 性能 | 基准：重复请求同页 TTFB / 客户端导航耗时有对比数字 |
| **RM-U07** | 客户端 JS 预算：官方 `pnpm analyze`（或 Vite 现有分析入口）+ 默认 Islands 页面的基线数字写入 contributing | 性能 + 差异化 | 基线可回归，禁止无数字的「更轻」 |
| **RM-U08** | 内容集合与 Markdown 页：把 `@ubean/content` 接到文件路由 / 预渲染发现，对标 Astro content 的最小可用集 | 用户习惯缺口 + 差异化 | 文档站或 example 用同一套 content API |

### 5.3 开源侧给 studio 的开口（不排 studio 里程碑）

studio 在独立私有仓。本路线图只承认两条开源契约：

| ID | 开口 | 说明 |
| --- | --- | --- |
| **RM-S01** | 稳定脚手架 CLI / `ubean/scaffold`：`page` / `api` / `layout` / `middleware` 的机器可读描述（JSON schema 或现有 CLI 的结构化输出） | studio 私有仓调用，不在本仓做 GUI |
| **RM-S02** | `.ubean/` 生成物契约（`routes.d.ts`、i18n types）保持可被外部 IDE 插件消费 | 不在本仓实现 studio |

## 6. 不做的伪缺口（避免 Q4 被带偏）

- 「把 33 包合成 5 个」——blast radius 过大，本周期只做 **runtime 单例策略**（RM-D01），不做大爆炸合并。
- 「默认挂 sessions」——有状态、cookie 密钥，opt-in 正确；只默认 CSRF/headers（RM-D05）。
- 「Next `after()` 再包一层」——已经有 `after()`。
- 「i18n 再加 custom paths / differentDomains」——ADR-0009 明确不做。

## 7. 验收

1. Q4 结束：公开 `framework-comparison.md` 的 ubean 列与源码一致（rewrite/PPR/IPX/内存存储不再满格）。
2. Q4 结束：RM-D01–D08 中至少 D01、D02、D04、D05 合并；其余可顺延但不得重新打满营销 ✅。
3. H1：RM-U01 或 U02 至少一个落地（数据层切口），否则「对标 Start」只是空话。
4. 全程：CodeGraph `impact` 对 `createUbeanApp` / `registerRoutes` / `ubeanPlugin` 在相关 PR 留下证据；不把任务人天写进文档。
