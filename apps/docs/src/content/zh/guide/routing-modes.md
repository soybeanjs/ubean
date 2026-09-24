---
title: 路由模式
description: 路由生成模式 —— virtual、file 与 both，以及各自的适用场景。
---

# 路由生成模式

ubean 支持三种路由数据生成模式，其设计理念与 [elegant-router](https://github.com/elegant-router/vue-router-elegant) 一致：你可以在「虚拟模块」与「物理文件」之间自由切换。

## 模式总览

| 模式 | 文件输出 | 虚拟模块 | 适用场景 | IDE 导航 |
|---|---|---|---|---|
| `virtual`（默认） | 无 | ✅ 已注册 | 启动快、零配置、不污染 git | 通过虚拟模块映射 |
| `file` | ✅ 已生成 | ❌ 不注册 | 手动改 `meta`、IDE 直接跳转、在 PR 中审阅生成文件 | 直接跳到 `src/router/_generated/routes.ts` |
| `both` | ✅ 已生成 | ✅ 已注册 | 调试（对照虚拟与物理数据） | 两者皆可 |

## 配置

通过 `ubean.config.ts` 的 `routing` 字段配置：

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routing: {
    mode: 'file', // 'virtual' | 'file' | 'both'（默认 'virtual'）
    outputDir: 'src/router/_generated', // 物理文件输出目录（相对 rootDir；产出 routes.ts / imports.ts）
    defaultLayout: 'default', // 默认布局名（默认 'default'；设为 false 可禁用）
    routeLazy: true, // 懒加载路由组件（默认 true）
    layoutLazy: true, // 懒加载布局组件（默认 true）
    watchFile: true, // 开发态监听文件变化（默认 true）
    fileUpdateDuration: 100, // 文件变更防抖时长（默认 100ms）
    onGenerated(files) {
      console.log('[ubean] 路由文件已生成：', files);
    }
  }
});
```

> 📌 `typed-router.d.ts` 不会写入 `outputDir`，它始终生成到 `.ubean/typed-router.d.ts` —— 与其他纯类型声明产物（`auto-imports.d.ts`、`components.d.ts`）同目录，且都被 gitignore。它通过模块增强（`declare module '@ubean/scan'`）提供类型；只要 `tsconfig.json` 的 `include` 覆盖 `.ubean/*`，类型即全局生效。

### 完整选项参考

参见 [`@ubean/config`](../../../../../../packages/config/src/types.ts) 中的 `RoutingConfig` 类型。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mode` | `'virtual' \| 'file' \| 'both'` | `'virtual'` | 路由数据生成模式 |
| `outputDir` | `string` | `'src/router/_generated'` | 物理文件输出目录（相对 `rootDir`；产出 `routes.ts`/`imports.ts`） |
| `generateBuiltinRoutes` | `boolean` | `true` | 生成内置路由（404、根路径重定向） |
| `rootRedirect` | `string` | — | 根路径重定向目标（例如 `/home`） |
| `notFoundRouteComponent` | `string` | `'404.vue'` | 404 页面组件路径 |
| `defaultLayout` | `string \| false` | `'default'` | 默认布局名 |
| `routeLazy` | `boolean` | `true` | 懒加载路由组件 |
| `layoutLazy` | `boolean` | `true` | 懒加载布局组件（与 `routeLazy` 平行） |
| `getRouteName` | `(filePath) => string` | 内置 | 自定义路由名生成器 |
| `getRoutePath` | `(filePath) => string` | 内置 | 自定义路由路径生成器 |
| `getRouteLayout` | `(filePath) => string \| false \| undefined` | 内置 | 自定义布局解析器 |
| `getRouteMeta` | `(filePath, frontmatter) => Record` | 内置 | 自定义路由 meta 解析器 |
| `onGenerated` | `(files: string[]) => void` | — | 生成完成回调（仅 `file`/`both`） |
| `watchFile` | `boolean` | `true` | 开发态监听变化（仅 `file`/`both`） |
| `fileUpdateDuration` | `number` | `100` | 防抖时长（ms） |

> **页面扫描来源**：页面文件扫描直接基于 `dir.pages`（支持 `string | string[]` 多目录），不再通过单独的 `pageInclude`/`pageExclude` glob 过滤。要排除特定文件，请使用 `scanOptions.ignore`（对所有扫描类型生效：页面/路由/布局/中间件等）。

## 模式详解

### 1. `virtual`（默认）—— 虚拟模块模式

ubean 在构建/开发时扫描 `src/pages/` 与 `src/layouts/`，把路由数据注册进虚拟模块：

- `virtual:ubean-pages` —— 页面路由数据
- `virtual:ubean-routes` —— API 路由数据
- `virtual:ubean-meta` —— 路由元数据
- `virtual:ubean-app-config` —— 应用配置
- `virtual:ubean-locales` —— 区域设置数据

**优点**：零配置启动、不污染 git 历史、所有路由数据都在内存中生成。

**缺点**：无法在 IDE 里直接跳转到路由定义，生成的 `meta` 也不能手动修改。

```ts
// 默认行为，无需任何配置
export default defineConfig({});
```

### 2. `file` —— 物理文件模式

扫描完成后，ubean 把路由数据写到以下位置：

```
src/router/_generated/        # 物理路由文件（meta 可编辑，增量保护）
├── routes.ts                  # 扁平化的 RouteRecord[]（name/path/component/layout/meta）
└── imports.ts                 # 懒加载的 views 与 layouts 记录

.ubean/                        # 纯类型声明（已 gitignore，每次全量重新生成）
└── typed-router.d.ts          # 类型定义（RouteKey/RoutePath/RouteLayoutKey/ReuseRouteKey）
```

**优点**：

- IDE 可以直接跳到 `routes.ts` 查看路由定义
- 支持手动修改 `meta` —— 增量更新生成结果，绝不覆盖用户的改动
- 生成的 `.d.ts` 通过模块增强（`declare module '@ubean/scan'`）提供强类型的路由名/路径补全，全局生效

**缺点**：

- 需要自行决定是否把 `src/router/_generated/` 加入 `.gitignore`（推荐提交以便在 PR 中审阅，或忽略以避免污染 git 历史）
- 首次启动略慢（要写文件）

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    outputDir: 'src/router/_generated'
  }
});
```

#### 增量更新行为

每次重新生成时，生成器遵循以下规则：

1. **`routes.ts`**（位于 `outputDir`）：对每条路由记录保留用户已有的 `meta` 字段（绝不覆盖），只更新 `name`/`path`/`component`/`layout` 等自动生成的字段
2. **`imports.ts`**（位于 `outputDir`）：全量重新生成（无用户可编辑内容）
3. **`typed-router.d.ts`**（位于 `.ubean/`）：全量重新生成（无用户可编辑内容，已 gitignore）

新增页面文件时，生成器把新路由追加到 `routes.ts` 末尾，默认 `meta` 取自 `definePage({ meta })` 宏或 frontmatter。

#### `onGenerated` 回调

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    onGenerated(files) {
      // files: ['/abs/src/router/_generated/routes.ts', '.../imports.ts', '.../typed-router.d.ts']
      console.log(`[ubean] 已生成 ${files.length} 个路由文件`);
    }
  }
});
```

### 3. `both` —— 混合模式（调试用）

同时生成物理文件并注册虚拟模块。适用于：

- 从 `virtual` 迁移到 `file` 的过渡期
- 调试路由数据不一致的问题（对照虚拟模块与物理文件的差异）

```ts
export default defineConfig({
  routing: {
    mode: 'both'
  }
});
```

## 纯前端项目

对于不依赖后端（SSR/API 路由）的纯 SPA 项目，可以只使用 `@ubean/vite`、`@ubean/client`、`@ubean/scan` 和 `@ubean/pages` 这几个子包，无需引入 `@ubean/build`、`@ubean/app` 或 `@ubean/server`。

```ts
// vite.config.ts（纯前端）
import { defineConfig } from 'vite-plus';
import { ubeanVite } from '@ubean/build/vue';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default defineConfig({
  plugins: [...ubeanVite(), ubeanIslandsPlugin()]
});
```

这种情况下路由生成模式默认为 `virtual`（由 `@ubean/vite` 内部处理）。要切到 `file` 模式，通过 `ubeanVite` 选项传入：

```ts
ubeanVite({
  routing: { mode: 'file' }
});
```

## CLI 路由管理命令（规划中）

对标 elegant-router，ubean 计划在 `@ubean/cli` 中提供以下命令（Phase 6 之后加入）：

| 命令 | 说明 |
|---|---|
| `ubean add-route <name>` | 创建页面文件并触发生成 |
| `ubean delete-route <name>` | 删除页面文件并清理生成产物 |
| `ubean recovery-route <name>` | 从备份恢复被删除的路由 |
| `ubean update-route` | 强制重新生成全部路由文件 |
| `ubean add-reuse-route <name>` | 添加 reuse 路由（`xxx.reuse.vue`） |
| `ubean backup` | 备份当前的 `src/router/_generated/` |

> 截至 Phase 5，CLI 已提供 6 个脚手架命令 —— `ubean page`/`ubean api`/`ubean layout`/`ubean middleware`/`ubean cron`/`ubean plugin` —— 与原 ubean 行为 100% 一致。上述 6 个路由管理命令将在 Phase 6 的文档与示例落地后加入。

## 迁移指南

### 从 `virtual` 迁移到 `file`

1. 在 `ubean.config.ts` 中加入 `routing: { mode: 'file' }`
2. 运行 `pnpm dev` 或 `pnpm build` —— 生成器会自动产出 `src/router/_generated/`
3. 把 `src/router/_generated/` 加入 `.gitignore`（可选 —— 如果希望在 PR 中审阅路由变更，就提交它）
4. 要手动修改 `meta`，编辑 `routes.ts` 中对应记录的 `meta` 字段
5. 后续增删页面时，生成器增量更新，并保留用户的改动

### 从 `file` 回到 `virtual`

1. 把 `ubean.config.ts` 中的 `routing: { mode: 'virtual' }` 改掉（或删除 `routing` 字段）
2. 删除 `src/router/_generated/` 目录（可选 —— 残留文件不影响虚拟模式）
3. 重新运行 `pnpm dev`

## 与 elegant-router 的差异

| 维度 | ubean | elegant-router |
|---|---|---|
| 默认模式 | `virtual` | `file` |
| 虚拟模式 | ✅ 支持 | ❌ 不支持 |
| 物理文件模式 | ✅ 支持 | ✅ 默认 |
| 混合模式 | ✅ `both` | ❌ |
| 增量 meta 保护 | ✅ | ❌（全量重新生成） |
| 框架无关 | ✅（`@ubean/scan` 不依赖 Vue） | ❌（仅 Vue） |
| 类型生成 | `typed-router.d.ts` | `typed-router.d.ts` |
| CLI 路由管理 | 规划中 | ✅ 内置 |

ubean 的核心优势是**把 `virtual` 模式作为零配置默认值**，同时提供 `file` 模式满足需要 IDE 导航与手动编辑 `meta` 的场景。两种模式可在同一项目的不同阶段自由切换。
