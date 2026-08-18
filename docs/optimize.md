# ubean 侧优化计划

> 本文档整理 **SoybeanAdmin Next 计划中涉及 ubean 主仓库的变更点**：将 ubean 的文件式路由、页面缓存等客户端能力封装为独立的 `ubean/client` 子路径入口，既可独立使用（只关注路由、页面缓存等客户端能力），也可在 ubean 框架内使用，实现单一实现、零双份维护。
>
> 关联文档：[docs/soybean-admin-next.md](./soybean-admin-next.md)（SoybeanAdmin Next 整体开发计划，§2 核心架构决策 / §6 指向本文档）

---

## 1. 背景与目标

SoybeanAdmin Next 选择「提取 ubean 客户端内核」路线，而非「改造 elegant-router」：

- `@ubean/routing` 已是**框架无关的扫描内核**（无 Vue/Vite 运行时依赖）
- `@ubean/runtime` 的页面缓存运行时（`useCacheViews`/`getNamedPageWrapper`/`PageView`）**只依赖 vue + vue-router + unhead**
- 自动导入预设已拆出 `UBEAN_CLIENT_PRESET` / `UBEAN_SERVER_PRESET` 两层
- `ubeanVite` 已有 frontend-only 模式支持

**缺口**：缺少一个一等公民的独立分发入口 `ubean/client`，让独立 SPA 项目能直接复用这套路由/缓存内核，且不与 SSR/server 能力耦合。

**本计划的验收目标**：

1. 独立 SPA 项目通过 `ubean/client/vite` 一行插件接入即可获得文件式路由 + 页面缓存能力
2. 客户端产物不拉入 vite/oxc-parser 等构建依赖（自动导入只使用 `ubean/runtime/vue` 入口）
3. 现有 ubean 路由单测全部回归通过，无行为变更
4. `examples/frontend-only` 升级为 `ubeanClientPlugin` 用法，作为独立 SPA 示例

---

## 2. 变更点清单

| ID | 变更点 | 内容 | 优先级 |
| --- | --- | --- | --- |
| UB-01 | 新增 `ubean/client` 子路径导出 | 客户端运行时聚合为 **Vue 插件 `ubeanClient`**（`app.use` 安装，见 §3.5），re-export `@ubean/runtime` 客户端部分 + `definePage` 等 | P0 |
| UB-02 | 新增 `ubean/client/vite` | 独立客户端 Vite 插件 `ubeanClientPlugin`（详见 §3） | P0 |
| UB-03 | 新增 `ubean/client/types` | `RouteName`/`LayoutName`/`RoutePath` 类型与 typed-router.d.ts 模块增强 | P1 |
| UB-04 | 测试 | 独立 SPA 冒烟测试（创建页面→路由→缓存→HMR）+ 现有路由单测回归 | P0 |
| UB-05 | 文档与示例 | `examples/frontend-only` 升级为 `ubeanClientPlugin` 用法 + 文档 | P1 |

---

## 3. 详细设计

### 3.1 子路径入口组织

```
ubean/
├── ubean/client/            # 客户端运行时聚合（Vue 插件 ubeanClient，app.use 安装）
│   ├── ubeanClient          # 默认导出：Vue 插件（install(app, options)）
│   ├── PageView / Link / Head / SlotView
│   ├── useRouter / usePage
│   ├── useCacheViews / enablePageCache / disablePageCache / ...
│   ├── getNamedPageWrapper / initCachedViewsFromRoutes
│   ├── usePageTransition / reloadPage / useReloadSignal
│   └── definePage（编译时宏）
├── ubean/client/vite        # 独立客户端 Vite 插件 ubeanClientPlugin（构建期，见 §3.3）
└── ubean/client/types       # 客户端类型（RouteName / LayoutName / typed-router.d.ts 模块增强）
```

> **命名区分**：`ubeanClient`（`ubean/client` 默认导出）是**运行时 Vue 插件**，通过 `app.use(ubeanClient, options)` 安装；`ubeanClientPlugin`（`ubean/client/vite`）是**构建期 Vite 插件**，负责扫描与路由生成。两者职责不同、阶段不同。

### 3.2 依赖边界（仅客户端）

| 包含 | 不包含 |
| --- | --- |
| `@ubean/routing`（扫描内核） | SSR / Hono |
| `@ubean/runtime`（Vue 客户端运行时） | 文件式 API 路由 |
| `@ubean/pages`（PageObject 协议） | server entry / middleware |
| vue + vue-router + @unhead/vue | crons / queues / 数据库 |
| 可选：`@ubean/i18n`、colorMode、view-transitions 等纯客户端能力 | DevTools / CLI 服务端能力 |

### 3.3 ubeanClientPlugin 能力清单（UB-02）

`ubeanClientPlugin` 是 `ubeanVite` 的客户端子集：

| 能力 | 说明 |
| --- | --- |
| 页面扫描 | 只扫描 `src/pages/` + `src/layouts/`（可配置 `dirs`），不扫描 routes/middleware/crons/queues 等 |
| 路由模式 | `virtual`（默认，零配置）/ `file`（物理文件）/ `both`（混合） |
| 客户端虚拟模块 | 注册 `virtual:ubean-client-pages`（pages/layouts/特殊页 404/loading/error） |
| 类型生成 | `.ubean/typed-router.d.ts`（RouteName / LayoutName / RoutePath 类型） |
| 自动导入 | 仅 `UBEAN_CLIENT_PRESET`（definePage / useCacheViews / PageView 等），不注册 `UBEAN_SERVER_PRESET` |
| 全局组件 | 注册 `<Link>` / `<Head>` / `<PageView>` / `<SlotView>` |
| 页面缓存初始化 | 启动时 `initCachedViewsFromRoutes()`，读取 `definePage({ cache: true })` |
| 文件监听 | pages / layouts / app 变更自动重扫，HMR 生效 |
| 纯客户端扩展 | 可选启用 colorMode（无 FOUC 脚本）、view-transitions、内置 i18n |

### 3.4 使用方式（独立 SPA）

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import vue from '@vitejs/plugin-vue';
import { ubeanClientPlugin } from 'ubean/client/vite';

export default defineConfig({
  plugins: [vue(), ubeanClientPlugin({ routing: { mode: 'file' } })]
});
```

```ts
// src/main.ts（独立 SPA 入口）
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { ubeanClient } from 'ubean/client';
// routes 由 ubean/client 生成（虚拟模块或 _generated/routes.ts）
import { routes } from './router/_generated/routes';

const router = createRouter({ history: createWebHistory(), routes });

createApp(App)
  .use(router)
  .use(ubeanClient, {
    routes,
    defaultLayout: 'default',
    resolveLayoutComponent: name => import(`@/layouts/${name}.vue`)
  })
  .mount('#app');
```

### 3.5 ubeanClient Vue 插件设计（UB-01）

`ubeanClient` 以 Vue 插件形式暴露，`install(app, options)` 内完成客户端运行时装配，**不接管 `createApp`**，用户保留应用根实例的完全控制权（可自由组合 Pinia、vue-i18n 等插件）：

```ts
import type { Plugin } from 'vue';

export interface UbeanClientOptions {
  routes: RouteRecordRaw[];
  defaultLayout?: string | null;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  loadingComponent?: Component | (() => Component);
  errorComponent?: Component | (() => Component);
  viewTransitions?: boolean | ViewTransitionOptions;
}

export const ubeanClient: Plugin<UbeanClientOptions> = {
  install(app, options) {
    // 1. 注册全局组件
    app.component('Link', Link);
    app.component('Head', Head);
    app.component('PageView', PageView);
    app.component('SlotView', SlotView);

    // 2. provide 页面 / 过渡 / loading / error 上下文（PageView、usePage 依赖）
    app.provide(PAGE_KEY, page);
    app.provide(TRANSITION_KEY, transitionOpts);
    app.provide(LOADING_KEY, loadingComponent ?? null);
    app.provide(ERROR_KEY, errorComponent ?? null);

    // 3. 从路由元信息初始化页面缓存（definePage({ cache: true })）
    initCachedViewsFromRoutes(options.routes);

    // 4. 暴露全局 $ubean
    app.config.globalProperties.$ubean = { page, head, router: app.config.globalProperties.$router };
  }
};
```

**职责清单**：

| 职责 | 说明 |
| --- | --- |
| 注册全局组件 | `<Link>` / `<Head>` / `<PageView>` / `<SlotView>` |
| provide 运行时上下文 | `PAGE_KEY` / `TRANSITION_KEY` / `LOADING_KEY` / `ERROR_KEY`（布局链、Suspense fallback、ErrorBoundary 依赖） |
| 页面缓存初始化 | `initCachedViewsFromRoutes(routes)`，读取 `definePage({ cache: true })` |
| 全局对象 | `app.config.globalProperties.$ubean` |
| 不接管的部分 | `createApp`、`createRouter`、`head` 实例（由用户自行创建与组合） |

> **边界**：`ubeanClient` 仅面向独立 SPA。SSR / 全栈场景仍走框架内部的 `createUbeanClientApp` / `createUbeanSSRApp`（框架需要接管 createApp 以支持 SSR 水合），两条路径共用同一套 `@ubean/runtime` 实现。

---

## 4. 实施顺序

1. **UB-01** 新增 `ubean/client` 子路径导出，实现 Vue 插件 `ubeanClient`（复用 `@ubean/runtime` 的全局组件注册、provide 上下文与缓存初始化逻辑）
2. **UB-02** 新增 `ubean/client/vite` 的 `ubeanClientPlugin`（从 `ubeanVite` 裁剪客户端子集，只注册 `UBEAN_CLIENT_PRESET`）
3. **UB-04** 独立 SPA 冒烟测试 + 现有路由单测回归（与 UB-01/UB-02 同步）
4. **UB-03** 新增 `ubean/client/types` 类型入口
5. **UB-05** `examples/frontend-only` 升级 + 文档

> 与 `@ubean/devtools`、`@ubean/pages` 等包无耦合；`ubeanClientPlugin` 不触碰 SSR/server 路径，保证客户端依赖最小化（避免自动导入拉入 vite/oxc-parser 等构建依赖——见工程规范中「客户端自动导入必须用 `ubean/runtime/vue` 入口」的经验）。

---

## 5. 影响范围与风险

| 项 | 评估 |
| --- | --- |
| 对现有 ubean 行为 | 无行为变更，纯新增入口与插件；现有路由单测需全绿 |
| 对 ubean 包依赖 | `ubean` 主包新增子路径导出，需在 `package.json` exports 中声明 |
| 对 SoybeanAdmin Next | 阻塞 Phase 0 的 `ubean/client/vite` 接入，其余开发可并行 |
| 对 elegant-router | 解耦：SoybeanAdmin Next 不再依赖 elegant-router；elegant-router 保留为社区独立插件 |
| 风险 | 客户端产物误拉入构建依赖（通过仅 `UBEAN_CLIENT_PRESET` + `ubean/runtime/vue` 入口规避） |
