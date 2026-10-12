# @ubean/scan

**[English](./README.md) | 中文**

ubean 的项目扫描器与路由元数据：服务端目录扫描（API 路由、中间件、插件、crons、queues、locales、entries）+ 页面扫描聚合。

`@ubean/scan` 只走一遍 `src/`，返回一份归一化的「所有形状像路由的东西」的描述，于是 Vite 插件、router 与 CLI 读同一份数据，而不必各自重新实现 glob。

```ts
import { scanProject } from '@ubean/scan';

const result = await scanProject({ cwd: process.cwd(), srcDir: 'src' });

result.apiRoutes; // ScannedApiRoute[] — route, http methods, matchers, meta
result.middlewares; // ScannedMiddleware[]
result.pages; // ScannedPage[]
result.layouts; // ScannedLayout[]
result.defaultLocale; // string | undefined
result.appEntry; // { shared, server, client, root? }
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [扫描项目](#扫描项目)
- [服务端扫描](#服务端扫描)
- [页面扫描（所有权在 @ubean/vue）](#页面扫描所有权在-ubeanvue)
- [路由元数据提取](#路由元数据提取)
- [路由路径工具与 matcher](#路由路径工具与-matcher)
- [路由文件生成](#路由文件生成)
- [子路径导出](#子路径导出)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                           | 归属其他包                                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 服务端目录扫描：API 路由、中间件、插件、crons、queues、locales、app/server entries | **页面扫描 —— `@ubean/vue`**（页面路由所有者；`scanPages` 位于 `@ubean/vue/vite`） |
| 把页面扫描结果聚合进 `ScanResult`                                                  | 页面路由语义本身 —— `@ubean/vue`                                                   |
| `detectHttpExports` / `detectHttpExportsFromCode`（void 风格命名导出 → HTTP 方法） | 这些路由的请求处理 —— `@ubean/routes`                                              |
| `generateApiRouteId` 与 `defineHandlerMeta` 提取（服务端路由 meta）                | `definePage` 提取 —— 那是 re-export，来自 `@ubean/vue/vite`                        |
| 面向服务端消费方的 matcher 注册表入口                                              | 注册表实现 —— `@ubean/vue`（`matchers.ts`）                                        |

**运行时依赖白名单（主入口）：`@ubean/shared`、`@ubean/vue`、`pathe`、`tinyglobby`。** 没有 `@ubean/build`，没有 `@ubean/config`，也没有 `hono` —— 扫描发生在构建期，且 `@ubean/scan` 不依赖 Vue 本身（它依赖的是 `@ubean/vue`，其中承担扫描的模块与 Vue 无关）。

可选 peer —— `vue-router`（`^4.0.0`，`peerDependenciesMeta.optional`）。它只为页面扫描侧 re-export 的 `RouteLocation` / `RouteLocationRaw` 提供类型；纯服务端消费方若完全不碰页面路由可以不装。

## 安装

```bash
pnpm add -D @ubean/scan
# optional peer, only when you consume page-route types:
pnpm add vue-router
```

## 快速开始

```ts
import { scanProject, detectHttpExports } from '@ubean/scan';

const { apiRoutes, middlewares, defaultLocale } = await scanProject({
  cwd: process.cwd(),
  srcDir: 'src',
  dirs: { routes: ['routes', 'api'], locales: 'locales' },
  ignore: ['**/*.test.*']
});

for (const route of apiRoutes) {
  route.route; // '/api/users/:id'
  route.exports; // ['GET', 'POST']
  route.method; // 'GET' | … (undefined → registered for every method)
  route.hasMeta; // boolean
  route.matchers; // { id: 'numeric' } from [id=numeric].ts
}

await detectHttpExports('/abs/path/src/routes/users.ts');
// { exports: ['GET'], httpMethods: ['get'], hasMeta: false }
```

## 扫描项目

```ts
import { scanProject } from '@ubean/scan';
import type { ScanOptions, ScanResult } from '@ubean/scan';
```

| `ScanOptions` 字段 | 默认值                                                                                                                                                         | 说明                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `cwd`              | 必填                                                                                                                                                           | 项目根目录；`srcDir` 相对它解析                                     |
| `srcDir`           | 必填                                                                                                                                                           | 绝对或相对路径                                                      |
| `dirs`             | `{ routes: 'routes', middleware: 'middleware', pages: 'pages', layouts: 'layouts', plugins: 'plugins', crons: 'crons', queues: 'queues', locales: 'locales' }` | 每项接受 `string \| string[]`                                       |
| `ignore`           | `['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts']`                                                                                                         | 下划线前缀的文件/目录按约定视为私有                                 |
| `markdown`         | 框架模式下 `true`（`.md` + `.mdx`）                                                                                                                            | 传 `'md'` / `'mdx'` 可收窄；精简内核 `@ubean/vue/vite` **默认关闭** |
| `head`             | 框架模式下 `true`                                                                                                                                              | 启用 `pageObj.head` 链路；精简内核**默认关闭**                      |

九个目录扫描加 entry 探测并发执行（`Promise.all`）：`apiRoutes`、`middlewares`、`pages`、`layouts`、`plugins`、`crons`、`queues`、`locales`、`appEntry`、`serverEntry`。

数字前缀排序（`/^(\d+)\.(.+)$/`）作用于**中间件**与**插件** —— `01.auth.ts` 排在 `02.i18n.ts` 前，并把该整数记为 `order`。注意中间件**挂载顺序不按路径排序**；路由注册顺序由 `@ubean/routes` 的 `sortApiRoutesForRegistration` / `apiPathSpecificity` 负责。

`ScanResult` 是一个扁平对象：

| 字段            | 类型                                 | 说明                                                               |
| --------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `apiRoutes`     | `ScannedApiRoute[]`                  | `route`、`method?`、`exports`、`hasMeta`、`fileMeta?`、`matchers?` |
| `middlewares`   | `ScannedMiddleware[]`                | `order`、`global`                                                  |
| `pages`         | `ScannedPage[]`（来自 `@ubean/vue`） | 页面扫描结果                                                       |
| `layouts`       | `ScannedLayout[]`                    | —                                                                  |
| `plugins`       | `ScannedPlugin[]`                    | `order`                                                            |
| `crons`         | `ScannedCronTask[]`                  | `name`                                                             |
| `queues`        | `ScannedQueue[]`                     | `name`                                                             |
| `locales`       | `ScannedLocale[]`                    | `code`、`namespace?`、`isDefault?`、`name?`、`dir?`                |
| `defaultLocale` | `string \| undefined`                | 第一个带 `isDefault` 的 locale                                     |
| `appEntry`      | `ScannedAppEntry`                    | `{ shared, server, client, root? }`                                |
| `serverEntry`   | `ScannedServerEntry`                 | `{ shared, dev, prod }`                                            |
| `notFoundPage`  | `ScannedPage \| undefined`           | `pages/404.vue`（或 `.ts`/`.md`）                                  |
| `loadingPage`   | `ScannedPage \| undefined`           | `pages/loading.vue`                                                |
| `errorPage`     | `ScannedPage \| undefined`           | `pages/error.vue`                                                  |

`appEntry.root` 优先小写 `src/app.vue`，其次 `src/App.vue`，且只认 `.vue` —— `.ts` 命名已被 `defineApp` 配置入口占用（`app.ts` / `app.server.ts` / `app.client.ts`）。

## 服务端扫描

API 路由使用 void 风格命名导出 —— 单个文件可导出多个方法：

```ts
// src/routes/api/users.ts
export const GET = defineHandler(c => c.json([]));
export const POST = defineHandler(c => c.json({ ok: true }, 201));
```

```ts
import { detectHttpExports, detectHttpExportsFromCode, generateApiRouteId, HTTP_METHODS } from '@ubean/scan';

HTTP_METHODS; // ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] — no TRACE

const fromCode = detectHttpExportsFromCode(
  `export const GET = defineHandler(h); export const POST = defineHandler(h);`
);
// { exports: ['GET', 'POST'], httpMethods: ['get', 'post'], hasMeta: false }

generateApiRouteId('GET', '/api/users/:id'); // 'get' + generateRouteName('/api/users/:id')
```

`detectHttpExports(filePath)` 是读文件的异步版本。两者都返回 `DetectExportsResult`（`exports`、小写的 `httpMethods`、`hasMeta`、`fileMeta?`）。探测会读 `export` 声明、`export { … }` 列表、`defineHandlerMeta(` 调用，以及 `export const meta = { … }` 块（从中取 `requiresAuth`）。

**没有**导出任何 HTTP 方法的文件会被注册到**所有**方法（`route.method` 保持 `undefined`），这保证普通 handler 模块仍可用。从文件名解析出的 matcher 落在 `route.matchers` —— `routes/api/users/[id=numeric].ts` 变成 `{ id: 'numeric' }`；运行时 router 会校验它们，拒绝即视为「不匹配」，让 Hono 继续匹配下一候选。

## 页面扫描（所有权在 @ubean/vue）

`@ubean/scan` **不**扫描页面。`scanProject` 把 `{ cwd, srcDir, pagesDir, layoutsDir, ignore, markdown, head }` 转发给 `@ubean/vue/vite` 的 `scanPages`，并 re-export 结果类型。

```ts
// Still supported for compatibility, but this is a re-export:
import type { ScannedPage, ScannedLayout, ScanPagesOptions, ScanPagesResult } from '@ubean/scan';
// Preferred for page routes — the owner's own subpath:
import { scanPages } from '@ubean/vue/vite';
```

`dir` 默认值刻意不同：`@ubean/vue/vite` 是精简内核，`markdown` 与 `head` 都**关闭**；`@ubean/scan` 运行在框架模式，两者都**开启**，因为 SSR 需要 `pageObj.head` 链路。

## 路由元数据提取

```ts
import {
  extractDefinePage,
  extractDefinePageFromCode,
  extractDefineMeta,
  extractDefineMetaFromCode
} from '@ubean/scan';

await extractDefineMeta('/abs/path/src/routes/users.ts');
// { meta?: Record<string, unknown>, requiresAuth?: boolean } | null

const meta = extractDefineMetaFromCode(`export const meta = { requiresAuth: true };`);
// { meta: { requiresAuth: true }, requiresAuth: true }
```

这个拆分依据是所有权而非命名：`extractDefinePage*` 解析**客户端**的 `definePage({ … })` 宏，是从 `@ubean/vue/vite` re-export 的；`extractDefineMeta*` 解析**服务端**的 `defineHandlerMeta({ … })`，留在本包。两者都只提取调用的对象字面量（经 `extractCallObject`），绝不执行被扫描模块。

## 路由路径工具与 matcher

纯路径工具函数，re-export 出来是为了既有消费方保持导入路径不变：

```ts
import {
  filePathToRoute,
  stripRouteGroups,
  parseMatchers,
  extractSlotFromPath,
  generateRouteName,
  generateLayoutName,
  defineMatcher,
  getMatcher,
  hasMatcher,
  listMatcherNames,
  clearMatchers,
  validateParams,
  createMatcherGuard
} from '@ubean/scan';

filePathToRoute('pages/(admin)/users/[id].vue'); // '/(admin)/users/:id' → groups stripped downstream
stripRouteGroups('/(admin)/users/:id'); // '/users/:id'
parseMatchers('users/[id=numeric]'); // { id: 'numeric' }
extractSlotFromPath('pages/@dialog/photo.vue'); // 'dialog'
generateRouteName('/users/:id'); // 'UsersId'
```

所有权：`filePathToRoute` / `stripRouteGroups` / `parseMatchers` / `extractSlotFromPath` / `generateRouteName` / `generateLayoutName` 来自 `@ubean/vue/vite`；matcher 注册表（`defineMatcher` / `getMatcher` / `hasMatcher` / `listMatcherNames` / `clearMatchers` / `validateParams` / `createMatcherGuard`）来自 `@ubean/vue`。`@ubean/scan` 只做聚合。matcher 注册表刻意挂在 `globalThis` 上，使得 dev 的 SSR 图内联 `ubean`、外部化 `@ubean/vue` 时，服务端（`src/server.ts`）与客户端（`src/app.ts`）仍共享同一实例。

## 路由文件生成

```ts
// Backwards-compatible alias with identical exports:
import { RouteFileGenerator, generateRouteFiles, DEFAULT_HEADER_COMMENT } from '@ubean/scan/generator';
// Preferred: the owner's subpath
import { RouteFileGenerator, generateRouteFiles, DEFAULT_HEADER_COMMENT } from '@ubean/vue/generator';
```

`@ubean/scan/generator` 是对 `@ubean/vue/generator` 的直通 re-export；新代码应直接从所有者子路径导入。`GeneratorOptions` / `GeneratorResult` / `GeneratorScanInput` 为调用提供类型，`DEFAULT_HEADER_COMMENT` 用于标注生成文件。

## 子路径导出

| 子路径                  | re-export 内容                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/scan`           | 下列全部，聚合入口                                                                                                        |
| `@ubean/scan/types`     | `ScanOptions` / `ScanResult` / `Scanned*` / `HttpMethod` / `HTTP_METHODS` / 三个 `GLOB_*` 模式，以及 re-export 的页面类型 |
| `@ubean/scan/generator` | `RouteFileGenerator`、`generateRouteFiles`、`DEFAULT_HEADER_COMMENT`（来自 `@ubean/vue/generator`）                       |

`GLOB_*` 常量描述每类扫描匹配的文件集合：`GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}'`、`GLOB_VUE_PATTERN = '**/*.{vue,ts,md,mdx}'`、`GLOB_LAYOUT_PATTERN = '**/*.{vue,ts}'`。

## 类型安全

- `HTTP_METHODS` 是 `as const`，因此 `HttpMethod` 是字面量联合 `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'` —— 而 `ScannedApiRoute.method` 同时接受 `Lowercase<HttpMethod>`，与运行时 router 对齐。
- 每个 `Scanned*` 接口都继承 `ScannedFile`（`fullPath`、`relativePath`、`dirname`、`basename`），因此扫描结果携带足够信息去读取、重写或比对文件。
- `ScannedApiRoute.fileMeta` 的类型是来自 `@ubean/shared` 的 `RouteMeta` —— 扫描与路由对元数据形状达成一致，而不是各自声明一份。
- `PageMeta` / `PageHead` / `ScannedPage` / `ScannedLayout` / `ScanPagesOptions` / `ScanPagesResult` 从 `@ubean/vue` re-export；`ScannedPageRoute` 保留为 `ScannedPage` 的向后兼容别名，使最终移除是一次弃用而非破坏性变更。
- `DefineMetaResult`（`{ meta?, requiresAuth? }`）与 `DetectExportsResult` 描述提取输出。
- `vue-router` 保持**可选** peer：这里 re-export 的页面路由类型只有在你真正消费它们时才需要它。

## 架构说明

- **一次扫描，多方消费。** `scanProject` 并发跑九个扫描并返回扁平 `ScanResult`；Vite 插件、router 与 CLI 读这个对象而不是各自 glob —— 这正是 virtual 与 file 两种路由模式保持一致的原因。
- **页面扫描只有一个所有者。** `@ubean/vue` 拥有页面路由及其扫描器（`@ubean/vue/vite`）；`@ubean/scan` 负责聚合。这些 re-export 纯粹是为了让众多既有消费方（`packages/vite`、`api-routes`、`builder`、`cli`）在搬迁过程中不必改导入路径。
- **提取是静态的。** `extractDefinePage*` / `extractDefineMeta*` 解析源码文本与调用实参，绝不 import 被扫描模块，因此带顶层副作用的 route 文件也能安全扫描。
- **约定优于配置。** 下划线前缀的文件/目录视为私有（`**/_*` 在默认 ignore 列表中），数字前缀给中间件/插件排序，`@slotName/` 目录标记并行路由插槽。拦截路由（`(.)` / `(..)` / `(...)`）刻意**不做** —— 扫描器遇到这些标记段会直接抛错，而不是静默降级成字面路径。
- **仅构建期使用。** 服务端专用、Node 专用；绝不要从客户端代码导入（见 AGENTS.md 陷阱 #23：worker 目标）。
