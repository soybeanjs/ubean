# 迁移指南：Vite 插件化（ADR-0012）

> 面向**框架用户**与**仓库维护者**。设计背景与逐条任务见 [vite-plugin-migration.md](vite-plugin-migration.md)；
> 本文件只讲「你会看到什么变化、要做什么」。

## 1 一句话

dev / build / preview 三个生命周期从 CLI 自建编排**下放给 Vite 插件**（ADR-0012）。用户侧不需要改代码：
装了 `ubean` 的项目照常用 `ubean dev|build|preview`；`vite dev|build|preview` 也等价可用。
迁移期由 `experimental.viteBuilder` 开关隔离（默认关闭），收敛后（RM-V36）默认打开并删除旧编排。

## 2 需要你做的事

| 情况 | 要做什么 |
| --- | --- |
| 项目里已有 `vite.config.ts` + `ubeanPlugin()` | **什么都不用做**。这是推荐形态，也是 `vite` 裸命令可用的前提 |
| 没有 `vite.config.ts` | 也不用做什么 —— CLI 会注入 builtin 插件，两条路径产物一致。但裸 `vite` 命令需要你补一个 `vite.config.ts`（内容只需 `plugins: [ubeanPlugin()]`） |
| 配置里写过顶层 `preset: 'vercel'` | **改成 `build: { preset: 'vercel' }`**。顶层 `preset` 从来不被读取（会被静默忽略并按默认 `node` 预设出产物）——本次核对后已在文档中修正 |
| 配置里写过 `experimental: { viteBuilder: … }` | **删掉这一项**（收敛后不再有开关；留着会被当作未知字段忽略） |
| 依赖 `prerender.staticDir` 的默认值 | 显式写上你要的目录。默认值不再写死 `dist/public`，改为从**实际的** `build.outputDir` 派生为 `<outputDir>/public`（这样 `--outDir` 与 preset 自带目录才成立） |
| CI 里用 `NODE_ENV=test` 跑构建 | 改成 `NODE_ENV=production` 或不设置。Vite 尊重显式 `NODE_ENV`，`NODE_ENV=test` 会把 Vue 开发态代码打进客户端产物（实测 entry gzip 45.2 → 75.9 kB）。`ubean build` 现在会对此打印警告 |
| 部署脚本按 preset 的 `runtime.entry` / `output.serverDir` 找入口 | 别按它找。这些字段是纯声明、全仓无消费者；真实产物恒定是 `<build.outputDir>/{public,server}` 与 `server/{server,worker,handler}.mjs`（按 preset 的 entryType 三选一） |

## 3 行为差异（已经开始生效的）

**dev**

- 客户端文件改动 = **整页重载**（Vite HMR 语义），服务端改动走高精度失效：只重算命中文件及其 importer 链，无关模块的单例保留（实测 5/5 轮保留）。
- 请求路由与宿主 app 由 `@ubean/build` 的插件负责；CLI 不再自建 HTTP server（RM-V12/V14 起）。
- `/_devtools` 入口可用（此前 CLI banner 广告的入口是 404 —— 它 302 到 `__` 保留命名空间，被判成应用请求）。

**build**

- 资产标签（客户端入口 `<script>` + 样式表）在**构建期**内联进服务端产物，不再运行时读 `<public>/.vite/manifest.json`。
- 预渲染 HTML 落到**本次构建的产物目录**（`<build.outputDir>/public`）。曾经无论 `--outDir` 是什么都写 `dist/public`，产物因此被劈成两半。
- `analyze:check` 除体积上限外还**对照基线的 chunk 名单**：基线里有、当前产物里没有的 chunk 会直接失败（岛屿组件整类消失那次就是这么溜过去的）。

**preview**

- fullstack / backend 预览的是**产物本身**：进程内加载 `dist/server/entry.mjs` 的 `createFetchHandler()`，静态与预渲染 HTML 由产物内的 `serveStatic` 服务 —— 与生产环境同形。不再 spawn 一个 Node 服务器再探端口。
- spa / ssg 走静态服务（解析规则与 CLI 的内置静态服务器共用一份实现）；`vite preview` 起不来时会降级到内置静态服务器。
- cloudflare 产物经 miniflare 预览（可选依赖 `miniflare`；缺失时给出安装提示与 `wrangler dev` 的替代方案）。
- **spa 模式现在会产出 `public/index.html`**（带客户端入口 script 与样式表）。此前 spa 产物只有 `assets/`，部署出去没有入口文件 —— 站点文档一直承诺的是「static `index.html` + assets」，实现与文档不符，RM-V36 收敛时按 mode 断言产物才发现。

**平台产物**

- cloudflare preset 的产物**可以在 workerd 里直接跑**（2026-09-16 修复）。生成的 `wrangler.toml` 带 `compatibility_flags = ["nodejs_compat"]` 与 `compatibility_date = "2024-09-23"`（v2 语义才提供 `process` / `Buffer` 全局）；worker 产物全量打包、不含 Node 内建 —— `node:fs` 在构建期被换成会抛错的桩。
- 三条使用约束：① **不要把 `ubean/build` 这类构建期 API 从运行时路由 import** —— 它会把整条构建工具链打进服务端产物，在 Node 上只是体积浪费（示例项目为 HTTP 集成测试保留了一条这样的路由），在 worker 上则**构建期直接失败**（工具链的可选依赖 `velocityjs` / `atpl` … 无法打包）；② worker 上没有文件系统，静态资源交给平台层（`assets.directory` 已在生成的 `wrangler.toml` 里，`node:fs` 会被换成会抛错的桩），缓存用 `memory` 或 KV/对象存储；③ 运行时用到的依赖都会被内联（worker 解析不到 bare specifier），产物因此明显更大 —— 这是 worker 部署的固有形态，wrangler 打包同样如此。

## 4 收敛（RM-V36）与回滚

收敛**已完成**：开关默认打开（阶段 1）→ 旧编排删除（阶段 2：`buildProduction` 的两段 `viteBuild`、`experimental` 配置字段、`build-parity.test.ts`）。

- **回滚**：只能回退版本，配置里已无开关可从旧编排逃生。
- 无用户 `vite.config.ts` 的项目**不受影响**：CLI 仍会注入 builtin 插件（那一支不是旧编排的产物，两条路径共用）。
- **时间点**：仓库不承诺具体版本日期，以 `vite-plugin-migration.md` 的 RM-V36 行为准；每次发布前重跑验收矩阵（`packages/cli/test/build-paths.test.ts` 13 格 + `dev-reload` / `vite-build` / `preview-vite` / `preview-cli` 四组端到端）。

## 5 维护者清单（收敛前每次都要过）

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test   # 全量
pnpm analyze:check                                       # 体积 + 缺 chunk 门禁（先 rm -rf dist）
pnpm benchmark:lifecycle -- --arms legacy,viteBuilder --skip-browser --skip-build   # build 臂生效证明 + 对照
```

体积与产物类断言必须固定两件事：**干净产物**（`rm -rf dist` 或临时 outDir）与 **`NODE_ENV`**。两次误判都出在这里（详见 vite-plugin-migration.md 的「三次结论」）。
