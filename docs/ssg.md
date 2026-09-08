# 轻量 SSG 模式设计（vite-ssg 式直接渲染路径）

- **状态**: proposed（任务清单落地后删除正文，决策归档 ADR，见 [README](README.md)）
- **日期**: 2026-09-08
- **适用模式**: `mode: 'ssg'`（`packages/config/src/types.ts:521` 的 `AppMode`）
- **参照实现**: [vite-ssg](https://github.com/antfu-collective/vite-ssg)（本地路径 `~/Web/Projects/OpenSource/vite-ssg`）

---

## 1. 背景与动机

### 1.1 vite-ssg 原理速览

vite-ssg 的全部运行时是一个 `createApp(routePath?)` 工厂（`src/client/index.ts:14-119`）：SSR 端 `createSSRApp` + `createMemoryHistory`，客户端 `createApp` + `createWebHistory`，同一入口两端复用。

构建流程（`src/node/build.ts:31-233`）：

```
1. viteBuild(client)            → dist/ + ssr-manifest.json
2. viteBuild(ssr, 临时目录)      → .vite-ssg-temp/<rand>/main.mjs
3. import(serverEntry)          → 拿到 createApp 工厂
4. createApp() → routes → routesToPaths() → includedRoutes 过滤
5. p-queue 并发逐路由:
     createApp(route) → router.push(route) → renderToString(app)
     → 注入 index.html 根容器 + __INITIAL_STATE__
     → JSDOM: renderPreloadLinks(ssrManifest) + renderDOMHead
     → beasties critical CSS → 写 <route>.html
6. rm -rf 临时 SSR bundle
```

**它轻的本质**：SSG 期间的"SSR"只是借用 `renderToString` 这个纯函数，不经过任何请求管道；没有 server runtime、没有 dev SSR、运行时依赖仅 7 个。

### 1.2 ubean 当前 SSG 链路

`packages/cli/src/build.ts:208-241`：

```
1. buildProduction()  → 完整生产 server entry（dist/server/entry.mjs）
2. createSsrFetcher() → import entry.mjs → createFetchHandler() → 完整 Hono app
3. prerender()        → 逐路由合成 Request 走完整 Hono 请求管道
4. SSG 模式删除 dist/server/
```

server entry（`packages/builder/src/production.ts:362-471`）包含：`createUbeanApp`、API 路由 loaders、中间件 loaders、**eager 加载的 crons**、SEO 约定模块、IPX、content 运行时。每个页面的渲染经过（`packages/routes/src/router.ts:534-577`）：全局中间件 → route rules 匹配 → matcher 验证 → form actions 分支 → loader → `resolveSelectSsr` → `createVueRenderer.render` → payload/deferred/state 序列化。

**产物端已经是轻的**（纯静态 HTML + 外置 `__data.json` + client assets），**重的是构建期**：为渲染一个静态页面实例化了整套全栈基础设施。

### 1.3 为什么"SSG + 关闭 SSR"不可行

SSG 的本质是"构建时执行 SSR"。`ssr: false` 时 `_pageRenderer = null`（`production.ts:339-342`），fetcher 只能拿到 SPA 空壳（`buildClientOnlyShell`）——没有内容、没有 SEO、没有首屏，SSG 退化为 SPA。现有代码也印证了这一点：`fullstack + ssr:false` 时 prerender 被直接禁用（`build.ts:153-155`）。

**要砍的不是 SSR 渲染本身，而是渲染所经过的重量级基础设施。**

---

## 2. 目标与非目标

### 目标

1. `mode: 'ssg'` 构建时绕过 Hono 请求管道，直接调用 `createVueRenderer` 渲染每个路由
2. server bundle 替换为**最小静态渲染 bundle**：只含 pages / layouts / app-config / renderer / i18n locales / content，不含 API 路由、中间件、crons、IPX、Hono app
3. 渲染调用链从 ~10 层降到 3 层（`renderPage → renderer.render → renderToString`）
4. 产物与现有 SSG 完全同构（纯静态 + `__data.json` + 水合），**客户端零改动**
5. `fullstack` 模式行为零变化（现有 `createSsrFetcher` 路径原样保留）

### 非目标

- 不改 dev 模式（dev 继续用现有 SSR dev server，DX 优先；轻量化收益在构建期）
- 不支持运行时能力：server actions、form POST、ISR/PPR/streaming、cookie/Accept-Language 协商
- 不做 routeRules 运行时语义（redirect/rewrite/headers 在纯静态产物上无执行点）
- 不引入 jsdom / beasties 等重依赖（可作为后续可选项）

---

## 3. 总体设计

### 3.1 核心思路

现有代码已具备关键解耦资产，`createVueRenderer` 的签名不依赖 Hono context：

```ts
// packages/client/src/ssr.ts:329
render(pageObj: PageObject, shellHtml: string, assetTags: PageAssetTags,
       renderContext?: PageRenderContext): Promise<PageRenderResult>
```

`renderPage` / `buildPageShell`（`packages/pages/src/protocol.ts:358-394, 222-279`）也是纯函数。因此可以构建一条**直接渲染路径**：

```
ssg mode 构建流程（新）:
1. viteBuild(client)              → dist/（不变）
2. viteBuild(ssr-static)          → 最小渲染 bundle（替代完整 server entry）
3. import → createStaticRenderer() → { fetcher, expandRoutes }
4. prerender()                    → 逐路由 fetcher(route) → 写 HTML（不变）
5. rm dist/server/                → （不变）
```

### 3.2 关键约束：水合一致性

生产 SSR 用 **router 模式** renderer（`production.ts:286-338` 的 `rendererSetup`：`createVueRenderer({ routes: _rendererRoutes, ... })`），SSR 输出结构与客户端 vue-router 水合结构对应。静态路径**必须复用同一份 `_rendererRoutes` 构造代码**，禁止改用 simple 模式，否则水合 mismatch。

### 3.3 现有代码资产复用清单

| 资产 | 位置 | 静态路径用途 |
| --- | --- | --- |
| `createVueRenderer`（router 模式） | `packages/client/src/ssr.ts:329` | 直接调用，含 layout 链 + i18n head + islands |
| `renderPage` / `buildPageShell` / `insertStateContent` | `packages/pages/src/protocol.ts` | shell 构建 + state 注入，纯函数直接复用 |
| `collectPrerenderRoutes` / `extractLinks` / `extractDataPayload` / `routeToFilePath` | `packages/builder/src/prerender.ts` | 路由发现 + 爬链 + payload 外置，全部不动 |
| `rendererSetup` 代码片段 | `packages/builder/src/production.ts:286-342` | 提取为共享函数，full/static 两个 entry 复用 |
| assetTags 生成逻辑 | `packages/builder/src/production.ts:421-436` | 同上，读取 `.vite/manifest.json` |
| `contentBootstrap` 片段 | `packages/builder/src/production.ts:344-352` | 文档站刚需，保留在静态 bundle |

---

## 4. 详细设计

### 4.1 最小静态渲染 bundle（ssg entry）

`production.ts` 的 server entry 模板拆分为共享片段 + 两个变体，`mode === 'ssg'` 时生成 static 变体，输出位置不变（`dist/server/entry.mjs`，复用现有清理逻辑 `build.ts:235-241`）。

**保留**：

```ts
import { createVueRenderer } from 'ubean/ssr';
import 'ubean:locales';
import { resolveAppConfig } from 'virtual:ubean-app';
// contentBootstrap（@ubean/content 注册，文档站数据源）
// pageModules / layoutModules 的 import.meta.glob
// _pages / _layouts / notFoundPage 元数据 JSON
// rendererSetup（与 fullstack 完全同一份代码）
// assetTags（.vite/manifest.json 解析）
```

**移除**：

```ts
import { createUbeanApp, applyServerConfig } from 'ubean/server';  // 无 Hono app
import { resolveServerConfig } from 'virtual:ubean-server';
// routeModules / middlewareModules / cronModules / seoConventionModules glob
// ipxImport / cronImport / startCronScheduler
// createApp() / CSRF / securityHeaders / dataCache / cache store
```

**新增导出**（替代 `createFetchHandler`）：

```ts
export interface StaticRenderer {
  /** fetcher 同构契约，直接喂给现有 prerender() */
  fetcher: (url: string) => Promise<{ html: string; statusCode: number }>;
  /** i18n locale 展开（Phase 2），把收集到的路由扩展为全语言 URL 列表 */
  expandRoutes?: (routes: string[]) => string[];
  /** 调试：渲染表（expanded URL → { page, params, locale }） */
  table: Map<string, { page: ScannedPageRoute; params: Record<string, string>; locale: string }>;
}
export function createStaticRenderer(init: StaticRendererInit): StaticRenderer;
```

### 4.2 `createStaticRenderer` 内部流程

位于新文件 `packages/builder/src/static-render.ts`：

```
init:
  1. 构建 URL → { page, params, locale } 渲染表（见 4.3 / 4.5）
  2. renderer = createVueRenderer({ routes: _rendererRoutes, ... })  // entry 内已创建，直接取

fetcher(url):
  1. 查表；未命中 → { html: '', statusCode: 404 }（crawlLinks 发现的死链记 skipped）
  2. 构造 pageObj:
       { component: page.name, props: {}, params,
         url, layout: page.layout ?? default ?? false, head: page.pageMeta?.head }
  3. renderContext = { locale, localeDir, messages, routing, baseUrl, availableLocales, ... }
  4. html = await renderPage(pageObj, assetTags, renderer, 'app', renderContext)
     // renderPage 内部完成 shell 构建 + renderToString + state/data/deferred 注入
  5. return { html, statusCode: 200 }
```

异常处理：单页渲染失败按 `prerender()` 现有语义走 `failOnError` / warn（`prerender.ts:451-458`）。

### 4.3 路由表与 params 提取

静态路由（`/about`）：params 为 `{}`，直接入表。

动态路由具象值（content 路由 `/blog/hello` → 页面 `/blog/[slug]`）：新增 helper

```ts
// packages/builder/src/static-render.ts
export function matchRoutePattern(
  pages: ScannedPageRoute[], path: string
): { page: ScannedPageRoute; params: Record<string, string> } | null;
```

- 用 `page.route` 的 pattern（`[param]` / `[param=matcher]` / `**` catch-all）与具象路径匹配
- 具象值来源：`prerender.include` 的具体路径、`contentRoutes`（`extractContentPageRoutes`）
- 未匹配任何页面模式的 include 路径 → 记 warn 并跳过
- matcher 校验可复用服务端 matcher 规则（构建期校验一次即可）

### 4.4 loader 处理策略（Phase 1：不执行）

`mod.loader(c)` 依赖 Hono context（cookie/header/param 动态值）。决策：

- **Phase 1 不执行 loader**。页面数据来源限定为：content collections（构建期注入）、模块级常量、`__data.json` payload（客户端水合后 fetch）
- 检测到页面导出 `loader` 时输出一次性 warn：`[ubean-ssg] page "x" exports loader which is not executed in static mode`
- 静态站内使用 internal fetch（`useData` + `createInternalFetch`）会在渲染期抛错——错误信息需可诊断（Phase 1 验证实际行为，必要时在文档中明确禁止）

**不提供 stub context**：构造假 Hono context 语义歧义大（cookie 是什么？header 是什么？），宁可显式不支持。

### 4.5 i18n 多语言展开（Phase 2）

| strategy | 展开规则 |
| --- | --- |
| `no_prefix` | 每 route 渲染 1 次（defaultLocale） |
| `prefix_except_default` | default 不带前缀 + 其余 locale 带前缀 |
| `prefix` / `prefix_and_default` | 全部 locale 带前缀（`prefix_and_default` 额外渲染 default 无前缀版本） |

- `expandRoutes(routes)` 返回扩展后的全 URL 列表（如 `/about` → `['/about', '/zh/about']`）
- 每个展开 URL 入渲染表时绑定 `locale`；`messages` 从 `ubean:locales` 按 locale 取
- hreflang / canonical / og:locale 由现有 `buildLocaleHead`（`ssr.ts:157-180`）经 `renderContext.routing + availableLocales` 自动产出，无需新代码
- 集成点：`PrerendererOptions` 新增可选 `expandRoutes?: (routes: string[]) => string[]`，在 `collectPrerenderRoutes` 之后、入队之前应用（`prerender.ts:366-374` 处，约 5 行改动）

### 4.6 与 `prerender()` 的集成（fetcher 同构契约）

`prerender()` 的对外契约不变，只换 fetcher 实现：

```ts
// packages/cli/src/build.ts（ssg 分支）
if (config.mode === 'ssg') {
  const staticRenderer = await createStaticRenderer(cwd, manifest);
  await prerender({ ..., fetcher: staticRenderer.fetcher,
                    expandRoutes: staticRenderer.expandRoutes });
} else {
  const fetcher = await createSsrFetcher(cwd, manifest);   // fullstack 原路径
  await prerender({ ..., fetcher });
}
```

payload 外置（`extractDataPayload` → `__data.json`）、`crawlLinks`、并发批处理（`config.concurrency`）全部自动生效，零改动。

### 4.7 404 页面

`notFoundPage`（`pages/404.vue`）在静态模式下额外渲染为 `dist/404.html`：

- 渲染表插入键 `/__ubean_404__` → notFoundPage，fetcher 特判写入 `404.html`（`routeToFilePath` 增加一条规则）
- 静态托管平台（GitHub Pages / Netlify / Cloudflare Pages）均支持自定义 404 页

### 4.8 dev 模式

不变。dev 继续走现有 SSR dev server（`vite-server.ts:249-307`）——开发期需要 loader / internal fetch / 即时反馈，轻量化收益只在构建期。dev 与 static build 的渲染差异（loader 执行与否）在文档中明示。

---

## 5. 能力矩阵

| 能力 | fullstack prerender（现状） | ssg 静态路径 | 说明 |
| --- | --- | --- | --- |
| layout 链 | ✅ | ✅ | renderer 内部 |
| i18n（messages/hreflang） | ✅ | ✅（P2 展开） | `renderContext` 供给 |
| head / metadata | ✅ | ✅ | unhead |
| `__data.json` payload 外置 | ✅ | ✅ | `extractDataPayload` 复用 |
| crawlLinks 爬链发现 | ✅ | ✅ | 复用 |
| content collections | ✅ | ✅ | contentBootstrap 保留 |
| 404 页 | Hono 兜底 | ✅ 404.html | 静态托管约定 |
| page loader | ✅ | ❌（warn） | 依赖请求上下文 |
| form / server actions | ✅ | ❌ | 无运行时 |
| ISR / PPR / streaming | ✅ | ❌ | 静态产物无执行点 |
| matcher 中间件 / route rules 运行时语义 | ✅ | ❌（构建期 params 校验） | |
| API 路由 / crons / IPX / auth | ✅ | ❌（不加载） | 轻量化来源 |

---

## 6. 实施计划

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| **P1 MVP** | entry 模板拆分（共享片段 + static 变体）；`static-render.ts`（matchRoutePattern + 渲染表 + fetcher）；CLI ssg 分支接入；404.html；loader warn | `mode: 'ssg'` 构建产物与现状语义一致，单测 + 集成测试通过 |
| **P2 i18n** | `expandRoutes` + 按 locale 绑定渲染表 + `prerender()` expandRoutes 钩子 | 多语言文档站全量 URL 生成 + hreflang |
| **P3 增强** | 构建性能对比报告（时间/内存 vs fullstack prerender）；beasties critical CSS 可选接入（peer optional）；`UBEAN_KEEP_SSG_STATIC` 调试开关 | 数据驱动的后续优化决策 |

P1 验收基准：examples/ubean-test 现有 92 个 prerender 相关测试不回归；新增静态路径等价性测试（见 §7）。

---

## 7. 测试策略

1. **单测**（`packages/builder`）：
   - `matchRoutePattern`：静态 / `[param]` / `[param=matcher]` / `**` / 未匹配
   - 渲染表构造：include 具体路径、contentRoutes、exclude 交互
   - ssg entry 生成：不包含 routes/middleware/crons glob 字符串断言
2. **等价性集成测试**（examples/ubean-test）：
   - 同一页面分别用 fullstack-prerender 与 ssg-static 构建，断言输出 HTML 的结构等价（`<title>`、app div 内容、`__UBEAN_DATA__` payload、state script、asset tags）
   - 允许非 byte 级一致（Hono 管道注入的头部差异），语义断言
3. **水合验证**：preview 起静态产物，浏览器 console 无 hydration mismatch 警告
4. **回归**：fullstack 模式构建 + prerender 全量测试不变绿转红

---

## 8. 风险与开放问题

| # | 风险 / 问题 | 缓解 |
| --- | --- | --- |
| R1 | 双 entry 模板漂移导致水合不一致 | `rendererSetup` / assetTags / contentBootstrap 提取为共享函数，两变体引用同一份；等价性测试兜底 |
| R2 | 页面隐式依赖请求上下文（loader / internal fetch / `useRequestEvent`） | 显式 warn + 文档清单；错误信息指向静态模式限制说明 |
| R3 | crawlLinks 发现的 URL 不在渲染表 | fetcher 返回 404 → skipped 记录，不中断 |
| R4 | `import.meta.glob` 在 static entry 中仍会打包全部 pages——含仅 fullstack 使用的重组件 | 接受（页面本身就是要渲染的内容）；dev 无影响 |
| Q1 | loader 的受限 stub context（仅 `c.req.param()` + env）是否值得做 | P3 依据用户反馈决定 |
| Q2 | routeRules.redirect 是否构建期生成平台 `_redirects` / meta refresh | 非目标，另立议题 |
| Q3 | critical CSS（beasties）作为可选 peer 依赖引入 | P3 评估，对齐 vite-ssg 的 optional peerDeps 模式 |

---

## 9. 涉及文件清单

| 文件 | 变更 |
| --- | --- |
| `packages/builder/src/production.ts` | entry 模板拆分：共享片段 + static 变体；`mode === 'ssg'` 走 static |
| `packages/builder/src/static-render.ts` | 新增：`createStaticRenderer` / `matchRoutePattern` / 渲染表 |
| `packages/builder/src/prerender.ts` | `PrerendererOptions.expandRoutes` 钩子（P2）；`routeToFilePath` 404 规则 |
| `packages/cli/src/build.ts` | ssg 分支接入 `createStaticRenderer`；`createSsrFetcher` 保留于 fullstack |
| `packages/builder/test/static-render.test.ts` | 新增单测 |
| `examples/ubean-test/test/ssg-equivalence.test.ts` | 新增等价性集成测试 |
