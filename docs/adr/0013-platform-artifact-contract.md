# ADR-0013 · 平台产物契约：workerd / Cloudflare 目标

- **状态**: implemented（2026-09-16 修复并验证，2026-09-17 补记）
- **日期**: 2026-09-16
- **关联**: [ADR-0012](0012-vite-plugin-first-lifecycle.md)（单 builder 多环境编排，本契约由该编排产出）、[ADR-0011](0011-lightweight-ssg-direct-render.md)（prerender 与静态 entry）

## 背景

cloudflare preset 的产物必须在 workerd 里能直接启动，否则"多平台部署"只是声明而非能力。实测把 `dist/server/worker.mjs` 交给 miniflare 时启动即失败，报 `No such module "node:fs/promises"`——**workerd 即使开 `nodejs_compat` 也不支持 `node:fs`**。

逐条排查后一共动了两类地方：**产物卫生**与**构建配置**。每一条都是实测撞出来的，不是预防性设计。

## 决定

### 1. 服务端产物对 worker 目标必须是自包含的

| # | 原因 | 修法 |
| --- | --- | --- |
| 1 | `ubean/server` 的 barrel 重导出 `@ubean/shared/node`（端口探测 / 网卡枚举）→ **每个**服务端图都带 `node:net` / `node:os` | barrel 不再重导出；需要时从 `@ubean/shared/node` 显式导入 |
| 2 | `serveStatic`（`node:fs`）被 `@ubean/app` 静态 import | 改动态 `import()` + `isNodeRuntime()` 守卫；worker 里静态资源归平台层 |
| 3 | fs 缓存存储（`node:fs/promises`）与 cache 模块同文件、静态可达 | 拆到独立模块，app 侧用懒加载工厂（构造器是同步的，不能 await） |
| 4 | SEO 约定扫描（`existsSync` 源目录）在 worker 上无意义 | 运行时守卫：非 Node 直接跳过（显式 `seoConventionModules` 照常生效） |
| 5 | SSR 构建默认把依赖外部化 → 产物留 `hono` / `vue` bare specifier | worker 目标全量打包（`noExternal: [/./]`、清空 `serverExternal`） |
| 6 | 打包器为 CJS 依赖生成的垫片是 `createRequire(import.meta.url)`，而 **workerd 里 `import.meta.url` 是 undefined** | 核心插件在 `renderChunk` 把 `import.meta.url` 换成固定文件 URL（`define` 够不到打包器自己生成的垫片，实测） |
| 7 | vue-i18n 顶层读 `process.env.NODE_ENV`；部分依赖用 `global` | worker 目标 `define` 出 `process.env.NODE_ENV='production'` 与 `global: 'globalThis'` |
| 8 | `nodejs_compat` 的 **v2** 语义（提供 `process` / `Buffer` 全局）要求 `compatibility_date ≥ 2024-09-23` | 生成的 `wrangler.toml` 用 `2024-09-23` 并补 `compatibility_flags = ["nodejs_compat"]`；预览 runner 从同一份 toml 读日期与标志 |
| 9 | `node:fs` / `node:fs/promises` 仍会被打进产物（动态 import 也会被内联） | 构建期把它们重写成**会抛错的虚拟桩模块**，导出面从 Node 真实模块生成，避免依赖漏名导致 `MISSING_EXPORT` |
| 10 | `ubean build --preset X` 改的是 CLI 侧配置，插件实例看不到 → 按目标分流的行为（桩 / 垫片）用错 preset | CLI 通过 `UBEAN_BUILD_PRESET` 把解析后的 preset 传给插件 |

### 2. worker 目标的服务端产物压缩

客户端一直是 `oxc` 压缩，服务端此前统一 `minify: false` 是为了 Node 堆栈可读。但 worker 产物要上传给平台，冷启动也与体积正相关 —— 因此 worker 目标单独开启压缩：实测完整示例 **2.6 MB → 1.36 MB（−49%）**，压缩后仍在 workerd 里正常启动（真机用例）。同时把已弃用的 `inlineDynamicImports` 换成 `codeSplitting: false`（rolldown 的新写法），三个代表性目标的文件数与体积逐项不变，构建日志的弃用告警消失。

## 验证

`cloudflare-preview.test.ts` 的真机用例 + 手工走查：完整示例（20 页 / 63 API）构建 cloudflare 产物后，在 miniflare 里 `/` → 200 SSR HTML、`/api/hello` → 200 JSON、`/about` → 200 预渲染 HTML、未命中 → 404 HTML、`/_health` → 200。

## 用户可见的三条使用约束

这三条是部署到 worker 时的固有形态，同时记录在站点迁移指南中：

1. **不要把 `ubean/build` 这类构建期 API 从运行时路由 import。** 它会把整条构建工具链打进服务端产物：在 Node 上只是体积浪费，在 worker 上则**构建期直接失败**（工具链的可选依赖无法打包）。
2. **worker 上没有文件系统。** 静态资源交给平台层（生成的 `wrangler.toml` 里已写 `assets.directory`，`node:fs` 会被换成会抛错的桩），缓存用 `memory` 或 KV / 对象存储。
3. **运行时用到的依赖都会被内联**（worker 解析不到 bare specifier），产物因此明显更大 —— 这是 worker 部署的固有形态，wrangler 打包同样如此。

## 影响

- 服务端产物对 worker 目标会压缩，Node 系目标保持不压缩以保留可读堆栈。
- 任何"从运行时路由 import 构建期 API"的新增都会在 worker 目标上构建立即失败 —— 这条约束是确定的、可预期的失败，而不是运行时惊喜。
