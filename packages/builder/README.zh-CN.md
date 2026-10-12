# @ubean/build

**[English](./README.md) | 中文**

ubean 的 Vite 插件、生产构建编排、SSG 预渲染、类型代码生成与 Server Actions 插件。

```ts
// vite.config.ts —— 整条工具链唯一的注册点
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

## 目录

- [@ubean/build](#ubeanbuild)
  - [目录](#目录)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [Vite 插件](#vite-插件)
  - [Vue 插件](#vue-插件)
  - [虚拟模块](#虚拟模块)
  - [宏](#宏)
  - [dev 服务端自举](#dev-服务端自举)
  - [预览](#预览)
  - [Server Actions](#server-actions)
  - [生产构建](#生产构建)
  - [预渲染](#预渲染)
  - [静态渲染路径](#静态渲染路径)
  - [代码生成](#代码生成)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

`@ubean/build` 是 ubean 的**构建期包**：所有在 Vite 内运行的部分，以及由 Vite 驱动的生产构建与 SSG 流水线。

| 负责                                                                                               | 不负责                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 核心 Vite 插件（`./vite` 的 `ubeanPlugin`）：环境注册、dev 请求路由、构建编排、preview 接管        | **组合版** `ubeanPlugin()` —— 那是聚合包 `ubean` 的 `ubean/vite`    |
| Vue 侧插件（`./vue` 的 `ubeanVite`）：页面/应用/入口虚拟模块、自动引入、组件 resolver、`.vue` 编译 | Vue **编译器**本身 —— `@vitejs/plugin-vue`                          |
| 虚拟模块注册表、`definePage` 宏提取、组件/CSS resolver 注册表                                      | 页面扫描 —— 页面归 `@ubean/vue`，聚合扫描归 `@ubean/scan`           |
| 生产构建编排（`buildWithEnvironments`）、preset 构建配置、server/worker/handler 入口生成器         | 部署平台定义 —— `@ubean/preset`                                     |
| 预渲染 / SSG：路由收集、路由→文件映射、payload 提取、静态 entry 直接渲染                           | 运行时缓存、ISR、PPR 语义 —— `@ubean/routes` / `@ubean/server`      |
| 类型代码生成（`generateTypes` + unplugin 预设）与配置→Vite 的转换                                  | 配置加载与解析 —— `@ubean/config`                                   |
| Server Actions 的**源码转换**（客户端 stub / 服务端 `filePath` 注入）                              | `defineAction` 运行时与 `POST /__actions` 处理器 —— `@ubean/routes` |

**运行时依赖白名单（主入口 `@ubean/build`）：** 宏、虚拟模块注册表、组件/CSS resolver 注册表、SSR 单例策略
—— 不含 `vite`、不含 `@vitejs/plugin-vue`、不含 Vue 编译器。更重的能力全部落在子路径之后；
`./vite` 与 `./vue` 是唯一两个 import Vite 的子路径；`./production`、`./prerender`、`./static-render`、
`./codegen`、`./actions` 是纯构建期 —— **绝不要**从运行时路由代码 import（见[架构说明](#架构说明)）。

`vite` 声明为 **optional peer dependency**（`peerDependenciesMeta.vite.optional`）。

## 安装

```bash
pnpm add -D @ubean/build vite
```

多数项目不会直接安装本包 —— 聚合包 `ubean` 依赖它，并通过 `ubean/vite`、`ubean/build`、`ubean/ssr` 重新导出插件。

## 快速开始

受支持的入口是聚合包提供的组合插件：

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  plugins: [ubeanPlugin()]
});
```

仅组合，无需 `await`：Vite 会在跑任何钩子之前 await `plugins` 数组里的 promise，因此即使工厂是 async 的，
`plugins: [ubeanPlugin()]` 也是正确写法。

框架无关或需要细粒度控制时直接 import 子路径：

```ts
import { ubeanServerActionsPlugin } from '@ubean/build/actions';
import { prerender } from '@ubean/build/prerender';
import { createStaticSsgRenderer } from '@ubean/build/static-render';
import { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite'; // 无 Vue、无 islands
import { ubeanVite } from '@ubean/build/vue'; // Vue 页面 + 应用入口 + 自动引入
```

## Vite 插件

入口：`@ubean/build/vite`。

`ubeanPlugin()` 是框架无关的核心插件（`name: 'ubean:core'`，`enforce: 'pre'`）。它的 `config` 钩子注册
`client` 与 `ubean` 两个环境以及 `builder.buildApp` —— 因此**裸 `vite dev | build | preview` 就是完整工具链**，
`ubean dev | build | preview` 只是它的薄别名。

```ts
import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from '@ubean/build/vite';

export default defineConfig({
  plugins: [ubeanPlugin()] // 未传参时从 ubean.config.ts 加载配置
});
```

```ts
// 显式传配置（`ubean dev` / `ubean build` 内部就是这么做的）
ubeanPlugin({ config: resolvedConfig, registry: createVirtualRegistry() });
```

| 钩子                        | 作用                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `config`                    | 需要时加载 `ubean.config.ts`、跑项目依赖检查、注册 `environments` + `builder.buildApp`                                            |
| `buildStart`                | 扫描项目、登记 dev 扫描基线、应用扫描结果、跑代码生成                                                                             |
| `resolveId` / `load`        | 提供虚拟模块（`ubean:routes`、`ubean:pages`、`ubean:meta`、`ubean:app-config`、`ubean:locales`）与 `virtual:ubean-asset-manifest` |
| `transform`                 | 提取 / 剥除 `definePage` 宏                                                                                                       |
| `configureServer`           | 注册 dev 扫描协调器，并在 `listening` 后生成 OpenAPI 类型                                                                         |
| `renderChunk` / `resolveId` | 仅 worker 目标：把 `node:*` 换成抛错的桩、重写 `import.meta.url`                                                                  |
| `configurePreviewServer`    | 挂载 preview 中间件                                                                                                               |

`UbeanPluginOptions`：

| 选项       | 类型                    | 说明                                                 |
| ---------- | ----------------------- | ---------------------------------------------------- |
| `config`   | `UbeanResolvedConfig`   | 已解析的配置；否则读全局缓存或在 `buildStart` 中加载 |
| `registry` | `VirtualModuleRegistry` | 调用方注入的虚拟模块注册表；省略时插件自建一个实例   |

**`experimental.viteBuilder` 已删除。** 该开关随两次 `viteBuild` 的旧编排一并下线（ADR-0012）。
在 `ubean.config.ts` 里写它会被当作未知字段忽略 —— 没有配置层的逃生口，只有回退版本。

**worker 目标。** 当生效 preset 的 `entryType` 为 `'worker'` 时，插件把 `node:fs` 等换成会抛错的桩，
并把 `import.meta.url` 重写为 `"file:///worker.mjs"`（workerd 的 ESM 里它是 `undefined`，
会让打包器生成的 `createRequire` 互操作垫片在模块实例化期就崩掉）。这两条只作用于 `ubean` 环境。

## Vue 插件

入口：`@ubean/build/vue`（同时是该子路径的默认导出）。

`ubeanVite()` 提供 Vue 专属的另一半：页面/应用/客户端入口/服务端入口虚拟模块、`unplugin-auto-import`、
`unplugin-vue-components`、Vue i18n 插件与 markdown 页面。

```ts
import { ubeanVite } from '@ubean/build/vue';

ubeanVite({
  config,
  ssr: true, // 可选
  vue: true, // 默认:注册 @vitejs/plugin-vue
  registry
});
```

| 选项       | 类型                    | 说明                                                                          |
| ---------- | ----------------------- | ----------------------------------------------------------------------------- |
| `config`   | `UbeanResolvedConfig`   | 必填 —— 已解析的 ubean 配置                                                   |
| `ssr`      | `boolean`               | 可选 SSR 标记                                                                 |
| `registry` | `VirtualModuleRegistry` | 与 `ubeanPlugin()` 同一个实例；否则由 `createVirtualRegistry()` 各自持有      |
| `vue`      | `boolean`               | 是否注册 `@vitejs/plugin-vue`（默认 **true**）；自带 Vue 插件配置时传 `false` |

`ubeanVite` 拥有 `@vitejs/plugin-vue` 的注册权，因为裸 `vite dev` 只会经过这一条入口 —— 若改由 CLI 注册，
同一份 `.vue` 会被编译两次。`VUE_PLUGIN_INCLUDE` 与它一起导出（`[/\.vue$/, /\.md$/]`）。

自行组装插件数组的工具可用的模块工厂：

```ts
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from '@ubean/build/vue';
```

## 虚拟模块

入口：`@ubean/build`（主入口）。

虚拟模块是注册表后面的普通对象，不是全局变量。框架路径用 `createVirtualRegistry()` 建一个并**显式注入**给插件
—— 模块级单例会让同一个 builder 的环境之间互相污染（ADR-0012 §6）。

```ts
import { createVirtualRegistry, defineVirtualModule, defineVirtualModulePrefix } from '@ubean/build';

const registry = createVirtualRegistry([
  defineVirtualModule('virtual:ubean-app-config', () => 'export const config = { mode: "fullstack" };'),
  defineVirtualModulePrefix('virtual:ubean-page:', id => `export default {}; // ${id}`)
]);
```

| 导出                                                                                       | 说明                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `VirtualModuleRegistry`                                                                    | 注册表类：`register` / `resolveId` / `load` / `getModules` / `invalidate` |
| `createVirtualRegistry(modules?)`                                                          | 建独立实例（推荐形态）                                                    |
| `defineVirtualModule(id, loader)`                                                          | 精确 id 模块                                                              |
| `defineVirtualModulePrefix(prefix, loader)`                                                | 前缀匹配的模块族                                                          |
| `useVirtualRegistry()` / `resetVirtualRegistry()`                                          | 已废弃的模块级单例 —— 仅供既有测试                                        |
| `VirtualModule`、`VirtualModuleResolver`、`VirtualModuleContext`、`VirtualModuleTransform` | 类型                                                                      |

框架提供的模块：

| 工厂                                                                         | 虚拟模块                  |
| ---------------------------------------------------------------------------- | ------------------------- |
| `createRoutingVirtualModule(routes, middlewares, cwd)`                       | API 路由 + 中间件         |
| `createPagesVirtualModule(pages, layouts, cwd)`                              | 页面 / 布局记录           |
| `createMetaVirtualModule()`                                                  | 路由元数据                |
| `createAppVirtualModule(apiRoutes, middlewares, pages, srcDir)`              | 应用配置                  |
| `createLocalesVirtualModule(locales, defaultLocale, srcDir, i18nConfigJson)` | 语言数据 + `loadLocale()` |

## 宏

入口：`@ubean/build`（主入口）。

`definePage` 是编译期宏。`transformMacros()` 在 `src/pages/`、`src/routes/`、`src/middleware/` 内提取并移除调用；
`stripMacros()` 是纯剥除器。

```ts
import { transformMacros, stripMacros } from '@ubean/build';

transformMacros('definePage({ cache: true })', '/app/src/pages/index.vue'); // → ''
stripMacros('definePage({ name: "Home" }); const a = 1;'); // → '; const a = 1;'
```

`MACRO_NAMES` **只**包含 `definePage`。往里加 `defineHandlerMeta` / `defineMiddleware` 会把运行时函数调用剥掉，
产出语法错误的产物 —— 那两个是真实运行时函数。

Vue SFC 在剥除后 `<script setup>` 为空时会保留一个注释块：一个只用 `definePage` 作为 setup 内容、
但同时有普通 `<script>`（`loader` + `definePage` 的文档约定形态）的页面，否则会丢掉默认导出并以
`MISSING_EXPORT "default"` 失败。

## dev 服务端自举

入口：`@ubean/build/vite`。

这些导出拥有 dev 请求路由与宿主 app，因此没有 CLI 时 `vite dev` 也能工作。

```ts
import { bootstrapDevApp, ubeanDevRequestPlugin, ensureDevApp } from '@ubean/build/vite';
```

| 导出                                                                     | 说明                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `bootstrapDevApp(options)`                                               | 由扫描结果创建 Hono dev app、接到 Vite SSR 图上、准备 `ready`、暴露 `rebuild` |
| `createDevApp(options)`                                                  | 扫描（可选）+ 创建宿主 app —— 不需要 Vite server                              |
| `createDevAppReady(options)`                                             | 幂等的首次请求初始化：locales、`defineServer`、`app.init()`、`onServerReady`  |
| `ubeanDevRequestPlugin(options)`                                         | 请求路由插件：前置判据 + 后置兜底                                             |
| `createUbeanRequestHandlers(server, options)`                            | 插件内部使用的处理器                                                          |
| `getDevApp(server)` / `ensureDevApp(server)`                             | 读取 / 懒自举某个 Vite server 关联的 dev app                                  |
| `enhanceDevApp(options)`                                                 | 把 SSR 图的加载器与渲染器接到已有 Hono app 上                                 |
| `isFrameworkHtmlPage(url)`                                               | 框架自有 HTML 页面（`/_devtools`、`/_scalar`、整个 `/__devframes/**`）        |
| `isViteResourceRequest(url, headers)`                                    | 请求是否属于 Vite                                                             |
| `collectDevCssLinks(moduleGraph)` / `injectStylesheetLinks(html, hrefs)` | CSS link 注入                                                                 |
| `toWebRequest(req, host, protocol)` / `sendWebResponse(res, webRes)`     | Node ↔ Web 适配                                                               |

dev 扫描协调（一套监听、一次扫描、一个重载顺序）：

| 导出                                                                        | 说明                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `DEV_SCAN_DIRS`                                                             | `routes`、`middleware`、`pages`、`layouts`、`plugins`、`app`、`api`、`locales` |
| `createDevScanCoordinator(options)` / `getDevScanCoordinator(server, init)` | 协调器生命周期                                                                 |
| `onDevScan(server, handler)`                                                | 订阅扫描结果                                                                   |
| `peekDevScanCoordinator(server)`                                            | 不触发初始化的读取                                                             |

`DEVTOOLS_PASS_THROUGH_PREFIXES`（`['/__devframes', '/__devtools', '/_devtools']`）是保留 dev 命名空间的
唯一声明 —— 按**裸字符串前缀**匹配，而不是按路径段，因为按段匹配会漏掉兄弟路径。

dev 安全头按模式推导：

```ts
import { resolveDevSecurityHeaders } from '@ubean/build/vite';

// `ssg` 模式默认关闭:静态产物没有框架注入的安全头。
resolveDevSecurityHeaders(config); // → boolean | Record<string, unknown>
```

基于 worker 的 dev 环境（`UbeanDevEnvironment`、`createUbeanDevEnvironmentFactory`、`createEnvRunnerTransport`、
`bridgeEnvRunnerInvokes`、`UBEAN_DEV_ENV_NAME`）及其生成的入口（`DEV_WORKER_FILE`、`getDevWorkerEntrySource`、
`writeDevWorkerEntry`、`invalidateDevWorkerModules`）从同一子路径导出。它们是**可运行能力，而非当前接线的 dev 路径**：
`createEnvironment` 目前没有注册点，SSR 在主进程执行。

## 预览

入口：`@ubean/build/vite`。

`ubeanPreviewPlugin()` / `attachPreviewMiddleware()` 让 `vite preview` 预览**产物本身**：fullstack / backend
在进程内加载构建产物 `dist/server/entry.mjs` 的 `createFetchHandler()`；spa / ssg 由与 CLI 内置服务器共用的
静态解析器服务。

```ts
import { ubeanPreviewPlugin, resolvePreviewFile, previewMimeType } from '@ubean/build/vite';

ubeanPreviewPlugin();
```

| 导出                                                                  | 说明                         |
| --------------------------------------------------------------------- | ---------------------------- |
| `ubeanPreviewPlugin(options?)`                                        | preview 插件                 |
| `attachPreviewMiddleware(server, config, host?)`                      | 挂到已有 preview server 上   |
| `createPreviewMiddleware(options)`                                    | connect 中间件               |
| `resolvePreviewFile(root, pathname, mode)`                            | `'spa'` / `'ssg'` 的静态解析 |
| `sendPreviewFile(res, path)` / `sendPreviewStatus(res, status, text)` | 响应工具                     |
| `previewMimeType(filePath)`                                           | MIME 查询                    |

cloudflare 产物经 miniflare 预览，后者是可选依赖：

```ts
import { createCloudflarePreviewRunner } from '@ubean/build/vite';

const result = await createCloudflarePreviewRunner({ cwd, outDir });
// → { ok: false, reason: 'miniflare-missing', hint: MINIFLARE_INSTALL_HINT }
```

`MINIFLARE_INSTALL_HINT` 给出替代方案：_Install it with `pnpm add -D miniflare`, or preview with
`wrangler dev` instead._

## Server Actions

入口：`@ubean/build/actions`。

插件检测 `defineAction()` 调用表达式并按环境拆分：**服务端**注入 `filePath`（以及可推断的 `name`），
使 action ID 在 dev 与构建间稳定；**客户端**把调用替换为 `createActionStub('<id>')` —— 一个 POST 到 `/__actions`
的 RPC stub。

它已包含在 `ubean/vite` 的组合版 `ubeanPlugin()` 中 —— 只有自行组装插件数组时才需要手动加入。

```ts
import { ubeanServerActionsPlugin } from '@ubean/build/actions';

plugin: ubeanServerActionsPlugin({ root: process.cwd() });
```

| 导出                                                        | 说明                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `findDefineActionCalls(code)` / `hasDefineActionCall(code)` | 检测                                                    |
| `transformActionsForServer(code, filePath, root)`           | 注入 `filePath` / `name`                                |
| `transformActionsForClient(code, filePath, root)`           | 替换为 `createActionStub(...)`                          |
| `ServerActionsPluginOptions`                                | `{ root?: string }` —— 默认插件创建时的 `process.cwd()` |

name 推断顺序：options 对象里的 `name` 属性 → 赋值目标的变量/属性名（`export const login = defineAction(...)`
→ `'login'`）→ `'anonymous'`。

## 生产构建

入口：`@ubean/build/production`。

```ts
import { buildWithEnvironments, getPresetBuildConfig, generateNodeServerEntry } from '@ubean/build/production';

const manifest = await buildWithEnvironments({
  cwd,
  config,
  preset,
  scanResult,
  minify: true,
  sourcemap: false,
  contentSnapshot
});
```

| 导出                                                                                                    | 说明                                                                                          |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `buildWithEnvironments(options)`                                                                        | 一次 `createBuilder` 完成整套构建；返回 `BuildManifest`                                       |
| `BuildOptions`                                                                                          | `cwd`、`config`、`preset`、`scanResult`、`minify?`、`sourcemap?`、`contentSnapshot?`          |
| `BuildManifest`                                                                                         | `assets`、`entry`、`clientDir`、`serverDir`、`preset`                                         |
| `getPresetBuildConfig(preset)`                                                                          | `{ format, target, entryType, external }` —— `entryType` 为 `'node'` / `'worker'` / `'fetch'` |
| `generateNodeServerEntry()` / `generateStandardHandlerEntry()` / `generateCloudflareWorkerEntry()`      | 按 entryType 生成服务端产物                                                                   |
| `generateVirtualModulesToDisk(cwd, config, scanResult, virtualDir, preset, registry, contentSnapshot?)` | 虚拟模块的构建期快照                                                                          |
| `serializePagesForEntry(pages)`                                                                         | 把扫描到的页面序列化进服务端入口                                                              |
| `createIslandsSsrStubPlugin()`                                                                          | SSR 期的 islands 注册表空壳                                                                   |

**`serializePagesForEntry()` 是一份白名单，而这份白名单承载语义。** 它此前只序列化
`relativePath` / `name` / `route` / `layout` / `reuseTarget` / `isReuse` / `pageMeta`，于是 `matchers` 与 `slot`
**在生产构建里消失** —— dev 用扫描得到的活对象因此一切正常，而带 `[id=numeric]` 的路由在 dev 返回 404、
在生产返回 200。给 `ScannedPage` 加字段就必须同步加到这里；`packages/builder/test/page-metadata.test.ts`
逐字段锁住这份名单。

`buildWithEnvironments()` 在执行期间声明「构建由调用方驱动」（`UBEAN_BUILD_DRIVEN_BY_CLI=1`），
使插件的 `config` 钩子**不要**再注册自己的 `buildApp` —— 否则插件的返回值会覆盖内联的 `builder` 字段，
表现为构建静默产出空结果。

## 预渲染

入口：`@ubean/build/prerender`。

`prerender()` 用 `fetcher` 跑收集到的路由列表、落盘 HTML，并可选把页面 payload 外置为 `__data.json`。

```ts
import { prerender, collectPrerenderRoutes, routeToFilePath } from '@ubean/build/prerender';

const result = await prerender({
  cwd,
  outputDir: 'dist',
  pages,
  prerender: { all: true },
  fetcher: async url => ({ html: await render(url), statusCode: 200 }),
  expandRoutes: routes => routes, // i18n 展开钩子
  notFoundRoute: true // 静态 SSG:把 404 哨兵入队 → 404.html
});
```

| 导出                                                     | 说明                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `prerender(options)`                                     | 完整运行 → `PrerenderResult`                                          |
| `collectPrerenderRoutes(pages, options)`                 | `{ routes, skipped }`；合并 `include` + routeRule 发现 + content 路由 |
| `extractPrerenderRoutesFromRules(routeRules)`            | 标记 `prerender: true` 或 `ppr: true` 的路由                          |
| `extractLinks(html, baseUrl?)`                           | 爬链支持                                                              |
| `routeToFilePath(route, outputDir)`                      | `/` → `index.html`，404 哨兵 → `404.html`，`/robots.txt` 原样保留     |
| `routeToDataFilePath(route, outputDir)`                  | 每个路由的 `__data.json` 路径                                         |
| `extractDataPayload(html, route)`                        | 从 HTML 中抽出 `__UBEAN_DATA__` → `ExtractedPayload`                  |
| `writePrerenderedFile(filePath, html)`                   | 写入工具                                                              |
| `resolvePrerenderStaticDir(cwd, buildOutputDir, config)` | 解析 `<outputDir>/public` —— 不再写死 `dist/public`                   |
| `generatePrerenderManifest(result, baseUrl?)`            | 供部署工具消费的清单                                                  |

`PrerendererOptions.fetcher` 是同构点：fullstack 路径提供 `createSsrFetcher`（导入真实 server entry，
逐路由走 Hono 管道），SSG 路径提供 `./static-render` 的直接渲染器。

## 静态渲染路径

入口：`@ubean/build/static-render`。

`mode: 'ssg'` 通过**最小静态 entry** 渲染，而不是走请求管道（ADR-0011）。`createStaticSsgRenderer()`
加载构建产物中的静态 entry 并返回同一个 fetcher 契约，因此 `prerender()` 无需改动。

```ts
import { createStaticSsgRenderer, matchRoutePattern, expandRoutesForLocales } from '@ubean/build/static-render';

const renderer = await createStaticSsgRenderer(cwd, manifest, {
  pages,
  notFoundPage,
  i18n: { enabled: true, strategy: 'prefix_except_default', defaultLocale: 'en', locales: ['en', 'zh'] }
});

const result = await prerender({
  ...options,
  expandRoutes: renderer.expandRoutes,
  fetcher: renderer.fetcher
});
```

| 导出                                           | 说明                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `createStaticSsgRenderer(cwd, manifest, init)` | 加载 `dist/server/entry.mjs`；失败返回 `undefined`             |
| `StaticSsgRenderer`                            | `{ fetcher, expandRoutes, renderStaticPage }`                  |
| `StaticSsgRenderer.renderStaticPage`           | 生成进静态 entry 产物的函数（构建产物，不是本子路径的 import） |
| `compilePageRoute(page)`                       | 把扫描到的页面编译为可匹配路由                                 |
| `matchRoutePattern(pages, path)`               | 按特异性排序匹配；返回 `StaticRouteMatch \| null`              |
| `expandRoutesForLocales(routes, i18n)`         | 按 strategy 展开全语言 URL                                     |
| `STATIC_NOT_FOUND_ROUTE`                       | `'/__ubean_404__'` —— 404 哨兵路由                             |

**直接路径没有什么**（ADR-0011）：没有 Hono app、没有 API 路由、没有中间件、没有 crons、没有 IPX、
不生成 preset 包装文件。页面 `loader` **不执行** —— 导出它会打印一次性警告，数据只能来自 content collections、
模块级常量或客户端水合 fetch。Server actions、ISR / PPR / streaming、routeRule 的 redirect/rewrite
在静态产物里没有执行点。fullstack 的 `prerender` 路径正好相反：逐路由驱动真实 server entry，
因此 loader 与中间件都会跑。

`matchRoutePattern` 同时理解两种方言：扫描器的（`:param`、`**:slug`、`:id?`）与来自 `definePage({ path })`
的 vue-router 语法（`:param(regex)`、`:param*`、`:param+`）。参数会 `decodeURIComponent`，与 `c.req.param()` 对齐。

## 代码生成

入口：`@ubean/build/codegen`。

```ts
import { generateTypes, CODEGEN_CONTRACT_VERSION, CODEGEN_FILES } from '@ubean/build/codegen';

const result = await generateTypes(scanResult, {
  cwd,
  srcDir: 'src',
  buildDir: '.ubean',
  autoImports: config.autoImports,
  components: config.components
});
```

| 导出                                                                                     | 说明                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `generateTypes(result, options)`                                                         | 写出全部声明，返回 `CodegenResult` + `codegen.manifest.json`                |
| `generateRouteTypes(result, options)`                                                    | `routes.d.ts`（`ubean:routes`：`ApiRouteMap`、`ApiRoutePath`、`ApiMethod`） |
| `generatePageTypes(result, options)`                                                     | `pages.d.ts`（`ubean:pages`：`RouteName`、`LayoutName`）                    |
| `generateI18nTypes(result, options)` / `messagesToTsType(value, indent?)`                | `i18n.d.ts`（`vue-i18n` 的 `DefineLocaleMessage`）                          |
| `generateOpenApiTypes(schema, options)`                                                  | 由 OpenAPI schema 生成 `openapi.d.ts`                                       |
| `generateOpenApiTypesFromServer(baseUrl, options)`                                       | 同上，但从 base URL 拉取 `/_openapi.json`                                   |
| `generateAutoImports(scanResult, options)`                                               | 由扫描结果生成自动引入声明                                                  |
| `CODEGEN_CONTRACT_VERSION` / `CODEGEN_FILES` / `CodegenManifest` / `CodegenFileContract` | 产物文件契约（带版本，供 studio / IDE 消费）                                |

自动引入预设解析 —— 运行时插件与代码生成共用：

```ts
import { resolveAutoImportsConfig, resolveComponentsConfig, getAutoImportPresets } from '@ubean/build/codegen';

const resolved = resolveAutoImportsConfig(config.autoImports);
const presets = getAutoImportPresets(resolved);
```

`ResolvedAutoImports` 把 `boolean | AutoImportOptions` 拆成分库开关 —— `enabled`、`ubean`（默认 `true`）、
`vue`、`vueRouter`、`vueI18n`、`honoOpenapi`（其余默认 `false`）—— 外加透传用的原始 `options`。
预设常量也一并导出：`VUE_PRESET`、`VUE_MACROS_PRESET`、`UBEAN_CLIENT_PRESET`、`VUE_ROUTER_PRESET`、
`VUE_I18N_PRESET`、`UBEAN_SERVER_PRESET`、`HONO_OPENAPI_PRESET`、`BUILTIN_PRESETS`，以及 `toArray`、
`getBuiltinComposables`、`getUbeanAutoImportConfig`、`getUbeanComponentsConfig`、`generateImportsTransform`。
配对组件的两个半边（`**/*.server.vue`、`**/*.client.vue`）在组件扫描阶段被识别，因此由同一次代码生成产出声明。

**代码生成在哪里跑也是契约的一部分。** 此前只有 CLI 会跑，于是裸 `vite dev` / `vite build` 完全不产出
`.ubean/*.d.ts`，用户的类型检查直接不成立。现在插件在 `buildStart` 里跑 `generateTypes()`，
并在设置了 `UBEAN_CODEGEN_BY_CLI=1` 或 `UBEAN_BUILD_DRIVEN_BY_CLI=1` 时让位，保证每份产物只有一个执行者。

## 类型安全

- 每个子路径都带 `.d.ts`（`package.json` 逐 export condition 声明 `types`）。
- `CodegenResult` 返回它写出的每个产物的路径，调用方无需猜文件名。
- `CodegenManifest` + `CODEGEN_CONTRACT_VERSION` 是面向外部消费者（studio、IDE 插件）的机器可读契约 ——
  `codegen.manifest.json` 逐文件记录其虚拟模块、是否必需、本次是否真的生成。
- `PresetBuildConfig` 是 `ReturnType<typeof getPresetBuildConfig>`，因此服务端环境的外部化列表与 preset 实现保持同步。
- `VirtualModuleRegistry` 实现了 `VirtualModuleResolver` —— 插件消费的只读视图，因此插件代码无法改动被交给它的注册表。
- 配置类型从 `@ubean/config` 的 `ResolvedConfig` 流入；本包每个选项都用该类型，不重复声明配置形状。

## 架构说明

- **生命周期归属（ADR-0012）。** `config` 钩子注册 `client` + `ubean` 两个环境与
  `builder.buildApp`；因此 `vite dev | build | preview` 就是完整工具链。两次 `viteBuild` 的旧编排与
  `experimental.viteBuilder` 开关**已删除** —— 现在写这个字段会被静默忽略。回滚只能回退版本，这是有意的：
  一个能悄悄改语义的开关，代价高于回退版本。
- **三个阶段、两种驱动方。** `prepareBuild` → `runEnvBuilds` 是共用的；`buildWithEnvironments()` 自建 builder，
  而插件路径让 Vite 创建 builder，只调这两个阶段。在 `buildApp` 里调 `buildWithEnvironments()` 会递归。
- **不拆 `ssr` 环境。** 刻意不对齐 Nitro：ubean 是 Vue 专属，服务端入口本就把 Hono app 与 Vue 渲染器合成一体，
  第三个环境只会换来跨环境单例代理，别无所获（ADR-0012 §2）。
- **产物布局是 `dist/{public,server}` + `dist/manifest.json`。** 刻意不采用 `.output/` —— 该布局已被文档、
  preview 接管与 `analyze` 的基线读取承诺（ADR-0012 §5）。
- **预渲染保持在服务端产物之后。** 两条渲染路径都消费构建产物，因此 prerender 不能提到打包之前
  （对 Nitro 的第二处刻意偏离，ADR-0012 §4）。
- **资产标签在构建期内联**，不在运行时读 `<public>/.vite/manifest.json`。
- **绝不要从运行时路由代码 import 本包。** 它会把整条构建工具链打进服务端产物：在 Node 上只是体积浪费，
  在 worker 上则**构建期直接失败**，因为工具链的可选依赖（`velocityjs`、`atpl` …）无法打包。
  静态资源与缓存走平台层（ADR-0013）。
- **`env-runner` 不得成为本包的依赖** —— 它留在 `@ubean/cli`。加到这里会触发 pnpm 的 peer 变体分裂，
  表现为 `Plugin` 类型身份不一致的类型错误。dev 环境代码因此用本地结构性接口（`EnvRunnerLike`）。
- **跨实例共享状态挂 `globalThis`，不用模块级 `Map`。** dev 的 SSR 图会内联 `ubean`、外部化 `@ubean/vue`，
  两份模块实例共存且读到的注册表不是同一份，**没有任何报错**。组件/CSS resolver 注册表遵循这条规则。
