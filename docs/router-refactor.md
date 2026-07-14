# 路由重构方案：迁移到 vue-router

## 1. 问题背景

### 当前实现

ubean 当前使用**自定义 fetch-based 路由器**，核心在 `runtime/vue/client.ts` 的 `createUbeanClient()`：

- 点击 `<Link>` → `e.preventDefault()` → `navigate(url)` → `fetch(url, { headers: { 'x-ubeanpages': 'true' } })` 获取页面 JSON → `history.pushState()` → 更新响应式 state → 动态渲染页面组件
- `popstate` 事件监听前进/后退
- 页面渲染通过 `PageRoot` 组件根据 `resolvedPage.value` 动态切换

### 核心缺陷

1. **页面重载问题**：点击链接触发整页刷新，而非客户端导航
2. **手动管理 History API**：`pushState/replaceState` + `popstate` 容易出 bug
3. **每次导航 HTTP fetch**：即使页面组件已在客户端，仍需请求服务端获取页面数据
4. **无 scroll restoration**：导航后不恢复滚动位置
5. **无 route guards**：不支持 `beforeEach` 等导航守卫
6. **无嵌套路由**：靠手动 layout chain 模拟，不够健壮
7. **active class 手动判断**：`isActiveRoute` 字符串匹配，不够精确
8. **与 vue 生态脱节**：无法使用 `RouterLink`、`RouterView`、`useLink`、typed routes 等

## 2. 方案对比

### void-vue

- **自定义路由器**，与 ubean 当前方案类似
- `createVoidRouter()` + `createRouterFacade()`
- Link 组件：`e.preventDefault()` → `router.visit(href, { method, data, ... })`
- 使用 deferred 模式处理异步页面加载
- **评价**：同为"自造轮子"方案，维护成本高，不推荐

### Nuxt

- **直接使用 vue-router**：`createRouter({ history: createWebHistory() / createMemoryHistory(), routes })`
- 路由从文件系统生成 `RouteRecordRaw[]`
- `NuxtLink` 内部链接渲染 `<RouterLink>`，外部链接渲染 `<a>` + `navigateTo()`
- `navigateTo()` 底层调用 `router.push()` / `router.replace()`
- Middleware 通过 `router.beforeEach()` 实现
- 路由状态通过 `router.afterEach()` 同步
- Scroll behavior 通过 router 的 `scrollBehavior` 选项
- 预取通过 `IntersectionObserver` + `preloadRouteComponents()`
- **评价**：充分利用 vue-router 全部能力，生态兼容性好，但封装层较重

### SourceBean

- **直接使用 vue-router**，最简洁
- `createRouter({ history: createWebHistory()/createMemoryHistory(), routes })`
- 客户端：`createSSRApp(App)` → `setupRouter(app)` → `app.mount('#app')`
- 服务端：`setupRouter(app, { ssr: true, beforeReady: router => router.push(href) })` → `renderToString()`
- 使用 vue-router 原生的 `<RouterLink>` 和 `<RouterView>`
- **评价**：最简洁，直接复用 vue-router 全部能力

### 对比总结

| 维度         | ubean (当前)      | void-vue       | Nuxt             | SourceBean       |
| ------------ | ----------------- | -------------- | ---------------- | ---------------- |
| 路由器       | 自定义 fetch      | 自定义 fetch   | vue-router       | vue-router       |
| History      | 手动 pushState    | 手动 pushState | vue-router 内置  | vue-router 内置  |
| Link         | 自定义 Link       | 自定义 Link    | 封装 RouterLink  | RouterLink       |
| 页面加载     | 每次导航 HTTP     | 每次导航 HTTP  | 懒加载路由组件   | 懒加载路由组件   |
| 嵌套路由     | 手动 layout chain | 手动           | vue-router 嵌套  | vue-router 嵌套  |
| Route Guards | 无                | 无             | beforeEach       | 无               |
| Scroll 恢复  | 无                | 无             | scrollBehavior   | 无               |
| Active class | 手动判断          | 手动           | useLink 内置     | useLink 内置     |
| SSR          | 自定义 SSR        | 自定义         | router.push(url) | router.push(url) |
| 复杂度       | 高                | 高             | 中高             | 低               |
| 可靠性       | 低（有 bug）      | 中             | 高               | 高               |

## 3. 推荐方案：基于 vue-router 重构

采用 **SourceBean + Nuxt 混合方案**，在 vue-router 基础上实现 ubean 的特有功能（i18n、布局系统、页面数据获取）。

### 3.1 架构概览

```
┌─────────────────────────────────────────────────┐
│                  虚拟模块层                       │
│  virtual:ubean-pages → RouteRecordRaw[]          │
│  virtual:ubean-app   → createApp / createSSRApp  │
├─────────────────────────────────────────────────┤
│                  路由器层                         │
│  createUbeanRouter() → vue-router 实例            │
│  + scrollBehavior + beforeEach (middleware)      │
│  + i18n 集成                                      │
├─────────────────────────────────────────────────┤
│                  组件层                          │
│  <Link> → 封装 <RouterLink> + i18n              │
│  <RouterView> → 布局嵌套渲染                     │
├─────────────────────────────────────────────────┤
│                  Composables                     │
│  useRouter() → 封装 vue-router useRouter()      │
│  usePage()   → 封装 useRoute() + pageData       │
│  useHead()   → 保留现有 head manager             │
├─────────────────────────────────────────────────┤
│                  SSR 层                          │
│  createUbeanSSRApp() → vue-router + renderToString│
└─────────────────────────────────────────────────┘
```

### 3.2 虚拟模块改造

#### `virtual:ubean-pages` — 生成 vue-router 路由记录

将扫描到的页面转换为 `RouteRecordRaw[]`，布局作为父路由：

```typescript
// 生成内容示例
import type { RouteRecordRaw } from 'vue-router';

const Page_Home = () => import('/src/pages/index.vue');
const Page_About = () => import('/src/pages/about.vue');
const Page_Dashboard = () => import('/src/pages/dashboard/index.vue');
const Page_DashboardProfile = () => import('/src/pages/dashboard/profile.vue');

const Layout_Default = () => import('/src/layouts/default.vue');
const Layout_Dashboard = () => import('/src/layouts/dashboard.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Layout_Default,
    children: [
      { path: '', name: 'Home', component: Page_Home, meta: { layout: 'default' } },
      { path: 'about', name: 'About', component: Page_About, meta: { layout: 'default' } },
    ]
  },
  {
    path: '/dashboard',
    component: Layout_Dashboard,
    children: [
      { path: '', name: 'Dashboard', component: Page_Dashboard },
      { path: 'profile', name: 'DashboardProfile', component: Page_DashboardProfile },
    ]
  },
];

// 保留现有的页面/布局元数据导出
export const pageNames = ['Home', 'About', ...] as const;
export const layoutNames = ['default', 'dashboard'] as const;
export const defaultLayout = 'default';

// 页面解析函数（兼容 islands 等场景）
export function resolvePageComponent(name: string): Promise<any> { ... }
export function resolveLayoutComponent(name: string): Promise<any> { ... }
```

**路由生成规则**：

| 文件                         | 路由路径     | 路由名      | 布局      |
| ---------------------------- | ------------ | ----------- | --------- |
| `pages/index.vue`            | `/`          | `Home`      | default   |
| `pages/about.vue`            | `/about`     | `About`     | default   |
| `pages/users/[id].vue`       | `/users/:id` | `UsersId`   | default   |
| `pages/dashboard/index.vue`  | `/dashboard` | `Dashboard` | dashboard |
| `pages/(marketing)/page.vue` | `/page`      | `Page`      | default   |
| `pages/page.reuse.ts`        | 复用目标组件 | 自定义名    | 可覆盖    |

**布局嵌套策略**：

- 具有相同 layout 的页面归入同一个父路由（layout 组件作为 `component`）
- `layout: false` 的页面直接作为顶层路由（无父 component）
- 嵌套布局通过多层 `children` 实现

#### `virtual:ubean-app` — 整合 router

```typescript
import { createUbeanApp, createUbeanSSRApp } from 'ubean/runtime/vue';
import { routes, resolvePageComponent, resolveLayoutComponent, defaultLayout } from 'virtual:ubean-pages';

export function createApp() {
  const config = resolveAppConfig('client');
  const instance = createUbeanApp({
    routes,
    defaultLayout,
    viewTransitions: config.viewTransitions
  });
  applyAppConfig(instance.app, config, 'client');
  instance.app.mount('#' + (config.rootId || 'app'));
  return instance;
}

export function createSSRApp(initialPage) {
  const config = resolveAppConfig('server');
  const { app, router } = createUbeanSSRApp(initialPage, {
    routes,
    defaultLayout
  });
  applyAppConfig(app, config, 'server');
  return { app, router, config };
}
```

### 3.3 路由器创建

新增 `runtime/vue/router.ts`，替换现有的 `createUbeanClient`：

```typescript
import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import type { Router, RouteRecordRaw, RouterHistory } from 'vue-router';

export interface CreateUbeanRouterOptions {
  routes: RouteRecordRaw[];
  ssr?: boolean;
  initialUrl?: string;
  base?: string;
  scrollBehavior?: Router['options']['scrollBehavior'];
}

export function createUbeanRouter(options: CreateUbeanRouterOptions): Router {
  const history: RouterHistory = options.ssr
    ? createMemoryHistory(options.base || '/')
    : createWebHistory(options.base || '/');

  const router = createRouter({
    history,
    routes: options.routes,
    scrollBehavior(to, from, savedPosition) {
      if (savedPosition) return savedPosition;
      if (to.hash) return { el: to.hash, behavior: 'smooth' };
      return { top: 0 };
    }
  });

  if (options.ssr && options.initialUrl) {
    router.push(options.initialUrl);
  }

  return router;
}
```

### 3.4 Link 组件改造

封装 vue-router 的 `RouterLink`，添加 i18n 本地化：

```typescript
import { defineComponent, h, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { localizePath } from '../i18n';

export const Link = defineComponent({
  name: 'Link',
  props: {
    to: { type: [String, Object], default: undefined },
    href: { type: String, default: undefined },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    activeClass: { type: String, default: 'router-link-active' },
    exactActiveClass: { type: String, default: 'router-link-exact-active' },
    noActiveClass: { type: Boolean, default: false }
  },
  setup(props, { slots, attrs }) {
    const resolvedTo = computed(() => {
      const path = props.to ?? props.href ?? '';
      if (typeof path === 'string' && (path.startsWith('http') || path.startsWith('//') || path.startsWith('#'))) {
        return path;
      }
      return localizePath(path);
    });

    const isExternal = computed(() => {
      const path = String(resolvedTo.value);
      return path.startsWith('http') || path.startsWith('//') || path.startsWith('#');
    });

    return () => {
      if (isExternal.value) {
        return h(
          'a',
          {
            ...attrs,
            href: resolvedTo.value,
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          slots.default?.()
        );
      }

      // 内部链接：直接使用 RouterLink
      return h(
        RouterLink,
        {
          ...attrs,
          to: resolvedTo.value,
          replace: props.replace,
          activeClass: props.noActiveClass ? '' : props.activeClass,
          exactActiveClass: props.noActiveClass ? '' : props.exactActiveClass
        },
        slots.default
      );
    };
  }
});
```

### 3.5 Composables 改造

#### `useRouter()`

```typescript
import { useRouter as useVueRouter } from 'vue-router';

export function useRouter() {
  const router = useVueRouter();
  return {
    // vue-router 原生能力
    ...router,
    // ubean 扩展
    push: (url: string, opts?: { replace?: boolean }) => (opts?.replace ? router.replace(url) : router.push(url)),
    replace: (url: string) => router.replace(url),
    back: () => router.back(),
    forward: () => router.forward(),
    refresh: () => router.go(0),
    get current() {
      return router.currentRoute.value;
    },
    get navigating() {
      return router.currentRoute.value.matched.length === 0;
    }
  };
}
```

#### `usePage()`

```typescript
import { useRoute } from 'vue-router';
import { inject, reactive, computed } from 'vue';

export function usePage<T = Record<string, unknown>>() {
  const route = useRoute();
  // 通过 provide/inject 获取 SSR 页面数据（保留兼容）
  const pageData = inject('ubean-page-data', null);

  return reactive({
    url: computed(() => route.fullPath),
    params: computed(() => route.params),
    query: computed(() => route.query),
    meta: computed(() => route.meta),
    component: computed(() => route.matched[route.matched.length - 1]?.components?.default),
    ...pageData
  });
}
```

### 3.6 App 创建流程

#### 客户端 `createUbeanApp`

```typescript
export function createUbeanApp(options: UbeanAppOptions): UbeanAppInstance {
  const app = _createApp(RootComponent);

  // 创建并安装 vue-router
  const router = createUbeanRouter({
    routes: options.routes,
    ssr: false
  });
  app.use(router);

  // 安装 head manager
  const head = options.head || createHeadManager();
  app.provide(HEAD_KEY, head);

  // 路由变化时更新 head
  router.afterEach(to => {
    if (to.meta.head) head.apply(to.meta.head as PageHead);
  });

  // 布局通过 RouterView 实现
  const RootComponent = defineComponent({
    name: 'UbeanAppRoot',
    setup() {
      return () => h(RouterView);
    }
  });

  return { app, router, head, page: reactive({}), navigate: (url, opts) => router.push(url) };
}
```

#### SSR `createUbeanSSRApp`

```typescript
export function createUbeanSSRApp(initialPage: PageObject, options: UbeanAppOptions) {
  const app = _createSSRApp(RootComponent);

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: true,
    initialUrl: initialPage.url
  });
  app.use(router);

  const RootComponent = defineComponent({
    name: 'UbeanSSRApp',
    setup() {
      provide(PAGE_KEY, reactive(initialPage));
      provide(HEAD_KEY, head);
      return () => h(RouterView);
    }
  });

  return { app, router };
}
```

### 3.7 SSR 渲染流程

渲染器 `renderer.ts` 改造为使用 vue-router：

```typescript
async function render(pageObj: PageObject, shellHtml: string, assetTags: PageAssetTags) {
  const { app, router } = createUbeanSSRApp(pageObj, rendererOptions);
  await router.isReady();
  const body = await renderToString(app);
  return body;
}
```

### 3.8 页面数据获取策略

迁移后有两种数据获取策略：

**策略 A（推荐）：纯客户端路由 + 懒加载组件**

- 页面组件通过 `() => import('...')` 懒加载
- 导航时 vue-router 自动处理组件加载
- 页面数据通过 `definePage` 中声明的 loader 在组件 `onBeforeRouteEnter` 或 `setup` 中获取
- **优点**：最简单，完全利用 vue-router 能力
- **缺点**：首次加载需要请求组件和数据

**策略 B（兼容）：保留 fetch-based 数据获取**

- 通过 `router.beforeEach()` 在导航前 fetch 页面数据
- 页面数据注入到 route meta 中
- **优点**：兼容现有服务端 loader/action 模式
- **缺点**：增加复杂度

**推荐采用策略 A**，后续根据需要逐步引入策略 B 的能力。

### 3.9 布局系统改造

当前布局通过手动 `resolveLayoutChain` + `renderNestedLayouts` 渲染。

改造为 **vue-router 嵌套路由**：

```typescript
// 虚拟模块生成的路由
const routes = [
  {
    path: '/',
    component: Layout_Default, // 布局作为父路由
    children: [
      { path: '', name: 'Home', component: Page_Home },
      { path: 'about', name: 'About', component: Page_About }
    ]
  },
  {
    path: '/dashboard',
    component: Layout_Dashboard,
    children: [{ path: '', name: 'Dashboard', component: Page_Dashboard }]
  },
  // layout: false 的页面直接作为顶层路由
  {
    path: '/login',
    name: 'Login',
    component: Page_Login,
    meta: { layout: false }
  }
];
```

布局组件使用 `<RouterView>` 替代 `<slot />`：

```vue
<!-- layouts/default.vue -->
<template>
  <div class="layout-default">
    <header><nav>...</nav></header>
    <main>
      <RouterView />
      <!-- 替代 <slot /> -->
    </main>
  </div>
</template>
```

### 3.10 文件变更清单

| 文件                             | 变更类型 | 说明                                    |
| -------------------------------- | -------- | --------------------------------------- |
| `runtime/vue/router.ts`          | 新增     | `createUbeanRouter()` 封装 vue-router   |
| `runtime/vue/app.ts`             | 重构     | 整合 router，删除自定义 client/navigate |
| `runtime/vue/client.ts`          | 删除     | 被 router.ts 替代                       |
| `runtime/vue/composables.ts`     | 重构     | useRouter/usePage 封装 vue-router       |
| `runtime/vue/components/Link.ts` | 重构     | 封装 RouterLink                         |
| `runtime/vue/router-location.ts` | 删除     | 被 vue-router 替代                      |
| `core/vue/virtual-modules.ts`    | 重构     | 生成 RouteRecordRaw[]                   |
| `core/vue/renderer.ts`           | 重构     | 使用 vue-router SSR                     |
| `core/vue/plugin.ts`             | 修改     | 适配新的虚拟模块                        |
| `package.json`                   | 修改     | 添加 vue-router 依赖                    |

### 3.11 预期收益

1. **彻底解决页面重载问题**：vue-router 原生处理 history API，经过充分测试
2. **获得完整路由能力**：嵌套路由、route guards、scroll restoration、active class、lazy loading
3. **生态兼容**：可直接使用 `<RouterLink>`、`<RouterView>`、`useLink`、typed routes
4. **简化代码**：删除 ~400 行自定义路由代码（client.ts 214 行 + router-location.ts 73 行 + app.ts 路由逻辑）
5. **保留 ubean 特色**：i18n 本地化、布局系统、definePage 宏等作为 vue-router 的扩展层
