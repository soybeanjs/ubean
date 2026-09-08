# ADR-0011 · 轻量 SSG：直接渲染路径（vite-ssg 式）

- **状态**: accepted（P1/P2 已落地，T3.1 基准完成）
- **日期**: 2026-09-09
- **关联**: [ADR-0010](0010-competitive-north-star-and-gap-filter.md)（性能权重 25%）、[benchmark 脚本](../../scripts/benchmark-ssg.mjs)
- **参照实现**: [vite-ssg](https://github.com/antfu-collective/vite-ssg)
- **设计正文**: 原 `docs/ssg.md`（任务落地后按 ADR-0007 约定删除，git 历史保留）

## 背景

`mode: 'ssg'` 原实现复用 fullstack 链路：构建完整生产 server entry（Hono app + API 路由 + 中间件 + crons + IPX），`createSsrFetcher` 导入后逐路由走完整请求管道渲染，最后删除 server 目录。产物端已是纯静态，**重的是构建期**——为渲染静态页面实例化整套全栈基础设施。

「SSG 基础上关闭 SSR」不可行：SSG 本质是构建时执行 SSR，`ssr: false` 只能产出 SPA 空壳。要砍的不是 SSR 渲染本身，而是渲染所经过的重量级基础设施。vite-ssg 证明了这个方向：它的"SSR"只是借用 `renderToString` 纯函数，无请求管道、无 server runtime。

## 决定

1. **直接渲染路径**：`mode === 'ssg'` 时生成最小静态 entry（`buildStaticSsgEntry()`），只含 pages / layouts / renderer / i18n locales / content bootstrap，导出 `renderStaticPage({ pageName, params, url, locale })`。不含 Hono app、API 路由、中间件、crons、IPX；不生成 preset 包装文件（server.mjs / worker.mjs / wrangler.toml）。
2. **fetcher 同构契约**：`createStaticSsgRenderer()`（`@ubean/build/static-render` 子路径导出）包装 `renderStaticPage` 为与 `PrerendererOptions.fetcher` 同构的接口，现有 `prerender()`（payload 外置 / crawlLinks / 并发）零改动接入；fullstack 路径（`createSsrFetcher`）原样保留。
3. **路由匹配替代 Hono 管道**：`compilePageRoute()` / `matchRoutePattern()` 支持 scanner 方言（`:param` / `**:slug` / `:id?`）与 `definePage({ path })` 覆盖的 vue-router 语法（`:param(regex)` / `:param*` / `:param+`），特异性排序（静态段优先、catch-all 最后），参数 `decodeURIComponent` 对齐 `c.req.param()`。
4. **水合一致性约束（防模板漂移）**：rendererSetup / assetTags 生成提取为共享函数（`buildRendererSetup()` / `buildAssetTagsSetup()`），fullstack 与 static 两个 entry 引用同一份代码；static 必须复用 router 模式 renderer，禁止 simple 模式。
5. **loader 不执行**：静态模式页面数据来源限定为 content collections / 模块级常量 / 客户端水合 fetch。检测到页面导出 `loader` 输出一次性 warn；不提供 stub context（语义歧义大，宁可显式不支持）。
6. **404 哨兵路由**：`STATIC_NOT_FOUND_ROUTE` 入队渲染 `pages/404.vue` → `404.html`（GitHub Pages / Netlify / Cloudflare Pages 自定义 404 约定）；哨兵不受默认 `/_**` exclude 过滤；注册为静态路径 `/404` 避免被根 catch-all 特异性抢占；无 404 页面的项目不入队。
7. **i18n 多语言展开**：`expandRoutesForLocales()` 按 strategy 展开全语言 URL（`prefix_except_default` default 无前缀 + 其余带前缀；`prefix` 全带；`prefix_and_default` 全带 + default 无前缀）；404 哨兵与已带前缀 URL 跳过；`PrerendererOptions.expandRoutes` 钩子在路由收集后、入队前应用。hreflang / canonical / og:locale 由现有 `buildLocaleHead` 自动产出。
8. **能力边界（显式不支持）**：page loader、form / server actions、ISR / PPR / streaming、matcher 中间件与 routeRules 运行时语义、cookie / Accept-Language 协商。dev 模式不变（继续 SSR dev server，DX 优先）。

## 结果

基准（3 轮中位数，Node 24 / darwin arm64，`pnpm benchmark:ssg`）：单路由渲染 **-46% ~ -52%**（约 2ms vs 3ms），总构建 **-6% ~ -11%**，峰值 RSS **-7% ~ -10%**——且 ssg 模式多渲染 2x 路由（i18n 展开 + 404 哨兵）。回归：builder 234 tests、全仓 25 包、typecheck 全绿。

## 未决

- beasties critical CSS 作为可选 peer 依赖引入（对齐 vite-ssg optional peerDeps 模式），按用户反馈决定
- 调试开关：现用 `UBEAN_KEEP_SSR` 保留 server bundle，是否更名 / 增加 `UBEAN_KEEP_SSG_STATIC` 待定
- loader 受限 stub context（仅 params + env）是否值得做
