---
title: Vite 插件迁移
description: dev / build / preview 生命周期从 CLI 下放到 Vite 插件（ADR-0012）后有哪些变化，以及配置里需要核对什么。
translatedFrom: a13be544b8f6
sections: ["9599422c","e3b0c442","016b58cb","91243b22","bc71106e","9498e38d","6c7581bc","0c8df940","c32924e5","ee8370f0"]
---

# Vite 插件迁移

dev / build / preview 三个生命周期由 Vite 插件接管（ADR-0012）。`ubeanPlugin()` 在 `config` 钩子里注册 `client` / `ubean` 两个环境与 `builder.buildApp`，因此 `vite dev | build | preview` 单独就是完整工具链 —— CLI 不再自建编排。

```bash
ubean dev      # ≡ vite dev
ubean build    # ≡ vite build
ubean preview  # ≡ vite preview
```

收敛**已完成**。`experimental.viteBuilder` 是迁移期的临时开关，它已随旧编排一并**删除**，配置里写它会被当作未知字段忽略。没有任何开关需要启用，两条命令路径的产物逐项一致。

## 配置迁移

| 你现在有的是 | 要做什么 |
| --- | --- |
| 顶层 `preset: 'vercel'` | 改成 `build: { preset: 'vercel' }`。顶层字段从来不被读取：它会被静默忽略，构建退回默认的 `node` 预设（现在会打印一条未知配置项警告）。 |
| `experimental: { viteBuilder: … }` | 删掉这一项。开关已不存在；留着会被当作未知字段忽略。 |
| 依赖的某个 `prerender.staticDir` 默认值 | 显式写上你要的目录。默认值不再写死 `dist/public`，改为从**实际的** `build.outputDir` 派生为 `<outputDir>/public` —— 这样 `--outDir` 与 preset 自带目录才成立。 |
| 按 `runtime.entry` / `output.serverDir` 找入口的部署脚本 | 别按它找。这些字段是纯声明、全仓无消费者。真实产物恒定是 `<build.outputDir>/{public,server}`，以及 `server/{server,worker,handler}.mjs`（按 preset 的 entryType 三选一）。 |
| CI 构建里的 `NODE_ENV=test` | 改成 `NODE_ENV=production` 或不设置。Vite 尊重显式 `NODE_ENV`，`test` 会把 Vue 开发态代码打进客户端产物（实测 entry gzip 45.2 → 75.9 kB）。`ubean build` 现在会对此打印警告。 |

```ts
// ubean.config.ts —— 顶层 preset 会被忽略，请用 build.preset
export default defineConfig({
  build: { preset: 'vercel' }
});
```

`vite build` 会忽略 `--outDir`，始终写入 `build.outputDir`。

## dev 行为

- 客户端文件改动触发**整页重载**（Vite HMR 语义）。
- 服务端文件改动走高精度失效：只重算命中文件及其 importer 链，无关模块的单例保留。
- 请求路由与宿主 app 由插件负责（位于 `@ubean/build`）；CLI 不再自建 HTTP server。
- `/_devtools` 入口可用。此前 CLI banner 广告的入口是 404 —— 它 302 到 `__` 保留命名空间，被判成应用请求。

## build 行为

- 资产标签（客户端入口 `<script>` + 样式表）在**构建期**内联进服务端产物，不再运行时读 `<public>/.vite/manifest.json`。
- 预渲染 HTML 落到**本次构建的产物目录**（`<build.outputDir>/public`）。曾经无论 `--outDir` 是什么都写 `dist/public`，一次构建的产物因此被劈成两半。
- `analyze:check` 除体积上限外还**对照基线的 chunk 名单**：基线里有、当前产物里没有的 chunk 会直接失败（岛屿组件整类消失那次就是这么溜过去的）。

## preview 行为

- fullstack / backend 预览的是**产物本身**：进程内加载构建产物 `dist/server/entry.mjs` 的 `createFetchHandler()`，静态与预渲染 HTML 由产物内的 `serveStatic` 服务 —— 与生产环境同形。不再 spawn 一个 Node 服务器再探端口。
- spa / ssg 与 CLI 的内置静态服务器共用一份静态解析实现；`vite preview` 起不来时会降级到内置静态服务器。
- cloudflare 产物经 miniflare 预览（可选依赖 `miniflare`）；缺失时给出安装提示与 `wrangler dev` 的替代方案。
- spa 模式现在会产出 `public/index.html`（带客户端入口 script 与样式表）。此前 spa 产物只有 `assets/`，部署出去没有入口文件 —— 站点文档一直承诺的是「static `index.html` + assets」，实现与文档不符。

## 部署到 Cloudflare Workers

cloudflare preset 的 worker 产物可以直接在 workerd 里跑。生成的 `wrangler.toml` 固定写入 `compatibility_flags = ["nodejs_compat"]` 与 `compatibility_date = "2024-09-23"`（从这一天起 `nodejs_compat` 按 v2 生效，提供 `process` / `Buffer` 全局）。worker 产物全量打包、不含 Node 内建 —— `node:fs` 在构建期被换成会抛错的桩。

由此有三条使用约束：

1. **不要把 `ubean/build` 这类构建期 API 从运行时路由 import。** 它会把整条构建工具链打进服务端产物：在 Node 上只是体积浪费，在 worker 上则**构建期直接失败**（工具链的可选依赖 `velocityjs` / `atpl` … 无法打包）。
2. **worker 上没有文件系统。** 静态资源交给平台层 —— `assets.directory` 已写进生成的 `wrangler.toml`，`node:fs` 会被换成会抛错的桩 —— 缓存请用 `memory` 或 KV/对象存储。
3. **运行时用到的依赖都会被内联进 worker 产物**，产物因此明显更大。worker 解析不到 bare specifier，这是 worker 部署的固有形态；wrangler 打包同样如此。服务端产物对 worker 目标**会压缩**（实测 2.6 MB → 1.36 MB），Node 系目标保持不压缩以保留可读堆栈。

## 回滚

回滚只能回退版本。配置里已无开关，没有从旧编排逃生的配置项。

没有用户 `vite.config.ts` 的项目不受影响：CLI 仍会注入 builtin 插件，而那一支从来不是旧编排的产物 —— 两条路径共用它。

## 下一步

- <Link to="/guide/app-modes">应用模式</Link> — `mode` 如何决定构建产物，以及各模式如何预览。
- <Link to="/guide/quickstart">快速开始</Link> — 可用脚本、裸 Vite 命令与 `ubeanPlugin()`。
