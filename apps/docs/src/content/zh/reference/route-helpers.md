---
title: 路由助手
description: "路由辅助 API：useRouter、Link 组件与导航工具。"
translatedFrom: eac768b27e55
sections: ["b796b6bc","e3b0c442","76a55e45","f163b508","b658cb7e","bb15e274","1da939ea","0f9ab036","2ccdf592","7733dc06","67b22670","37e8f1d0","f9d15bfe","57880fc8","8fe845b1","6662265f","3cd2ecf7","ac2790bc","29d22aa9","58e47c48"]
---

# 路由助手

ubean 的路由辅助能力围绕 `useRouter()`（来自 `vue-router`；仅在启用 `autoImports: { vueRouter: true }` 时才自动导入，默认关闭）与全局注册的 `<Link>` 组件展开。ubean **不**提供 `useRoute()`、`navigateTo()`、`redirectTo()`、`useRouteParams()` 或 `useRouteQuery()`——请改用 `router.currentRoute`（见下文）或 `vue-router` 的 `useRoute()`。i18n 路径助手（`useLocalePath`、`useSwitchLocalePath`）见 <Link to="/reference/i18n">i18n 参考</Link>。

## useRouter()

`useRouter()` 返回扩展了 `push`/`replace` 快捷方法的 Vue Router 实例。在客户端组件中从 `vue-router` 导入（自动导入需要 `autoImports.vueRouter`，默认关闭）：

```vue
<script setup lang="ts">
const router = useRouter();
</script>
```

### 方法

| 方法         | 说明                          |
| -------------- | ------------------------------------ |
| `push(to)`     | 导航到新路由              |
| `replace(to)`  | 替换当前路由（不产生历史记录）   |
| `back()`       | 后退一步                     |
| `forward()`    | 前进一步                  |
| `go(n)`        | 前进 n 步（负数为后退）   |
| `beforeEach`   | 注册全局 beforeEach 守卫    |
| `afterEach`    | 注册全局 afterEach 钩子      |

### 读取当前路由

通过 `router.currentRoute.value` 查看当前路由：

```typescript
const router = useRouter();
const route = router.currentRoute.value;

console.log(route.path);      // "/users/123"
console.log(route.params.id); // "123"
console.log(route.query.q);   // "search term"
console.log(route.hash);      // "#section"
console.log(route.fullPath);  // "/users/123?q=...#section"
console.log(route.name);      // "UserDetail"
console.log(route.meta);      // 页面元数据
```

若要在模板中响应式读取，直接用 `router.currentRoute`，或用 computed 解包：

```vue
<script setup lang="ts">
import { computed } from 'vue';

const router = useRouter();
const currentPath = computed(() => router.currentRoute.value.path);
const userId = computed(() => router.currentRoute.value.params.id as string);
</script>

<template>
  <p>Path: {{ currentPath }}</p>
  <p>User: {{ userId }}</p>
</template>
```

### 编程式导航

```typescript
const router = useRouter();

// 字符串路径
router.push('/about');

// 带 name + params 的对象形式
router.push({ name: 'UserDetail', params: { id: '123' } });

// 带 query
router.push({ path: '/search', query: { q: 'ubean' } });

// 带 hash
router.push({ path: '/docs', hash: '#section-1' });

// 替换（不产生历史记录）
router.replace('/login');

// 后退 / 前进
router.back();
router.forward();
router.go(-2);
```

### 导航守卫

注册导航守卫有两种方式：

#### 1. 通过 `defineApp({ router })` 注册全局守卫 —— **推荐**

在 `src/app.ts` 中于应用启动时注册一次。守卫在**客户端与 SSR 都会执行**，并且能拦截首次导航。详见 <Link to="/guide/pages-routing/overview#导航守卫客户端-ssr">导航守卫指南</Link>。

```typescript
// src/app.ts
import { defineApp } from 'ubean';

export default defineApp({
  router: {
    setup(router) {
      router.beforeEach((to, from) => {
        if (to.meta.requiresAuth && !isAuthenticated()) {
          return '/login';
        }
      });
      router.afterEach((to, from) => {
        // 埋点、回到顶部等
      });
    }
  }
});
```

#### 2. 通过 `useRouter()` 注册组件级守卫

适用于组件作用域内的守卫（较少用；主要在长期存活的根组件里）。每次调用都会**追加**一个守卫——注意不要在每次挂载时重复注册：

```typescript
const router = useRouter();

router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return '/login';
  }
});

router.afterEach((to, from) => {
  // 埋点、回到顶部等
});
```

> 生产环境的鉴权/埋点守卫应放在 `defineApp({ router })` 中，以避免重复注册，并确保它们在 SSR 期间也会执行。

### 在 `setup()` 之外取得 Router

`useRouter()` 需要组件上下文。路由守卫、插件、普通工具模块里都没有 —— 改用框架提供的模块级单例：

```typescript
import { useUbeanApp, useUbeanRouter } from 'ubean/client';

// 客户端任意位置调用，无需组件：
const router = useUbeanRouter(); // 等价于 useUbeanApp().router
router.push('/about');

// 完整实例：{ app, router, head, page, preloadLayouts }
const { head, page } = useUbeanApp();
```

单例由框架生成的客户端入口注册，应用启动后即可用——但**在应用创建之前的模块顶层调用会取不到**。

**服务端会抛错。** SSR 每请求新建一个实例，模块级变量会被并发请求覆盖。SSR 组件内请改用 inject：

```typescript
import { inject } from 'vue';
import { UBEAN_APP_KEY } from 'ubean/client';

const { router } = inject(UBEAN_APP_KEY)!;
```

`createUbeanClientApp` 与 `createUbeanSSRApp` 都 provide 了 `UBEAN_APP_KEY`，所以 `inject` 在客户端与服务端都可用 —— 组件内优先用它（或 `useRouter()`）。`getUbeanAppInstance()` 不抛错而是返回 `null`，给只需要判断“有没有实例”的同构代码用。

## `<Link>` 组件（全局）

`<Link>` 已全局注册——无需导入。它执行客户端导航，并支持激活态样式。

```vue
<template>
  <!-- 字符串路径 -->
  <Link to="/about">About</Link>

  <!-- 带 params 的具名路由 -->
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User</Link>

  <!-- 带 query -->
  <Link :to="{ path: '/search', query: { q: 'ubean' } }">Search</Link>
</template>
```

### Props

| Prop               | 类型                                       | 说明                       |
| ------------------ | ------------------------------------------ | --------------------------------- |
| `to`               | `string \| { name, params, query, hash }` | 目标路由                      |
| `locale`           | `string`                                   | 把目标路径本地化到指定 locale（i18n） |
| `replace`          | `boolean`                                  | 使用 `router.replace` 而非 push  |
| `href`             | `string`                                   | 覆盖渲染出的 href            |
| `prefetch`         | `boolean`                                  | 预取目标页面的 chunk        |
| `activeClass`      | `string`                                   | 链接匹配当前路由时应用的类   |
| `exactActiveClass` | `string`                                   | 精确匹配时应用的类             |
| `noActiveClass`    | `boolean`                                  | 禁用默认激活态类    |

外部 URL（以 `http://`、`https://`、`//` 开头）会被自动识别，渲染为普通 `<a>` 标签并带上 `target="_blank" rel="noopener noreferrer"`。

### 插槽作用域

默认插槽暴露 `isActive` 与 `isExactActive`：

```vue
<template>
  <Link to="/about" v-slot="{ isActive }">
    <span :class="{ active: isActive }">About</span>
  </Link>
</template>
```

## 页面元数据（definePage）

在 `<script setup>` 中用 `definePage` 宏设置页面元数据。它是编译时宏，已自动导入：

```vue
<script setup lang="ts">
definePage({
  name: 'About',
  path: '/about',                    // 覆盖自动生成的路径
  layout: 'default',
  meta: {
    title: 'About Page',
    description: 'About our company'
  },
  requiresAuth: true,
  cache: true,                       // 开启 KeepAlive 页面缓存
  head: {
    title: 'About',
    meta: [{ name: 'description', content: 'About us' }]
  }
});
</script>
```

### 字段

| 字段           | 类型                  | 说明                          |
| --------------- | --------------------- | ------------------------------------ |
| `name`          | `string`              | 路由名（建议 PascalCase）  |
| `path`          | `string`              | 覆盖自动生成的 URL 路径     |
| `layout`        | `string \| string[] \| false` | 布局名、由外到内的布局链，或 `false` 表示禁用 |
| `reuse`         | `string`              | 复用路由的目标                   |
| `meta`          | `object`              | 自定义元数据（任意结构）          |
| `requiresAuth`  | `boolean`             | 鉴权要求（meta 简写）     |
| `cache`         | `boolean`             | 开启 KeepAlive 页面缓存        |
| `head`          | `object`              | 页面级 head 标签（@unhead/vue）     |
| `ssr`           | `boolean \| 'streaming' \| 'data-only'` | 页面级渲染覆盖 |
| `transition`    | `string`              | 页面过渡名（空字符串表示禁用） |
| `redirect`      | `string`              | 跳转到另一条路径（必须是以 `/` 开头的字面量） |

> **没有顶层 `title`** 字段——请用 `meta: { title }` 或 `head: { title }`。
> **没有顶层 `middleware`** 字段——路由级中间件通过 `meta: { middleware: [...] }` 声明。

### 重定向（`redirect`）

`redirect` 把一条路由变成跳转，页面本身不渲染组件。`src/pages/index.vue` 就是根路由，所以「`/` 跳到 `/home`」直接写在页面里：

```ts
// pages/index.vue
definePage({ redirect: '/home' });
```

服务端遇到这条路由返回 **302**（不是 301——目标可能变，301 会被浏览器和 CDN 长期缓存），客户端由 vue-router 完成同样的跳转。

三条约束：

- **只接受字符串字面量**。`redirect: () => '/home'` 这类函数无法在构建期求值，会被忽略并打印一条告警（与 `layout` / `cache` 等字段同样的规则）。
- **必须是以 `/` 开头的站内路径**。外部 URL 不被支持——vue-router 会把 `https://example.com` 当成路径。需要外链跳转时在页面里自己处理（`router.replace` 之外的方式，如 `window.location`）。
- **不要写语言前缀**。目标是「路径本身」，前缀由框架按当前请求语言补：配置了 `prefix_except_default` 且当前是中文时，`redirect: '/home'` 会跳到 `/zh/home`；默认语言则停在 `/home`。写成 `/:locale/home` 只会得到一个字面路径。

静态站点（`mode: 'ssg'`）没有重定向的执行点，因此预渲染会**跳过**这类页面并打印一条告警；需要在静态托管上做跳转，请在托管平台侧配置（如 `_redirects` / `redirects` 文件）。

> 旧的路由配置 `routing.rootRedirect` 已删除。`routing` 下写已删除或拼错的字段会得到一条告警，而不是被静默忽略。

### 页面缓存（`cache: true`）

设置 `cache: true` 后，离开该页面时会用 Vue 的 `<KeepAlive>` 保留页面组件实例。页面路由名（如 `'About'`）即缓存键——框架会自动用带名字的包装组件（`getNamedPageWrapper`）包裹页面组件，因此 `<script setup>` SFC 无需手动调用 `defineOptions({ name })`。

被缓存时，页面组件上触发的是 `onActivated` / `onDeactivated` 生命周期钩子（而非 `onMounted` / `onUnmounted`）：

```vue
<script setup lang="ts">
import { onActivated, onDeactivated } from 'vue';

definePage({ cache: true });

onActivated(() => {
  console.log('Page re-activated (navigated back)');
});

onDeactivated(() => {
  console.log('Page deactivated (navigated away, but kept alive)');
});
</script>
```

运行时控制可用 `useCacheViews()` / `enablePageCache(name)` / `disablePageCache(name)` / `excludePageCache(name)` / `invalidatePageCache(name)`（从 `ubean/client` 自动导入）。

### reuse 路由的缓存继承

`.reuse.ts` 页面若**未**显式声明 `cache`，就会继承目标页面的 `cache` 设置。你也可以在 reuse 路由上显式开关缓存，与目标页面无关：

```ts
// pages/about.vue —— 开启缓存
definePage({ cache: true });

// pages/about2.reuse.ts —— 继承 About 的 cache: true（无需重复声明）
definePage({ reuse: 'About' });

// pages/about3.reuse.ts —— 显式关闭缓存（覆盖继承值）
definePage({ reuse: 'About', cache: false });

// pages/about4.reuse.ts —— 即使目标未缓存也显式开启缓存
definePage({ reuse: 'About', cache: true });
```

每个被缓存的 reuse 路由都是独立的 KeepAlive 实例，以自身的路由名作为键。

## 在 API 路由中读取路由参数

在 API 路由处理器（服务端）中，使用 Hono 的 `c.req.param()`：

```typescript
// src/routes/api/users/[id].ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  const id = c.req.param('id');
  return c.json({ id });
});
```

若需要类型化的参数，使用 `validator('param', schema)`：

```typescript
import { defineHandler, validator } from 'ubean/server';
import { z } from 'zod';

export const GET = defineHandler(
  validator('param', z.object({ id: z.string() })),
  c => {
    const { id } = c.req.valid('param');
    return c.json({ id });
  }
);
```
