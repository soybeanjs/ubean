# @ubean/client

**[English](./README.md) | 中文**

ubean 的框架客户端运行时 —— 在精简的 `@ubean/vue` 内核之上叠加应用工厂、unhead、i18n、数据层、岛屿水合与 SSR 状态助手。

`@ubean/client` 是完整 ubean 应用的客户端入口。它 **re-export 精简内核**（`@ubean/vue` —— 组件、router 接线、页面缓存、过渡、matcher），使两者共享同一份实现，然后在其上叠加框架层：应用工厂、head/SEO 门面、i18n、数据获取、岛屿水合、SSR 状态与 Vue SSR 渲染器。

```ts
import { createClientHead, createUbeanClientApp } from '@ubean/client';

const head = createClientHead();
const { app, router, page } = createUbeanClientApp({
  routes,
  resolveLayoutComponent: name => import(`../layouts/${name}.vue`),
  head
});
```

## 目录

- [@ubean/client](#ubeanclient)
  - [目录](#目录)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [应用工厂](#应用工厂)
    - [`@ubean/client/app`](#ubeanclientapp)
    - [`@ubean/client/define-app`](#ubeanclientdefine-app)
  - [入口](#入口)
    - [`@ubean/client/server`](#ubeanclientserver)
    - [`@ubean/client/ssr`](#ubeanclientssr)
  - [Router 工厂](#router-工厂)
  - [Head 与 SEO](#head-与-seo)
  - [i18n](#i18n)
  - [数据层](#数据层)
  - [Islands 水合](#islands-水合)
  - [颜色模式](#颜色模式)
  - [Partytown](#partytown)
  - [搜索](#搜索)
  - [SSR 状态](#ssr-状态)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

`@ubean/client` 是**框架客户端运行时**，叠加在精简的 `@ubean/vue` 内核之上：

| 分层                               | 职责                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/vue`（内核，被 re-export） | 页面路由、组件（`PageView` / `Link` / `SlotView` / `LayoutChainRenderer` / `ErrorBoundary` / `ClientOnly`）、页面缓存（keep-alive）、过渡、重载信号、`definePage` 宏、matcher |
| `@ubean/client`（本包）            | 应用工厂、`defineApp`、unhead/SEO 门面、i18n、数据层、岛屿水合桥接、颜色模式、partytown、Pagefind 搜索、SSR 状态助手、Vue SSR 渲染器                                          |
| `@ubean/app`                       | 服务端：`createUbeanApp`（Hono）与 `defineServer` —— **不在这里**                                                                                                             |
| `@ubean/pages`                     | 数据层的实现方（`useData` / `useFetch` / `defer`）；本包只是 re-export                                                                                                        |

**包含：**

- 应用工厂 `createUbeanClientApp`（客户端）与 `createUbeanSSRApp`（SSR）—— 它们拥有客户端接线：history 选择、布局链解析、i18n 桥接、岛屿指令、水合
- `defineApp` / `applyAppConfig` / `mergeAppConfig` / `createDefaultAppConfig`
- Head 门面：`createClientHead`、`createServerHead`、`useHead`、`useSeoMeta`、`Head`、`useHeadInstance`、`useSchemaOrg`
- i18n：`createUbeanI18n`、`configureI18nRuntime`、`setLocale`、`getLocale`、`useLocalePath`、`useSwitchLocalePath`、`useLocaleRoute`、`useLocaleHead`
- 数据层 re-export：`useData`、`useAsyncData`、`useFetch`、`setDefaultFetch`、`invalidateData`、`defer`、`useDeferredData`
- 岛屿水合：`hydrateIslands`、`collectIslands`、`hydrateIsland`、`hasPendingIslands`、`scheduleIslandHydration`、`defineIsland`、`defineServerIsland`
- 颜色模式、Partytown 脚本加载、Pagefind 搜索组合式函数
- SSR 状态：`getInitialPageData`、`getInitialState`，以及 `serializeState` / `hydrateState` 钩子
- `createVueRenderer`（Vue SSR 渲染器），位于 `/ssr` 子路径之后

**不包含：**

- 服务端路由与 Hono 应用 —— `@ubean/app`（`createUbeanApp`）与 `@ubean/routes`（`defineHandler`）
- 页面路由 Vite 插件与文件约定 —— `@ubean/vue/vite`
- 岛屿 Vite 插件（指令转换、`.server.vue` / `.client.vue`、注册表）—— `@ubean/islands/vite`
- robots.txt / sitemap.xml / manifest / JSON-LD 的**实现** —— `@ubean/seo`（本包只 re-export 纯 JSON-LD 助手，并提供可用的 `useSchemaOrg`）
- 数据层的**实现** —— `@ubean/pages`

**运行时依赖白名单（主入口）：`@ubean/vue`（re-export 的内核）、`@ubean/i18n`、`@ubean/islands`、`@ubean/pages`、`@ubean/shared`、`@unhead/vue`、`vue`、`vue-i18n`、`vue-router`、`@ubean/seo`。** `@ubean/seo` 是 **optional peer** —— 它是主入口唯一的第三方静态导入，而每个完整框架项目都会随 `ubean` 一起装上它。`dist/index.js` 中不出现任何 `node:*` 导入。

## 安装

```bash
pnpm add ubean          # 或：pnpm add @ubean/client
# optional peer（随 ubean 一起安装）：
pnpm add @ubean/seo
```

## 快速开始

**1. 应用配置** —— `src/app.ts` 描述应用外壳；框架会把它合并进客户端与 SSR 两侧：

```ts
// src/app.ts
import { defineApp } from '@ubean/client';

export default defineApp({
  router: {
    setup(router) {
      router.beforeEach(to => {
        if (to.meta.requiresAuth) return '/login';
      });
    }
  }
});
```

**2. 页面** —— `useData` 自动导入，在 `<script setup>` 中 `await`：

```vue
<script setup lang="ts">
const { data: posts } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});
</script>

<template>
  <ul>
    <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
  </ul>
</template>
```

**3. 岛屿** —— 标记交互组件即可，无需其他接线：

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
</script>

<template>
  <Counter v-client.load />
</template>
```

## 应用工厂

```ts
import { createUbeanClientApp, createUbeanSSRApp } from '@ubean/client';

const instance = createUbeanClientApp({
  routes, // RouteRecordRaw[]
  resolveLayoutComponent: name => import(`../layouts/${name}.vue`),
  defaultLayout: 'default',
  initialPage, // SSR 注入的页面数据，由 getInitialPageData() 读取
  head, // 必填：@unhead/vue/client 实例
  viewTransitions: true,
  router: { setup }
});
// instance = { app, router, head, page, preloadLayouts }

const ssr = createUbeanSSRApp(initialPage, { routes, resolveLayoutComponent, head });
```

- `head` 缺失时 `createUbeanClientApp` 抛出 `'[ubean] createUbeanClientApp requires a head instance from @unhead/vue/client'`；`createUbeanSSRApp` 抛出 `@unhead/vue/server` 对应的那条。
- 两者通常由框架生成的客户端/服务端入口调用 —— 只有自建入口时才手写。
- `preloadLayouts()` 会预先解析当前路由的布局链，使首次渲染就已包含布局。

### `@ubean/client/app`

app 子路径为框架侧消费者 re-export 内核导出面（`PageView`、`SlotView`、`Link`、`ClientOnly`、`ubeanVue`、`useViewTransition`、`usePage`、各注入 key、`LayoutChainRenderer`、no-op 宏 `definePage` / `defineMeta` / `defineMiddleware`、`createUbeanRouter`、`Head` / `useHead` / `useSeoMeta`），外加两个应用工厂。

### `@ubean/client/define-app`

应用配置，不创建任何 Vue 实例：

```ts
import { defineApp, applyAppConfig, mergeAppConfig } from '@ubean/client/define-app';

export default defineApp({
  plugins: [{ plugin: myPlugin, mode: 'client' }], // 也可以是普通插件 / [plugin, ...args]
  globalComponents: { MyButton },
  provides: { theme: 'dark' },
  rootId: 'app',
  rootAttrs: { class: 'dark' },
  appRoot: AppRoot, // 包装组件；框架出口注入它的默认 slot
  router: {
    setup(router) {
      router.beforeEach(to => (to.meta.requiresAuth ? '/login' : true));
    }
  },
  onAppCreated: app => {},
  onClientReady: app => {},
  errorComponent: ErrorPage, // 覆盖 pages/error.vue 的自动检测
  loadingComponent: LoadingPage, // 覆盖 pages/loading.vue 的自动检测
  viewTransitions: true,
  serializeState: app => ({}), // SSR：renderToString 之后读取状态
  hydrateState: (app, state) => {} // 客户端：mount 之前回填
});
```

- `rootId` 默认 `'app'`；`appRoot` 优先级为 `defineApp({ appRoot })` > `src/app.vue` > `src/App.vue`。
- `onClientReady` 在 mount 之后执行 —— 它是手动注册岛屿的官方逃生口。
- `mergeAppConfig` 负责把 shared 配置与模式专属配置（`src/app.server.ts` / `src/app.client.ts`）合并；两处 `router.setup` **累加执行**，shared 在前。
- `applyAppConfig(app, config, 'client' | 'server')` 负责注册插件、全局组件与 provide —— 生成的入口会调用它，自建入口时自行调用。

## 入口

### `@ubean/client/server`

服务端 head 实例加上完整的 `./app` 导出面：`createServerHead` 即 `@unhead/vue/server` 的 `createHead`，是主入口 `createClientHead` 的对应物。由生成的服务端入口与 `createUbeanSSRApp` 使用。

### `@ubean/client/ssr`

Vue SSR 渲染器，刻意与主入口隔离 —— 因为它静态导入 `@vue/server-renderer` 与 `@unhead/vue/server`：

```ts
import { createVueRenderer } from '@ubean/client/ssr';

const renderer = createVueRenderer({ routes, resolveLayoutComponent, resolveAppConfig });
const result = await renderer.render(url, context);
```

`VueRendererOptions` 接受 `{ routes, ... }`（router 驱动）或 `{ resolvePageComponent, ... }`（简单形态）两种；两者都需要 `resolveLayoutComponent`，可选 `defaultLayout` 与 `resolveAppConfig`。

## Router 工厂

`@ubean/vue` **不提供** router 工厂 —— SPA 用原生 `vue-router` 自建。这个便利设施归框架层：

```ts
import { createUbeanRouter } from '@ubean/client';

const router = createUbeanRouter({
  routes,
  ssr: false, // true → createMemoryHistory（并额外 router.push(initialUrl)）
  base: '/',
  setup(router) {
    router.beforeEach(to => (to.meta.requiresAuth ? '/login' : true));
  },
  scrollBehavior: (to, from, saved) => saved ?? { top: 0 } // 可选覆盖
});
```

默认 `scrollBehavior` 回到顶部；仅当带 hash 的**目标元素已存在**时平滑滚动（首次导航时客户端渲染的锚点可能尚不存在），否则跳过滚动以避免 vue-router 的 `VUE_ROUTER_R0042` 告警。

## Head 与 SEO

```ts
import { createClientHead, useHead, useSeoMeta, useSchemaOrg } from '@ubean/client';

const head = createClientHead(); // -> @unhead/vue/client 的 createHead

useSeoMeta({ title: 'Home', description: '…' });
useHead({ htmlAttrs: { lang: 'en' } });
useSchemaOrg(schemaOrg.organization({ name: 'ubean', url: 'https://ubean.dev' }));
```

- `useHead` / `Head` / `useSeoMeta` 来自 `@unhead/vue`；`createServerHead`（位于 `./server`）是 SSR 对应物。
- `useSchemaOrg()` 是**能用的** JSON-LD 入口：它通过 unhead 的 `useHead` 推入 `application/ld+json`，沿用 `@ubean/seo` 的 `serializeJsonLd` 完成转义。`@ubean/seo` 里同名函数是 isomorphic 降级实现，自己无法触达 head 实例。
- 主入口同时 re-export 纯助手 `defineJsonLd`、`renderJsonLdScript`、`renderJsonLdScripts`、`mergeJsonLd` 与 `schemaOrg.*` 工厂 —— 客户端模块无需为此走聚合主入口 `ubean`。

## i18n

```ts
import { createUbeanI18n, configureI18nRuntime, setLocale, useLocalePath } from '@ubean/client';

configureI18nRuntime({
  config: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    strategy: 'prefix_except_default',
    fallbackLocale: 'en',
    cookieName: 'ubean_locale',
    baseUrl: 'https://example.com'
  },
  loadLocale: code => import(`./locales/${code}.json`)
});

const i18n = createUbeanI18n();
await setLocale('zh-CN'); // load messages + cookie + router.replace(switchLocalePath)
```

- `useLocalePath` / `useSwitchLocalePath` / `useLocaleRoute` / `useLocaleHead` 是路径与 SEO head 组合式函数；`localizePath` / `switchLocalePath` / `extractLocaleFromPath` 是纯函数。
- 应用工厂提供 `LOCALIZE_PATH_KEY`，内核的 `<Link>` 正是通过它本地化内部路径 —— 纯 `@ubean/vue` SPA 若不自备该 hook 就按原样渲染路径。
- `useI18n` 本身**不在此 re-export**，请直接从 `vue-i18n` 导入。

## 数据层

实现位于 `@ubean/pages`；客户端入口将其 re-export，使页面只从一个地方导入：

```ts
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json()),
  ttl: 60_000, // 缓存 60 秒
  tags: ['posts'], // 分组失效：invalidateData('posts')
  dedupe: true // 相同 key 的在途请求共享（默认）
});
```

- `UseDataOptions<T>` = `{ key?, tags?, ttl?, staleWhileRevalidate?, fetcher, dedupe? }`；`DataResult<T>` = `{ data, error, loading, pending, status, timestamp, invalidate(), refresh() }`。
- `useAsyncData(key, fn, options?)` 是位置参数别名；`useFetch(key, url, options?)` 在其上包装。
- ubean **不自带** HTTP 客户端：调用一次 `setDefaultFetch(createRequest())`（来自 `@soybeanjs/fetch`）为 `useFetch` 注入 client，否则回退到原生 `fetch`。
- `defer(factory)` / `useDeferredData(key, deferred)` 在首屏渲染之后流式补数据。

## Islands 水合

```ts
import { defineApp, hydrateIslands } from '@ubean/client';

export default defineApp({
  onClientReady: app => {
    // 仅为逃生口：自动注册的岛屿已经水合过了。
    hydrateIslands({ appContext: app, components: { DynamicIsland } });
  }
});
```

- 岛屿**自动**水合 —— 框架在 mount 之后（双重 `requestAnimationFrame`）以及每次 SPA 导航后调用 `hydrateIslands()`。带 `v-client.*` 的组件无需任何代码。
- 在 `onClientReady` 中手动传入的组件优先于自动注册表；已水合的岛屿通过其 `data-hydrated` 属性跳过。
- `defineIsland(Component, strategy, options?)` 与 `defineServerIsland(Component, options?)` 是编程式包装器，自 `@ubean/islands/runtime` re-export。指令族、注册表与 `.server.vue` / `.client.vue` 约定见 [`@ubean/islands`](../islands/README.md)。

## 颜色模式

```ts
import { useColorMode } from '@ubean/client';

const colorMode = useColorMode();
colorMode.value; // 解析后的模式：'light' | 'dark' | …
colorMode.preference; // 'system' | 'light' | 'dark' | …
colorMode.toggle();
```

`resolveColorModeConfig` / `configureColorMode` / `getColorModeScript` 负责配置并生成在首次绘制前执行的 no-FOUC 内联脚本（默认 `classPrefix=''`、`classSuffix='-mode'`、`storageKey` / `cookieName` = `'ubean-color-mode'`）。

## Partytown

```ts
import { useScript } from '@ubean/client';

const { load, remove } = useScript('https://www.googletagmanager.com/gtag/js?id=GA_ID', {
  trigger: 'idle', // 'load' | 'idle' | 'visible' | 'manual'
  partytown: true
});
```

Partytown 是 **opt-in**（`PartyTownConfig.enabled` 默认 `false`）；`getPartyTownScript` / `getPartyTownHeadContent` 产出在 Web Worker 中运行第三方脚本的内联配置。

## 搜索

```ts
import { useSearch } from '@ubean/client';

const { query, results, loading, search, clear, preload } = useSearch({ debounce: 200, limit: 10 });
```

基于 Pagefind 的全文搜索：索引在构建期生成，浏览器侧 bundle 从 `/pagefind/pagefind-modern.js` 懒加载。`initPagefind` / `executeSearch` / `isPagefindLoaded` 是命令式对应物。

## SSR 状态

```ts
import { getInitialPageData, getInitialState } from '@ubean/client';

const page = getInitialPageData(); // 读取 __UBEAN_PAGE_DATA__
const state = getInitialState(); // 读取 __UBEAN_STATE__
```

`getInitialPageData()` 返回 SSR 序列化的 `PageObject`（服务端或水合前为 `null`）。`getInitialState()` 返回服务端 `defineApp({ serializeState })` 产出的状态；配合 `hydrateState` 在 `app.mount()` **之前**回填 store（如 Pinia）。

## 类型安全

- `UbeanAppOptions`、`UbeanAppInstance`、`DefineAppOptions`、`ResolvedAppConfig`、`CreateUbeanRouterOptions` 覆盖工厂与配置导出面。
- re-export 的内核类型（`UbeanVuePage`、`UbeanVuePageData`、`LayoutChainContext`、`MatcherGuardOptions`、缓存/过渡返回类型）与数据类型（`DataResult`、`UseAsyncDataOptions`、`UseFetchOptions`、`DeferredValue`）让导入点保持单一。
- 内核的 `vue-router` `RouteMeta` 增强（页面名、layout、cache、matcher、head）同样作用于框架项目 —— 无需本地 `declare module`。

## 架构说明

- **同一份实现**：内核没有被 fork —— `@ubean/client` re-export `@ubean/vue`，因此组件、缓存与过渡只有一个真源。
- **客户端一律从这个包导入，而非聚合入口。** 客户端模块导入主入口 `ubean` 会把整条聚合链拉进客户端产物。`examples/ubean-test` 实测：一处 `import { defineMatcher } from 'ubean'` 让入口 chunk 从 45.2 kB 涨到 111.9 kB gzip（+148%）；改从 `'ubean/client'` 导入后回到 +1.5%。由 `packages/cli/test/example-imports.test.ts` 与 `pnpm analyze:check` 守着。
- **渲染器懒加载**：SSR 渲染器在 `/ssr` 之后，客户端产物永远看不到 `@vue/server-renderer` 与 `@unhead/vue/server`。
- **两个 head**：`createClientHead`（主入口，`@unhead/vue/client`）与 `createServerHead`（`./server`，`@unhead/vue/server`）刻意分离 —— 工厂会拒绝不匹配的实例。
- **精简内核逃生口**：只需要路由、缓存与过渡的 SPA 应直接依赖 `@ubean/vue`（仅 `vue` + `vue-router`）。见 [`examples/client-only-spa`](../../examples/client-only-spa)。
- **命名**：`createUbeanClientApp`（Vue 应用）与 `@ubean/app` 的 `createUbeanApp`（Hono 应用）是两个不同的东西。
