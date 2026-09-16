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

请求链（`packages/app/src/app.ts` → `registerRoutes` → `packages/routes/src/router.ts` → `packages/client/src/ssr.ts`）：`handle` hook → requestId → ActionContext ALS → securityHeaders → CSRF → dataCache → i18n 中间件 → routeRules+cache → WS → static → 路由 → SSR。这条链是健康的：Hono 一等、页面与 API 同进程、中间件由工厂挂载。

真正的风险不在「功能清单缺一项」，而在**声明的能力宽于默认路径**。Q4/H1 已收口的不要再当未做债：

| 现象 | 现状 |
| --- | --- |
| 24 包（含聚合器，即 23 个 `@ubean/*` + `ubean`） | 卫生合并完成（Wave 1+2）；`@ubean/vue` 保持独立 |
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
| 性能验证 | 体积预算进 CI（相对 +5% 与绝对上限并存）；生命周期基准五项指标落地但不进 CI；dev 服务端热重载曾因 watcher 路径拼接缺陷整体失效（2026-09-15 修复并补回归测试） |

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

5.4 是 5.5 的硬前置：性能基线必须在旧路径上冻结（RM-V36 收敛后旧实现删除）。

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

### 5.4 性能回归网（先于 Vite 插件化）

5.5 的两条性能主张（ADR-0012 §3：单次 builder 取代两次独立 build、reload 粒度降到文件级）与风险 R3（reload 不得劣于现状）目前都没有判据：`analyze:check` 只守体积，`benchmark-ssg.mjs` 是手动启用的构建对比、无断言，dev 冷启动 / 变更生效延迟 / 浏览器运行时完全没有度量。

基线必须在**旧路径**上冻结——RM-V36 收敛后旧实现删除，「回到旧实现测一次」将永久不可能。

**进展（2026-09-15）**：**Phase 0 全部完成**（RM-V01…V06 + RM-P01…P05）。

- **回归网**：`RM-V05`（dev 拓扑 18 个纯 HTTP 断言，旧实现上全绿）、`RM-V06`（vite-plus 实验性 API 契约 9 个断言 + 版本锁 tripwire）、`RM-P01–P05`（性能基线七项指标 + reload 正确性）。
- **地基清理**：`RM-V02`（虚拟模块注册表改为显式注入，连续两次构建产物逐字节一致）、`RM-V03`（Node↔Web 适配收拢为单模块并补往返测试）。
- **`RM-V04` env-runner spike**：结论见 [env-runner-spike.md](env-runner-spike.md) —— worker 托管、IPC、`dev.createEnvironment` 均已验证；宿主侧通道契约不足（`getBuiltins` invoke 无人应答）留待 RM-V08；Plan B 成本下调到约 100–200 行。
- **Phase 1**：`RM-V08`（`UbeanDevEnvironment` + env-runner worker）✅ —— 请求可进入 worker 线程内的 Hono app 并返回响应，worker 内 `ModuleRunner` 经 invoke bridge 取宿主模块已闭环。
- **Phase 1**：`RM-V09`（dev worker entry + 作用域化失效）✅ —— 框架生成 `.ubean/dev-worker.mjs`；文件改动后**只有命中文件及其 importer 链重新求值**，无关模块的单例保留。关键实现点：模块图按 realpath 建索引，宿主侧须用「原始路径 + realpath」两种候选键查表，再把模块 URL 发给 worker。
- **Phase 1**：`RM-V10`（`configureServer` 请求路由）✅ —— 判据 + pre/post 兜底落在 `@ubean/build` 的插件里，CLI 的 dev server 同步切到这条路径（原先「Vite 中间件 + 自己兜底 + 自己 transformIndexHtml」的分叉删除）；52 个新断言（41 判据 + 11 真 server 集成）。
- **Phase 1**：`RM-V12`（摘除 CLI server 层 + 插件自举）✅ —— CLI 不再自建 HTTP server（`viteServer.listen()` 取而代之，`httpServerBinderPlugin` 与 HMR 独立端口一并消失）；`ubeanDevRequestPlugin` 的 `handler` 变为可选，缺省时惰性自举宿主 app（首次应用请求才扫盘），`dev-request-bootstrap.test.ts` 用**无 CLI**的真 Vite server 验证页面 SSR / API / 404 组件 DOM / `_health`。文件 700+ → 462 行。
- **Phase 1**：`RM-V11`（宿主 dev app）✅ —— app 侧 bootstrap 全部落进 `@ubean/build`：`buildDevSsrRoutes()`（SSR 路由表，测试直接对照客户端产出，把「两表同形」变成可执行约束）/ `enhanceDevApp()`（route·page·middleware 加载器 + cron 预加载 + pageRenderer 接线）/ `createDevApp()` / `createDevAppReady()`（locales → 应用 `defineServer` 配置 → `init()` → `onServerReady`，幂等）/ `bootstrapDevApp()`；CLI 退化为调用，原先三个手动重置的标志位由 ready 的实例内缓存取代。新增 21 个 builder 断言 + 拓扑网 3 条 `defineServer` 时序断言（专防搬迁丢时序）。
- **Phase 1**：`RM-V13`（watcher 合一）✅ —— 三套监听（core 插件 / vue 插件 / CLI 的 `fs.watch`）合并为 `dev-scan.ts` 一个协调器：一套 `server.watcher` 监听、一次扫描（去抖 + 单飞）、一个重载顺序（订阅者全部完成后才 `full-reload`）；CLI 的 `watcher.ts` 及其回归测试删除。实测未倒退：服务端变更 p50 220ms（基线 219–222）、客户端变更 104ms（106）、冷启动 1.60s（1.69）、reload 单例保留 3/3。期间发现并修复 **R10**（框架代码在 dev 下有两个模块实例，模块级注册表会让订阅静默丢失）。
- **Phase 1 进行中**：`RM-V14`（`ubean dev` 薄别名）🟡 —— 行为等价已达成：`ubeanVite` 接管 `@vitejs/plugin-vue`（此前 `.vue` 由 CLI 代劳，导致同一份 `ubeanPlugin()` 在 `vite dev` 下报 “Install @vitejs/plugin-vue”），`experimental.viteBuilder` 打开时聚合入口追加请求路由插件，`vite dev` 独立可服务应用；插件自举的 app 会随扫描重建。集成测试覆盖 `vp dev` 的四类请求与改文件生效。剩余：把 `dev.ts` 改成调 Vite `createServer` 并删除 `vite-server.ts`/`runner.ts`（机械性收敛）。
- **Phase 1**：`RM-V14`（`ubean dev` 薄别名）✅ —— vue 插件注册归属收敛、聚合入口按开关追加请求路由插件、请求日志下沉 builder、开关路径守卫；并**删除 `vite-server.ts` 与 `runner.ts`（673 行）**，收敛为 `dev-vite.ts`（243 行）。实测未倒退：服务端变更 p50 220ms（基线 222）、冷启动 1.60s（1.69）、reload 单例保留 5/5。
- **Phase 1**：`RM-V15`（dev 全量验收）✅ —— 四层自动化：CLI 137 / example 783 / 真 dev server 4 条 / **真实浏览器交互 3 条**（页面内切语言且无整页重载、DevTools 外壳可进入、改文件后整页重载）。浏览器运行时优于基线（水合 116ms vs 155、导航 73ms vs 121）。走查中修复「CLI advertised 的 DevTools 入口 404」；已知缺口：示例缺页面级 action 表单，浏览器内表单提交未走查。**Phase 1 具备按 `experimental.viteBuilder` 灰度发布的条件**。
- **Phase 2 启动**：`RM-V16`（`buildApp` 编排）✅ —— 一次 `createBuilder` 驱 client/ubean 两个环境；`build-steps.ts` 抽出与编排无关的步骤、islands SSR 空壳与 preset entry 生成器导出共用；`build-parity.test.ts` 对照两条路径的文件清单与 manifest。**过程中发现并修复构建路径回归**：RM-V14 让 `ubeanVite` 接管 vue 插件后漏改 `production.ts`，`.vue` 被编译两次导致 `ubean build` 直接失败 —— 此前没有任何测试跑生产构建，已补 `production-build.test.ts`（实测先于修复复现）。
- **Phase 2 主体**：`RM-V17…V22` ✅ —— environment 驱动构建、资产清单内存传递（`virtual:ubean-asset-manifest` 由核心插件提供）、虚拟模块 alias 兜底删除、ssg 清理时机核对后无需改动、`ubean build` 在开关下走同一条 builder 路径、基线在正确产物上重定（32 条目 / total 111.1 KB，含 5 个岛屿 chunk）。过程中连带修复五个真缺陷：限流清理定时器不可销毁、生成入口的 teardown 导入不可解析、cron 句柄作用域错位（三者共同导致 `vite build` 挂满 13 分钟不退出）、同步配置加载器因 jiti 互操作读到默认值（内容集合页整类缺失）、`prepareBuild` 无用户 vite.config 分支漏注册 islands 插件（岛屿 chunk 全缺）。
- **Phase 2 收尾**：`RM-V23`（构建矩阵）✅ 矩阵 13 格 / 🟡 性能对照 —— mode 四格 + preset 九格（本轮补 aws / azure）+ 有/无用户 vite.config 一格全绿，每格在临时 outDir 独立构建并断言该 preset 的包装文件。build 臂原先两臂同命令且无生效证明，现改为无 CLI 的 `vp build`（不带开关时**直接硬失败**、零产物）并加产物契约断言与每臂构建前 `rm -rf dist`。**性能**：两次采集一致给出开关路径 build 墙钟 +0.35s、峰值 RSS +66–74MB；`vp` 启动比 CLI 快 0.7–1.1s，故非派发开销。**未达标**：对基线（p50 1.62s）的绝对对照未做 —— 同一 legacy 臂今日 1.93s 而宿主 load 15，需安静环境复测。顺带查实平台 preset 的 `output.*` / `runtime.entry` 声明与真实产物不符（全仓无消费者），已登记为待决项。
- **Phase 3 起步**：`RM-V24`（`configurePreviewServer` 接管）✅ —— 核心插件挂预览中间件：fullstack / backend 在进程内 import 产物 `dist/server/entry.mjs` 的 `createFetchHandler()`（不是 `server.mjs`——那会再起一个监听端口的服务器，预览的就不是产物了），静态与预渲染 HTML 交给产物内的 `serveStatic`；spa / ssg 走静态服务，解析规则与 CLI 的 `startStaticServer` 共用一份。`vp preview`（无 CLI）在示例上跑通预渲染页 / API / SSR / 404 / 资源 MIME 五类断言。**写验收断言时暴露出两个产物级缺陷**（均已修）：① `virtual:ubean-asset-manifest` 有两个提供者，核心插件那份 ref 在 CLI 路径上为空却抢先解析 → 资产标签内联为空串，**生产页面不水合、无样式**（dev 由 Vite 注入、体积门禁比体积、矩阵比清单，三条门禁都不看 HTML 内容，故长期潜伏）；② `prerender.staticDir` 默认值写死 `'dist/public'`、不跟随 `build.outputDir` → `--outDir` 下客户端产物与预渲染 HTML 落进两棵树，且矩阵各格的「清单一致」里其实没有 HTML 参与比对。修法：核心插件成为唯一提供者并加「服务端 outDir 旁的磁盘清单」兜底；`resolvePrerenderStaticDir()` 统一从实际的 `build.outputDir` 派生落盘目录。基线格新增两条**内容级**断言（产物里必须有预渲染 HTML；服务端产物必须内联入口 script），修复前均为红。
- **Phase 3**：`RM-V25`（`ubean preview`）✅ —— CLI 退化为「参数 + banner + 生命周期」，委托 `vite preview`，请求交给 RM-V24 的插件中间件；`spawnPreviewServer`/`waitForPort` 那套子进程编排删除（约 90 行）。`startStaticServer` 保留为 spa / ssg 的降级路径（fullstack / backend 无等价兜底，失败直接退出 —— 降级成静态服务会给出「看着能开、实际没渲染」的假象），并把它的解析规则改为调用 `resolvePreviewFile`、MIME 用 `previewMimeType`，与插件同源一份。项目无用户 `vite.config` 时显式注册 `ubeanPreviewPlugin()`。实测：`ubean preview` 在示例（fullstack）跑通预渲染页 / 资源 MIME / API / 404 四类断言，临时 spa 项目验证静态 + 客户端回退。
- **Phase 3 收尾**：`RM-V26`（cloudflare preview）✅ runner / 🟡 产物受阻 —— `createCloudflarePreviewRunner()` 把产物 worker 交给 miniflare 在进程内跑（可选 peer，缺失时给出安装提示），预览中间件按 preset 分流。miniflare 真机实测通过（合成 worker：派发 / POST 体 / dispose），但依赖**不进仓库**（workerd 体积大，同既有可选依赖约定），故 CI 里真机用例跳过、接线层由注入假 loader 的用例守着（7 条）。**连带撞出三个产物级问题**：① 无用户 `vite.config` + `backend` 模式构建失败（`virtual:ubean-app` 只在 `hasPages` 时注册，而服务端入口无条件 import 它；矩阵的 backend 格有配置、无配置格是 fullstack —— **交叉处从未被测过**），已修；② **cloudflare 产物在 workerd 里起不来**（模块图带 `node:fs/promises`，workerd 不支持 → 该 preset 的产物在 Cloudflare 上同样跑不起来，此前从未真正运行过；本轮把失败前移为构建期审计告警，修法需独立一笔）；③ 配置里的 `preset` 顶层字段从不被读取（实际是 `build.preset`，文档与实现不一致，登记到 RM-V32）。
- **Phase 1 起步**：`RM-V07`（environments 注册）✅ —— 新增 `experimental.viteBuilder` 灰度开关，插件侧 `config` 钩子在开关打开时注册 `client`/`ubean` 两个环境；关闭时旧路径零变更。
- 附带修复：`RM-V05` 期间发现并修复「`pages/404.vue` 存在时页面兜底按注册顺序吞掉内置 `_` 路由」；R8（dev 下 404 组件内容不 SSR）已修复——dev 的 SSR 路由表漏注册 404 catch-all，补上后组件 DOM 与 `useHead` 标题都正常产出，并已补回归断言。
- 环境坑：catalog 的 `typescript: npm:typescript-native-bridge@latest` 会让 peer 解析漂移出两份 `vite-plus-core`，表现为 `Plugin` 类型身份不一致的类型报错；遇到先 `pnpm install` 收敛（详见 [vite-plugin-migration.md](vite-plugin-migration.md) R9）。


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
5. Vite 插件化（RM-V01–V36）：回归网（RM-V05 功能 + RM-P01–P05 性能）先于 Phase 1 落地；Phase 1（dev）与 Phase 2（build）各自在 `experimental.viteBuilder` 开关后独立可发布；产物布局与 `analyze:check` 基线全程不变。
6. 性能回归网（RM-P01–P08）：`perf-baseline.json` 在**旧实现**上产出并 committed；此后 Phase 1 / Phase 2 的「DX 不倒退 / 性能收益」以该基线的 p50 / p95 为准，不接受定性描述；RM-V36 收敛前归档最后一次旧路径基准。（部分达成：变更延迟两项待 [perf-regression-net.md](perf-regression-net.md) §2.1 的 dev 变更不生效问题处置后再补。）
