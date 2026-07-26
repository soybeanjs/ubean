# 路由生成模式

ubean 支持三种路由数据生成模式,对齐 [elegant-router](https://github.com/elegant-router/vue-router-elegant) 的设计理念,允许在"虚拟模块"和"实体文件"之间自由切换。

## 模式总览

| 模式 | 文件产物 | 虚拟模块 | 适用场景 | IDE 跳转 |
|---|---|---|---|---|
| `virtual`(默认) | 无 | ✅ 注册 | 快速启动、零配置、不想污染 git | 通过 virtual 模块映射 |
| `file` | ✅ 生成 | ❌ 不注册 | 需要手动修改 `meta`、IDE 直接跳转、生成 PR 审阅 | 直接跳到 `src/router/_generated/routes.ts` |
| `both` | ✅ 生成 | ✅ 注册 | 调试场景(同时对比虚拟/实体数据) | 两者皆可 |

## 配置

在 `ubean.config.ts` 中通过 `routing` 字段配置:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routing: {
    mode: 'file', // 'virtual' | 'file' | 'both'(默认 'virtual')
    outputDir: 'src/router/_generated', // 实体文件输出目录(相对于 rootDir,产出 routes.ts / imports.ts)
    defaultLayout: 'default', // 默认布局名称(默认 'default',设为 false 表示不使用)
    routeLazy: true, // 路由组件懒加载(默认 true)
    layoutLazy: true, // 布局组件懒加载(默认 true)
    watchFile: true, // dev 模式下监听文件变更(默认 true)
    fileUpdateDuration: 100, // 文件变更 debounce 时长(默认 100ms)
    onGenerated(files) {
      console.log('[ubean] 路由文件已生成:', files);
    }
  }
});
```

> 📌 `typed-router.d.ts` 不在 `outputDir` 中,固定生成到 `.ubean/typed-router.d.ts`(与 `auto-imports.d.ts`、`components.d.ts` 等其他纯类型声明产物同目录,均已 gitignored)。该文件通过 `declare module '@ubean/routing'` 模块增强提供类型,只要 `tsconfig.json` 的 `include` 包含 `.ubean/*`,类型即自动全局生效。

### 完整配置项

详见 [`@ubean/config` 的 `RoutingConfig` 类型](../../../packages/config/src/types.ts)。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mode` | `'virtual' \| 'file' \| 'both'` | `'virtual'` | 路由数据生成模式 |
| `outputDir` | `string` | `'src/router/_generated'` | 实体文件输出目录(相对于 `rootDir`,产出 `routes.ts`/`imports.ts`) |
| `generateBuiltinRoutes` | `boolean` | `true` | 是否生成内置路由(404、首页重定向) |
| `rootRedirect` | `string` | — | 根路径重定向目标(如 `/home`) |
| `notFoundRouteComponent` | `string` | `'404.vue'` | 404 页面组件路径 |
| `defaultLayout` | `string \| false` | `'default'` | 默认布局名称 |
| `routeLazy` | `boolean` | `true` | 路由组件懒加载 |
| `layoutLazy` | `boolean` | `true` | 布局组件懒加载(与 `routeLazy` 平行) |
| `getRouteName` | `(filePath) => string` | 内置 | 自定义路由名称生成器 |
| `getRoutePath` | `(filePath) => string` | 内置 | 自定义路由路径生成器 |
| `getRouteLayout` | `(filePath) => string \| false \| undefined` | 内置 | 自定义布局解析器 |
| `getRouteMeta` | `(filePath, frontmatter) => Record` | 内置 | 自定义路由 meta 解析器 |
| `onGenerated` | `(files: string[]) => void` | — | 生成完成回调(仅 `file`/`both`) |
| `watchFile` | `boolean` | `true` | dev 监听变更(仅 `file`/`both`) |
| `fileUpdateDuration` | `number` | `100` | debounce 时长(ms) |

> **页面扫描来源**:页面文件扫描直接基于 `dir.pages`(支持 `string | string[]` 多目录),
> 不再通过独立的 `pageInclude`/`pageExclude` glob 过滤。如需排除特定文件,使用
> `scanOptions.ignore`(适用于所有扫描类型:pages/routes/layouts/middleware 等)。

## 模式详解

### 1. `virtual`(默认)— 虚拟模块模式

ubean 在构建/dev 时扫描 `src/pages/` 与 `src/layouts/`,生成路由数据注册到虚拟模块:

- `virtual:ubean-pages` — 页面路由数据
- `virtual:ubean-routes` — API 路由数据
- `virtual:ubean-meta` — 路由元数据
- `virtual:ubean-app-config` — 应用配置
- `virtual:ubean-locales` — 区域设置数据

**优点**:零配置启动,不污染 git 历史,所有路由数据都在内存中动态生成。

**缺点**:无法在 IDE 中直接跳转到路由定义,无法手动修改生成的路由 `meta`。

```ts
// 默认行为,无需配置
export default defineConfig({});
```

### 2. `file` — 实体文件模式

ubean 扫描后将路由数据写入以下位置:

```
src/router/_generated/        # 实体路由文件(可编辑 meta,增量保护)
├── routes.ts                  # 扁平 RouteRecord[](name/path/component/layout/meta)
└── imports.ts                 # 懒加载 views 与 layouts 记录

.ubean/                        # 纯类型声明(已 gitignored,每次完全重新生成)
└── typed-router.d.ts          # 类型定义(RouteKey/RoutePath/RouteLayoutKey/ReuseRouteKey)
```

**优点**:
- IDE 可直接跳转到 `routes.ts` 查看路由定义
- 支持手动修改 `meta` 字段,**生成器采用增量更新,不会覆盖用户修改**
- 生成的 `.d.ts` 通过模块增强(`declare module '@ubean/routing'`)提供路由名称/路径的强类型补全,自动全局生效

**缺点**:
- `src/router/_generated/` 需要决定是否加入 `.gitignore`(推荐提交以供 PR 审阅,或忽略以避免污染 git 历史)
- 首次启动稍慢(需要写文件)

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    outputDir: 'src/router/_generated'
  }
});
```

#### 增量更新行为

生成器在每次重新生成时遵循以下规则:

1. **`routes.ts`**(位于 `outputDir`):对每个路由记录,保留用户已有的 `meta` 字段(不覆盖),仅更新 `name`/`path`/`component`/`layout` 等自动生成的字段
2. **`imports.ts`**(位于 `outputDir`):完全重新生成(无用户可编辑内容)
3. **`typed-router.d.ts`**(位于 `.ubean/`):完全重新生成(无用户可编辑内容,gitignored)

如果新增了页面文件,生成器会在 `routes.ts` 末尾追加新路由,默认 `meta` 来自 `definePage({ meta })` 宏或 frontmatter。

#### `onGenerated` 回调

```ts
export default defineConfig({
  routing: {
    mode: 'file',
    onGenerated(files) {
      // files: ['/abs/src/router/_generated/routes.ts', '.../imports.ts', '.../typed-router.d.ts']
      console.log(`[ubean] 生成 ${files.length} 个路由文件`);
    }
  }
});
```

### 3. `both` — 混合模式(调试场景)

同时生成实体文件并注册虚拟模块。适用于:
- 从 `virtual` 迁移到 `file` 时的过渡阶段
- 调试路由数据不一致问题(对比虚拟模块与实体文件的差异)

```ts
export default defineConfig({
  routing: {
    mode: 'both'
  }
});
```

## 前端-only 项目的路由配置

对于不依赖后端(SSR/API 路由)的纯 SPA 项目,可以只使用 `@ubean/vite`、`@ubean/runtime`、`@ubean/routing`、`@ubean/pages` 等子包,无需引入 `@ubean/build`、`@ubean/app`、`@ubean/server`。

```ts
// vite.config.ts(frontend-only)
import { defineConfig } from 'vite-plus';
import { ubeanVuePlugin } from '@ubean/vite';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default defineConfig({
  plugins: [...ubeanVuePlugin(), ubeanIslandsPlugin()]
});
```

此时路由生成模式默认为 `virtual`(由 `@ubean/vite` 内部处理),如需切换到 `file` 模式,通过 `ubeanVuePlugin` 的 options 传入:

```ts
ubeanVuePlugin({
  routing: { mode: 'file' }
});
```

## CLI 路由管理命令(计划中)

对齐 elegant-router,ubean 计划在 `@ubean/cli` 中提供以下命令(Phase 6 后追加):

| 命令 | 说明 |
|---|---|
| `ubean add-route <name>` | 新增页面文件并触发生成 |
| `ubean delete-route <name>` | 删除页面文件并清理生成文件 |
| `ubean recovery-route <name>` | 从备份恢复已删除的路由 |
| `ubean update-route` | 强制重新生成所有路由文件 |
| `ubean add-reuse-route <name>` | 新增复用路由(`xxx.reuse.vue`) |
| `ubean backup` | 备份当前 `src/router/_generated/` |

> 当前阶段(Phase 5 完成)CLI 已提供 `ubean page`/`ubean api`/`ubean layout`/`ubean middleware`/`ubean cron`/`ubean plugin` 6 个 scaffold 命令,与原 ubean 行为 100% 对齐。上述 6 个路由管理命令将在 Phase 6 文档与示例落地后单独追加。

## 迁移建议

### 从 `virtual` 迁移到 `file`

1. 在 `ubean.config.ts` 中添加 `routing: { mode: 'file' }`
2. 运行 `pnpm dev` 或 `pnpm build`,生成器自动产出 `src/router/_generated/`
3. 将 `src/router/_generated/` 加入 `.gitignore`(可选 — 若希望 PR 审阅路由变更则提交)
4. 如需手动修改 `meta`,直接编辑 `routes.ts` 中对应记录的 `meta` 字段
5. 后续新增/删除页面时,生成器增量更新,保留用户修改

### 从 `file` 回退到 `virtual`

1. 在 `ubean.config.ts` 中改为 `routing: { mode: 'virtual' }`(或删除 `routing` 字段)
2. 删除 `src/router/_generated/` 目录(可选 — 残留文件不会影响虚拟模式)
3. 重新运行 `pnpm dev`

## 与 elegant-router 的差异

| 维度 | ubean | elegant-router |
|---|---|---|
| 默认模式 | `virtual` | `file` |
| 虚拟模式 | ✅ 支持 | ❌ 不支持 |
| 实体文件模式 | ✅ 支持 | ✅ 默认 |
| 混合模式 | ✅ `both` | ❌ |
| 路由 meta 增量保护 | ✅ | ❌(完全重新生成) |
| 框架无关 | ✅(`@ubean/routing` 不依赖 Vue) | ❌(Vue 专属) |
| 类型生成 | `typed-router.d.ts` | `typed-router.d.ts` |
| CLI 路由管理 | 计划中 | ✅ 内置 |

ubean 的核心优势是 **`virtual` 模式作为零配置默认**,同时提供 `file` 模式供需要 IDE 跳转和手动编辑 `meta` 的场景使用。两种模式可在同一项目的不同阶段自由切换。
