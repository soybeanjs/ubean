# `examples/ubean-test` → E2E 迁移可行性分析

> **性质**：开发任务型（dev-task，见 [ADR-0007](adr/0007-docs-content-classification.md)）。分析结论落地后按政策删除正文，决策归 ADR。
> **方法**：纯静态分析。**未运行任何测试、未构建**。所有数字来自对文件的字面统计，描述的是「文件里写了什么」，不是「CI 现在是什么状态」。
> **基线文档**：[test.md](test.md)（覆盖率优化方案，466 行）
> **关联**：[ADR-0002](adr/0002-sequencing-enablers-and-test-boundaries.md)（测试边界，含一条「声明但未执行」的自认）、[ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)

---

## 0. 结论

**「能不能迁移」这个问题问错了方向。** 正确的问法是「哪些该迁、哪些该往反方向迁」。

`examples/ubean-test/test/` 的 783 个用例**不是一类东西**，硬性整体迁移到 E2E 会造成：

- **约 1/3 的用例（HTTP 形）**：L3 已经用真实 Chromium 覆盖了同一批端点的等价断言 → 迁移是**纯重复**，只增加 3–5 倍耗时（L2 单端口 dev server vs L3 真实浏览器 + POM）。
- **约 2/3 的用例（纯单元形）**：断言的是 `formatSSEMessage()` 返回 `'data: hello\n\n'`、`parseCron()` 解析结果、`routeToFilePath()` 映射这类**纯函数/内存模型**行为。浏览器里**没有可观测面**——它们不经过 DOM、不经过水合、不经过网络。塞进 Chromium 只是把 `expect(fn()).toBe(x)` 包在 page.evaluate 里，信号为零。
- **真正该进 E2E 的**：只有一小批**需要真实 DOM / 水合 / 浏览器 API / 交互时序**的能力，其中大部分**L3 已经有了**，剩下的恰好是 `packages/cli/test/dev-dx.test.ts` 已经用裸 Playwright 覆盖的那批（matcher 客户端守卫、Server Components 水合、PPR、服务端岛屿、Server Action 表单、HMR 语义）。

**一句话结论**：

> 该迁移的不是「L2 的用例」，而是「L2 里那些**依赖真实浏览器语义**的少数能力」。它们中的绝大多数**已经迁完了**（在 L3 的 12 个 spec 和 `dev-dx.test.ts` 的 10 个用例里），剩下的是**结构性错位**而非缺口——L2 承担了本该属于 L1（纯函数）和 L3（浏览器语义）的职责。

**三个可执行判断**：

| 判断 | 动作 |
| --- | --- |
| 508 个纯单元形用例（65%） | **反向迁移到 L1**（`packages/*/test/`），不是迁到 E2E。**注意：observability/storage/websocket/sse/queue/cron 六个能力域在 L1 完全没有测试文件**（符号级已验证），这是真缺口 |
| 275 个 HTTP 形用例（35%） | **留在 L2**。这是 L2 唯一不可替代的价值：真实 dev server 上的 HTTP 契约。不迁 E2E |
| 浏览器语义能力（约 15–20 个能力点） | 迁 L3。**已完成大半**；未覆盖的部分是「L3 该补」而非「L2 该迁」（22 个 API 路由 + 若干页面） |

---

## 1. 五层基线（[test.md](test.md) §1.1）

| 层 | 位置 | 规模 | 运行方式 |
| --- | --- | --- | --- |
| **L1** 包单元 | `packages/*/test/` | 159 文件 / ~34,430 行 / 2,560 用例 | `vp test`（vitest 5.0.3），进程内 |
| **L2** 示例集成 | `examples/ubean-test/test/` | 36 文件 / 8,250 行 / **783 用例** | 真实 `ubean dev` on `:3999`，全局 setup 起服务 |
| **L3** 浏览器 E2E | `test/browser/specs/` 12 spec + `packages/cli/test/dev-dx.test.ts` 10 用例 | **201 + 10 = 211 用例** | 真实 Chromium（vitest browser mode / 裸 Playwright） |
| **L4** 构建产物契约 | `packages/cli/test/build-contracts.test.ts` | 4 mode × 9 preset = 15 格 + miniflare | 临时 outDir 真实构建 |
| **L5** 纯 SPA 示例 | `examples/client-only-spa/test/` | 4 文件 / 30 用例 | vitest + happy-dom |

**关键事实**：L2 与 L3 **跑的是同一个 app**（`examples/ubean-test`），只是一个走 `:3999` 的 HTTP、一个走 `:3998` 的真实浏览器。

```
                    examples/ubean-test（同一个 fixture）
                    ┌──────────────┴──────────────┐
        L2 :3999 真实 dev server          L3 :3998 真实 dev server
        fetch() over HTTP                 Chromium + POM + 水合
        ── 783 用例                       ── 201 用例
```

这意味着：**L2 里任何「只要 HTTP 就能断言」的东西，L3 都能断言，而且已经断言了一部分。** 反过来，**L3 能断言的浏览器语义，L2 原理上做不到。**

---

## 2. L2 的 783 个用例是什么形态

按 `api(` / `getJson(` / `postJson(` / `postForm(` / `fetch(` / `createRequest(` / `createTypedClient(` / `toFlatTypedClient(` 字面量静态粗分（一个 `it` 体内出现过即计为 HTTP 形）：

| 形态 | 数量 | 占比 | 含义 |
| --- | --- | --- | --- |
| **HTTP 形** | ~275 | ~35% | 真的打 `:3999` 上的端点 |
| **纯单元形** | ~508 | ~65% | 在测试进程内直接调 API / 断言纯函数返回值 |

> 粗分口径说明：同一文件内混排很常见（例：`queue.test.ts` 25 个用例里 10 个打 `/api/queue-test`，15 个直接调 `createMemoryQueueDriver()`）。所以「HTTP 形」是下界近似，不是精确值。
>
> **两处容易误判的文件**：`download`(23) 与 `typed-client`(46) 表面像单元测试，实际用 `createRequest({ baseURL: getBaseUrl() })` / `createTypedClient` **await 真实请求**。只有 `parseContentDisposition`(8) / `replacePathParams`(7) / 客户端形状探测(4) 是纯单元形 → 这两个文件因此贡献了 29 个「曾被低估」的 HTTP 形用例（27 + 2）。反向的陷阱是 `request-integration`(60)：它 HTTP 词汇密集，但 `createInternalAdapter()` + mock `setInternalFetcher` 返回 `new Response(...)` **从不开 socket**，43 个属单元形。

### 2.1 完全 100% HTTP 形的文件（9 个）

`routing`(25) · `pages`(19) · `download`(23) · `auto-imports`(10) · `static-files`(10) · `draft-mode`(8) · `data-cache`(7) · `request-demo`(5) · `streaming-metadata`(5)

### 2.2 完全 100% 纯单元形的文件（2 个）

`preset`(28) · `config`(10)

> 这两者**无法在不动服务端的前提下变成 E2E**——它们测的是平台预设对象与配置加载，没有任何 HTTP 面。`typed-client` 曾被误列入此表，实际它是 19 单元 / 27 HTTP（见 §2 口径说明）。
>
> 另一个极端：**没有任何混排文件达到 80% HTTP**。最接近的是 `typed-client` 59%、`i18n` 58%、`defineApp` 50%。也就是说「HTTP 形」在整个 L2 里是**少数派形态**，这本身就是 L2 定位偏移的量化证据。

### 2.3 混排最严重的文件（单元形占比高）

`prerender`(93 = 18 HTTP + 75 单元) · `observability`(53 = 3 + 50) · `request-integration`(60 = 17 + 43) · `markdown`(29 = 6 + 23) · `storage`(28 = 5 + 23)

---

## 3. 迁移可行性：四分类

### 3a. 已被 L3 覆盖 —— **不需要迁移**

L3 的 12 个 spec 已用真实 Chromium 覆盖同一批能力，断言强度**普遍高于** L2 的等价用例。

| 能力 | L2 的断言 | L3 的断言 | 谁更强 |
| --- | --- | --- | --- |
| 首页/关于/特性 SSR | `res.text` 含 `关于 ubean-test` | POM `heading()` + `useHead` title + description meta | L3 |
| 布局系统 | 字符串 indexOf 顺序（layout→main→page） | 真实 DOM 选择器 + SPA 导航后布局保持 | L3 |
| `/api/*` CRUD | `api()` 断言 status/body | 同一批 + valibot 400 + 404 分支 | 平 |
| SEO head | — | 15 个 meta accessor + og/twitter/canonical/hreflang | L3 独有 |
| i18n | 7 HTTP + 5 单元 | 22 用例：页面 + 客户端切换 + 服务端 API + 路由策略 | L3 |
| **Islands** | **仅 `it('islands-test page renders')` 冒烟** | 5 个指令 + `data-hydrating` 标记 + 点击驱动计数器 | **L3 压倒性** |
| **View Transitions** | **仅 `it('view-transitions page renders')` 冒烟** | `startViewTransition` 检测 + 过渡计数 + style helper | **L3 压倒性** |
| 页面缓存 KeepAlive | — | `onActivated`/`onDeactivated` 计数 + 运行时开关 | L3 独有 |
| typed client | 46 个：19 单元 + 27 真实请求 | 页面按钮驱动真实请求 | 互补，非重复 |
| OpenAPI / Scalar / DevTools | 1 个 `/_devtools/rpc` 触点 | `/_openapi.json` schema + `/_scalar` + `/_devtools` 302 | L3 |

**Islands 与 View Transitions 是最有力的证据**：L2 对这两个能力只有「页面返回 200 且 HTML 里有东西」的冒烟，L3 才有「`data-hydrating="load"` 标记存在、点击后计数器从 0 变 3」的真断言。**这里的方向是 L2 → L3 已完成，且 L2 的旧用例应当被删除而不是保留。**

### 3b. 真正的浏览器专属能力 —— **该迁 L3，且大部分已迁**

| 能力 | 页面 | 现状 | 建议 |
| --- | --- | --- | --- |
| Server Action 表单提交 | `action-demo.vue` | **`dev-dx.test.ts` 用例 8** 已覆盖（填写 + 点击 + 断言 `.action-log` + 无整页刷新 + 非法输入错误） | 已迁，无需重复 |
| 页内语言切换 | `i18n.vue` | **`dev-dx.test.ts` 用例 1**（URL 与文案切中文 + 无整页刷新）；L3 spec 04 覆盖客户端切换 | 已迁（两处重叠，可合并） |
| DevTools 外壳可达 | `/_devtools` | **`dev-dx.test.ts` 用例 7** + L3 spec 11 | 已迁 |
| 改客户端文件 → 整页重载 | — | **`dev-dx.test.ts` 用例 9/10**（含 HMR vs 整页重载的分野） | 已迁，L3 不该重复 |
| 动态路由 matcher 客户端守卫 | `order/[id=numeric]` | **`dev-dx.test.ts` 用例 2**（服务端 404 + `pushState`/`popstate` 被拦截） | 已迁 |
| Server / Client Components 水合 | `server-components.vue` | **`dev-dx.test.ts` 用例 3**（`pageerror` 收集 + foster-parenting 回归守卫） | 已迁 |
| PPR | `ppr-demo.vue` | **`dev-dx.test.ts` 用例 4**（`x-ppr: streaming` + `x-ssr-mode` 响应头） | 已迁 |
| 服务端岛屿 | `server-island-demo.vue` | **`dev-dx.test.ts` 用例 5**（SSR 含 `island-resolved` + 无 pageerror） | 已迁 |
| 流式延迟数据 | `deferred-demo.vue` | **`dev-dx.test.ts` 用例 6**（SSR fallback → 水合后真值） | 已迁 |
| **Task 9.4 `POST /__server-component` props 重渲染** | `server-island-demo` | **无任何层覆盖** | **该补 L3（真缺口）** |
| 并行路由命名插槽 | `parallel.vue` + `@aside/parallel.vue` | 仅 `dev-topology`/`preview-cli` 探活 200 | 该补 L3（`<SlotView name="aside">` 渲染位置） |
| `blog/[...slug]` catch-all + content 集合 | `blog/[...slug].vue` | 无覆盖 | 该补 L3 或 L2 |
| `/marketing` CSR 页（`ssr: false`） | `marketing.vue` | 无覆盖（spec 10 测的是 `/marketing-page` 路由组，**不是这个**） | 该补 L3（CSR 无 SSR 内容 + 水合后出现） |
| `/dashboard` `ssr: 'data-only'` 契约 | `dashboard.vue` | spec 10 只断言 heading/导航，**未断言 data-only 契约** | 该补 L3（CSR shell + loader 已跑） |
| `data-fetch.vue` | `/data-fetch` | **POM `DataFetchPage` 存在但零 spec 引用**（死代码） | 该补 L3 或删 POM |
| 404 页面内容 | `404.vue` | 只断言状态码，未断言内容 | 该补 L3（低优先） |

### 3c. 不可迁移 —— **纯函数 / node-only / 构建时**

这些用例**在浏览器里没有可观测面**。迁移到 E2E 只能得到 `page.evaluate(() => fn())`，信号等价于零，却付出 3–5 倍耗时。

| 能力域 | 代表断言 | 为什么不可迁 |
| --- | --- | --- |
| `prerender` 75 个单元用例 | `collectPrerenderRoutes()` glob 匹配、`routeToFilePath()` 的 `.txt/.xml/.json/.webmanifest/.svg/.ico` 扁平映射 | 纯函数 + `node:fs/promises`/`node:os`（**注：L1 已覆盖大部分，见 §5.1**） |
| `preset` 28 个 | `detectPreset()`、`serializeWranglerToml()`、`generateWranglerConfig()` | 构建时配置，无 HTTP/DOM 面 |
| `observability` 50 个 | `createSpan()`、`REQUEST_ID_HEADER`、tracer 模型 | 进程内模型 |
| `storage` 23 / `cache` 15 / `queue` 15 / `cron` 13 / `websocket` 21 | `createMemoryDriver()`、`createMemoryStore()` LRU、`parseCron()`、`createRoom()` | 内存驱动 + hook 接线，不经过浏览器 |
| `config` 10 个 | `loadUbeanConfig()`/`getConfig()` | node-only 配置加载 |
| `errors`/`env`/`seo`/`markdown` 纯函数部分 | `createError()`、`mergeMetadata()`、`buildMetaTags()` | 纯函数 |
| `typed-client` 46 个（19 单元 + 27 真实请求） | `replacePathParams`/`parseContentDisposition`/客户端形状探测 | 19 个是纯函数；27 个打真实端点，属 L2（**注：它测外部包，见 §5.1**） |
| `rate-limit`/`route-rules` 中间件内部 | `compileRouteRules()`、`matchRouteRules()` 特异性排序 | 纯函数（**注意 L1 已有 `packages/routes/test/route-rules*.test.ts`**） |
| `defineApp`/`types` 类型部分 | `TypedLinkProps` 类型形状 | 类型级 |

### 3d. 该留在 L2（HTTP）—— **不迁 L3**

**49 个 API 路由中有 22 个从未被任何 L3 spec 引用**（精确字面匹配 `/api/<route-name>`）：

`cache-advanced-test` · `cors-test` · `create-error` · `cron-parse-test` · `cron-status` · `data-test` · `db-test` · `draft-mode-test` · `env-schema` · `internal-fetch-test` · `login` · `markdown-parse-test` · `queue-test` · `queue-advanced-test` · `request-demo` · `route-rules-test` · `storage-test` · `storage-advanced-test` · `streaming-metadata-test` · `test-meta` · `trace-test` · `ws-test`

（另有 `cached-fn-demo`/`perf-probe`/`prerender-test`/`sse-demo` 被 `packages/cli/test/` 而非 L3 spec 覆盖，故不计入未覆盖。）

**为什么这些不该迁 L3**：L3 spec 09 已经证明了「浏览器 ↔ 服务端桥接」可用（SSE/stream/缓存/限流/校验器/data-cache 全在 L3）。既然桥接已被证明，**再把这 22 个端点拖过 Chromium 不会产生新信号**——它们要验证的是服务端逻辑，用 `fetch()` 就够了。这是 L2 的核心价值区。

> 补充：`route-rules-test`、`ws-test`、`queue-test`、`storage-test` 等的**服务端逻辑**其实该下沉到 L1（见 §5），L2 只保留「路由挂载正确 + 端到端 200」的薄契约。

---

## 4. 逐文件决策表（36 文件）

| 文件 | 用例 | 形态 | 决策 |
| --- | --- | --- | --- |
| `routing` | 25 | HTTP | 留 L2（L3 02 已重复，可精简） |
| `pages` | 19 | HTTP | 留 L2；islands/view-transitions 两条冒烟**删**（L3 06/07 更强） |
| `download` | 23 | HTTP | 留 L2 |
| `static-files` | 10 | HTTP | 留 L2（L3 01 已重复） |
| `auto-imports` | 10 | HTTP | 留 L2 |
| `draft-mode` | 8 | HTTP | 留 L2；核心签名逻辑**下沉 L1**（`packages/server/test/draft-mode.test.ts` 已有文件） |
| `data-cache` | 7 | HTTP | 留 L2（L3 09 已重复） |
| `request-demo` | 5 | HTTP | 留 L2（internal fetch 聚合） |
| `streaming-metadata` | 5 | HTTP | 留 L2；`isBotUserAgent()` **下沉 L1** |
| `cache` | 16 | 混 | 存储 LRU/TTL 语义 **下沉 L1**（L1 已有 `fs-cache`/`cache-handler`/`cache-directive`）；`/api/cache-test` 归 L3（已有） |
| `cors` | 18 | 混 | HTTP 部分留 L2；`defineCors()` 形状下沉 L1 |
| `cron` | 19 | 混 | `parseCron`/`validateCron`/scheduler **下沉 L1**（**L1 无 cron 文件**）；`/api/cron-*` 留 L2 |
| `database` | 22 | 混 | 驱动/hook **下沉 L1**；`/api/db-test` 留 L2 |
| `defineApp` | 10 | 混 | 5 个 HTTP 留 L2；类型部分归 L1 |
| `devtools` | 8 | 混 | 留 L2（`/_devtools/rpc` 唯一触点）；面板内部**不测**（§6 do-not-do） |
| `env` | 21 | 混 | schema 纯函数**下沉 L1**；`/api/env`、`/api/env-schema` 留 L2 |
| `errors` | 19 | 混 | 纯函数**下沉 L1**；`/api/error`、`/api/create-error` 留 L2 |
| `i18n` | 12 | 混 | 留 L2（L3 04 更强，可精简）；ALS `t()` 下沉 L1 |
| `internal-fetch` | 6 | 混 | 留 L2（进程内调度是 L2 的正当职责） |
| `manifest` | 22 | 混 | 纯函数**下沉 L1**；`/api/manifest-test` 留 L2 |
| `markdown` | 29 | 混 | 解析器**下沉 L1**（`packages/markdown/test/` 已有 1 文件）；`/md-test` 归 L3（已有） |
| `observability` | 53 | 单元 | **下沉 L1**（**L1 无 observability 文件**）；`/api/trace-test` 留 L2 |
| `prerender` | 93 | 单元 | L1 **已有实质覆盖**（5 个文件，见 §5.1）→ L2 只保留 `extractLinks`/`generatePrerenderManifest`/完整流程的增量；其余**删** |
| `preset` | 28 | 单元 | **下沉 L1**（L1 已有 `packages/preset/test/` 3 文件） |
| `queue` | 25 | 混 | 驱动/worker **下沉 L1**（**L1 无 queue 文件**）；`/api/queue-*` 留 L2 |
| `rate-limit` | 14 | 单元 | **下沉 L1**（L1 已有 `rate-limit-lifecycle.test.ts`） |
| `request-integration` | 60 | 混 | 17 HTTP 留 L2；43 单元**下沉 L1** |
| `route-rules` | 17 | 单元 | **下沉 L1**（**L1 已有 `route-rules.test.ts` + `route-rules-rewrite.test.ts`——已重复**） |
| `seo` | 24 | 单元 | **下沉 L1**（L1 已有 `packages/seo/test/` 4 文件） |
| `sse` | 18 | 单元 | **下沉 L1**（**L1 无 sse 文件**）；`/api/sse-test` 归 L3（已有） |
| `storage` | 28 | 单元 | **下沉 L1**（**L1 无 storage 文件**） |
| `stream` | 19 | 混 | `createStreamResponse()` **下沉 L1**；`/api/stream-test` 归 L3（已有） |
| `types` | 12 | 混 | 类型级归 L1 |
| `typed-client` | 46 | 19 单元 / 27 HTTP | **留 L2**（测的是外部包 `@soybeanjs/fetch` + `.ubean/openapi.d.ts` 生成的类型，见 §5.1）；其中 8 个纯解析函数可下沉 `@soybeanjs/fetch` 自身仓库 |
| `websocket` | 22 | 单元 | **下沉 L1**（**L1 无 websocket 文件**）；`/api/ws-test` 留 L2 |
| `config` | 10 | 单元 | **下沉 L1**（L1 已有 `packages/config/test/` 7 文件） |

**统计**：约 22 个文件的**大部分用例应反向下沉 L1**；9 个文件留在 L2；4 个文件（`pages`/`i18n`/`cors`/`static-files`）与 L3 有实质重复需精简。

> 表中「形态」列是**多数形态标签**（单元 / 混 / HTTP），精确的 U/I 计数见 §2 口径说明。少数被标为「单元」的文件仍含 HTTP 形用例（`observability` 3、`route-rules` 2、`rate-limit` 3、`seo` 4、`sse` 3、`storage` 5、`websocket` 1），这些 HTTP 部分按 §3d 留在 L2；反之 `request-integration` 的 17 个 HTTP 用例也留在 L2。

---

## 5. 真缺口：L1 完全没有的能力域

这是本次分析**最重要的发现**。以下能力域在 `examples/ubean-test/test/` 有大量单元形用例，但 `packages/*/test/` **没有任何对应测试文件**：

| 能力域 | L2 单元用例数 | L1 对应文件 |
| --- | --- | --- |
| `observability` | 50 | **无** |
| `storage` | 23 | **无**（`packages/server/test/fs-cache.test.ts` 仅间接用到 `createMemoryDriver`/`createStorage`） |
| `websocket` | 21 | **无** |
| `sse` | 15 | **无** |
| `queue` | 15 | **无** |
| `cron` | 13 | **无** |

**符号级验证**（在 `packages/*/test/*.ts` 中按符号搜索）：

| 符号 | L1 命中 |
| --- | --- |
| `createObservabilityTracer` / `getRequestId` / `createSpan` / `createTracingMiddleware` / `REQUEST_ID_HEADER` | — 全无 |
| `defineWebSocket` / `defineRoom` / `createRoom` / `handleUpgrade` / `clearWebSocketState` | — 全无 |
| `formatSSEMessage` / `createSSEStream` / `broadcastSSE` / `sseHeaders` / `clearSSEState` | — 全无（`defineSSE` 仅出现在 `packages/cli/test/dev-topology.test.ts` 的探活里） |
| `defineQueue` / `sendMessage` / `startQueueWorkers` / `stopQueueWorkers` / `createMemoryQueueDriver` | — 全无 |
| `parseCron` / `validateCron` / `defineScheduled` | — 全无（`startCronScheduler` 仅出现在 `dev-host-app.test.ts`） |
| `useStorage` / `useKV` / `createKV` | — 全无 |
| `compileRouteRules` | ✅ `packages/routes/test/route-rules*.test.ts` |
| `mergeMetadata` | ✅ `packages/seo/test/dedupe.test.ts` |
| `cachedEventHandler` | ✅ `packages/server/test/cache-handler.test.ts` |

**结论**：`examples/ubean-test/test/` 事实上**承担了 6 个包的全部单元测试职责**（observability / storage / websocket / sse / queue / cron）。这不是「该不该迁 E2E」的问题，而是**测试层次错位**——示例项目的测试文件在替包做单测。

### 5.1 反向发现：`prerender` 与 `typed-client` **不是**缺口

初版分析曾把这两个也列为 L1 空白，**符号级复核后推翻**：

- **`prerender`（L2 有 75 个单元用例）在 L1 已有实质覆盖**：`packages/builder/test/prerender-content-routes.test.ts`（`collectPrerenderRoutes`）、`prerender-payload.test.ts`（`writePrerenderedFile`/`routeToDataFilePath`/`extractDataPayload`）、`static-render.test.ts`（`routeToFilePath`）、`packages/shared/test/glob.test.ts`（`matchGlob`/`matchAnyGlob`）、`packages/config/test/resolvers.test.ts`（`resolvePrerenderConfig`/`DEFAULT_PRERENDER_EXCLUDE`）。L2 相对 L1 的**增量只有** `extractLinks`、`generatePrerenderManifest` 和完整 `prerender()` 流程（写盘 + crawl + failOnError + 并发）。
- **`typed-client`（L2 有 46 个用例，其中 27 个是真实请求）测的是外部包**：其 import 为 `@soybeanjs/fetch` 与 `@soybeanjs/fetch/openapi`，加上 `../.ubean/openapi.d.ts`（dev server 生成的 OpenAPI 类型）。它**不是 ubean 的单元测试**，而是「OpenAPI 代码生成 → 类型化客户端」的集成验证，天然属于 L2。它内部那 8 个 `parseContentDisposition` / 7 个 `replacePathParams` 用例的归属地是 `@soybeanjs/fetch` 自己的仓库，与 ubean 的 L1/L3 都无关。

> 这正是 [test.md](test.md) 强调的「静态分析必须给出可复核证据」——本节的结论已用符号级 `grep -rl` 逐条验证，而非按文件名推断。

这直接违反 [test.md](test.md) §2 的核心判据「让现有绿灯更难被伪造」：包自己的 `test` 脚本在这些能力域上是**空的绿灯**（根脚本的 `--passWithNoTests` 让空测试目录不报错）。

---

## 6. 约束与风险

### 6.1 ADR-0002 的教训必须吸收

[ADR-0002](adr/0002-sequencing-enablers-and-test-boundaries.md) 决策 1 声明：

> codegen 模块（`production.ts`、`virtual-modules.ts`）用**快照/字符串断言**做快速单测门禁；临时目录真实 Vite 构建属于 **e2e，不属于** OPT-04 4b。

该 ADR 的 2026-09-27 诚实补记承认：**这条边界从未真正执行**——`packages/builder/test/production-build.test.ts` 是完整构建集成测试（真实 `vite build`），且 `grep -rl toMatchSnapshot packages/builder/test/` **零命中**。

**2026-09-28 更新（TS-28 已收口）**：逐模块实测发现这条边界**只落地了一半**——`virtual-modules.ts` 语句覆盖 97.7%（有断言），`production.ts` 仅 6.2%（三份 preset 入口模板与 islands SSR 空壳插件零断言）。已补 `packages/builder/test/codegen-entry-templates.test.ts`（6 例，1.0s），`production.ts` 语句覆盖升至 16.5%、函数 39.1%。两处修订写进 ADR 正文：①「snapshot/断言」在本仓的实际形态是**显式契约断言**而非 `toMatchSnapshot()`（整串快照会在改注释时变红）；②「真实 Vite build 归 e2e」**刻意不执行**——它是全仓唯一的 build 侧端到端断言，而历史事故 #1（RM-V14 双编译）正是「build 侧 0 断言」造成的。

**对本迁移方案的直接约束**（这条教训仍然成立）：任何「声明某能力归某层」的结论，必须**在同一变更里落地可执行的断言**，否则就是第二次重复这个失败模式。§7 的验收清单必须勾选到可执行状态。

> 注意：TS-28 的结论**部分收窄了本方案的 §5「慢集成测上移」建议** —— 真实构建**可以**留在单测层，但必须显式标记（`// 历史事故 #N` 编号 + 文件头说明）且受体积/耗时闸门约束；「必须上移」不再是判据。TS-33 的 build 轨（`UBEAN_TEST_MODE=build`）与 `packages/cli/test/build-*.test.ts` 族已经这么做了。

[test.md](test.md) TS-28 已收口（「ADR-0002 边界 land-or-revise」）。

### 6.2 [test.md](test.md) §6 的 do-not-do 清单（迁移方案不得违反）

- ❌ 覆盖率阈值门禁（覆盖率只做诊断，不设 threshold）
- ❌ PR 阻塞型性能门禁
- ❌ DevTools 组件测试（只做 `useRpc` 单元测试，TS-30）
- ❌ `vi.mock` 风格约定（全仓当前 0 个 `vi.mock`，不要引入）
- ❌ 跨浏览器矩阵（当前只跑 Chromium）
- ❌ Nx / Turbo 等任务编排

### 6.3 测试卫生现状（[test.md](test.md) 静态统计）

- `toMatchSnapshot`：**全仓 0 处**
- `vi.mock`：**全仓 0 处**
- `vi.useFakeTimers`：仅 1 个文件
- `describe.skipIf`：4 个文件（L2 的 `data-cache`/`draft-mode`/`streaming-metadata` 三处 `describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)` + 1）
- 覆盖率工具：**无**
- `it.only`：0 处
- 根 `test` 脚本的 `--passWithNoTests`：被 [test.md](test.md) 明确点名为「掩护」，待移除

### 6.4 L2 的隐性脆弱点

L2 的三个 `describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)` 意味着：**在 IDE Vitest 扩展或任何未走 global-setup 的运行方式下，这 20 个用例静默跳过**。`helper.ts` 的 `getBaseUrl()` 回退到 `http://localhost:3000`（而非 `:3999`）会直接连不上——这是「绿灯可被伪造」的具体形态，与 [test.md](test.md) 的核心判据冲突。

---

## 7. 建议执行顺序

### 阶段 0：先立门禁（不做迁移）

| # | 动作 | 验收 |
| --- | --- | --- |
| 0.1 | 移除根 `test` 脚本的 `--passWithNoTests`（[test.md](test.md) TS-02） | 空测试目录的包 `test` 必须失败 |
| 0.2 | L2 三个 `describe.skipIf` 改为**显式失败**或输出醒目跳过标记（[test.md](test.md)「skips 必须可见」） | 跳过时 CI 输出可见 |
| 0.3 | 导出面快照（[test.md](test.md) TS-01） | `toMatchSnapshot` 首次引入 |

> 不先做 0.1，§5 的「空绿灯」问题无法被发现，后续所有迁移都失去度量。

### 阶段 1：把 L2 的单元形用例**反向下沉 L1**（不是迁 E2E）

按「L1 缺失程度」排序，优先补 6 个完全空白的能力域（**均已符号级验证为 L1 零覆盖**）：

1. `packages/server/test/observability.test.ts`（50 个用例的最大缺口；`@ubean/server/observability`）
2. `packages/server/test/websocket.test.ts` + `sse.test.ts`（`@ubean/server/realtime`）
3. `packages/server/test/queue.test.ts` + `cron.test.ts`（`@ubean/server/queue`、`@ubean/server/cron`）
4. `packages/server/test/storage.test.ts`（`@ubean/server/storage`）
5. `packages/builder/test/prerender-flow.test.ts`（**仅补 L2 的增量**：`extractLinks` / `generatePrerenderManifest` / 完整 `prerender()` 流程；`collectPrerenderRoutes`/`routeToFilePath`/`matchGlob` 等 L1 已有，见 §5.1）
6. 复核 `route-rules`：L1 已有 `packages/routes/test/route-rules*.test.ts` → 直接删 L2 的重复部分，**不新增**

**验收**：每个新 L1 文件独立于 `examples/ubean-test` 运行；L2 中对应用例删除；`pnpm --filter <pkg> test` 在无示例项目时通过。

### 阶段 2：清理 L2 与 L3 的重复

- 删 `pages.test.ts` 的 islands/view-transitions 两条冒烟（L3 06/07 更强）
- 评估 `static-files`/`data-cache`/`i18n` 与 L3 01/09/04 的重叠度，保留 L2 的**独有**断言（如 `Content-Type` 精确值）
- `route-rules` 单元用例与 L1 已重复 → 直接删 L2 部分

### 阶段 3：补 L3 真缺口（§3b 表的下半部分）

按价值排序：

1. **Task 9.4 `POST /__server-component` props 重渲染** —— 零覆盖，且是 ADR-0013 平台契约的一部分
2. `/dashboard` `ssr: 'data-only'` 契约（spec 10 已到页面但未断言契约）
3. `/marketing` CSR 页（`ssr: false`）
4. 并行路由 `<SlotView name="aside">`
5. `blog/[...slug]` catch-all
6. `data-fetch.vue`（或删死 POM `DataFetchPage`）

### 阶段 4：把 `dev-dx.test.ts` 与 L3 收敛

`dev-dx.test.ts` 与 `test/browser/` 是**两套并行 harness**（裸 Playwright vs vitest browser mode），重叠仅 `/i18n` 切换与 `/_devtools`。建议：

- 长期把 `dev-dx` 的浏览器交互用例**迁入 vitest browser mode**，复用 POM 与 `e2eFetch`
- 但 `dev-dx` 的**源码改写 + 恢复**能力（HMR/整页重载语义）在 vitest browser mode 下无法表达（需要重启 dev server）→ **这部分保留在裸 Playwright**
- 这与 [test.md](test.md) TS-28「land-or-revise 边界」是同一个决策点：**必须显式写清哪套 harness 负责哪类语义**，并落地断言

> **2026-09-28 更新（TS-37 已收口）**：实际做法**部分收窄了本条建议**。
>
> - **没有迁移**：保留两套 harness，改为「固化边界 + 消除重复」。理由是迁移的前提是能复用 POM，而 `dev-dx` 的 10 例里 3 例核心动作是改示例源码再还原（`src/app.ts` 整页重载探针、`src/pages/index.vue` HMR 探针、新增 `src/pages/zz-dx-hmr-probe.vue` 触发结构变化）—— 这类语义在 vitest browser mode 里既不安全（同进程浏览器 + 并发 suite 会读到源码中间态）也无法表达（无子进程管理）。**边界由语义决定，不是由「合并更优雅」决定**。
> - **真正的问题不是两套 harness，而是重复的 helper**：实测 `findFreePort()` 被复制 **6 份**、就绪探测有 **6 种形态**、`playwright` 在 `packages/cli/test/` 只有 1 个消费者。新增 `packages/cli/test/helpers/cli-harness.ts` 作为唯一实现，6 个测试文件本地重复全部删除（合计 −268 行）。
> - **落地了断言**（本条建议最后一句要求的）：新增 `packages/cli/test/harness-boundary.test.ts`（4 例）钉住边界 —— L3 不得自己起进程/端口、cli 侧 `findFreePort`/`node:net` 只允许住 harness、cli 不得长出 POM 类、harness 文件头必须含边界说明。红证 5/5 咬住。
> - 边界表、判据与重复消除清单见 [test.md](test.md#ts-37-harness-边界台账)。

---

## 8. 一句话回答原问题

> **`examples/ubean-test` 所测的功能不能整体迁移到 E2E。**
>
> - 约 35%（HTTP 形，275 例）**不需要迁**——L3 已用真实 Chromium 覆盖等价能力，且断言更强。
> - 约 65%（纯单元形，508 例）**不该迁 E2E**——浏览器里没有可观测面；它们真正的问题是**层次错位**：**6 个能力域**（observability / storage / websocket / sse / queue / cron）在 L1 **完全没有测试文件**，示例项目在替包做单测。（`prerender` 与 `typed-client` 经符号级复核后**不属于**此列，见 §5.1。）
> - 真正属于浏览器语义的那批能力（Server Action 表单、matcher 客户端守卫、Server Components 水合、PPR、服务端岛屿、流式延迟、HMR 语义）**已经迁完了**——在 `packages/cli/test/dev-dx.test.ts` 的 10 个用例里，用裸 Playwright 直接覆盖。
> - **剩余的是 L3 缺口，不是 L2 迁移**：若干页面 + 22 个 API 路由未被任何 spec 引用，其中 `POST /__server-component` props 重渲染零覆盖。
>
> **最优动作顺序**：先拆掉 `--passWithNoTests` 与静默 skip（让空绿灯可见）→ 把 L2 单元形用例下沉 L1 补 6 个空白包 → 清理 L2/L3 重复 → 补 L3 真缺口 → 收敛 `dev-dx` 与 L3 两套 harness 的边界。

---

## 附录：证据口径

- 所有用例计数来自 `it(` / `it.each(` 字面统计；`it.each`/`test.each`/`describe.each` 全仓为 0，且无 `it.skip`/`it.todo`/`it.only`，故**展开数 == 字面数 == 783**。形态分类按 `it` 体内是否出现 `api(`/`getJson(`/`postJson(`/`postForm(`/`fetch(`/`createRequest(`/`createTypedClient(`/`toFlatTypedClient(` 粗分，为下界近似（未展开 `for` 循环内的用例；4 个文件含 `for` 循环但均不包裹 `it(`）。
- 计数陷阱：`it(` 子串裸匹配会把 `prerender` 记成 94（`path.split('/')`）、`rate-limit` 记成 16（`defineRateLimit()`）——本表用锚定 `^\s*it\(` 排除。形态分类的边界见 §2 的「两处容易误判的文件」。
- L3 spec 数与用例数来自 `test/browser/specs/*.e2e.spec.ts` 逐文件统计（12 spec / 201 用例）；`dev-dx.test.ts` 10 用例。
- 「L1 无对应文件」结论来自 `ls packages/*/test/` 与符号级 `grep -rl` 双重验证。
- **本分析未运行任何测试、未构建、未修改任何测试文件。**