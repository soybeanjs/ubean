# routing-file-mode

ubean **file 路由模式** 的最小示例项目,对齐 [elegant-router](https://github.com/elegant-router/vue-router-elegant) 的实体文件生成理念。

## 这是什么?

本项目演示 ubean 在 `ubean.config.ts` 中将 `routing.mode` 设置为 `'file'` 后的行为:ubean 扫描 `src/pages/` 与 `src/layouts/`,将路由数据写入实体文件,而不是仅注册虚拟模块。

### 关键配置

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  routing: {
    mode: 'file',
    outputDir: 'src/router/_generated',
    onGenerated(files) {
      console.log('[routing-file-mode] Generated route files:', files);
    }
  }
});
```

## 运行

```bash
# 安装依赖(在仓库根目录)
pnpm install

# 启动开发服务器
pnpm -F routing-file-mode dev

# 或构建生产版本
pnpm -F routing-file-mode build
```

运行 `dev` 或 `build` 后,生成器会产出以下文件:

```
src/router/_generated/        # 实体路由文件(可编辑 meta,增量保护)
├── routes.ts                  # 扁平 RouteRecord[](name/path/component/layout/meta)
└── imports.ts                 # 懒加载 views 与 layouts 记录

.ubean/                        # 纯类型声明(已 gitignored,每次完全重新生成)
└── typed-router.d.ts          # 类型定义(RouteKey / RoutePath / RouteLayoutKey / ReuseRouteKey)
```

> ⚠️ `src/router/_generated/imports.ts` 与 `.ubean/typed-router.d.ts` 均由生成器每次完全重写，手动修改会被覆盖；只有 `routes.ts` 中的 `meta` 字段支持增量保护(见下文)。
>
> `typed-router.d.ts` 通过 `declare module '@ubean/scan'` 模块增强提供类型,只要 `tsconfig.json` 的 `include` 包含 `.ubean/*`,类型即自动全局生效,无需显式 `import`。

## 项目结构

```
examples/routing-file-mode/
├── public/
│   └── favicon.svg
├── src/
│   ├── layouts/
│   │   └── default.vue       # 默认布局(nav + PageView + footer)
│   ├── pages/
│   │   ├── index.vue          # /
│   │   ├── about.vue          # /about
│   │   └── users/[id].vue     # /users/:id(使用 useRoute 获取动态参数)
│   ├── routes/
│   │   └── api/
│   │       └── hello.ts       # GET /api/hello(API 路由在 file 模式下同样可用)
│   └── app.ts                 # 客户端入口(defineApp)
├── ubean.config.ts            # 启用 file 模式(关键配置)
├── vite.config.ts
├── tsconfig.json              # 含 ~router/* 路径映射
└── package.json
```

## 增量更新行为

生成器在每次重新生成时遵循以下规则:

| 文件                | 位置                     | 更新策略                                                                                      | 用户可编辑       |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------------------- | ---------------- |
| `routes.ts`         | `src/router/_generated/` | **增量更新** — 仅刷新 `name`/`path`/`component`/`layout` 等自动字段,**保留用户已有的 `meta`** | ✅ 可编辑 `meta` |
| `imports.ts`        | `src/router/_generated/` | 完全重新生成                                                                                  | ❌               |
| `typed-router.d.ts` | `.ubean/`                | 完全重新生成                                                                                  | ❌               |

如果新增了页面文件,生成器会在 `routes.ts` 末尾追加新路由,默认 `meta` 来自 `definePage({ meta })` 宏或 frontmatter。

### 示例:手动修改 meta 不被覆盖

```ts
// src/router/_generated/routes.ts(生成后)
{
  name: 'about',
  path: '/about',
  component: 'layout.base$view.about',
  meta: {
    title: '关于' // ← 你手动添加的字段
  }
}
```

下次重新生成时,生成器只会更新 `name`/`path`/`component`,你手动添加的 `meta.title` 会被保留。

## 与 `examples/ubean-test/`(virtual 模式)的差异

| 维度           | examples/ubean-test                    | examples/routing-file-mode        |
| -------------- | -------------------------------------- | --------------------------------- |
| `routing.mode` | `'virtual'`(默认)                      | `'file'`                          |
| 路由数据存放   | 内存中的虚拟模块                       | `src/router/_generated/` 实体文件 |
| IDE 跳转       | 通过 virtual 模块映射                  | 直接跳到 `routes.ts`              |
| 手动修改 meta  | ❌ 不支持                              | ✅ 增量保护                       |
| git 历史       | 不污染                                 | 可选择提交或忽略                  |
| 首次启动速度   | 快                                     | 稍慢(需要写文件)                  |
| 功能完整度     | 完整(i18n/crons/middleware/islands...) | 最小(仅演示 file 模式)            |

`examples/ubean-test/` 是 ubean 功能全量验证项目,而本示例只关注 file 路由模式本身,保持最小化以便清晰对比。

## 路径别名

`tsconfig.json` 中配置了以下路径映射:

```json
{
  "paths": {
    "@/*": ["./src/*"],
    "~ubean/*": ["./.ubean/*"],
    "~router/*": ["./src/router/_generated/*"]
  }
}
```

- `@/*` —— 指向 `src/`(应用源代码)
- `~ubean/*` —— 指向 `.ubean/`(`auto-imports.d.ts`、`typed-router.d.ts` 等生成产物)
- `~router/*` —— 指向 `src/router/_generated/`(可编辑实体路由文件,如 `routes.ts`、`imports.ts`)

类型导入示例:

```ts
// typed-router.d.ts 通过 `declare module '@ubean/scan'` 模块增强提供类型,
// tsconfig.json 的 `include` 已包含 .ubean/*,类型自动全局生效,直接从 @ubean/scan 导入即可。
import type { RouteKey, RoutePath, RouteLayoutKey } from '@ubean/scan';
```

如果需要从生成文件中导入运行时数据(如自定义路由守卫),使用 `~router/*`:

```ts
import { routes } from '~router/routes';
```

## 配置项详解

完整的 `RoutingConfig` 类型定义见 [`@ubean/config` 类型](../../packages/config/src/types.ts),完整文档见 [`skills/ubean/docs/guide/routing-modes.md`](../../skills/ubean/docs/guide/routing-modes.md)。

常用字段:

| 字段                 | 类型                            | 默认值                    | 说明                                                             |
| -------------------- | ------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `mode`               | `'virtual' \| 'file' \| 'both'` | `'virtual'`               | 路由数据生成模式                                                 |
| `outputDir`          | `string`                        | `'src/router/_generated'` | 实体文件输出目录(相对于 `rootDir`,产出 `routes.ts`/`imports.ts`) |
| `defaultLayout`      | `string \| false`               | `'default'`               | 默认布局名称,设为 `false` 表示不使用默认布局                     |
| `routeLazy`          | `boolean`                       | `true`                    | 路由组件懒加载                                                   |
| `layoutLazy`         | `boolean`                       | `true`                    | 布局组件懒加载                                                   |
| `watchFile`          | `boolean`                       | `true`                    | dev 模式下监听文件变更                                           |
| `fileUpdateDuration` | `number`                        | `100`                     | 文件变更 debounce 时长(ms)                                       |
| `onGenerated`        | `(files: string[]) => void`     | —                         | 生成完成回调(仅 `file`/`both`)                                   |

> 📌 `typed-router.d.ts` 不在 `outputDir` 中,固定生成到 `.ubean/typed-router.d.ts`(与 `auto-imports.d.ts`、`components.d.ts` 同目录,均已 gitignored)。

## 三种模式对比

| 模式            | 文件产物 | 虚拟模块  | 适用场景                                        |
| --------------- | -------- | --------- | ----------------------------------------------- |
| `virtual`(默认) | 无       | ✅ 注册   | 快速启动、零配置、不想污染 git                  |
| `file`          | ✅ 生成  | ❌ 不注册 | 需要手动修改 `meta`、IDE 直接跳转、生成 PR 审阅 |
| `both`          | ✅ 生成  | ✅ 注册   | 调试场景(同时对比虚拟/实体数据)                 |

## 迁移建议

### 从 virtual 迁移到 file

1. 在 `ubean.config.ts` 中添加 `routing: { mode: 'file' }`
2. 运行 `pnpm dev` 或 `pnpm build`,生成器自动产出 `src/router/_generated/`
3. 在 `.gitignore` 中决定:忽略生成文件(推荐)或提交以供 PR 审阅
4. 如需手动修改 `meta`,直接编辑 `routes.ts` 中对应记录

### 从 file 回退到 virtual

1. 在 `ubean.config.ts` 中改为 `routing: { mode: 'virtual' }`(或删除 `routing` 字段)
2. 删除 `src/router/_generated/` 目录(可选)
3. 重新运行 `pnpm dev`
