# ADR-0012 · Vite 插件优先：dev / build / preview 生命周期下放

- **状态**: proposed（方案已定，尚未实施；迁移期以 `experimental.viteBuilder` 开关灰度）
- **日期**: 2026-09-15
- **关联**: [ADR-0010](0010-competitive-north-star-and-gap-filter.md)（架构健康 40%）、[ADR-0011](0011-lightweight-ssg-direct-render.md)（ssg 直接渲染路径与 prerender 契约）、[ADR-0002](0002-sequencing-enablers-and-test-boundaries.md)（构建时序与测试边界）
- **参照实现**: [nitrojs/nitro](https://github.com/nitrojs/nitro) v3（`main` 分支 `src/build/vite/`、`src/dev/`、`src/preview.ts`）
- **设计正文**: [docs/vite-plugin-migration.md](../vite-plugin-migration.md)（任务清单落地后按 ADR-0007 约定删除）

## 背景

ubean 当前的 dev / build / preview 三个生命周期命令由 `packages/cli` 自建：

- **dev**：CLI 用 `node:http` 自建 HTTP server（`packages/cli/src/dev-server/vite-server.ts:247-381`），Vite 以 `middlewareMode: { server: httpServer }` + `appType: 'custom'` 挂入（`:524-532`）。未被 Vite 中间件消费的请求经 `toWebRequest` 转换后交给 Hono 的 `currentApp.fetch`（`:330-331`），SSR 渲染器与全部服务端模块通过宿主进程 `ssrLoadModule` 加载（`:295-313`、`:571-693`）。HMR 走独立端口 hack（`port + 1000`，`:528-530`），DTK 需要一个 `httpServerBinderPlugin` 补丁才能把 WebSocket 绑到 CLI 的 server（`:463-471`）。
- **build**：两次顺序调用的独立 `viteBuild()` JS API——先 client（`packages/builder/src/production.ts:692-729`）、后 server（`:750-805`），虚拟模块先落盘 `.ubean/virtual/`（`:78-461`）并用 alias 映射（`:653-669`）；prerender 是构建之后的独立阶段，动态 `import()` 已产出的 `dist/server/entry.mjs`（`packages/cli/src/build.ts:49-81`、`:219-303`）。
- **preview**：自建静态文件服务器（`packages/cli/src/preview.ts:46-125`）或 `spawn('node', dist/server/server.mjs)`（`:304-346`）。

这套实现能用，但结构性代价在累积：

1. **框架与 Vite 的职责边界倒置**。Vite 是构建工具的拥有者，却在 dev 下被降级为"挂在别人 HTTP server 上的一段中间件"。两个 HTTP 语义层叠（CLI 的 Node handler + Hono 的 Web fetch）导致 `toWebRequest` / `sendWebResponse` 在两处重复实现（`vite-server.ts:95/119`、`server.ts:17/41`）。
2. **服务端无隔离，reload 粒度粗**。所有服务端代码（CLI、Hono、Vite、SSR 渲染器）同进程 `ssrLoadModule`；任何服务端文件变更触发"重扫 → 新建 Hono app → 全量 full-reload"（`packages/cli/src/dev.ts:166-188`），模块状态与单例全部丢失。
3. **watcher 三套并行**且 debounce 与 reload 策略各异（`dev-server/watcher.ts:25`、`packages/builder/src/vite.ts:120`、`packages/builder/src/vue-plugin.ts:261`），reload 时序靠注释约定"CLI rescan 拥有 reload 顺序"来避免竞态（`vite.ts:148-153`）。
4. **多环境构建靠两次独立 build 拼接**，顺序耦合（client manifest 先落盘、SSR entry 运行时读取 `../public/.vite/manifest.json`）、插件实例与虚拟模块注册表在两次 build 间 `clear()`/复用（`production.ts:92-93`），构建顺序与状态生命周期只能靠人工约束。
5. **用户无法直接使用 Vite 生态**。`ubeanPlugin()` 已是标准 Vite 插件，但裸 `vite dev` 只能跑客户端/虚拟模块层——API 路由、middleware、SSR 渲染全部活在 CLI 自建的 handler 里。

Nitro v3 提供了已验证的解法：把框架做成 Vite 插件，`vite dev` / `vite build` / `vite preview` 三条命令驱动全部生命周期，服务端代码在**自定义 DevEnvironment + 独立 worker 里的 Vite ModuleRunner** 中执行，多环境构建由 `buildApp` 钩子一次编排。

## 决定

### 1. 生命周期下放：Vite 命令为一级，`ubean` 命令退为薄别名

`ubeanPlugin()` 承担框架职责（注册 environments、dev 请求路由、构建编排、preview 接管），`vite dev` / `vite build` / `vite preview` 成为完整可用的路径。`ubean dev` / `ubean build` / `ubean preview` 保留为薄别名（内部调 Vite 的 `createServer` / `createBuilder` / preview 接管），不做行为分叉。`page` / `env` / `scaffold` / `init` / `prepare` / `config` / `analyze` 等工程化命令原样留在 CLI。

理由：生命周期编排是 Vite 的领域，工程化能力才是 CLI 的领域。Nitro 的取舍相同——它保留 `nitro build` 仅因为部署平台需要入口，`nitro dev` 明确不支持 Vite builder。

### 2. 环境划分：`client` + `ubean`（server），**不拆** `ssr` 环境

注册两个 Vite 环境：`client`（`consumer: 'client'`，输出 `dist/public`）与 `ubean`（`consumer: 'server'`，输出 `dist/server`）。SSR 渲染器作为 server bundle 的一部分，不单独成为 service environment。

**这是对 Nitro 的有意偏离。** Nitro 拆出独立 `ssr` environment（`src/build/vite/plugin.ts:441-467`）是因为它框架无关——React / Vue / Solid / Preact / RSC 共用同一个 Nitro，用户框架的 SSR 代码必须与 Nitro runtime 分开打包。ubean 是 Vue 专属，`server-entry.mjs` 模板本来就把 Hono app 与 Vue renderer 合成单一入口；拆分只会引入跨环境单例代理（Nitro 为此需要 `nitroDevServiceProxy`，`src/build/vite/services.ts:56-96`）与资产清单同步成本，不带来任何能力。

保留 Nitro 式 `services` 机制（任意 `consumer: 'server'` 的环境自动注册为可 fetch 的服务）作为逃生口，未来若出现"API 服务与 SSR 独立部署"的真实需求再启用。

### 3. dev 服务端执行：自定义 `UbeanDevEnvironment` + env-runner worker

- `ubean` 环境在 dev 下通过 `dev.createEnvironment` 创建继承 Vite `DevEnvironment` 的 `UbeanDevEnvironment`，`dispatchFetch(request)` 把 Web `Request` 转发进 worker（对齐 `nitro/src/build/vite/dev.ts:93-164`）。
- worker 内用 Vite 的 **ModuleRunner**（`vite/module-runner`）经 hot channel（`env-runner/vite` 的 `createViteHotChannel`）向宿主 `fetchModule` 拉取转换后代码并执行，加载 `virtual:ubean-server` → Hono app（对齐 `nitro/src/runtime/internal/vite/dev-worker.mjs`）。
- 运行时隔离由 `env-runner` 提供，默认 `node-worker`；**全部调用封装在既有的 `EnvRunner` 接口（`packages/cli/src/dev-server/runner.ts:55-59`）之后**，保留自研 `node:worker_threads` 实现作为 Plan B。
- reload 语义升级为**作用域化模块重载**：只失效变更文件及其 importer 的求值结果，其余模块保留单例与状态（对齐 `dev-worker.mjs` 的 `invalidateFile` / `reload`）；仅 scan 目录增删（api / routes / middleware / plugins / modules）才全量失效 + 重扫路由表。

理由：这是本方案用户可感知的最大收益——崩溃隔离、状态保留的 HMR、以及 `env-runner` 自带的 `miniflare` / `vercel` / `netlify` runner 能把平台保真带到本地 dev（直接服务 `cloudflare` / `vercel` / `netlify` preset）。选择 `env-runner` 而非自研（省 300–500 行 IPC/worker 样板）的代价是引入一个 0.x 依赖，用接口封装隔离。

### 4. build：一次 `createBuilder` + `buildApp` 钩子编排，prerender 保持在 server bundle 之后

用 Vite 的 Builder API 一次构建多环境，`buildApp` 钩子定义阶段顺序（对齐 `nitro/src/build/vite/prod.ts:20-133`）：

```
prepare（order: pre，生成 .ubean 虚拟模块与类型）
  → client env
  → ubean env（server bundle）
  → prerender
  → preset 包装（server.mjs / handler.mjs / worker.mjs / wrangler.toml）
  → manifest.json
```

**第二处对 Nitro 的有意偏离。** Nitro 在 server bundle 构建**之前** prerender（`prod.ts:104`），因为它的 prerender 走内存中的 Nitro app 而非打包产物。ubean 的 prerender 必须消费已构建产物——fullstack 走 `createSsrFetcher` 动态 `import()` `dist/server/entry.mjs`，ssg 走 `createStaticSsgRenderer` 加载静态 entry（`packages/builder/src/static-render.ts:266-346`，ADR-0011 的 fetcher 同构契约）。因此顺序必须在 server env 之后。代价是无法像 Nitro 那样把 prerender 结果直接喂给 server 打包，收益是不改动 ADR-0011 建立的契约。

### 5. 产物布局不变：`dist/public` + `dist/server` + `dist/manifest.json`

**不**采用 Nitro 的 `.output/` 布局。该布局已被 `apps/docs` 多处对外承诺，且 `preview.ts:240-250`、`analyze-lib.ts:93-106`、`examples/ubean-test/benchmarks/bundle-baseline.json` 均硬依赖。布局不变使迁移聚焦在编排层，把 `bundle-baseline` / `analyze:check` 5% 门禁的风险降到最低。

### 6. 虚拟模块无状态化，落盘降级为构建期快照

`useVirtualRegistry()` 目前在两次 build 之间 `clear()` 并重新注册（`production.ts:92-93`），插件实例与 registry 生命周期耦合——这正是单 builder 多环境共享插件实例（`sharedConfigBuild`）时会出问题的地方。改为：虚拟模块由 scan 结果派生的**无状态插件**提供，落盘 `.ubean/virtual/*` 保留为构建期快照（供 preset 包装与调试读取），但不再被 alias 映射依赖（删除 `production.ts:653-669` 的 id→磁盘文件映射）。

### 7. dev 编排收敛的连带收益（随 Phase 1 一并删除）

以下都是在 Vite 拥有 server 之后自然消失的结构，不作为独立任务：

- `httpServerBinderPlugin`（`vite-server.ts:463-471`）——DTK 的 server 绑定补丁不再需要。
- HMR 独立端口 hack（`vite-server.ts:528-530`）——Vite 拥有 server 后 HMR 同端口。
- 手工 `transformIndexHtml` 调用与 CSS link 注入（`vite-server.ts:343-345`）——改为 worker RPC 回宿主（对齐 `nitro/src/build/vite/dev.ts:245-260`）。
- 三套 watcher 合一——复用 `server.watcher`（对齐 `dev.ts:200-224`）。
- `toWebRequest` / `sendWebResponse` 两份重复实现——统一为一份（或改用 `srvx` 的 `NodeRequest` / `sendNodeResponse`）。

### 8. 迁移期双轨，收口在最后一阶段

用户项目若已在 `vite.config` 中写 `ubeanPlugin()`，走用户 config（框架插件不重复注册）；否则由 CLI 注入 builtin 插件。这个双轨逻辑已存在（`findUserViteConfig`），迁移期必须保留，否则存量项目全部失效。收敛（删除 CLI 注入分支）排在收口阶段，且需先验证裸 `vite dev` / `vite build` 全链路可用。

### 9. 实施方案采用开关灰度 + 回归网先行

每个 Phase 以 `experimental.viteBuilder: true` 隔离，CLI 旧路径保留至收口阶段；任一 Phase 验收失败即关开关回到旧路径，无需 revert 提交。

**回归网先行是硬前置**：现状 `packages/cli/test` 只覆盖 `dev-logging.test.ts` / `dev-security-headers.test.ts` / `preview.test.ts`，**没有任何 dev HTTP 拓扑、SSR HTML 注入、404 行为的断言**（这些只散落在 `test/browser/specs/*.e2e.spec.ts`）。没有迁移前基线，就无法判断 Phase 1 是否造成 DX 倒退。

## 影响面

| 项 | 变更 |
| --- | --- |
| `packages/builder/src/vite.ts` | `ubeanPlugin()` 增加 `config` 钩子注册 environments；`configureServer` 承担 dev 请求路由；新增 `buildApp` 钩子 |
| `packages/builder/src/` | 新增 dev environment / dev worker / preview 三个模块；`production.ts` 从 875 行编排函数重构为 environment 驱动 |
| `packages/cli/src/dev-server/` | `vite-server.ts` 大幅瘦身（摘除 http server、middlewareMode、HMR 端口、DTK hack、Node↔Web 适配）；`watcher.ts` 退役；`runner.ts` 的 `EnvRunner` 接口成为 worker 抽象点 |
| `packages/cli/src/{dev,build,preview}.ts` | 退化为薄别名（保留参数解析、banner、logging 闸门） |
| 依赖 | 新增 `env-runner`（0.x，封装在 `EnvRunner` 接口后） |
| 回归网 | `packages/cli/test` 新增 dev 拓扑测试；`test/browser` 与 `examples/ubean-test` 作为验收矩阵 |
| 基线 | `bundle-baseline.json` 在 build 迁移完成后重新生成 |
| 文档 | `AGENTS.md` §3/§8/§9/§10、`apps/docs`（`guide/app-modes.md`、`quickstart.md`、`contributing/engineering.md:466` 的 `dist/client/.vite/manifest.json` 笔误一并修正）、`skills/ubean/command/ubean.md` |

## 已验证前提（2026-09-15）

| 前提 | 证据 |
| --- | --- |
| vite-plus 提供 Environment / Builder API | `vite-plus-core@0.3.1` 的 `dist/vite/node/index.d.ts` 含 `createBuilder()`（`:2415`）、`ViteBuilder.buildApp()/build(env)`、`BuilderOptions.sharedConfigBuild/sharedPlugins/buildApp`、`DevEnvironment`（`:1685`）、`FetchableDevEnvironment`、`hot` 通道、`createServerHotChannel`（`:1309`）、`vite/module-runner`（`ModuleRunner` / `ESModulesEvaluator`） |
| `env-runner` 可独立采用 | `env-runner@0.2.3` 已发布，通用包（依赖 srvx / httpxy / crossws / exsolve），`/vite` 子路径提供 `createViteHotChannel` / `createViteTransport`；runner 含 `node-worker`（默认）、`node-process`、`miniflare`、`vercel`、`netlify`、`bun-process`、`deno-process`、`self` |
| 已有可替换的运行时接缝 | `packages/cli/src/dev-server/runner.ts:55-59` 的 `EnvRunner` 接口 |
| 插件形态已具备 | `ubeanPlugin()` 是标准 Vite 插件（`packages/builder/src/vite.ts:58`，`name: 'ubean:core'`），`examples/ubean-test/vite.config.ts` 已在用户 config 中使用 |

**风险**：vite-plus 的 Builder API 标注 `@experimental`。缓解方式是 Phase 0 建立契约测试（断言 environments 注册、`buildApp` 调用顺序、`builder.build(env)` 返回形态）并锁定 `0.3.1`，升级时跑验收矩阵。

## 结果

（待实施后补：dev 冷启动与 reload 耗时、构建耗时、bundle 基线变化、回归网覆盖数。）

预期收益按权重排序：

1. **架构健康**：框架回到 Vite 插件的位置，删除两个 HTTP 语义层叠加、三套 watcher、两次独立 build 的顺序耦合。
2. **用户可见**：服务端崩溃隔离；HMR 保留模块状态（现状任何服务端变更全量重建）；裸 `vite dev` / `vite build` 可用；后续可接入 `miniflare` / `vercel` / `netlify` runner 做平台保真 dev。
3. **性能**：单次 builder 多环境取代两次独立 build；reload 粒度从全量降到文件级。

## 未决

- **Phase 2.3 资产清单时序**：SSR entry 运行时读 `../public/.vite/manifest.json`（`packages/builder/src/ssg-entry.ts:126-145`、`production.ts:731-736`）且强依赖 client 先构建。是改用 `ssrManifest` 注入，还是引入 Nitro 那样的 `?assets` 编译期清单（`src/build/vite/plugin.ts:56-62` 引入的 `@hiogawa/vite-plugin-fullstack`），待 Phase 0 的 spike 结论。
- **自研 worker 的触发条件**：`env-runner` 若在 0.x 阶段出现阻塞问题，切换到自研 `node:worker_threads` + `vite/module-runner` + `createServerHotChannel` 的成本需在 Plan B 评估中量化。
- **是否最终删除 `ubean dev/build/preview` 命令**：当前决定是永久保留薄别名。若用户实际全部转向 `vite` 命令，可在更晚的版本重新评估。
- **`cloudflare` preview**：现状 `preview.ts:242-244` 直接报错让用户用 `wrangler dev`；是否改走 miniflare runner 取决于 Phase 4 的平台 runner 落地情况。
- **`services` 机制的启用时机**：本 ADR 只保留机制不做实现，等真实的多服务部署需求出现。
