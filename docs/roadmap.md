# ubean 框架未实现功能规划文档

> 基于 [framework-comparison.md](../apps/docs/src/content/zh/architecture/framework-comparison.md) 对比分析，梳理 ubean 当前未实现的功能特性，按优先级制定实现计划。
> 更新日期：2026-08-01

---

## 一、现状校正

对比文档与源码核实后，以下 3 项已实际实现但对比文档未更新：

| 任务 ID | 功能 | 实现位置 | 文档状态 |
|---|---|---|---|
| P9-14 | `after()` 响应后执行 | `packages/server/src/after.ts` | ❌ → ✅ |
| P9-15 | fetch memoization | `packages/server/src/fetch-memo.ts` | ❌ → ✅ |
| P9-20 | MDX 编译 | `packages/markdown/src/mdx.ts` + `vite-plugin.ts` + `jsx-runtime.ts` | ⚠️ → ✅ |

---

## 二、Server Components 实现必要性分析

### 2.1 React RSC vs Nuxt Server Components

对比文档中将 Server Components 标记为 ❌ 并注明"设计差异（Vue 生态）"。但深入分析后发现存在两种完全不同的 "Server Components" 概念：

| 维度 | React RSC (Next.js) | Nuxt Server Components |
|---|---|---|
| **渲染模型** | 独立的服务端渲染协议，wire protocol 传递组件树 | 组件级 Islands：`.server.vue` 仅服务端渲染，props 变化触发网络请求重渲染 |
| **客户端 JS** | 服务端组件零 JS 到客户端 | 同上：服务端组件不发送 JS 到客户端 |
| **交互能力** | 需要包裹 Client Component | 通过 `nuxt-client` 指令选择性注水嵌套组件 |
| **配对机制** | 无（server/client 是不同文件） | `.server.vue` + `.client.vue` 配对：服务端渲染初始 HTML，客户端注水接管 |
| **Vue 可行性** | ❌ 不可行（需要 React 的 fiber + wire protocol） | ✅ 可行（本质是 Islands 的组件级粒度） |

### 2.2 Nuxt 实现方式参考

Nuxt 的 Server Components 核心机制：

1. **`.server.vue` 后缀约定**：组件仅在服务端渲染，不发送 JS 到客户端
2. **`<NuxtIsland>` 组件**：内部使用，props 变化时发起网络请求重新渲染服务端组件
3. **`.client.vue` 后缀约定**：组件仅在客户端渲染
4. **配对组件**：同名 `.server.vue` + `.client.vue`，服务端渲染初始 HTML，客户端注水接管交互
5. **`nuxt-client` 指令**：在 server 组件内标记需要客户端注水的嵌套组件
6. **`selectiveClient` 配置**：`deep` 模式自动注水所有嵌套交互组件

### 2.3 ubean 可行性评估

ubean 已有的能力与 Nuxt Server Components 高度重叠：

| Nuxt 能力 | ubean 现状 | 差距 |
|---|---|---|
| `.server.vue` 组件后缀 | ❌ 无组件级约定（仅有路由级 `ssr: false`） | 需新增组件级约定 |
| `<NuxtIsland>` props 重渲染 | ⚠️ `defineServerIsland()` 支持 Suspense 但无 props 变化重渲染 | 需扩展网络请求重渲染 |
| `.client.vue` 组件后缀 | ❌ 无 | 需新增 |
| 配对组件 | ❌ 无 | 需新增 |
| `nuxt-client` 选择性注水 | ✅ `v-client.*` 指令已有 | 已具备 |
| Islands 架构 | ✅ `v-client.*` + `defineIsland()` + `defineServerIsland()` | 已具备 |
| PPR | ✅ `routeRules.ppr` | 已具备 |

### 2.4 结论与建议

**React RSC**：不实现。Vue 生态无等价物，ubean 的 Islands + PPR 架构已覆盖其核心价值（减少客户端 JS、服务端数据获取）。

**Nuxt 风格 Server Components**：**建议实现**，优先级 P1.5（介于 P0 和 P1 之间）。理由：

1. **与现有架构互补**：ubean 已有 Islands + PPR，`.server.vue` 是其自然延伸——从路由级细化到组件级
2. **用户需求**：内容密集型场景（博客、文档站、CMS）需要服务端渲染非交互组件而不发送 JS
3. **技术可行**：Vue SSR 原生支持组件级渲染，配合 ubean 已有的 island 机制实现成本低
4. **差异化**：结合 ubean 的 PPR + `defineServerIsland()`，可提供比 Nuxt 更强的流式 + 预渲染能力

**实现方案**（详见第三节 #9）：
- `.server.vue` / `.client.vue` 组件后缀约定
- 扩展 `defineServerIsland()` 支持 props 变化触发服务端重渲染
- 配对组件机制

---

## 三、未实现能力项清单与优先级

### P0 — 核心数据层补全（高重要性 / 高需求 / 中等难度）

| # | 能力 | 任务 ID | 理由 |
|---|---|---|---|
| 1 | `defer()` 流式非关键数据 | ✅ 已实现 | 与已有 PPR + Suspense 架构互补，竞品全部支持 |
| 2 | useData/useAsyncData 增强 | ✅ 已实现 | 当前实现较薄，缺 dedupe/refresh/payload 提取 |
| 3 | SSG payload 提取 | ✅ 已实现 | `__UBEAN_STATE__` 存在但 SSG 无独立 payload |
| 4 | fetch Data Cache | ✅ 已实现 | 与组件级缓存互补，对齐 Next.js Data Cache |

### P1 — 重要功能补全（中重要性 / 中需求 / 中等难度）

| # | 能力 | 任务 ID | 理由 |
|---|---|---|---|
| 5 | Draft / Preview mode | ✅ 已实现 | 内容管理场景刚需，CMS 集成前置 |
| 6 | 流式 metadata | ✅ 已实现 | SEO 优化，Next.js 已有 |
| 7 | 动态路由 matchers | ✅ 已实现 | SvelteKit 有，rou3 底层支持 |
| 8 | metadata 自动 dedupe | ✅ 已实现 | 当前 useSeoMeta 无去重 |

### P1.5 — Server Components（Nuxt 风格）

| # | 能力 | 任务 ID | 理由 |
|---|---|---|---|
| 9 | `.server.vue` / `.client.vue` 组件约定 + props 重渲染 | ✅ 部分实现 (9.1+9.2) | 与 Islands/PPR 互补，内容场景刚需；9.3 配对 + 9.4 props 重渲染待后续迭代 |

### P2 — 扩展生态（低重要性 / 低需求 / 低难度）

| # | 能力 | 任务 ID | 理由 |
|---|---|---|---|
| 10 | 第三方脚本优化 (Partytown) | P9-22 | 性能优化，需求不紧迫 |
| 11 | Color mode | P9-21 | 已委托 @soybeanjs/ui，可考虑内置集成 |
| 12 | 全文搜索 (Pagefind) | P9-26 | 文档站场景 |
| 13 | Analytics | P9-27 | 仅 observability，可第三方委托 |
| 14 | Email 发送 | P9-25 | 第三方即可，无需内置 |
| 15 | A/B 测试 / Feature flags | P9-28 | 高级特性，需求极低 |

### P3 — 平台扩展（低需求 / 高难度）

| # | 能力 | 任务 ID | 理由 |
|---|---|---|---|
| 16 | AWS/Azure 平台预设 | 新建 | Nitro 有，需求低 |
| 17 | CDN/Edge 缓存集成 | 新建 | 需平台特定适配 |
| 18 | Single-flight mutations | P9-16 | SolidStart 独有，需求不普遍 |

### 不实现（设计差异）

| 能力 | 理由 |
|---|---|
| React RSC (Server Components) | Vue 生态无等价物，ubean 用 Islands + PPR + Nuxt 风格 Server Components 替代 |

---

## 四、详细实现方案

### 1. `defer()` 流式非关键数据 [P0] ✅ 已实现

**目标**：允许 loader/页面组件返回 `{ data, deferred }`，非关键数据以 Promise 流式推送。

**实现状态**：已完成。API 已在 `packages/pages/src/defer.ts` 实现,SSR 渲染器已集成流式注入。

**技术方案**：
- 在 `packages/pages/src/protocol.ts` 扩展 `PageRenderResult`，新增 `deferred: Record<string, Promise<unknown>>`
- SSR 流式渲染时，`deferred` 中的 Promise 通过 Suspense 边界流式输出
- 客户端水合时，通过 `__UBEAN_STATE__.deferred` 恢复未完成的 Promise
- 新增 `defer()` 辅助函数：包装 Promise 标记为可流式

**实现步骤**：
1. 定义 `defer()` API + `DeferredValue` 类型
2. 扩展 SSR 渲染器，支持 deferred Promise 的流式注入
3. 扩展 `__UBEAN_STATE__` 协议，序列化 deferred 状态
4. 客户端水合时重建 deferred Promise

**验收标准**：
- `defer()` 包装的 Promise 不阻塞 TTFB
- 非关键数据在关键数据之后流式到达
- 客户端水合后 deferred 数据正确显示
- 测试：SSR 流式输出中 deferred 部分出现在关键数据之后

**兼容性**：与现有 PPR/Suspense 架构自然互补，不影响非流式路由。

---

### 2. useData/useAsyncData 增强 [P0] ✅ 已实现

**目标**：对齐 Nuxt `useAsyncData` 的 dedupe/refresh/payload 能力。

**实现状态**：已完成。API 在 `packages/pages/src/data.ts` 实现,SSR 渲染器已集成 payload 注入。

**技术方案**：
- 在 `packages/pages/src/data.ts` 增强 `useData`：
  - 新增 `dedupe` 选项（同 key 请求自动去重,默认 `true`）
  - 新增 `refresh()` 方法手动刷新（绕过缓存 + dedupe）
  - 新增 `pending`/`status` 字段（`status: 'idle'|'pending'|'success'|'error'`）
  - SSR 时自动提取 payload 到 `__UBEAN_DATA__` script 标签
- 新增 `useAsyncData(key, fn, options)` 作为 `useData` 的超集（Nuxt 风格位置参数签名）
- 客户端从 `__UBEAN_DATA__` 恢复初始数据,避免二次请求

**设计决策**：
- payload 使用独立的 `__UBEAN_DATA__` script 标签(而非 `__UBEAN_STATE__`),
  与 `__UBEAN_DEFERRED__` 模式一致,职责分离:用户状态(Pinia)与框架数据缓存互不污染,
  便于 Task 3 (SSG payload) 提取为独立 JSON。

**验收标准**：
- ✅ 同一 key 的并发请求只执行一次 fetcher
- ✅ `refresh()` 能强制重新获取
- ✅ SSR 数据通过 `__UBEAN_DATA__` 传递,客户端无二次请求
- ✅ 单元测试覆盖 dedupe/refresh/payload 流程（35 测试通过）

**兼容性**：现有 `useData` API 向后兼容,新增字段为可选。

---

### 3. SSG payload 提取 [P0] ✅ 已实现

**目标**：SSG 预渲染时自动提取页面数据为独立 JSON payload。

**技术方案**：
- 在 `packages/prerender` 中，预渲染完成后将 `__UBEAN_DATA__` 提取为 `__data.json` 文件
- 页面 HTML 中注入 `<link rel="preload" href="/page/__data.json">` + 轻量内联引用
- 客户端水合时优先从 `__data.json` 加载

**实现步骤**：
1. 预渲染后分离 `__UBEAN_DATA__` 为独立 JSON
2. HTML 中替换内联 script 为外部引用
3. 客户端运行时优先读外部 JSON，降级读内联

**实现说明**（已实现）：
- 新增 `extractDataPayload(html, route): ExtractedPayload | null`（`@ubean/prerender`）——
  从预渲染 HTML 中正则提取 `<script id="__UBEAN_DATA__">JSON</script>`,返回
  `{data, html, dataUrl}`。失败(无 script / JSON 解析失败 / 空数据)返回 `null`,静默降级。
- 新增 `routeToDataFilePath(route, outputDir)` —— 路由 → `__data.json` 文件路径映射
  (根路由 → `outputDir/__data.json`;其他 → `outputDir/<route>/__data.json`)。
- 新增配置项 `PrerenderConfig.extractDataPayload?: boolean`(默认 `true`)——
  控制是否启用 SSG payload 提取。设为 `false` 时保留内联 script(向后兼容)。
- `prerender()` 的 `processRoute` 在 HTTP 200 时调用 `extractDataPayload`;
  成功则写 `__data.json` 文件 + 用替换后的 HTML 写 `index.html`,失败则保留原 HTML。
- HTML 替换内容:`<link rel="preload" href="<dataUrl>" as="fetch" crossorigin="anonymous">`
  + `<script>window.__UBEAN_DATA_PAYLOAD__=fetch("<dataUrl>",{credentials:"include"}).then(r=>r.ok?r.json():null).catch(()=>null)</script>`
- 客户端 `useData`(`@ubean/pages`):`readClientPayload()` 改为异步,优先读
  `globalThis.__UBEAN_DATA_PAYLOAD__`(可能是 Promise / 对象 / null),降级到 DOM 读取
  `__UBEAN_DATA__` script。in-flight Promise 缓存去重并发调用。
- 仅对 HTTP 200 的 HTML 生效;ISR 页面同样适用;SSR 页面不受影响(仍内联)。

**验收标准**：
- SSG 页面 HTML 体积减小（state 不再内联）
- `__data.json` 可被浏览器缓存
- 水合后数据一致
- 测试：对比 SSG 前后 HTML 体积 + 水合正确性

**测试覆盖**：
- `packages/prerender/test/payload.test.ts` —— `extractDataPayload` 单元测试 +
  `routeToDataFilePath` 路径映射 + `prerender()` 端到端集成(默认启用 / `false` 禁用 /
  无 script 降级 / 非 200 不提取)。
- `packages/pages/test/data.test.ts` —— 新增 3 个客户端水合测试:
  `__UBEAN_DATA_PAYLOAD__` 为 Promise / 对象 / reject 降级。
- `examples/ubean-test/test/prerender.test.ts` —— HTTP 集成测试
  `action=payloadExtract` 验证完整流程。

**兼容性**：ISR 页面同样适用；SSR 页面不受影响（仍内联）。

---

### 4. fetch Data Cache [P0] ✅ 已实现

**目标**：对齐 Next.js Data Cache，`fetch()` 自动缓存 + `revalidateTag`/`revalidatePath` 失效。

**技术方案**：
- 扩展 `packages/server/src/fetch-memo.ts` 为完整 Data Cache
- 包装 `globalThis.fetch`，识别 `next: { revalidate, tags }` 选项
- 缓存按 URL + headers 作为 key，TTL + 标签索引
- 与已有 `revalidateTag`/`revalidatePath` API 集成

**实现步骤**：
1. 定义 `FetchCacheOptions` 接口（`revalidate`/`tags`/`noStore`）
2. 实现 fetch wrapper，缓存 GET 响应
3. 集成 `revalidateTag`/`revalidatePath` 失效缓存
4. dev 模式默认 no-cache，prod 默认按配置

**实现说明**（已实现）：
- 新增 `createDataCacheMiddleware(options)` 中间件（`@ubean/server`）——
  在请求作用域内包装 `globalThis.fetch`，对带 `next: { revalidate, tags }` 选项的
  GET/HEAD 请求按 TTL 跨请求缓存响应。
- 新增 `FetchCacheOptions` 接口（`revalidate` / `tags` / `noStore`）+
  `FetchInitWithNext` 扩展 `RequestInit`。
- 缓存键 = `method:url:sorted(headers)`，排除自动设置的 header
  （User-Agent / Accept-Encoding / Connection / Host / Content-Length），
  保证相同语义请求命中同一缓存键。
- 缓存值：序列化的 `Response`（status / statusText / headers / body ArrayBuffer），
  命中时通过 `deserializeResponse` 重建可消费的 `Response` 实例。
- 仅缓存 2xx 响应（4xx/5xx 不缓存，允许后续重试）；仅缓存 GET/HEAD。
- TTL 语义：`revalidate: N` → N 秒后过期；`revalidate: 0` / `noStore: true` → 不缓存；
  仅有 `tags` 无 `revalidate` → 永久缓存直到被失效（对齐 Next.js）。
- dev 模式（`NODE_ENV !== 'production'`）默认 no-cache，可通过 `forceDevCache: true`
  强制启用（用于测试）。
- **失效集成**：`cache-directive.ts` 的 `revalidateTag` / `revalidatePath` /
  `clearComponentCache` 现在同时失效 fetch Data Cache 条目
  （分别调用 `revalidateDataCacheTag` / `revalidateDataCachePath` / `clearDataCache`）。
  用户调用 `revalidateTag('users')` 会一次性失效所有带 `users` 标签的组件缓存 + fetch 缓存。
- 标签反向索引（tag → 缓存键集合）加速 `revalidateTag`；LRU 驱逐（上限 1000 条，超限淘汰最旧 20%）。

**验收标准**：
- ✅ `fetch(url, { next: { revalidate: 60 } })` 返回缓存响应
- ✅ `revalidateTag('xxx')` 后对应 fetch 缓存失效
- ✅ 无 `next` 选项的 fetch 不缓存（默认行为不变）
- ✅ 测试：缓存命中/失效/降级场景

**测试覆盖**：
- `packages/server/test/data-cache.test.ts` —— 28 个单元测试,覆盖:
  基本缓存命中/未命中、无 next 不缓存、noStore/revalidate:0 退出、
  POST/4xx/5xx 不缓存、TTL 过期、headers 缓存键、
  revalidateTag/revalidatePath 失效、与组件缓存集成、dev 模式行为、
  响应重建正确性、exclude、clearDataCache/getDataCacheSize、中间件恢复 fetch。
- `examples/ubean-test/test/data-cache.test.ts` —— HTTP 集成测试(7 个 action):
  cacheHit / noNextNoCache / noStore / revalidateTag / revalidatePath /
  errorNotCached / devNoCache,通过 `/api/data-cache-test?action=xxx` 端点验证端到端行为。

**兼容性**：仅影响服务端 fetch；用户可通过 `next: { noStore: true }` 退出缓存。
无 `next` 选项的 fetch 行为完全不变（走原始 fetch 路径）。

---

### 5. Draft / Preview mode [P1]

**目标**：对齐 Next.js `draftMode()`，支持预览未发布内容。

**技术方案**：
- 新增 `packages/server/src/draft-mode.ts`：
  - `draftMode()` 返回 `{ isEnabled, enable(), disable() }`
  - 基于 cookie (`__ubean_draft`) + 签名验证
  - 中间件读取 cookie，注入 `c.var.draftMode`
- API 路由 / loader 中 `if (draftMode().isEnabled)` 读取草稿数据

**实现步骤**：
1. 实现 draft cookie 签名 + 验证
2. 提供 `enableDraftMode()`/`disableDraftMode()` API（通常在 `/api/preview` 路由调用）
3. `draftMode()` composable 读取请求上下文

**验收标准**：
- 未启用时 `draftMode().isEnabled === false`
- 启用后请求携带 cookie，`isEnabled === true`
- cookie 签名验证防伪造
- 测试：enable/disable/isEnabled 流程

**兼容性**：可选中间件，不启用时零开销。

---

#### 实现说明（Task 5 / P9-23 ✅ 已实现）

**实现位置**：`packages/server/src/draft-mode.ts`

**API 设计**：
- `createDraftModeMiddleware(options)` / `defineDraftMode(options)` — 中间件,读取并验证
  cookie 后在 context 上注入 `DraftModeController`(内部 key `__ubean_draft_mode__`)。
- `enableDraftMode(c)` / `disableDraftMode(c)` — 在路由处理函数中调用,标记 pendingAction,
  中间件在 `await next()` 后根据 pendingAction 设置/清除 cookie。
- `isDraftMode(c)` — 读取 `isEnabled`(未注册中间件返回 false)。
- `useDraftMode(c)` — 组合式 API,返回 `{ isEnabled, enable, disable }`;未注册中间件时
  返回安全回退(`isEnabled: false` + `enable/disable` 抛错),零开销。
- `DraftModeOptions`:`{ secret(必填), cookieName='ubean_draft', ttl=3600, cookie={...}, exclude=[] }`。

**安全机制**：
- cookie 值格式 `expiry.signature`,签名使用 HMAC-SHA256 + base64url。
- 验证使用 `timingSafeEqual` 时序安全比较,防止 timing attack。
- 签名长度不等时直接返回 null,避免 `timingSafeEqual` 抛错。
- cookie 携带 expiry 时间戳,中间件拒绝已过期 token。
- 客户端无法伪造签名或延长有效期。

**工作流程**：
1. 中间件读取 `cookie` 头,正则解析 `ubean_draft` 值。
2. 验证签名 → 检查 expiry > Date.now() → 在 context 标记 `enabled`。
3. 路由处理函数调用 `enableDraftMode(c)` → controller 标记 `pendingAction='enable'`。
4. `await next()` 后,中间件根据 pendingAction 设置 `Set-Cookie`(enable 写入签名 token + Max-Age=ttl;disable 写入空值 + Max-Age=0)。

**与 spec 的差异**（合理调整）：
- cookie 名 `ubean_draft`（spec 写作 `__ubean_draft`，实现采用无下划线前缀，可通过 `cookieName` 配置）。
- 状态通过内部 context key 注入而非 `c.var.draftMode`（实现细节，对外通过 `useDraftMode(c)`/`isDraftMode(c)` 暴露，API 形状与 spec 一致）。
- 同时提供 `defineDraftMode` 别名，与 `defineCors`/`defineCsrf` 风格对齐。

**验收标准**：
- ✅ 未启用时 `isEnabled === false`（`noCookie` / 未注册中间件场景）
- ✅ 启用后请求携带 cookie，`isEnabled === true`（`roundTrip` 场景）
- ✅ cookie 签名验证防伪造（篡改签名 / 错误密钥 / 无分隔符 / 过期 token 全部拒绝）
- ✅ 测试：enable/disable/isEnabled 流程（单元 + 集成）

**测试覆盖**：
- `packages/server/test/draft-mode.test.ts` —— 26 个单元测试,覆盖:
  Detection（无 cookie / 有效 cookie / 篡改签名 / 无分隔符 / 过期 / 错误密钥）、
  enableDraftMode（Set-Cookie / 同请求立即生效 / Max-Age=TTL）、
  disableDraftMode（Max-Age=0 / 同请求立即生效）、
  isDraftMode（未注册中间件返回 false / 有效 cookie 返回 true）、
  useDraftMode（组合式形状 / enable/disable / 未注册时回退 / 未注册时 isEnabled=false）、
  Configuration（自定义 cookieName / cookie 选项 / exclude / 无 secret 抛错 / 默认选项）、
  Round-trip（enable → 后续请求 isEnabled=true / disable → 后续 isEnabled=false / 同请求 enable+disable 后者胜出）、
  defineDraftMode 别名。
- `examples/ubean-test/test/draft-mode.test.ts` —— 8 个 HTTP 集成测试:
  noCookie / enable / disable / tampered / expired / wrongSecret / roundTrip / composable,
  通过 `/api/draft-mode-test?action=xxx` 端点验证端到端行为。

**兼容性**：可选中间件,未注册时 `isDraftMode` 返回 false、`useDraftMode` 返回安全回退,零开销。

---

### 6. 流式 metadata [P1]

**目标**：SSR 流式输出时，metadata 在数据就绪后流式注入。

**技术方案**：
- 扩展 `packages/seo/src/index.ts`：
  - `useSeoMeta` 支持响应式 ref/computed
  - SSR 流式时，metadata 通过 `<template>` 占位 + 流式替换注入
  - 爬虫检测时降级为同步（等待 metadata 完成）

**实现步骤**：
1. 支持响应式 metadata（watch ref 变化）
2. 流式 SSR 中 metadata 延迟到数据就绪后注入
3. UA 检测：爬虫 UA 同步等待

**验收标准**：
- 异步数据加载后 title/description 正确更新
- 爬虫请求获得完整 metadata
- 非爬虫请求 metadata 可流式延迟
- 测试：流式输出中 metadata 出现在数据就绪后

---

#### 实现说明（Task 6 / P9-24 ✅ 已实现）

**核心结论**:流式 metadata 的主体能力(响应式 `useSeoMeta` + 流式 `<head>` 注入)
**已由现有架构天然支持**,无需新增代码:

- `packages/ssr/src/index.ts` 的 `collectDynamicHeadTags()` 在流式渲染完成后捕获
  动态 head 条目(`useHead`/`useSeoMeta` 注册的响应式 title/meta/link),注入到
  响应尾部。浏览器会自动把 `<meta>`/`<title>`/`<link>` 移动到 `<head>`(HTML5 规范)。
- `renderToStreamFn` 依次流式输出:静态 head → app HTML → 动态 head tags →
  数据 → deferred → state → tail。
- `useSeoMeta`(packages/seo/src/index.ts)委托给 `@unhead/vue`,后者原生支持
  响式 Ref/Computed,异步数据加载后 metadata 自动更新。
- 已有测试:`packages/ssr/test/streaming.test.ts` 4 个用例覆盖 useHead 注入、
  动态 title、tail 放置位置、静态 head 不重复。

**本次新增 —— 爬虫降级(P9-24)**:

社交预览爬虫(Facebook OG、Twitter、Slack、LinkedIn、WhatsApp 等)只解析初始
`<head>`,不会执行流式尾部的 metadata 注入,导致 OG/Twitter Card 标签缺失。
本任务新增爬虫 UA 检测,在流式 SSR 启用时自动为爬虫降级为缓冲渲染,
保证 metadata 出现在初始 `<head>` 中。

**实现位置**:
- `packages/api-routes/src/bot-detection.ts` —— `isBotUserAgent(ua)` 函数,
  基于大小写不敏感子串匹配,覆盖主流搜索引擎(Google/Bing/Baidu/Yandex/DuckDuckGo/
  Yahoo/Sogou/Apple/ByteDance/Petal/Exabot/Alexa)、社交预览(Facebook/Twitter/
  LinkedIn/Slack/Telegram/WhatsApp/Skype/Discord/Pinterest/Reddit)、
  SEO/监控(Ahrefs/Semrush/MJ12/DotBot/Pingdom/GTmetrix/PageSpeed/Stackdriver)
  及通用 `crawler`/`spider`/`bot/`/`bot;`/`fetcher`/`scraper`/`preview` token。
- `packages/api-routes/src/router.ts` —— `RegisterOptions.botFallback`(默认 `true`),
  在主页面处理器与 404 处理器的流式决策点检查 UA:命中爬虫则走缓冲 `renderPage`,
  否则走 `renderPageToStream`。
- `packages/app/src/app.ts` —— `UbeanAppOptions.botFallback` 透传到 `registerRoutes`。

**API 设计**:
- `isBotUserAgent(ua: string | undefined | null): boolean` —— 公开导出(通过
  `@ubean/api-routes` 与 `ubean` 主包),供用户在自定义中间件中复用。
- `botFallback?: boolean` —— `RegisterOptions` / `UbeanAppOptions` 字段,默认 `true`。
  仅在 `streaming` 启用时实际生效;设为 `false` 可禁用爬虫检测(不推荐)。
- 无新增配置项 —— 爬虫降级是流式 SSR 的安全默认行为,无需用户显式开启。

**与 spec 的差异**(合理调整):
- spec 写作"爬虫检测时降级为同步(等待 metadata 完成)" —— 实现采用缓冲渲染
  (`renderPage`)而非"等待 metadata"。原因:流式 SSR 的 metadata 是在流尾部注入的,
  "等待"等同于完整缓冲;直接走缓冲路径更简单且语义一致,metadata 自然出现在
  初始 `<head>` 中。
- UA 检测基于子串匹配(非正则歧义解析),覆盖主流爬虫;空 UA 视为非爬虫
  (部分正常请求也带空 UA,避免误伤)。

**验收标准**:
- ✅ 异步数据加载后 title/description 正确更新(由 `@unhead/vue` 响应式支持,
  已有 `packages/ssr/test/streaming.test.ts` 覆盖)
- ✅ 爬虫请求获得完整 metadata(缓冲渲染,metadata 在初始 `<head>`)
- ✅ 非爬虫请求 metadata 可流式延迟(浏览器自动移动到 `<head>`)
- ✅ 测试:流式输出中 metadata 出现在数据就绪后(已有测试)+ 爬虫降级单元/集成测试

**测试覆盖**:
- `packages/api-routes/test/bot-detection.test.ts` —— 50 个单元测试,覆盖:
  搜索引擎爬虫(13 种)、社交预览爬虫(11 种)、SEO/监控爬虫(8 种)、
  通用爬虫子串(4 类)、浏览器 UA 不误判(7 种)、边界情况
  (空/undefined/null、大小写不敏感、"robot" 子串不误判)。
- `examples/ubean-test/test/streaming-metadata.test.ts` —— 5 个 HTTP 集成测试:
  detect(Googlebot/Chrome)、botUAs(7 个批量)、browserUAs(3 个批量)、empty,
  通过 `/api/streaming-metadata-test?action=xxx` 验证 `isBotUserAgent` 通过
  `ubean` 主包导出的端到端可达性。

**兼容性**:爬虫降级仅在 `streaming: true` 时生效;未启用流式 SSR 时无任何影响。
`botFallback` 默认 `true`,现有应用无需改动即获得爬虫安全行为。

---

### 7. 动态路由 matchers [P1]

**目标**：对齐 SvelteKit matchers，支持自定义路由参数验证。

**技术方案**：
- 在 `packages/routing` 中新增 `defineMatcher(name, fn)` API
- `[id=name].vue` 约定：使用名为 `name` 的 matcher 验证 `id`
- matcher 返回 `true`/`false`，false 则跳过该路由

**实现步骤**：
1. 定义 `defineMatcher` API + matcher 注册表
2. 路由扫描时解析 `[id=name]` 语法
3. rou3 匹配时调用 matcher 验证

**验收标准**：
- `[id=numeric].vue` 仅匹配数字 id
- matcher 返回 false 时路由不匹配
- 测试：matcher 通过/拒绝场景

---

#### 实现说明（Task 7 ✅ 已实现）

**核心结论**:对齐 SvelteKit matchers API,支持 `[param=matcher]` 文件路由约定,
在路由匹配阶段调用用户注册的 matcher 函数校验参数,失败则跳过该路由(走下一候选
或最终 404)。服务端(Hono 中间件)与客户端(Vue Router `beforeEach` 守卫)双重校验。

**实现位置**:
- `packages/routing/src/matchers.ts` —— matcher 注册表与校验逻辑(新增文件):
  - `defineMatcher(name, fn)` / `getMatcher` / `hasMatcher` / `listMatcherNames` /
    `clearMatchers`:进程单例注册表 API(`MatcherFunction = (value: string) => boolean | null | undefined`)
  - `validateParams(matchers, params)`:批量校验参数,未注册的 matcher 保守返回 `false`
    (对齐 SvelteKit 的 error 行为,但用 `false` 而非抛出,避免阻塞路由表初始化);
    matcher 抛异常时捕获并视为不匹配;数组参数(`:path*`)逐元素校验
  - `createMatcherGuard(options)`:返回 vue-router `beforeEach` 守卫,读取
    `route.meta.matchers` 校验 `to.params`,失败时跳转到 `notFoundRouteName`
    (默认 `'NotFound'`);可选 `onReject` 回调用于日志/监控
- `packages/utils/src/path.ts` —— `[id=name]` 语法解析:
  - `DYNAMIC_PARAM_WITH_MATCHER_REGEX` 捕获 `[name]` / `[...name]` / `[name=matcher]` /
    `[...name=matcher]` 形式
  - `parseMatchers(filePath)`:剥离 `=matcher` 后缀并返回 `{ cleaned, matchers }` 映射
  - `filePathToRoute` 内部先调用 `parseMatchers`,后续正则(`DYNAMIC_PARAM_REGEX` 等)
    才能正确识别为普通 `[id]` 动态参数;`ParsedRoutePath` 新增 `matchers?` 字段
- `packages/routing/src/types.ts` —— `ScannedApiRoute` / `ScannedPageRoute` 新增
  `matchers?: Record<string, string>` 字段
- `packages/routing/src/scan.ts` —— `scanPages` / `scanApiRoutes` 从 `filePathToRoute`
  捕获 `matchers` 并写入扫描结果
- `packages/routing/src/generator/index.ts` —— `computeMeta` 将 `page.matchers` 注入到
  route meta,供客户端 `createMatcherGuard()` 读取
- `packages/api-routes/src/router.ts` —— API 与页面路由注册时,在 `metaMiddleware` 之后、
  handler 之前插入 `matcherMiddleware`:无 matchers 直接 `next()`(零开销);有 matchers
  则调用 `validateParams`,失败返回 404 JSON(让 Hono 继续匹配下一候选路由)
- `packages/routing/src/index.ts` / `packages/utils/src/index.ts` —— 导出 matcher API
- `ubean` 主包通过 `export * from '@ubean/routing'` 自动导出全部 matcher API

**API 设计**:
- `defineMatcher(name, fn): MatcherFunction` —— 注册命名 matcher,同名覆盖,返回 `fn`
- `getMatcher(name)` / `hasMatcher(name)` / `listMatcherNames()` / `clearMatchers()` ——
  注册表读取/清理(`clearMatchers` 仅供测试)
- `validateParams(matchers, params): boolean` —— 批量校验(供服务端中间件与客户端守卫复用)
- `createMatcherGuard(options?): NavigationGuard` —— 创建 vue-router `beforeEach` 守卫,
  options: `{ notFoundRouteName?: string; onReject?: (to) => void }`
- 文件约定:`[id=numeric].vue` / `[...slug=any].vue` / `[[page=numeric]].vue` /
  `[id=numeric].get.ts`(API 路由);与现有动态路由 / catch-all / optional 参数语法兼容

**与 spec 的差异**(合理调整):
- spec 写作"rou3 匹配时调用 matcher" —— 实现采用 Hono 中间件层校验(在路由匹配后、
  handler 前),而非 rou3 内部回调。原因:rou3 的 matcher 钩子需要返回 regex 修改,
  而 ubean 的路由表由 `convertUbeanRoutePath` 转换为 Hono 路径,在中间件层校验更简单
  且与现有 `metaMiddleware` / 用户 middleware 链一致;matcher 拒绝时返回 404,Hono
  自动继续匹配下一候选路由(语义等价于"跳过该路由")
- 客户端校验是**可选的**:不调用 `createMatcherGuard()` 时,纯 SSR 应用完全依赖服务端
  中间件拦截;纯 SPA 应用(`ssr: false`)建议在 `defineApp({ router: { setup } })` 中
  注册守卫,否则客户端导航到 `/users/abc` 会渲染页面而非 404

**验收标准**:
- ✅ `[id=numeric].vue` 仅匹配数字 id(matcher 拒绝时返回 404,走下一候选路由)
- ✅ matcher 返回 false 时路由不匹配(`validateParams` 返回 `false`,中间件返回 404)
- ✅ 测试:matcher 通过/拒绝场景(64 个单元测试覆盖注册表、校验、语法解析、守卫、集成)

**测试覆盖**:
- `packages/routing/test/matchers.test.ts` —— 64 个单元测试,覆盖:
  - 注册表 API(`defineMatcher` / `getMatcher` / `hasMatcher` / `listMatcherNames` /
    `clearMatchers`):注册/覆盖/清空/类型校验(8 tests)
  - `validateParams`:通过/拒绝/未注册/参数缺失/undefined/null/数组参数/异常捕获/
    nullish 返回值/多 matcher 全通过/真实 numeric/uuid/slug/base64 matcher(20 tests)
  - `createMatcherGuard`:返回函数/无 matchers 放行/matcher 通过/拒绝跳转 NotFound/
    自定义 notFoundRouteName/未注册 matcher/onReject 回调/空 matchers 放行(10 tests)
  - `parseMatchers` 语法解析:`[id=name]` / `[...slug=name]` / 多段 / 无 matcher /
    可选参数 `[[id]]` / `[[id=name]]` / 混合 / 无括号 / matcher 名含下划线连字符(12 tests)
  - `filePathToRoute` 集成:`[id=numeric].vue` / `[...slug=any].vue` /
    `[[page=numeric]].vue` / 普通 `[id].vue` / `index.vue` / 嵌套多 matcher /
    混合 matcher / API 路由 method 后缀 / method+env 后缀 / catch-all / 路由组(13 tests)
  - 真实场景:numeric / uuid / slug / base64 matcher 边界值(4 tests,含 30+ 断言)
- `packages/routing/test/` 其余测试(nested-layouts 11 + parallel-intercept 14)无回归
- `packages/api-routes/test/` 129 个测试(form-actions / isr / page-routing /
  bot-detection / route-rules)无回归

**兼容性**:
- 无 matcher 语法的路由(`[id].vue`)行为完全不变,`matchers` 为 `undefined`,
  `matcherMiddleware` 直接 `next()`(零开销)
- 与现有动态路由 / catch-all(`[...slug]`)/ optional(`[[page]]`)/ 路由组(`(group)`)/
  并行路由(`@slot`)/ 拦截路由(`(..)target`)语法完全兼容
- API 路由与页面路由均支持 matcher;SSR 与 SPA 均支持(SSR 服务端中间件拦截,
  SPA 客户端守卫拦截)

---

### 8. metadata 自动 dedupe [P1]

**目标**：`useSeoMeta` 多次调用自动合并去重，避免重复标签。

**技术方案**：
- 扩展 `packages/seo` 中 `useSeoMeta`：
  - 基于 `@unhead/vue` 的 dedupe 机制
  - 页面级 + 布局级 + 全局级 metadata 自动合并
  - 后定义的覆盖先定义的（按层级优先级）

**验收标准**：
- 布局和页面同时设置 title，页面优先
- 同名 meta 标签不重复
- 测试：多层 metadata 合并

---

### 9. Server Components（Nuxt 风格）[P1.5]

**目标**：支持 `.server.vue` / `.client.vue` 组件约定，服务端组件不发送 JS 到客户端。

**技术方案**（参考 Nuxt `.server.vue` + ubean 已有 Islands 架构）：

#### 9.1 `.server.vue` 组件后缀

- Vite 插件检测 `.server.vue` 文件，编译时标记为服务端组件
- SSR 时正常渲染，客户端不注水（不发送组件 JS）
- 客户端收到纯 HTML，无事件监听器

#### 9.2 `.client.vue` 组件后缀

- SSR 时渲染占位符（`<div data-client-only></div>`）
- 客户端注水后替换为真实组件

#### 9.3 配对组件（`.server.vue` + `.client.vue`）

- 同名组件：服务端渲染初始 HTML，客户端注水接管交互
- 例如 `Counter.server.vue` + `Counter.client.vue`
- 类似 Nuxt 的配对机制

#### 9.4 props 变化重渲染

- 扩展 `defineServerIsland()` 支持 props 变化触发服务端重渲染
- 客户端 props 变化时，发起 `POST /__server-component` 请求携带组件名 + props
- 服务端渲染返回 HTML 片段，客户端替换 island 内容
- 复用已有 `/__actions` 中间件模式

**实现步骤**：
1. Vite 插件：识别 `.server.vue` / `.client.vue` 后缀，标记组件渲染模式
2. SSR 渲染器：`.server.vue` 组件渲染 HTML 但不注水；`.client.vue` 渲染占位符
3. 扩展 `defineServerIsland()`：新增 `rerenderOnPropsChange` 选项
4. 新增 `POST /__server-component` 端点：接收组件名 + props，返回 HTML 片段
5. 客户端运行时：props 变化时发起重渲染请求

**验收标准**：
- `.server.vue` 组件渲染的 HTML 不含客户端 JS
- `.client.vue` 组件 SSR 时为占位符，客户端注水后显示
- 配对组件：服务端渲染初始状态，客户端接管交互
- `defineServerIsland({ rerenderOnPropsChange: true })` 的组件 props 变化后发起重渲染请求
- 测试：组件渲染模式 + props 重渲染 + 水合正确性

**兼容性**：
- 普通 `.vue` 组件不受影响
- 与 `v-client.*` 指令正交（`.server.vue` 是文件级约定，`v-client.*` 是使用时声明）
- 与 PPR 互补：PPR 页面中的 `.server.vue` 组件自动成为静态壳的一部分

**实现状态**（2026-08）：

- ✅ **9.1 `.server.vue`**：`@ubean/islands` Vite 插件 `resolveId` 在 client 构建中将 `.server.vue` import 重定向到通用虚拟 stub (`virtual:ubean-server-component-stub`)，导出 `ServerComponentStub` 组件（渲染空 `<ubean-server-only>`）；SSR 构建正常解析，`transform` 将模板包裹在 `<ubean-server-only v-once>` 中。客户端 bundle 不含 `.server.vue` 组件 JS。
- ✅ **9.2 `.client.vue`**：`resolveId` 在 SSR 构建中重定向到通用占位符 (`virtual:ubean-client-component-placeholder`)，导出 `ClientComponentPlaceholder`（渲染 `<div data-client-only>`）；client 构建生成文件级包装虚拟模块，导入真实组件并用 `defineClientComponent()` 包装（`isClient` ref + `onMounted` 切换：初始渲染占位符与 SSR 一致 → 水合无 mismatch → `onMounted` 后切换为真实组件）。
- ⏳ **9.3 配对组件**：待后续迭代（需 import resolver 按 `ssr` flag 解析 `Counter.vue` → `Counter.server.vue` / `Counter.client.vue`）。
- ⏳ **9.4 props 重渲染**：待后续迭代（需 `POST /__server-component` 端点 + `rerenderOnPropsChange` 选项）。

**测试覆盖**：`packages/islands/test/server-client-components.test.ts`（32 项）— 文件检测、模板包裹（含幂等/多根/script 保留）、runtime 组件 SSR 渲染输出、Vite 插件 `resolveId`/`load`/`transform` 路由逻辑（含 importer 排除、普通 `.vue` 不受影响）。

---

### 10-15. P2 扩展项（简表）

| # | 能力 | 方案概要 | 验收标准 |
|---|---|---|---|
| 10 | Partytown 集成 | `@ubean/scripts` 包，Vite 插件注入 partytown worker | 第三方脚本在 web worker 执行 |
| 11 | Color mode | `@ubean/color-mode` 包，cookie + no-flash 脚本 | 深浅色切换无闪烁 |
| 12 | Pagefind | `@ubean/search` 包，构建后自动索引 | 全文搜索可用 |
| 13 | Analytics | `@ubean/analytics` 包，page view + custom event | 页面访问统计正确 |
| 14 | Email | `@ubean/email` 包，nodemailer 抽象 | 邮件发送成功 |
| 15 | A/B 测试 | `@ubean/ab` 包，cookie 分组 + flag 评估 | 分组一致 |

---

### 16-18. P3 平台扩展（简表）

| # | 能力 | 方案概要 |
|---|---|---|
| 16 | AWS/Azure 预设 | `awsPreset`/`azurePreset`，Lambda/Functions 适配 |
| 17 | CDN/Edge 缓存 | `Cache-Control`/`Surrogate-Key` header + 平台 purge API |
| 18 | Single-flight mutations | 变更返回流式 patch，客户端逐步应用 |

---

## 五、兼容性评估

| 新功能 | 对现有架构影响 | 兼容策略 |
|---|---|---|
| `defer()` | 扩展 SSR 渲染器 + state 协议 | 向后兼容：无 `defer()` 的页面不受影响 |
| useData 增强 | 扩展返回值 | 向后兼容：新字段为可选 |
| SSG payload | 预渲染器输出变化 | 向后兼容：客户端可降级读内联 |
| fetch Data Cache | 包装 globalThis.fetch | 向后兼容：无 `next` 选项不缓存 |
| Draft mode | 新增中间件 | 可选启用，不启用时零开销 |
| 流式 metadata | SSR 渲染器扩展 | 向后兼容：同步 metadata 不受影响 |
| 路由 matchers | 路由扫描扩展 | 向后兼容：无 matcher 的 `[id]` 行为不变 |
| Server Components | Vite 插件 + SSR 渲染器扩展 | 向后兼容：普通 `.vue` 不受影响 |

**核心原则**：所有新功能默认不改变现有行为，用户通过 opt-in API 或文件后缀启用。

---

## 六、建议落地顺序

```
Phase A (P0 核心数据层):
  1. defer() 流式非关键数据
  2. useData/useAsyncData 增强
  3. SSG payload 提取
  4. fetch Data Cache

Phase B (P1 安全与体验):
  5. Draft / Preview mode
  6. 流式 metadata
  7. 动态路由 matchers
  8. metadata 自动 dedupe

Phase C (P1.5 Server Components):
  9. .server.vue / .client.vue 组件约定 + props 重渲染

Phase D (P2 扩展生态):
  10. Partytown / 11. Color mode / 12. Pagefind / ...

Phase E (P3 平台扩展):
  16. AWS/Azure / 17. CDN 缓存 / 18. Single-flight
```

Phase A 内部 1→2→3 有依赖关系（defer 依赖 SSR 流式，useData 增强依赖 state 协议，SSG payload 依赖 useData），建议按序实现。Phase B 各项相互独立可并行。Phase C 依赖 Phase A 的 SSR 增强。Phase D/E 按需推进。
