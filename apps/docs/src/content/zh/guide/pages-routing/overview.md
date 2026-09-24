---
title: 页面与路由
description: "基于文件的页面与路由：约定、路由规则、渲染模式与导航。"
---

# 页面与路由概览

ubean 采用基于文件的路由系统。页面是 `src/pages/` 下的 Vue 组件；API 路由使用 Hono handler，在 `src/routes/` 中以 void 风格的具名导出定义。

## 页面组件

页面是位于 `src/pages/` 的 Vue 组件，文件结构决定路由路径。

### 基本页面

```
src/pages/
├── index.vue           → /
├── about.vue           → /about
└── blog/
    ├── index.vue       → /blog
    └── [slug].vue      → /blog/:slug
```

### 动态路由

用方括号 `[param]` 表示动态段：

```
src/pages/users/[id].vue        → /users/:id
src/pages/posts/[year]/[slug].vue → /posts/:year/:slug
```

通过 `useRouter()` 访问路由参数（来自 `vue-router`；仅在启用 `autoImports: { vueRouter: true }` 时自动导入，默认关闭）：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();

// 当前路由信息
console.log(router.currentRoute.value.path);
console.log(router.currentRoute.value.params.id);
console.log(router.currentRoute.value.query);
console.log(router.currentRoute.value.hash);
</script>
```

### Catch-all 路由

用 `[...path]` 定义 catch-all 路由：

```
src/pages/[...path].vue → /anything/here
```

### 特殊页面（404 / Loading）

ubean 会自动检测 `src/pages/` **根目录**下的特殊页面。它们不作为常规路由注册，而是承担框架级职责：

| 文件 | 职责 | 效果 |
| --- | --- | --- |
| `pages/404.vue`（或 `.ts` / `.md`） | 未找到页面 | 注册 Vue Router 的 catch-all `/:pathMatch(.*)*` **以及** Hono 的 `GET *` 兜底处理器。未匹配的浏览器导航返回 HTTP 404 并渲染该组件。API（`/api/*`）与内部（`/_*`）路径仍返回默认的 JSON 404。 |
| `pages/loading.vue`（或 `.ts` / `.md`） | 加载提示 | 作为 `<Suspense>` 的 fallback 组件，在 SPA 导航期间懒加载页面组件时显示。SSR 会跳过它（服务端同步解析异步组件）。 |
| `pages/error.vue`（或 `.ts` / `.md`） | 错误边界 | 作为 `ErrorBoundary` 组件（Vue `errorCaptured`）。当页面的渲染 / setup / 异步解析抛出错误时渲染，接收 `error` prop，路由切换时自动重置。仅客户端生效。 |

只有根目录下的文件才被视为特殊页面。像 `pages/users/404.vue` 这样的嵌套文件仍是常规路由 `/users/404`。

#### 应用根组件（`src/app.vue` / `src/App.vue`）

与 `pages/` 下的特殊页面不同，ubean 还会自动检测位于 `src/app.vue`（小写，优先 —— 对齐 `app.ts` 这个 defineApp 入口）或 `src/App.vue`（大写，经典 Vue 约定）的**应用根组件**。两者同时存在时，小写的 `app.vue` 胜出。它是位于框架根组件之上的一层包装：布局链 + 页面通过它的**默认 slot** 注入 —— 组件内用 `<slot />` 声明渲染位置。全局上下文 Provider（`SConfigProvider` 等）、位于布局之上的应用级错误边界、全局过渡容器都应放在这里。完整契约见 <Link to="/architecture/runtime#应用根组件-appvue-approot">运行时 —— 应用根组件</Link>。

#### 通过 `defineApp` 覆盖

`loadingComponent`、`errorComponent` 与 `appRoot` 也可以通过 `defineApp` 以编程方式配置（或覆盖）：

```typescript
// src/app.ts
import { defineApp } from 'ubean';
import MyLoading from './components/MyLoading.vue';
import MyError from './components/MyError.vue';
import MyAppRoot from './components/MyAppRoot.vue';

export default defineApp({
  // 覆盖 pages/loading.vue 的自动检测
  loadingComponent: MyLoading,

  // 覆盖 pages/error.vue 的自动检测
  errorComponent: MyError,

  // 覆盖 src/app.vue / src/App.vue 的自动检测（布局 + 页面之上的包装组件）
  appRoot: MyAppRoot
});
```

优先级：`defineApp({ loadingComponent / errorComponent })` > `pages/loading.vue` / `pages/error.vue` 自动检测。对 `appRoot` 而言：`defineApp({ appRoot })` > `src/app.vue` > `src/App.vue` 自动检测。

`errorComponent` 会把页面内容包进错误边界（使用 Vue 的 `errorCaptured` 生命周期）。错误状态在路由变化时自动重置，因此离开出错的页面即可清除边界状态。

### 路由组

用括号包裹的目录不贡献 URL 段：

```
src/pages/(marketing)/about.vue → /about  （"marketing" 分组被忽略）
```

> 带**点**的括号（`(.)photo/`、`(..)photo/`、`(...)photo/`）是另一套约定 —— Next.js 的拦截路由 —— ubean 刻意
> 不支持。扫描器遇到这类路径段会直接报错，而不是把它注册成字面的 `/(.)photo` 路由。替代做法见
> [对话框与可分享 URL](#对话框与可分享-url)。

### 并行路由（`@slotName/`）

以 `@` 开头的目录表示一个**插槽**：其中的页面与相邻页面共享同一个 URL，并在该路由记录上注册为 Vue Router 的**具名视图**，因此一个 URL 可以把多个页面组件渲染到布局中的不同位置。

```
src/pages/photo/[id].vue          → /photo/:id 的默认视图
src/pages/@dialog/photo/[id].vue  → 同一路由的 "dialog" 具名视图
```

在布局（或任意祖先组件）中用 `<SlotView>` 渲染插槽：

```vue
<!-- src/layouts/default.vue -->
<template>
  <main>
    <slot />
  </main>
  <SlotView name="dialog" />
</template>
```

`<SlotView name="x" />` 会从最深一层暴露该插槽的匹配路由记录中解析组件，没有匹配时渲染空内容。插槽页面是一个独立的页面文件：有自己的 `definePage`、自己的 loader 和自己的客户端 chunk。

### 对话框与可分享 URL

Next.js 的拦截路由用于为另一条路由显示对话框，**同时保持当前页面在背后挂载**，并把目标路由的 URL 放进地址栏。ubean 刻意不实现这套约定（见
[ADR-0010](https://github.com/soybeanjs/ubean/blob/main/docs/adr/0010-competitive-north-star-and-gap-filter.md)）：
让服务端渲染完整的目标页面而客户端渲染对话框，意味着刻意引入 SSR 与客户端的不一致，而且对话框背后的页面会重新挂载而非被保留。请改用以下方案之一：

**1. 让对话框不进路由**（大多数应用的场景）。不需要独立 URL 的对话框本质上只是组件状态 —— 背景天然被保留，也不会有 SSR/客户端的分歧：

```vue
<script setup lang="ts">
const selected = shallowRef<Photo | null>(null);
</script>

<template>
  <PhotoGrid @select="selected = $event" />
  <PhotoDialog v-if="selected" :photo="selected" @close="selected = null" />
</template>
```

**2. 当确实需要把状态放进 URL 时**（深链接、按返回键关闭），把对话框放进插槽并用查询参数驱动。URL 仍是目标路由的 URL，外加一个标记：

```
src/pages/photo/[id].vue            → 完整页面（默认视图 + 硬导航）
src/pages/@dialog/photo/[id].vue    → 对话框（插槽 "dialog"）
src/layouts/default.vue             → <SlotView v-if="route.query.dialog" name="dialog" />
```

```vue
<!-- 从列表发起的链接 -->
<Link :to="{ path: `/photo/${photo.id}`, query: { dialog: '1' } }">{{ photo.title }}</Link>
```

与拦截路由不同，这种方式是 **SSR 一致的**（服务端与客户端都渲染页面 + 对话框），前进/后退也走正常的 URL 历史记录。需要知道的取舍是：背景是目标页面本身，而不是你来的那个列表 —— 如果必须保持列表可见，请用方案 1。由于对话框的 URL 是真实可抓取的 URL，若不希望它出现在搜索结果里，请为它加上 canonical 或 `noindex`。

## 布局

布局组件包裹页面，为各路由提供一致的 UI。

### 默认布局

创建 `src/layouts/default.vue`：

```vue
<template>
  <header>
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
    </nav>
  </header>
  <main>
    <slot />
  </main>
</template>
```

> `<Link>` 已全局注册 —— 无需导入。

### 自定义布局

通过 `definePage` 为页面指定布局：

```vue
<script setup lang="ts">
// definePage 是编译时宏，自动导入
definePage({
  layout: 'admin'
});
</script>
```

后台布局请创建 `src/layouts/admin.vue`（或 `src/layouts/admin/index.vue`）。布局支持嵌套链（例如 `admin/dashboard` → `admin` → `default`）。

## 页面元数据（definePage）

`definePage` 是用于配置页面选项的编译时宏。其顶层字段包括 `name`、`path`、`layout`（`string | string[] | false`）、`reuse`、`meta`、`requiresAuth`、`cache`、`head`、`ssr`（`boolean | 'streaming' | 'data-only'`）、`transition`。**没有顶层 `title`** —— 请用 `head.title` 或 `meta: { title }`。**没有** Nuxt 风格的客户端 `middleware/*.global` 文件约定：请在 `defineApp({ router: { setup } })` 中注册 vue-router 守卫。

```vue
<script setup lang="ts">
definePage({
  name: 'About',                   // 路由名（PascalCase）
  layout: 'default',               // 布局名
  ssr: true,                       // false | 'data-only' | true | 'streaming'
  meta: {                           // 自定义元数据
    title: 'My Page',
    description: 'My page description'
  },
  requiresAuth: true,               // 鉴权要求（meta 快捷方式）
  cache: true,                      // 启用 KeepAlive 页面缓存
  head: {                           // 页面级 head 标签（@unhead/vue）
    title: 'My Page',
    meta: [{ name: 'description', content: '...' }]
  }
});
</script>
```

## 页面缓存（KeepAlive）

在 `definePage` 中设置 `cache: true`，导航离开时用 Vue 的 `<KeepAlive>` 保留页面组件实例。用户返回时，页面从缓存恢复而不是重新挂载 —— 本地状态（表单输入、滚动位置等）得以保留。

框架会自动用路由名作为组件 `name`，通过具名包装器（`getNamedPageWrapper`）包装页面组件。这意味着 `<script setup>` SFC 开箱即用 —— 你**不需要**手动调用 `defineOptions({ name: 'About' })` 来让 KeepAlive 的 `include` 过滤器匹配。

```vue
<!-- src/pages/about.vue -->
<script setup lang="ts">
import { onActivated, onDeactivated } from 'vue';

definePage({ cache: true });

onActivated(() => {
  // 导航回该缓存页面时触发
  console.log('About re-activated');
});

onDeactivated(() => {
  // 导航离开时触发（组件被保活，不会卸载）
  console.log('About deactivated');
});
</script>

<template>
  <div>About Page</div>
</template>
```

> 设置 `cache: true` 后，对于每次访问都应触发的生命周期逻辑，请用 `onActivated` / `onDeactivated` 代替 `onMounted` / `onUnmounted`。

### 运行时缓存控制

用自动导入的缓存辅助函数在运行时开关缓存（例如在布局或设置面板中）：

```vue
<script setup lang="ts">
// 全部从 ubean/client 自动导入
const { cachedViews, excludedViews } = useCacheViews();

function toggleCache(name: string) {
  if (cachedViews.value.includes(name)) {
    disablePageCache(name);
  } else {
    enablePageCache(name);
  }
}

// 强制移除缓存的实例，下次访问时重新挂载
invalidatePageCache('About');

// 重新加载当前缓存页面（exclude → 等待 → include，强制重挂载）
await resetRouteCache('About');
</script>
```

可用的运行时辅助函数（均从 `ubean/client` 自动导入）：

| 函数 | 说明 |
| ------------------------------ | ----------------------------------------------------------------- |
| `useCacheViews()`              | 响应式存储，含 `cachedViews` / `excludedViews` / `enabled` |
| `enablePageCache(name)`        | 把路由名加入缓存 include 列表 |
| `disablePageCache(name)`       | 把路由名从缓存中移除（同时清理其实例） |
| `excludePageCache(name)`       | 临时把页面排除出缓存（下次渲染时强制清理） |
| `includePageCache(name)`       | 恢复被排除页面的缓存 |
| `invalidatePageCache(name?)`   | 使指定页面失效；省略参数时对所有页面生效 |
| `isPageCached(name)`           | 检查页面当前是否被缓存 |
| `resetRouteCache(name?, delay)` | 通过 exclude → 等待 → include 重新加载缓存页面（强制重挂载） |

### Reuse 路由的缓存继承

当 `.reuse.ts` 页面**没有**显式声明 `cache` 时，它会继承目标页面的 `cache` 设置。也就是说，如果目标页面是 `cache: true`，reuse 路由也会被自动缓存 —— 两者各自是一个独立的 KeepAlive 实例，以各自的路由名为键。

```ts
// pages/about.vue —— 已启用缓存
definePage({ cache: true });

// pages/about2.reuse.ts —— 自动继承 cache: true
definePage({ reuse: 'About' });

// pages/about3.reuse.ts —— 显式关闭缓存（覆盖继承）
definePage({ reuse: 'About', cache: false });
```

| reuse 页面的 `cache` 取值 | 行为 |
| ------------------------ | -------- |
| `undefined`（未声明） | 继承目标页面 |
| `true` | 显式启用缓存（即使目标页面未缓存） |
| `false` | 显式关闭缓存（即使目标页面已缓存） |

## 导航

### `<Link>` 组件（全局注册）

`<Link>` 已自动注册为全局 Vue 组件 —— 无需导入：

```vue
<template>
  <Link to="/">Home</Link>
  <Link to="/about">About</Link>
  <Link to="/users/123">User 123</Link>
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User detail</Link>
  <Link :to="{ path: '/search', query: { q: 'ubean' } }">Search</Link>
</template>
```

`<Link>` 的 props：

| Prop               | 类型                                            | 说明                                        |
| ------------------ | ----------------------------------------------- | -------------------------------------------------- |
| `to`               | `string \| { name, params, query, hash }`      | 目标路由                                       |
| `locale`           | `string`                                        | 把目标路径本地化到指定语言（i18n）        |
| `replace`          | `boolean`                                       | 用 `router.replace` 代替 push               |
| `href`             | `string`                                        | 覆盖渲染出的 href                         |
| `prefetch`         | `boolean`                                       | 预取目标页面的 chunk                     |
| `activeClass`      | `string`                                        | 链接激活时应用的 class                  |
| `exactActiveClass` | `string`                                        | 精确匹配激活时的 class                       |
| `noActiveClass`    | `boolean`                                       | 关闭默认的激活 class 们                 |

默认 slot 还暴露 `isActive` / `isExactActive` 供进阶用法使用。

### 编程式导航（useRouter）

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();

function goAbout() {
  router.push('/about');
}

function replaceWithLogin() {
  router.replace('/login');
}

function goBack() {
  router.back();
}
</script>
```

### 外部 URL

外部 URL 请使用原生 `<a>` 标签：

```vue
<template>
  <a href="https://example.com" target="_blank" rel="noopener">External link</a>
</template>
```

## 中间件

中间件在页面或 API 路由之前运行。文件位于 `src/middleware/`：

```typescript
// src/middleware/auth.ts
import { defineMiddleware } from 'ubean/server';

export default defineMiddleware(async c => {
  const user = c.get('user');
  if (!user) {
    return c.redirect('/login');
  }
});
```

### 排序规则

- `global.ts` 或 `global.*.ts` → 挂载到 `/*`
- 带数字前缀的文件（例如 `01-auth.ts`、`02-logging.ts`）→ 按前缀排序
- 目录前缀的中间件（例如 `middleware/admin/auth.ts`）→ 挂载到 `/admin/*`

## 导航守卫（客户端 + SSR）

ubean 通过 `src/app.ts` 中的 `defineApp({ router })` 暴露 vue-router 的全局导航守卫（`beforeEach` / `beforeResolve` / `afterEach`）。守卫在**客户端与 SSR 都会执行**，因此可以拦截首次导航（包括 SSR 的 `router.push(initialUrl)`）。

```typescript
// src/app.ts
import { defineApp } from 'ubean';

export default defineApp({
  router: {
    setup(router) {
      // 鉴权守卫 —— 路由需要鉴权时重定向到 /login
      router.beforeEach((to, from) => {
        if (to.meta.requiresAuth && !isAuthenticated()) {
          return '/login';
        }
      });

      // 统计 / 页面标题 —— 导航完成后执行
      router.afterEach((to) => {
        if (typeof document !== 'undefined' && to.meta?.title) {
          document.title = String(to.meta.title);
        }
      });
    }
  }
});
```

### 执行时机

`setup(router)` 在 router 实例创建**之后**、`app.use(router)` **之前**被调用。这保证守卫在首次导航开始前完成注册，因此能在客户端水合与 SSR 渲染两条路径上拦截初始 URL。

### 在 `app.ts` + `app.server.ts` / `app.client.ts` 中累加执行

如果你把配置拆成 `app.ts`（共享）+ `app.server.ts` 和/或 `app.client.ts`，所有 `setup` 函数都会被**串联执行**（先 shared，再 client/server 特定）。这样可以把通用守卫（例如统计）放在 `app.ts`，把环境特定守卫（例如仅 SSR 的鉴权重定向）放在 `app.server.ts`。

### 约束

- `setup` 自身必须**同步**注册守卫（守卫函数可以返回 Promise）。
- `setup` 中不要出现 `await` API 调用 —— 它们会拖慢首次导航。把异步逻辑放进守卫回调内部。

### 守卫与后端中间件的对比

| 维度                | 前端守卫（`router.setup`）     | 后端中间件（`src/middleware/`）     |
| --------------------- | ------------------------------------- | ----------------------------------------- |
| 触发时机               | 客户端导航 + SSR URL      | 每个 HTTP 请求                        |
| 运行位置               | 浏览器 + SSR 运行时                 | 服务端（Hono）                             |
| 典型用途           | 鉴权重定向、页面标题、统计 | Cookie 解析、注入会话、CORS   |
| 是否需要网络往返    | 否                                    | 是                                       |

需要检查 cookie/header 的鉴权流程通常放在后端中间件里（由它把用户注入上下文）；前端守卫再读取该状态并决定是否重定向。**不要**再新增一套客户端中间件文件树。

## 路由规则

在 `ubean.config.ts` 中定义路由级规则：

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  routeRules: {
    '/api/**': {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    },
    '/admin/**': {
      headers: { 'Cache-Control': 'private' }
    },
    '/static/**': {
      cache: { ttl: 3600 }
    }
  }
});
```

支持的规则字段（按顺序处理：`redirect` > `rewrite`（内部重新匹配）> `proxy` > `headers`（合并）> `cache`）：

- `*` 匹配单个路径段
- `**` 递归匹配多个路径段

### 按路由的渲染规则 (P9-03)

除 HTTP 层规则外，`routeRules` 还能按路由覆盖渲染行为。这与 Nuxt 的 `routeOptions`、Astro 的 `export const prerender` 对齐：

```typescript
export default defineConfig({
  routeRules: {
    // 后台页面强制 CSR（覆盖全局 ssr: true）
    '/admin/**': { ssr: false },

    // 某一页面强制 SSR（覆盖 ssr.exclude）
    '/dashboard/realtime': { ssr: true },

    // 该路由使用流式 SSR（覆盖全局 streaming 设置）
    '/feed': { ssr: 'streaming' },

    // ISR：每 60 秒重新生成，再验证期间提供过期内容
    '/blog/**': { isr: { ttl: 60, swr: true } },

    // 简化写法（不带 SWR）
    '/news/**': { isr: 300 },

    // 构建时预渲染（预渲染器会自动发现）
    '/about': { prerender: true },
    '/blog/**': { prerender: true }
  }
});
```

| 字段       | 类型                          | 说明                                                                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ssr`       | `boolean \| 'streaming' \| 'data-only'` | 覆盖命中路由的全局 SSR 设置。`false` → CSR，`true` → SSR，`'streaming'` → 流式 SSR，`'data-only'` → 执行 loader 但返回带脱水数据的 CSR 外壳。 |
| `prerender` | `boolean`                     | 标记该路由需要构建时预渲染。`prerender()` 会从 `routeRules` 中自动发现。                   |
| `isr`       | `number \| { ttl: number; swr?: boolean }` | 增量静态再生。`ttl` 单位为秒；`swr: true` 在再验证期间提供过期内容。       |

**特异性与合并**：规则按综合得分排序（规则类型权重 + 路径段权重）。对某个请求，命中的规则通过 `c.get('routeRule')` 暴露给 handler，并驱动以下行为：

- `ssr` / `ssr: 'streaming'` → 覆盖该路由的 `ssr.exclude` 与 `SsrOptions.streaming`
- `isr` → GET 请求由 ISR 缓存提供（HIT / STALE / MISS，通过 `X-ISR` 响应头标记）；MISS 时执行渲染（启用 `swr` 时 STALE 也会在后台渲染）
- `prerender` → `collectPrerenderRoutes()` 在构建时自动收集这些模式（与 `prerender.include` / `prerender.all` 合并）

另见 <Link to="/reference/cache">缓存</Link>，其中介绍了 `CacheStore.peek()` 与 ISR 内部实现。

## 数据获取

用 `useData()`（从 `ubean/client` 自动导入）进行声明式数据获取，支持缓存、TTL、依赖与失效：

```vue
<script setup lang="ts">
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});
</script>
```

## 下一步

- <Link to="/guide/pages-routing/loaders">数据获取（useData）</Link>
- <Link to="/guide/pages-routing/actions">表单 Action</Link>
- <Link to="/reference/route-helpers">路由助手</Link>
- <Link to="/guide/i18n">国际化</Link>
