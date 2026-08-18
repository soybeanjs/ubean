# SoybeanAdmin Next 开发计划

> 下一代 SoybeanAdmin 的技术选型、架构设计与开发计划。
> 对比当前版本 (v2.2.0) 的核心差异，明确下一代的管理后台方向。
>
> **v0.2 重大调整（2026-08-17）**：路由内核路线由「改造 elegant-router」调整为「**提取 ubean 客户端内核**」——将 ubean 的文件式路由、页面缓存等客户端能力封装为独立的 `ubean/client` 子路径入口，既可独立使用（只关注路由、页面缓存等客户端能力），也可在 ubean 框架内使用，实现单一实现、零双份维护。

---

## 1. 定位与目标

### 1.1 一句话定位

**SoybeanAdmin Next** 是 SoybeanAdmin 的下一代版本，基于 `vite-plus` + `Vue 3` + `@soybeanjs/ui` 构建，以 `@soybeanjs/ui` 替换 NaiveUI 作为默认 UI 库，以 **`ubean/client`（从 ubean 提取的独立客户端内核）** 作为路由与页面缓存基础，可选集成 `ubean` 元框架获得全栈能力。

### 1.2 核心目标

| 维度 | 目标 |
| --- | --- |
| **UI 统一** | 从 NaiveUI 迁移到 `@soybeanjs/ui`（Soybean 生态自有组件库），保持一致的视觉语言 |
| **路由内核独立** | 提取 ubean 客户端能力为 `ubean/client`，独立 SPA 可直接使用，只关注路由、页面缓存等客户端能力 |
| **单一实现** | 独立使用与 ubean 集成共用同一份路由/缓存实现，「贴合 ubean」构造性成立，零双份维护 |
| **ubean 可选集成** | 集成 ubean 元框架时，获得 SSR、文件式 API 路由、全栈能力 |
| **构建工具链** | 全面使用 `vite-plus` 替代裸 `vite`，统一工程化体验 |
| **后端对接** | 从 mock 数据切换到真实后端 API（对接 `soybean-unify` 的服务端） |
| **Monorepo 架构** | 采用 pnpm monorepo，结构清晰，可扩展 |

### 1.3 与现有项目的关系

```
SoybeanAdmin (current)              SoybeanAdmin Next (new)
┌──────────────────────┐            ┌──────────────────────────────┐
│ Vue3 + Vite8         │            │ Vue3 + vite-plus             │
│ NaiveUI              │     →      │ @soybeanjs/ui                │
│ @elegant-router/vue  │            │ ubean/client (独立客户端内核) │
│ Mock (ApiFox)        │            │ OpenAPI 真实后端              │
│ @sa/* 内部包         │            │ 极简内部包                   │
└──────────────────────┘            └──────────────────────────────┘
                                            │ 可选
                                            ↓
                                    ┌──────────────────────────────┐
                                    │ + ubean 元框架集成            │
                                    │ - SSR 支持                    │
                                    │ - 文件式 API 路由              │
                                    │ - 全栈能力                    │
                                    │ - ubean 生态                  │
                                    └──────────────────────────────┘
```

---

## 2. 核心架构决策：提取 ubean 客户端内核

### 2.1 背景与动机

原方案计划将 `elegant-router` 改造成「贴合 ubean 当前路由实现」的独立路由插件。但该思路存在本质缺陷：

- 需要维护**两条并行实现**（elegant-router 适配版 + ubean 自身路由）
- 「贴合」是目标而非构造性成立，需持续同步，容易漂移
- ubean 路由升级后，适配版需手动跟进

**新思路**：ubean 的路由与客户端运行时**本身就是按「可独立、可整合」分层的**：

| 层 | 包 | 定位 | 独立可用性 |
| --- | --- | --- | --- |
| L1 扫描内核 | `@ubean/routing` | 文件式路由扫描（pages/layouts、`definePage` 宏、路由命名、`[id]`/`(group)`/`.reuse`）、文件生成、typed-router.d.ts | ✅ 框架无关，无 Vue/Vite 运行时依赖 |
| L2 客户端运行时 | `@ubean/runtime` | `<PageView>`（KeepAlive+Transition+Suspense+ErrorBoundary）、`useCacheViews`/`enablePageCache`/`getNamedPageWrapper`、`<Link>`/`<Head>`、布局链、页面过渡/重载 | ✅ 仅依赖 vue + vue-router + unhead |
| L3 完整框架 | `ubean` | SSR、文件式 API 路由、中间件、crons、数据库、DevTools 等全栈能力 | 内部复用 L1+L2 |

**自动导入预设**早已按此边界拆分：`UBEAN_CLIENT_PRESET`（来自 `ubean/runtime/vue`，纯客户端）与 `UBEAN_SERVER_PRESET`（来自 `ubean`，含构建工具，仅服务端文件使用）。

因此 ubean 缺的只是 **一个一等公民的独立分发入口**：`ubean/client`。

### 2.2 ubean/client 子路径入口设计

在 `ubean` 主包新增客户端专用子路径导出，复用现有 `@ubean/routing` + `@ubean/runtime` + `@ubean/pages`，并新增一个轻量「客户端专用 Vite 插件」`ubeanClientPlugin`。

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
├── ubean/client/vite        # 独立客户端 Vite 插件 ubeanClientPlugin（构建期）
└── ubean/client/types       # 客户端类型（RouteName / LayoutName / typed-router.d.ts 模块增强）
```

**依赖边界（仅客户端）**：

| 包含 | 不包含 |
| --- | --- |
| `@ubean/routing`（扫描内核） | SSR / Hono |
| `@ubean/runtime`（Vue 客户端运行时） | 文件式 API 路由 |
| `@ubean/pages`（PageObject 协议） | server entry / middleware |
| vue + vue-router + @unhead/vue | crons / queues / 数据库 |
| 可选：`@ubean/i18n`、colorMode、view-transitions 等纯客户端能力 | DevTools / CLI 服务端能力 |

### 2.3 ubeanClientPlugin 独立 Vite 插件

`ubeanClientPlugin` 是 `ubeanVite` 的客户端子集，能力如下：

| 能力 | 说明 |
| --- | --- |
| 页面扫描 | 只扫描 `src/pages/` + `src/layouts/`（可配置 `dirs`），不扫描 routes/middleware/crons/queues 等 |
| 路由模式 | `virtual`（默认，零配置）/ `file`（物理文件）/ `both`（混合） |
| 客户端虚拟模块 | 注册 `virtual:ubean-client-pages`（pages/layouts/特殊页 404/loading/error） |
| 类型生成 | `.ubean/typed-router.d.ts`（RouteName / LayoutName / RoutePath 类型） |
| 自动导入 | 仅 `UBEAN_CLIENT_PRESET`（definePage / useCacheViews / PageView 等） |
| 全局组件 | 注册 `<Link>` / `<Head>` / `<PageView>` / `<SlotView>` |
| 页面缓存初始化 | 启动时 `initCachedViewsFromRoutes()`，读取 `definePage({ cache: true })` |
| 文件监听 | pages / layouts / app 变更自动重扫，HMR 生效 |
| 纯客户端扩展 | 可选启用 colorMode（无 FOUC 脚本）、view-transitions、内置 i18n |

**独立 SPA 使用方式**：

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
import { createUbeanClientApp } from 'ubean/client';
import { createWebHistory, createRouter } from 'vue-router';
// routes 由 ubean/client 生成（虚拟模块或 _generated/routes.ts）
```

**ubean 集成使用方式**：使用完整 `ubeanVite`（frontend-only 模式本身就是 `ubeanClientPlugin` 的超集），或完整元框架（SSR + API 路由）。同一套路由/缓存内核，无缝切换。

### 2.4 elegant-router 去留

- **决策**：SoybeanAdmin Next **不再依赖 elegant-router**，路由与页面缓存统一由 `ubean/client` 提供。
- elegant-router 保留为社区独立的文件式路由插件（适用于完全不想引入 ubean 依赖的项目），但与 SoybeanAdmin Next 主路线解耦。
- ubean 文档中「与 elegant-router 的差异」继续保留，作为选型参考。

---

## 3. 技术栈对比

### 3.1 核心依赖对比

| 维度 | SoybeanAdmin v2.2.0 | SoybeanAdmin Next | 说明 |
| --- | --- | --- | --- |
| **构建工具** | Vite 8 | Vite 8 + vite-plus | vite-plus 提供统一工程化入口 |
| **UI 框架** | Vue 3.5 | Vue 3.5+ | 一致 |
| **UI 组件库** | NaiveUI 2.44 | `@soybeanjs/ui` | 生态统一，Soybean 自有组件 |
| **路由内核** | `@elegant-router/vue` 0.3.8 | `ubean/client`（提取自 `@ubean/routing` + `@ubean/runtime`） | 独立可用 + 可整合 ubean |
| **状态管理** | Pinia 3.x | Pinia 3.x+ | 一致 |
| **CSS 引擎** | UnoCSS 66.x | UnoCSS 66.x | 一致，预设升级 |
| **国际化** | vue-i18n 11.x | vue-i18n 11.x（可选 `@ubean/i18n`） | 保持一致或切换内置 i18n |
| **请求库** | `@sa/axios` | `@soybeanjs/request` | 使用生态统一请求库 |
| **图标** | `@iconify/vue` + unplugin-icons | `@iconify/vue` + `@ubean/icon`(可选) | ubean 集成时可选图标模块 |
| **Mock** | ApiFox 在线 Mock | 无内置 Mock | 对接真实后端 |
| **元框架** | 无 | ubean（可选） | 全栈能力按需启用 |
| **内部包** | `@sa/*` (6个包) | 极简，复用 `@soybeanjs/*` + `@ubean/*` 生态 | 减少自维护内部包 |

### 3.2 工程化对比

| 维度 | SoybeanAdmin v2.2.0 | SoybeanAdmin Next |
| --- | --- | --- |
| **包管理** | pnpm monorepo | pnpm monorepo |
| **格式化** | oxfmt | Oxlint/Oxfmt (via vite-plus) |
| **Lint** | oxlint + eslint | Oxlint + ESLint (via vite-plus) |
| **提交** | `@sa/scripts` (sa git-commit) | `@soybeanjs/cli` (soy git-commit) |
| **类型检查** | vue-tsc | vue-tsc |
| **单元测试** | 无 | Vitest (可选) |
| **Hooks 工具** | `@sa/hooks` | `@vueuse/core` + `@soybeanjs/utils` |
| **工具函数** | `@sa/utils` | `@soybeanjs/utils` |
| **颜色工具** | `@sa/color` | `@soybeanjs/colord` |

---

## 4. 项目结构设计

### 4.1 Monorepo 结构

```
soybean-admin-next/
├── apps/
│   └── admin/               # 管理后台主应用
├── packages/
│   └── shared/              # 共享类型、工具（极简）
├── docs/                    # 文档
├── scripts/                 # 构建脚本
├── package.json
├── pnpm-workspace.yaml
├── uno.config.ts            # 根级 UnoCSS 配置
└── vite.config.ts           # 根级 vite-plus 配置
```

### 4.2 应用目录结构

```
apps/admin/
├── build/                    # 构建辅助（代理等）
├── public/                   # 公共资源
├── src/
│   ├── pages/                # 页面文件（路由文件，由 ubean/client 扫描）
│   │   ├── (builtin)/        # 内置页面（登录、异常等）
│   │   │   ├── login/
│   │   │   ├── 403.vue
│   │   │   ├── 404.vue
│   │   │   └── 500.vue
│   │   ├── home/
│   │   ├── manage/
│   │   │   ├── api/
│   │   │   ├── dict/
│   │   │   ├── menu/
│   │   │   ├── org/
│   │   │   ├── permission/
│   │   │   ├── role/
│   │   │   └── user/
│   │   └── user/
│   ├── layouts/              # 布局文件（ubean/client 自动扫描）
│   │   ├── base/
│   │   └── blank/
│   ├── components/           # 通用组件
│   ├── composables/          # 组合式逻辑
│   ├── constants/            # 常量
│   ├── directives/           # 自定义指令
│   ├── locales/              # 国际化
│   ├── router/               # 路由入口、守卫
│   │   ├── _generated/       # 自动生成（file 模式时）
│   │   └── guard/
│   ├── service/              # API 请求层
│   │   ├── config.ts
│   │   ├── request.ts
│   │   └── openapi.ts
│   ├── store/                # Pinia 状态
│   │   ├── app/
│   │   ├── auth/
│   │   ├── menu/
│   │   ├── route/
│   │   ├── tab/
│   │   └── theme/
│   ├── styles/               # 全局样式
│   ├── theme/                # 主题配置
│   ├── typings/              # 类型声明
│   ├── App.vue
│   └── main.ts               # 或 app.ts (ubean 集成模式时)
├── .env
├── uno.config.ts
├── vite.config.ts
└── package.json
```

### 4.3 两种使用模式对比

| 维度 | 独立 SPA 模式 | ubean 集成模式 |
| --- | --- | --- |
| Vite 插件 | `ubeanClientPlugin` | `ubeanVite`（或完整框架） |
| 路由内核 | `ubean/client` | 同一内核（`@ubean/routing` + `@ubean/runtime`） |
| 页面目录 | `src/pages/` | `src/pages/`（一致） |
| 布局 | `src/layouts/` 自动扫描 | `src/layouts/` 自动扫描（一致） |
| 页面缓存 | ✅ KeepAlive + `definePage({ cache })` | ✅ 一致 |
| SSR | ❌ | ✅ |
| 文件式 API 路由 | ❌ | ✅ `src/routes/` |
| 中间件 | 前端守卫（vue-router） | 前端守卫 + 服务端中间件 |
| 全栈能力 | ❌ | ✅ 数据库/crons/DevTools 等 |

---

## 5. 与 soybean-unify 的关系

### 5.1 定位差异

| 维度 | soybean-unify | soybean-admin-next |
| --- | --- | --- |
| **范围** | 全栈 Monorepo（前端+后端+Cloudflare） | 前端管理后台 |
| **后端** | 包含完整 Hono 后端 | 不包含后端，对接外部 API |
| **共享 Schema** | `packages/schema` 前后端共享 Valibot DTO | 不强制共享 Schema，通过 OpenAPI 类型生成 |
| **路由** | elegant-router v1.x | `ubean/client`（提取自 ubean） |
| **ubean 集成** | 未使用 | 可选集成（同一路由内核） |
| **目标用户** | 需要完整前后端方案的团队 | 只需前端管理后台的开发者 |

### 5.2 代码复用

| 可复用的部分 | 来源 | 说明 |
| --- | --- | --- |
| 页面组件 | soybean-unify `apps/admin/src/views/` | 可直接迁移到 `pages/` 目录 |
| Store 逻辑 | soybean-unify `apps/admin/src/store/` | 可直接复用，调整 API 适配 |
| 布局组件 | soybean-unify `apps/admin/src/layouts/` | 基于 `@soybeanjs/ui` 的 `SLayout`，可复用 |
| 通用组件 | soybean-unify `apps/admin/src/components/` | 大部分可复用 |
| 请求封装 | soybean-unify `apps/admin/src/service/` | `@soybeanjs/request` 可复用 |
| 国际化 | soybean-unify `apps/admin/src/i18n/` | 可复用翻译文件 |
| 主题配置 | soybean-unify `apps/admin/src/theme/` | 可复用主题预设 |
| OpenAPI 类型 | soybean-unify `apps/admin/src/service/openapi.ts` | 生成方式可复用 |

> **路由/缓存差异注意**：soybean-unify 用 elegant-router 生成 `src/router/_generated/`，页面目录是 `src/views/`；迁移到 Next 时改为 `ubean/client`（`src/pages/`），需做目录与路由元信息（`definePage`）迁移。

---

## 6. ubean 侧所需改动

`ubean/client` 子路径入口需要在 ubean 主仓库落地，是独立小改，不阻塞 SoybeanAdmin Next 的独立开发。

> 变更点清单、详细设计、实施顺序与风险已整理至 **[docs/optimize.md](./optimize.md)**（UB-01~UB-05）。

---

## 7. 开发阶段与里程碑

### Phase 0：ubean/client 内核落地 + 项目初始化

**目标**：先在 ubean 落地 `ubean/client`，再搭建 SoybeanAdmin Next 骨架，验证技术栈选型。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 【ubean】落地 `ubean/client` 内核（UB-01~UB-05，见 [docs/optimize.md](./optimize.md)） | 独立客户端内核可用 | P0 |
| 初始化 pnpm monorepo + vite-plus 配置 | 可运行的空项目 | P0 |
| 配置 `@soybeanjs/ui` + UnoCSS（shadcn preset） | UI 组件可渲染 | P0 |
| 接入 `ubean/client/vite`，`pages/` 文件式路由 | 路由自动生成，页面可访问 | P0 |
| 搭建基础布局（`layouts/base/` + `layouts/blank/`） | 侧边栏、顶部栏、Tab 标签 | P0 |
| 实现登录页面（pwd-login / register / reset-pwd） | 登录流程完整 | P0 |
| 实现异常页面（403 / 404 / 500） | 异常页展示 | P0 |
| 配置 Pinia stores（app / auth / theme / tab / route / menu） | 状态管理基础 | P0 |

**Phase 0 完成后的可运行页面**：
- 登录页（含密码登录/注册/重置密码）
- 首页
- 403/404/500 异常页
- 基础布局（侧边栏/顶部/标签栏）

### Phase 1：路由、权限与页面缓存体系

**目标**：构建完整的动态路由、权限与多标签缓存体系。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 路由守卫（auth 检查、loading 状态） | 页面级鉴权控制 | P0 |
| auth store（登录状态、用户信息、角色） | 认证状态管理 | P0 |
| menu store（菜单树、面包屑、菜单映射） | 菜单状态管理 | P0 |
| route store（动态路由注册、缓存控制） | 动态路由挂载 | P0 |
| tab store（标签页管理 + 页面缓存联动） | 多标签页管理 | P0 |
| 页面缓存体系（`definePage({ cache })` + `useCacheViews` + `resetRouteCache`） | 多标签 KeepAlive 缓存 | P0 |
| 静态菜单模式（`data.json` 本地菜单） | 无后端可用的菜单模式 | P0 |
| 动态菜单模式（从后端拉取菜单） | 对接后端菜单 | P1 |
| token 自动续期与失败恢复 | 稳定的登录态 | P1 |

### Phase 2：后端对接与 API 层

**目标**：对接 `soybean-unify` 服务端 API，实现完整 CRUD 管理页。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 配置 `@soybeanjs/request`（flatClient + flatOpenapiClient） | 统一请求封装 | P0 |
| 从 OpenAPI 生成前端类型（对接 `soybean-unify` 后端） | 类型安全的 API 调用 | P0 |
| 实现菜单管理页 | 菜单 CRUD、树形展示 | P0 |
| 实现用户管理页 | 用户 CRUD、分页、搜索 | P0 |
| 实现角色管理页 | 角色 CRUD、权限分配 | P0 |
| 实现组织管理页 | 组织 CRUD、树形展示 | P0 |
| 实现权限管理页 | 权限 CRUD | P0 |
| 实现接口资源管理页 | API 资源 CRUD | P0 |
| 实现字典管理页 | 字典 CRUD、字典项管理 | P0 |
| 实现用户个人页 | 个人资料、设置 | P1 |

**Phase 2 完成后的页面清单**：
- 所有后台管理页（菜单/用户/角色/组织/权限/API/字典）
- 与 soybean-unify 后端完全对接
- 完整的 CRUD 操作体验

### Phase 3：主题定制与 UI 打磨

**目标**：继承 SoybeanAdmin 的丰富主题定制能力，同时利用 `@soybeanjs/ui` 的组件能力。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 主题配置面板（颜色、布局、暗色模式） | 实时主题切换 | P0 |
| 多主题预设（default、其他） | 一键切换主题 | P0 |
| 暗色模式适配 | 完整暗色主题 | P0 |
| 页面过渡动画（`usePageTransition` / view-transitions） | 流畅的页面切换 | P1 |
| 移动端响应式布局 | 移动端可访问 | P1 |
| 国际化完善（中英文完整翻译，可选内置 `@ubean/i18n`） | 双语支持 | P1 |
| 图标选择器（IconPicker 组件） | 可交互的图标选择 | P1 |

### Phase 4：ubean 可选集成

**目标**：支持 optional 的 ubean 元框架集成，提供全栈能力。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 设计 ubean 集成入口（`app.ts` + `ubean.config.ts`） | 集成规范文档 | P0 |
| 模式切换：独立 SPA（`ubeanClientPlugin`）↔ ubean 全栈（`ubeanVite`） | 可切换的脚手架 | P1 |
| ubean 集成时启用 SSR | SSR 渲染 | P2 |
| ubean 集成时使用文件式 API 路由 | 后端 API 文件路由 | P2 |
| ubean 集成时使用 `@ubean/icon` 图标模块 | 图标优化 | P2 |
| ubean 集成时使用 `@ubean/pinia` SSR 状态水合 | SSR 状态同步 | P2 |

### Phase 5：质量与发布

**目标**：完善测试、文档、CI/CD，正式发布。

| 任务 | 交付物 | 优先级 |
| --- | --- | --- |
| 关键模块单元测试（store / utils / guards） | 测试覆盖 | P1 |
| 核心页面 E2E 测试（Playwright） | 登录、菜单、CRUD 流程 | P1 |
| CI 流水线（lint / typecheck / test / build） | GitHub Actions | P1 |
| 项目文档（README、部署、开发指南） | 完整文档 | P1 |
| 迁移指南（从 SoybeanAdmin v2.x 迁移） | 迁移文档 | P1 |
| 发布 v1.0.0-alpha | 可用版本 | P0 |

---

## 8. 关键决策记录

### ADR-01：UI 组件库

- **决策**：`@soybeanjs/ui` 替代 NaiveUI
- **理由**：Soybean 生态统一，`@soybeanjs/ui` 提供 Headless + UI 双层架构，与 UnoCSS shadcn preset 深度集成
- **影响**：所有页面组件需要重写，但布局结构保持（`SLayout` 替代 `NLayout`）

### ADR-02：路由与页面缓存内核

- **决策**：提取 ubean 客户端内核为 `ubean/client`，替换「改造 elegant-router」方案
- **理由**：`@ubean/routing`（框架无关扫描内核）+ `@ubean/runtime`（纯客户端运行时）本就可独立使用；`ubean/client` 提供一等公民的独立入口，独立 SPA 与 ubean 集成共用同一实现，「贴合 ubean」构造性成立、零双份维护
- **影响**：需在 ubean 主仓库落地 `ubean/client` 子路径（见 [docs/optimize.md](./optimize.md)）；SoybeanAdmin Next 不再依赖 elegant-router

### ADR-03：Monorepo 策略

- **决策**：独立仓库 `soybeanjs/soybean-admin-next`，不放入 ubean 主仓库
- **理由**：SoybeanAdmin 是独立产品，不依赖 ubean；保持版本独立发布
- **影响**：新增仓库维护成本，但产品独立性更强

### ADR-04：后端对接

- **决策**：对接 `soybean-unify` 服务端 API，不内置 Mock
- **理由**：`soybean-unify` 已提供完整后端实现，复用即可；Mock 作为开发辅助
- **影响**：开发环境需启动后端服务，但提供 `docker compose` 一键启动

### ADR-05：构建工具

- **决策**：使用 `vite-plus` 替代裸 `vite`
- **理由**：`vite-plus` 提供统一工程化入口（dev/build/fmt/lint/test），与 ubean 生态对齐
- **影响**：配置方式略有不同，但功能更强大

### ADR-06：独立/集成边界

- **决策**：`ubean/client` 严格保持纯客户端依赖，自动导入只使用 `ubean/runtime/vue` 入口
- **理由**：避免拉入 vite/oxc-parser 等构建依赖进浏览器产物（ubean 工程规范经验）；确保独立 SPA 产物最小化
- **影响**：`ubean/client/vite` 插件只注册 `UBEAN_CLIENT_PRESET`，不注册 `UBEAN_SERVER_PRESET`

---

## 9. 与 SoybeanAdmin v2.2.0 的差异总结

| 差异维度 | SoybeanAdmin v2.2.0 | SoybeanAdmin Next |
| --- | --- | --- |
| **UI 组件库** | NaiveUI | `@soybeanjs/ui` |
| **路由内核** | `@elegant-router/vue` 0.3.x | `ubean/client`（提取自 `@ubean/routing` + `@ubean/runtime`） |
| **构建工具** | 裸 Vite + 自定义脚本 | vite-plus |
| **Mock 方案** | ApiFox 在线 Mock | 无内置 Mock，对接真实后端 |
| **内部包** | 6 个 `@sa/*` 包 | 极简，复用 `@soybeanjs/*` + `@ubean/*` 生态 |
| **请求库** | `@sa/axios` | `@soybeanjs/request` |
| **Hooks** | `@sa/hooks` | `@vueuse/core` + `@soybeanjs/utils` |
| **元框架** | 无 | ubean（可选） |
| **页面目录** | `src/views/` | `src/pages/` |
| **路由模式** | 仅 `file` 模式 | `virtual` / `file` / `both` 三种模式 |
| **布局扫描** | 手动配置 `layouts` | 自动扫描 `src/layouts/` |
| **编译时宏** | 无 | `definePage({ name, path, layout, cache, meta, head })` |
| **页面缓存** | 组件 name 注入 + 自定义 tab store | `definePage({ cache })` + `useCacheViews`/`resetRouteCache` + `getNamedPageWrapper` |
| **复用路由** | `reuseRoutes` 配置 | `.reuse.ts` 文件约定（缓存继承） |
| **特殊页面** | 手动注册 404/500 | 自动检测 `404.vue`/`loading.vue`/`error.vue` |
| **SSR 支持** | 无 | ubean 集成时可选 |
| **文件式 API** | 无 | ubean 集成时可选 |
| **主题定制** | 完整 | 继承并增强（基于 `@soybeanjs/ui`） |
| **国际化** | 完整 | 继承（可选内置 `@ubean/i18n`） |
| **移动端适配** | 支持 | 继承 |
| **工程化** | 自定义脚本 | vite-plus 统一入口 |
| **测试** | 无 | 单元测试 + E2E 测试 |

---

## 10. 后续演进

### Phase 6+：平台能力扩展

- 文件上传与资源管理
- 通知与消息中心
- 操作审计日志
- 批量导入导出
- 更多页面模板（详情页、关系页、仪表盘扩展）

### 与 ubean-studio 的关系

SoybeanAdmin Next 是 ubean-studio 物料市场和商业系统的天然消费方：

- **物料市场**：SoybeanAdmin Next 的页面（基于 `ubean/client` 文件式路由 + `@soybeanjs/ui`）可直接作为物料市场的一部分
- **商业系统**：SoybeanAdmin Next 可作为「中后台管理系统」商业系统的基座（含 `ubean/client` 独立模式与 ubean 全栈模式两种形态）
- **AI 驱动**：ubean-studio 的 AI 能力可直接用于 SoybeanAdmin Next 的项目开发
