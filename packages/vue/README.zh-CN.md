# @ubean/vue

**[English](./README.md) | 中文**

ubean 的精简 Vue 客户端内核 & 页面路由唯一所有者。

`@ubean/vue` 拥有 ubean 生态中**页面路由**的一切：文件路由扫描、虚拟模块生成、实体路由文件生成、页面缓存（keep-alive）、页面过渡、重载信号与 `definePage` 宏。以 Vue **插件**形式接入（无应用工厂、无 router 工厂），运行时**仅依赖 `vue` + `vue-router`**。

```ts
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { ubeanVue } from '@ubean/vue';
import { routes } from 'virtual:ubean-vue-routes'; // 由 @ubean/vue/vite 生成

const router = createRouter({ history: createWebHistory(), routes });
const app = createApp(App);
app.use(router);
app.use(ubeanVue, { routes }); // 注册 Link/PageView/SlotView + 播种页面缓存
app.mount('#app');
```

## 目录

- [@ubean/vue](#ubeanvue)
  - [目录](#目录)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [文件路由](#文件路由)
    - [约定](#约定)
    - [definePage 宏](#definepage-宏)
    - [reuse 路由](#reuse-路由)
    - [特殊页](#特殊页)
    - [并行路由与拦截路由](#并行路由与拦截路由)
    - [动态参数 matcher](#动态参数-matcher)
    - [Markdown 页面（opt-in）](#markdown-页面opt-in)
  - [路由输出模式](#路由输出模式)
  - [Vite 插件 API](#vite-插件-api)
  - [实体路由文件生成器](#实体路由文件生成器)
  - [虚拟模块导出面](#虚拟模块导出面)
  - [Vue 插件](#vue-插件)
  - [组件](#组件)
    - [`<PageView>`](#pageview)
    - [`<Link>`](#link)
    - [`<SlotView>`](#slotview)
    - [`<LayoutChainRenderer>`](#layoutchainrenderer)
    - [`<ErrorBoundary>`](#errorboundary)
  - [组合式函数](#组合式函数)
  - [页面缓存（keep-alive）](#页面缓存keep-alive)
  - [页面过渡与重载](#页面过渡与重载)
  - [View Transitions 工具](#view-transitions-工具)
  - [路由 Matcher API](#路由-matcher-api)
  - [页面级 head（opt-in）](#页面级-headopt-in)
  - [路由纯函数](#路由纯函数)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

`@ubean/vue` 是**精简客户端内核**，也是 ubean 中**页面路由逻辑的唯一所有者**：

| 层                            | 职责                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `@ubean/vue`（本包）          | 页面路由：扫描、虚拟模块、实体路由文件生成器、matcher、head 守卫、页面缓存、过渡、重载 —— 纯客户端 |
| `@ubean/scan`（聚合层）       | 依赖 `@ubean/vue`；叠加服务端路由（rou3）、API 路由扫描、SSR 页面处理                              |
| `@ubean/client`（框架运行时） | 应用工厂（`createUbeanClientApp` / `createUbeanSSRApp`）、unhead/SEO、i18n、islands、数据层        |

**包含：**

- `ubeanVue` Vue 插件（唯一接线入口 —— 插件优先，无工厂）
- `<PageView>` / `<Link>` / `<SlotView>` / `<LayoutChainRenderer>` / `<ErrorBoundary>`
- 页面缓存（keep-alive）store：命令式 + 声明式 API
- 页面过渡与重载信号（按页重载 + 缓存新鲜重建）
- View Transitions 工具（特性检测 + 包装器）
- `definePage` 客户端宏（构建期提取，运行时 no-op）
- 动态路由 matcher（`[param=matcher]` 语法 + 注册表 + 守卫）
- 页面级 head（`setupPageHeadGuard` / 懒加载 `createPageHead`）
- 文件路由 Vite 插件（`/vite` 子路径）：多目录扫描、reuse 路由、特殊页、并行/拦截路由、markdown 与 head 按需开启
- 实体路由文件生成器（`/generator` 子路径）：`routes.ts` + `imports.ts` + `typed-router.d.ts`（file 模式）

**不包含**（框架运行时 `@ubean/client` 的职责）：

- 应用工厂（`createUbeanClientApp` / `createUbeanSSRApp`）
- unhead / `<Head>` / SEO（仅 opt-in 的 head _守卫_ 在这里）
- i18n（`Link` 原样渲染路径，除非通过 `LOCALIZE_PATH_KEY` 注入 localizer）
- Islands（`v-client` 指令）、SSR 状态助手、自动引入预设

**运行时依赖白名单（主入口）：仅 `vue` + `vue-router`。** 无 `@ubean/*`、无 `node:*`、无 `@unhead/vue` 静态导入。

## 安装

```bash
pnpm add @ubean/vue vue vue-router
# 构建期（文件路由）：
pnpm add -D vite @ubean/vue # /vite 与 /generator 子路径是本包的一部分
# 可选 peer（懒加载，仅启用时加载）：
pnpm add @ubean/markdown   # markdown 页面
pnpm add @unhead/vue       # 页面级 head（SPA）
```

## 快速开始

**1. Vite 配置** —— 插件扫描页面并生成 `virtual:ubean-vue-routes`：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { ubeanVueVite } from '@ubean/vue/vite';

export default {
  plugins: [vue(), ubeanVueVite()]
};
```

**2. 引导** —— 自行创建 router，然后安装插件：

```ts
// src/main.ts
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { ubeanVue } from '@ubean/vue';
import { routes } from 'virtual:ubean-vue-routes';
import App from './App.vue';

const router = createRouter({ history: createWebHistory(), routes });
const app = createApp(App);
app.use(router);
app.use(ubeanVue, { routes });
app.mount('#app');
```

**3. 应用外壳** —— `<PageView />` 是页面出口（keep-alive / 过渡 / 重载都在这里生效）：

```vue
<!-- src/App.vue -->
<template>
  <nav>
    <Link to="/">首页</Link>
    <Link to="/about">关于</Link>
  </nav>
  <main><PageView /></main>
</template>
```

完整可运行示例见 [`examples/client-only-spa`](../../examples/client-only-spa)。

## 文件路由

### 约定

默认页面扩展名为 `vue` / `tsx` / `jsx`（可用 `extensions` 选项覆盖）。`.ts` **不是**页面扩展名 —— 脚本页面请使用 `.tsx` / `.jsx` 或 `.vue`。布局使用 `vue` / `ts`。

```
src/pages/
├── index.vue                 →  /                        Home
├── about.vue                 →  /about                   About
├── users/index.vue           →  /users                   Users
├── users/[id].vue            →  /users/:id               UsersId
├── users/[id=numeric].vue    →  /users/:id  + matcher    （见 matcher）
├── blog/[...slug].vue        →  /blog/**:slug            BlogAllSlug（catch-all）
├── docs/[[page]].vue         →  /docs/:page?             DocsPageOptional
├── (marketing)/about.vue     →  /about                   About（组名剥离）
├── settings.tsx              →  /settings                Settings（JSX 页面）
├── 404.vue                   →  catch-all + NotFound     （特殊页）
└── guide.md                  →  /guide                   Guide（markdown，opt-in）
```

支持多个 `pagesDir` / `layoutsDir`（先到先得去重，可分层叠加目录）。

- 路由名由路径按 PascalCase 派生（`users/[id]` → `UsersId`）。
- `definePage({ name, path })` 可覆盖两者。
- 路由组 `(name)` 不参与 URL 与路由名。

### definePage 宏

在 `<script setup>` 顶层（或 `.tsx`/`.jsx`/`.reuse.ts` 顶层）声明页面元信息：

```vue
<script setup lang="ts">
import { definePage } from '@ubean/vue';

definePage({
  name: 'UserProfile', // 覆盖文件派生的路由名
  path: '/u/:id', // 覆盖文件派生的路径
  cache: true, // keep-alive 页面缓存
  transition: 'fade', // 页面级过渡名
  layout: 'admin', // 布局标记：名、数组（外→内）或 false
  requiresAuth: true, // 鉴权标记 → route.meta.requiresAuth
  head: { title: 'Profile' }, // 页面 head（需插件 `head: true`）
  meta: { custom: 'any' } // 任意 RouteMeta 扩展
});
</script>
```

双重语义：

- **构建期（推荐）**：`/vite` 插件提取参数对象，合并进生成的路由表，并把调用从产物中剥除（零运行时开销）。
- **运行时兜底**：无插件环境下函数是 no-op —— 不报错、无副作用，页面按文件派生的路径/名称注册；`cache` 可在运行时用 `enablePageCache(name)` 补齐。

> 需要按路由声明守卫时用 `meta: { middleware: [...] }` 并在自己的导航守卫中消费。

### reuse 路由

`.reuse.ts` / `.reuse.js` 是**纯元数据文件**（只含 `definePage({ reuse })`），注册一条复用另一页面组件的新路由：

```ts
// src/pages/about2.reuse.ts
definePage({ reuse: 'About' });
// → /about2 路由渲染 About 页面组件
```

- `.reuse.vue` **不属于**该约定 —— 带 `.vue` 扩展名的是真实组件，按普通页面处理（路由 `/xxx.reuse`）。
- 未显式声明 `cache` 的 reuse 路由**继承**目标页的缓存设置；声明 `cache: false` 可关闭。
- 目标必须是常规（非 reuse）页面。

### 特殊页

页面目录根级文件接入框架插槽：

| 文件                           | 角色                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `404.vue`（或 `.tsx` / `.md`） | Vue Router catch-all `/:pathMatch(.*)*`，名为 `NotFound`   |
| `loading.vue`                  | 异步页面加载时的 `<Suspense>` fallback（经 `LOADING_KEY`） |
| `error.vue`                    | `<ErrorBoundary>` 的错误组件（经 `ERROR_KEY`）             |

仅根级文件是特殊页 —— `users/404.vue` 仍是 `/users/404` 的常规路由。

### 并行路由与拦截路由

- **并行路由**：`@slotName/` 目录注册命名视图，用 `<SlotView name="slotName" />` 渲染。
- **拦截路由**：`(..)target/`、`(.)target/`、`(...)target/`（上一级 / 同级 / 根级），Next.js 风格。

```
src/pages/dashboard/@analytics/index.vue   → 并行插槽 "analytics"
src/pages/photos/(..)photo/[id].vue        → 从 /photos/* 拦截 /photo/:id
```

### 动态参数 matcher

`[param=matcherName]` 文件语法为动态段附加校验 matcher：

```
src/pages/users/[id=numeric].vue  →  /users/:id + meta.matchers = { id: 'numeric' }
```

用 `defineMatcher` 注册 matcher（见[路由 Matcher API](#路由-matcher-api)），用 `createMatcherGuard` 强制执行；校验失败重定向到 `NotFound` 路由。

### Markdown 页面（opt-in）

用 `markdown: true`（`md` + `mdx`）、`'md'` 或 `'mdx'` 开启。需要 `@ubean/markdown`（optional peer，仅开启时懒加载）：

```ts
ubeanVueVite({ markdown: true });
```

frontmatter 映射到页面元信息（`name` / `path` / `layout` / `cache` / `head`）：

```md
---
name: Guide
layout: docs
cache: true
head:
  title: Guide
---

# Guide 内容
```

## 路由输出模式

两种模式均由 `@ubean/vue` 所有：

| 模式             | 产物                                                      | 消费方                                            |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------- |
| **虚拟**（默认） | 内存模块 `virtual:ubean-vue-routes` + `typed-router.d.ts` | 精简 SPA；框架 virtual 模式                       |
| **实体文件**     | 落盘的 `routes.ts` + `imports.ts` + `typed-router.d.ts`   | file 模式 —— `meta` 可编辑、免 `import.meta.glob` |

框架经 `ubean.config.ts` 的 `routing.mode`（`'virtual'` | `'file'` | `'both'`，见 `@ubean/builder`）接线；精简 SPA 直接用 `/vite` 插件，也可手动调用 `/generator` 子路径。

## Vite 插件 API

```ts
import { ubeanVueVite } from '@ubean/vue/vite';

ubeanVueVite({
  pagesDir: 'src/pages', // string | string[]（相对项目根或绝对路径）
  layoutsDir: 'src/layouts', // string | string[]
  extensions: undefined, // 默认 ['vue', 'tsx', 'jsx'];markdown 扩展自动追加
  ignore: [], // 额外 glob ignore
  generateTypes: true, // 生成 typed-router.d.ts
  dtsDir: '.ubean', // 类型声明产物目录（相对项目根或绝对路径）
  markdown: false, // true | 'md' | 'mdx'
  head: false // 开启页面级 head 提取
});
```

插件还导出独立工具函数：`scanPages`、`scanClientPages`、`extractSlotAndIntercept`、`generatePagesModuleSource`、`generateTypedRouter`、`stripDefinePageCalls`、`filePathToRoute`、`parseMatchers`、`stripRouteGroups`、`generateRouteName`、`generateLayoutName`、`extractDefinePage`、`extractDefinePageFromCode`、`extractCallObject`、`normalizePageHead`。

## 实体路由文件生成器

`/generator` 子路径在磁盘上生成可编辑的路由文件（`@ubean/vue/generator`）：

```ts
import { generateRouteFiles } from '@ubean/vue/generator';

const result = await generateRouteFiles(
  { pages, layouts },               // GeneratorScanInput —— ScanPagesResult 的结构子集
  {
    cwd: process.cwd(),
    srcDir: 'src',                  // 默认 @/ 导入路径的基准
    outDir: 'src/router/_generated',
    // dtsPath: '…',                // 默认: <outDir>/typed-router.d.ts
    // generateRoutes / generateImports / generateDts: true,
    routeLazy: true,                // 或 (page) => boolean
    layoutLazy: true,
    getRouteMeta: page => ({ ... }),   // 额外 meta(definePage meta 优先)
    getImportPath: page => `@/pages/${page.name}.vue`,
  }
);
// → { routesPath, importsPath, dtsPath, routeCount, layoutCount }
```

在 `outDir` 下产出 3 个文件：

- `routes.ts` —— 扁平 `RouteRecord[]`（`name` / `path` / `component`（`views` 的 key）/ `layout` / `meta` / `cache` / `requiresAuth`；reuse 路由的 `component` 指向目标页）
- `imports.ts` —— `views` / `layouts` 懒加载映射 + 分类 key 类型（`RouteKey` / `RouteFileKey` / `RouteReuseKey` / `LayoutKey`）
- `typed-router.d.ts` —— `@ubean/scan` 模块增强（`RouteKey` / `RoutePathMap` / `RouteLayoutKey` / `ReuseRouteKey`）+ `vue-router/auto-routes` 的 `RouteNamedMap`（类型化 `useRoute<Name>(name)` 参数推断）

同时导出 `RouteFileGenerator` 类供增量使用（`new RouteFileGenerator(options).generate(scan)`）。

> dts 仍增强 `@ubean/scan` 模块 —— 这是框架层的既有类型契约（框架代码从 `@ubean/scan` 导入 `RouteKey` 等）；生成器的物理位置不改变产物。精简 SPA 使用 `/vite` 插件的虚拟模式 `typed-router.d.ts`，不经过本生成器。

## 虚拟模块导出面

`virtual:ubean-vue-routes` 导出：

| 导出                                                          | 说明                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `routes`                                                      | Vue Router `RouteRecord[]`（含 `meta.cache` / `transition` / `matchers` / `head` 等） |
| `pages` / `layouts`                                           | `{ [name]: () => Promise<Component> }` 懒加载器                                       |
| `pageNames` / `layoutNames`                                   | 名称数组（存在 404 时包含 `NotFound`）                                                |
| `defaultLayout`                                               | 默认布局名或 `null`                                                                   |
| `resolvePageComponent(name)` / `resolveLayoutComponent(name)` | 组件解析器（reuse 路由解析目标页）                                                    |
| `loadingComponent` / `errorComponent`                         | 特殊页组件或 `null`                                                                   |
| `resolveLoadingComponent()` / `resolveErrorComponent()`       | 懒加载解析器                                                                          |
| `hasNotFoundPage()` / `hasErrorPage()`                        | 存在性检查                                                                            |

## Vue 插件

```ts
app.use(ubeanVue, { routes });
```

注册 `Link` / `PageView` / `SlotView` 全局组件，并从 `meta.cache: true` 声明播种 keep-alive include 列表（`initCachedViewsFromRoutes`）。这是本包主入口**唯一**的接线入口（与 `/vite` 子路径的同名 Vite 插件是两个不同入口）。

## 组件

### `<PageView>`

页面出口。将匹配的组件包裹在 `<Transition>` + `<KeepAlive>` 中（通过注入键提供 loading/error 组件时再加 `<Suspense>` / `<ErrorBoundary>`）。

Props：

- `transition: string | boolean` —— 过渡名，`false` 禁用。优先级：prop > `route.meta.transition` > 全局 `usePageTransition()`。
- `reloadKey: string | number` —— 强制重挂载的响应式 key；默认 `route.fullPath` + 按页重载计数。
- `mode: 'default' | 'out-in' | 'in-out'` —— 默认 `'default'`（交叉过渡）。因 vue@3.5.x KeepAlive 上游 bug，`'out-in'` 降级为 `'default'` 并给出 dev 警告。

SSR 场景（经 `SSR_KEY`）跳过 KeepAlive/Transition/Suspense/ErrorBoundary。

### `<Link>`

内部链接经 `RouterLink` 渲染；外部链接（`http*`、`//`、`#`）渲染为原生 `<a target="_blank" rel="noopener noreferrer">`。

Props：`to`（字符串或位置对象）、`href`、`replace`、`activeClass`、`exactActiveClass`、`noActiveClass`、可选 `locale`。路径本地化经 `LOCALIZE_PATH_KEY` opt-in（框架运行时提供；精简 SPA 原样渲染路径）。

### `<SlotView>`

`<SlotView name="modal" />` 渲染并行路由插槽匹配到的组件（无匹配时不渲染）。

### `<LayoutChainRenderer>`

递归渲染嵌套布局链（框架工厂构建链；精简 SPA 可在渲染函数中直接使用）。

### `<ErrorBoundary>`

捕获后代组件的渲染/异步/setup 错误并渲染配置的错误组件；路由变更时自动重置。

## 组合式函数

- **`usePage<T>()`** —— 精简版页面数据访问：原样返回 `PAGE_KEY` 注入的数据（`props` / `component` / `errors`），未注入时返回共享空对象。**不含**路由态（`url` / `params` / `query` / `meta`）—— 请直接用 vue-router 的 `useRoute()`。框架运行时（`@ubean/client`）在其上叠加自己的路由感知 `usePage` 提供完整 PageObject 协议。
- **`useRouter()`** —— 请直接导入 vue-router 的 `useRouter()`，`push` / `replace` 保留 `RouteNamedMap` 类型化重载（`@ubean/client` 仅作纯 re-export）。
- **`useCacheViews()`** —— 见[页面缓存](#页面缓存keep-alive)。
- **`usePageTransition()`** —— `{ name, set, clear, enabled }` 全局过渡名。
- **`useReloadSignal()`** —— `{ counter, reloading, reload(routeName?, duration?) }`。
- **`useViewTransition()`** —— `{ enabled, supports, options }` 原生 View Transitions。

## 页面缓存（keep-alive）

声明式：

```ts
definePage({ cache: true }); // 或路由 meta: { cache: true }
```

命令式：

```ts
import {
  enablePageCache, // enablePageCache('DashboardIndex')
  disablePageCache, // 从 include 列表移除（剪除实例）
  invalidatePageCache, // 清除某页（或全部）缓存实例
  isPageCached,
  excludePageCache, // 临时排除（下次渲染强制剪除）
  includePageCache,
  useCacheViews, // 响应式 store:cachedViews / excludedViews / enable / disable / ...
  resetRouteCache
} from '@ubean/vue';
```

缓存以**路由名**（`route.meta.pageName`）为 key —— 内核在渲染时把它注入为组件 `name`，使 `<keep-alive :include>` 能匹配 `<script setup>` SFC。

## 页面过渡与重载

```ts
import { setPageTransition, useReloadSignal } from '@ubean/vue';

setPageTransition('fade-slide'); // 全局默认;'' / 'none' 禁用
// 页面级:definePage({ transition: 'fade' }) 或路由 meta

const { reload } = useReloadSignal();
await reload('DashboardIndex'); // 空白 → 剪除旧缓存 → 新鲜重挂载
```

`reloadPage(name)` 只变更**该页**的 key —— 无关页面重载不会使其他页面的 keep-alive 条目失效。

## View Transitions 工具

```ts
import { supportsViewTransitions, withViewTransition, useViewTransitionState, getNavigationType } from '@ubean/vue';

if (supportsViewTransitions()) {
  await withViewTransition(
    async () => {
      /* 变更 DOM/状态 */
    },
    { types: ['slide-left'] }
  );
}
```

## 路由 Matcher API

```ts
import { defineMatcher, createMatcherGuard } from '@ubean/vue';

// src/matchers/numeric.ts
export default defineMatcher('numeric', value => /^\d+$/.test(value));

// router 设置 —— matcher 失败重定向到 NotFound
router.beforeEach(createMatcherGuard(/* { notFoundRouteName?, onReject? } */));
```

注册表工具：`getMatcher(name)`、`hasMatcher(name)`、`listMatcherNames()`、`clearMatchers()`（仅测试）、`validateParams(matchers, params)`。

## 页面级 head（opt-in）

插件开启 `head: true` 提取后：

```ts
import { createPageHead, setupPageHeadGuard } from '@ubean/vue';

const head = await createPageHead(); // 懒加载 @unhead/vue(optional peer)
setupPageHeadGuard(router, head); // 每次导航后 push route.meta.head
```

已有 unhead 实例？跳过 `createPageHead()` 直接传实例 —— `PageHeadClient` 是结构化类型（`{ push }`），核心不引入任何第三方依赖。

## 路由纯函数

```ts
import { resolveRoute, isActiveRoute } from '@ubean/vue';

resolveRoute({ name: 'UsersId', params: { id: 7 }, query: { tab: 'info' } }, routeMap);
// → '/users/7?tab=info'
isActiveRoute('/users/7', '/users', false); // → true（前缀匹配）
```

## 类型安全

- 本包增强了 `vue-router` 的 `RouteMeta`（`cache` / `pageName` / `layout` / `requiresAuth` / `transition` / `head` / `matchers`）—— 项目无需自写 `declare module` 即可获得完整类型安全。
- `generateTypes: true`（默认）时，`/vite` 插件把 `ubean-vue-routes.d.ts` + `typed-router.d.ts` 生成到 `dtsDir`（默认 `.ubean`，与框架 auto-imports dts 同一约定）；`/generator` 子路径为 file 模式生成自己的 dts（见上文）。

## 架构说明

- **插件优先**：`ubeanVue`（主入口，Vue 插件，`app.use`）与 `ubeanVueVite`（`/vite` 子路径，Vite 插件工厂）是两个独立命名的接线入口。内核不产出应用工厂与 router 工厂 —— 两者都用原生 `vue` / `vue-router` API 自行创建。
- **运行时边界**：主入口（`@ubean/vue`）禁止静态导入 `node:*`、`@ubean/*`、`@unhead/vue`、`vite`、`tinyglobby`（由测试强制）。构建期代码全部在 `/vite` 与 `/generator` 子路径之后。
- **懒加载可选 peer**：`@ubean/markdown`（markdown 页面）与 `@unhead/vue`（head）为 optional peer，仅在对应功能开启时动态导入。
- **全局单例**（缓存 store、过渡名、重载计数）挂在 `globalThis` 上，使重复模块实例（依赖重新优化、HMR `?t=` 变体）共享同一状态 —— 避免 SSR 水合不匹配与 KeepAlive 缓存失效。
- **所有权方向**：`@ubean/scan`（聚合层）依赖 `@ubean/vue` —— 永不反向。聚合层 re-export 页面路由类型、函数与生成器。
