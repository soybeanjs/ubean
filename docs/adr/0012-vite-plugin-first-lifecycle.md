# ADR-0012 · Vite 插件优先：dev / build / preview 生命周期下放

- **状态**: implemented（2026-09-16 收敛完成，RM-V36 分两步落地）
- **日期**: 2026-09-15（决策）／2026-09-16（落地）
- **关联**: [ADR-0010](0010-competitive-north-star-and-gap-filter.md)（架构健康 40%）、[ADR-0011](0011-lightweight-ssg-direct-render.md)（ssg 直接渲染路径与 prerender 契约）、[ADR-0002](0002-sequencing-enablers-and-test-boundaries.md)（构建时序与测试边界）、[ADR-0013](0013-platform-artifact-contract.md)（平台产物契约）
- **参照实现**: [nitrojs/nitro](https://github.com/nitrojs/nitro) v3（`src/build/vite/`、`src/dev/`、`src/preview.ts`）
- **设计正文**: 原 `docs/vite-plugin-migration.md` —— 任务清单落地后已按 ADR-0007 约定删除，git 历史保留

## 背景

迁移前，dev / build / preview 三个生命周期由 `packages/cli` 自建：

- **dev**：CLI 用 `node:http` 自建 HTTP server，把 Vite 以 `middlewareMode` + `appType: 'custom'` 挂入；未被 Vite 中间件消费的请求转成 Web `Request` 后交给 Hono 的 `currentApp.fetch`，SSR 渲染器与全部服务端模块在宿主进程经 `ssrLoadModule` 加载；HMR 走独立端口 hack，DTK 需要一个 `httpServerBinderPlugin` 补丁才能把 WebSocket 绑到 CLI 的 server。
- **build**：两次顺序调用的独立 `viteBuild()`——先 client 后 server，虚拟模块先落盘 `.ubean/virtual/` 并用 alias 映射；prerender 是构建之后的独立阶段，动态 `import()` 已产出的 server entry。
- **preview**：自建静态文件服务器，或 `spawn('node', dist/server/server.mjs)`。

这些模块（`dev-server/vite-server.ts`、`dev-server/watcher.ts`、`dev-server/runner.ts`、旧的 `buildProduction` 编排）**已随收敛删除**，git 历史可查。

结构性代价（决策动因，仍然成立）：

1. **框架与 Vite 的职责边界倒置**。Vite 是构建工具的拥有者，却在 dev 下被降级为"挂在别人 HTTP server 上的一段中间件"。两个 HTTP 语义层叠（CLI 的 Node handler + Hono 的 Web fetch）导致 `toWebRequest` / `sendWebResponse` 在两处重复实现。
2. **服务端无隔离，reload 粒度粗**。所有服务端代码（CLI、Hono、Vite、SSR 渲染器）同进程 `ssrLoadModule`；任何服务端文件变更触发"重扫 → 新建 Hono app → 全量 full-reload"，模块状态与单例全部丢失。
3. **watcher 三套并行**（CLI 的 `fs.watch`、builder 核心插件、vue 插件），debounce 与 reload 策略各异，reload 时序靠注释约定"CLI rescan 拥有 reload 顺序"来避免竞态。
4. **多环境构建靠两次独立 build 拼接**，顺序耦合（client manifest 先落盘、SSR entry 运行时读取它）、插件实例与虚拟模块注册表在两次 build 间重置，构建顺序与状态生命周期只能靠人工约束。
5. **用户无法直接使用 Vite 生态**。`ubeanPlugin()` 已是标准 Vite 插件，但裸 `vite dev` 只能跑客户端/虚拟模块层——API 路由、middleware、SSR 渲染全部活在 CLI 自建的 handler 里。

Nitro v3 提供了已验证的解法：把框架做成 Vite 插件，`vite dev` / `vite build` / `vite preview` 三条命令驱动全部生命周期，多环境构建由 `buildApp` 钩子一次编排。

## 决定

### 1. 生命周期下放：Vite 命令为一级，`ubean` 命令退为薄别名

`ubeanPlugin()` 承担框架职责（注册 environments、dev 请求路由、构建编排、preview 接管），`vite dev` / `vite build` / `vite preview` 成为完整可用的路径。`ubean dev` / `ubean build` / `ubean preview` 保留为薄别名（内部调 Vite 的 `createServer` / `createBuilder` / preview 接管），不做行为分叉。`page` / `env` / `scaffold` / `init` / `prepare` / `config` / `analyze` 等工程化命令原样留在 CLI。

理由：生命周期编排是 Vite 的领域，工程化能力才是 CLI 的领域。Nitro 的取舍相同——它保留 `nitro build` 仅因为部署平台需要入口，`nitro dev` 明确不支持 Vite builder。

### 2. 环境划分：`client` + `ubean`（server），**不拆** `ssr` 环境

注册两个 Vite 环境：`client`（`consumer: 'client'`，输出 `dist/public`）与 `ubean`（`consumer: 'server'`，输出 `dist/server`）。SSR 渲染器作为 server bundle 的一部分，不单独成为 service environment。

**这是对 Nitro 的有意偏离。** Nitro 拆出独立 `ssr` environment 是因为它框架无关——React / Vue / Solid / Preact / RSC 共用同一个 Nitro，用户框架的 SSR 代码必须与 Nitro runtime 分开打包。ubean 是 Vue 专属，server entry 模板本来就把 Hono app 与 Vue renderer 合成单一入口；拆分只会引入跨环境单例代理（Nitro 为此需要 `nitroDevServiceProxy`）与资产清单同步成本，不带来任何能力。

保留 Nitro 式 `services` 机制（任意 `consumer: 'server'` 的环境自动注册为可 fetch 的服务）作为逃生口，未来若出现"API 服务与 SSR 独立部署"的真实需求再启用。

### 3. dev 服务端执行：`UbeanDevEnvironment` + env-runner worker

- `ubean` 环境在 dev 下通过 `dev.createEnvironment` 创建继承 Vite `DevEnvironment` 的 `UbeanDevEnvironment`，`dispatchFetch(request)` 把 Web `Request` 转发进 worker。
- worker 内用 Vite 的 **ModuleRunner**（`vite/module-runner`）经 hot channel 向宿主 `fetchModule` 拉取转换后代码并执行，加载 `virtual:ubean-server` → Hono app。
- 运行时隔离由 `env-runner` 提供，默认 `node-worker`；**全部调用封装在结构性接口之后**，保留自研 `node:worker_threads` 实现作为 Plan B。
- reload 语义升级为**作用域化模块重载**：只失效变更文件及其 importer 的求值结果，其余模块保留单例与状态；仅 scan 目录增删才全量失效 + 重扫路由表。

理由：这是本方案用户可感知的最大收益——崩溃隔离、状态保留的 HMR、以及 `env-runner` 自带的 `miniflare` / `vercel` / `netlify` runner 能把平台保真带到本地 dev（直接服务 `cloudflare` / `vercel` / `netlify` preset）。选择 `env-runner` 而非自研（省 300–500 行 IPC/worker 样板）的代价是引入一个 0.x 依赖，用接口封装隔离。

> **落地注记（2026-09-16，修正本条的两处设计假设）**
>
> 1. **hot channel 不自研。** 原方案把宿主侧通道寄托在 `env-runner` 的 `createViteHotChannel` 上；实测这一步不够，但解法不是自研 invoke 分发——**Vite 已把 `handleInvoke()` 作为公开方法暴露**，并在 `DevEnvironment` 构造期安装。宿主侧只补一层符合 Vite `HotChannel` 契约的桥（`createEnvRunnerTransport` / `bridgeEnvRunnerInvokes`）。基于此，自研 worker 的 Plan B 成本从 ADR 原文的 300–500 行下调到**约 100–200 行**（宿主侧通道是免费的）。
> 2. **`node-worker` 是线程，不是进程。** 判断隔离是否生效要看 `threadId` 而非 `pid`——按 `pid` 判定会得到错误的结论。
> 3. **worker 承载服务端执行尚未接入 dev 主路径。** `createEnvironment` 目前在全仓没有注册点，实际 dev 路径是"插件自举宿主 app + 请求路由中间件"，SSR 在主进程执行；RM-V08 交付的 `UbeanDevEnvironment` 是可运行能力而非当前接线。多环境服务（`services`）与 worker 拓扑按下面「未决」暂不采用。

### 4. build：一次 `createBuilder` + `buildApp` 钩子编排，prerender 保持在 server bundle 之后

用 Vite 的 Builder API 一次构建多环境，`buildApp` 钩子定义阶段顺序：

```
prepare（order: pre，生成 .ubean 虚拟模块与类型）
  → client env
  → ubean env（server bundle）
  → prerender
  → preset 包装（server.mjs / handler.mjs / worker.mjs / wrangler.toml）
  → manifest.json
```

**第二处对 Nitro 的有意偏离。** Nitro 在 server bundle 构建**之前** prerender，因为它的 prerender 走内存中的 Nitro app 而非打包产物。ubean 的 prerender 必须消费已构建产物——fullstack 走 `createSsrFetcher` 动态 `import()` server entry，ssg 走 `createStaticSsgRenderer` 加载静态 entry（ADR-0011 的 fetcher 同构契约）。因此顺序必须在 server env 之后。代价是无法像 Nitro 那样把 prerender 结果直接喂给 server 打包，收益是不改动 ADR-0011 建立的契约。

### 5. 产物布局不变：`dist/public` + `dist/server` + `dist/manifest.json`

**不**采用 Nitro 的 `.output/` 布局。该布局已被 `apps/docs` 多处对外承诺，且 preview 接管、`analyze` 的预算读取与 `bundle-baseline.json` 均硬依赖。布局不变使迁移聚焦在编排层，把体积门禁的风险降到最低。

### 6. 虚拟模块无状态化，落盘降级为构建期快照

`useVirtualRegistry()` 原先在两次 build 之间 `clear()` 并重新注册，插件实例与 registry 生命周期耦合——这正是单 builder 多环境共享插件实例时会出问题的地方。改为：虚拟模块由 scan 结果派生的**无状态插件**提供，落盘 `.ubean/virtual/*` 保留为构建期快照（供 preset 包装与调试读取），但不再被 alias 映射依赖。

### 7. dev 编排收敛的连带收益（已随收敛删除）

以下都是在 Vite 拥有 server 之后自然消失的结构，当时不作为独立任务，现已全部移除：

- `httpServerBinderPlugin`——DTK 的 server 绑定补丁不再需要。
- HMR 独立端口 hack——Vite 拥有 server 后 HMR 同端口。
- 手工 `transformIndexHtml` 调用与 CSS link 注入——改为请求路由中间件处理。
- 三套 watcher 合一——复用 `server.watcher`（收敛为一个 dev-scan 协调器：一套监听、一次扫描、一个重载顺序）。
- `toWebRequest` / `sendWebResponse` 两份重复实现——统一为一份。

### 8. 双轨：用户 `vite.config` 优先，无 config 项目由 CLI 注入 builtin 插件

用户项目若已在 `vite.config` 中写 `ubeanPlugin()`，走用户 config（框架插件不重复注册）；否则由 CLI 注入 builtin 插件。**该分支保留至今，未删除**——它保证没有 `vite.config.ts` 的存量项目在收敛后依然可用，两条路径共用同一份 environment 构建配置。

反面约束同样重要：当 `UBEAN_BUILD_DRIVEN_BY_CLI` 打开时，插件**不得**重复注册 `buildApp`，否则同一次构建会被编排两次。

### 9. 实施方式：回归网先行，然后两步收敛

原方案计划用 `experimental.viteBuilder` 开关逐 Phase 灰度。**该开关与旧编排已随 RM-V36 一并删除**；实际执行方式是：

1. **回归网先行（硬前置）**：迁移前 `packages/cli/test` 只覆盖 dev-logging / dev-security-headers / preview，没有任何 dev HTTP 拓扑、SSR HTML 注入、404 行为的断言。先补齐功能回归网与性能基线（ADR-0010 的"架构健康 40%"要求先有判据），基线只能在**旧路径**上冻结——收敛后旧实现删除，"回到旧实现测一次"将永久不可能。
2. **两步收敛**：① 生命周期默认切到插件路径；② 删除旧编排（两次 `viteBuild`、`experimental` 配置字段与开关、parity 测试）。

**回滚策略已失效**：配置里不再有开关，只能回退版本。这是有意的——保留一个能悄悄改语义的开关，代价高于回退版本的收益。

## 落地结果

| 项 | 数据 | 来源 |
| --- | --- | --- |
| dev 冷启动 | 基线 p50 1690.0 ms / p95 1698.9 ms | `examples/ubean-test/benchmarks/perf-baseline.json`（旧路径冻结） |
| 浏览器水合 | 155 ms → 116 ms | 迁移验收记录 |
| 浏览器内导航 | 121 ms → 73 ms | 迁移验收记录 |
| 服务端变更生效 / 客户端变更生效 | 基线 p50 222.2 ms / 106.2 ms | 同上 baseline |
| reload 单例保留 | 5/5 轮 | 同上 baseline |
| worker 目标产物 | 2.6 MB → 1.36 MB（−49%，服务端不再统一 `minify: false`） | 实测（workerd 真机用例） |
| `production.ts` | 875 行编排函数 → 638 行 | 直线对比 |
| CLI dev server | 删除 `vite-server.ts` / `runner.ts`（673 行）→ `dev-vite.ts` 227 行 | 直线对比 |
| 回归网 | `packages/cli/test` 19 套、`packages/builder/test` 36 套 | 目录统计 |
| 验收矩阵 | 4 mode × 9 preset × 有/无用户 `vite.config` 固化为 `packages/cli/test/build-contracts.test.ts`（15 格）+ dev-reload / vite-build / preview-vite / preview-cli 四组端到端 | 测试目录 |

体积与产物类断言必须固定两件事：**干净产物**（先 `rm -rf dist`）与 **`NODE_ENV`**（Vite 尊重显式设置，`NODE_ENV=test` 会把 Vue 开发态代码打进客户端产物，实测 entry gzip 45.2 → 75.9 kB）。口径与门禁见 [perf-regression-net.md](../perf-regression-net.md)。

## 落地期建立的架构不变量

迁移过程中撞出来的、**不随任务结束而失效**的约束：

1. **跨插件↔CLI 的共享状态必须挂在 `server` 对象上，不能用模块级注册表。** dev 下框架存在两份模块实例（SSR 图内联 `ubean`、外部化 `@ubean/vue`），模块级 `Map` 会导致两侧读到的不是同一份，且**没有任何报错**。同样的原因，需要跨实例共享的注册表挂 `globalThis`。
2. **保留命名空间的归属必须用一处常量声明，且按裸字符串前缀匹配。** DevTools 有多个以 `/` 结尾的挂载点（`/__devtools`、`/__devtools-assets/`、`/__devtools-client-imports.js`、`/_devtools/**`），按路径段匹配会漏掉兄弟路径；分散在多处声明则最容易只改一处。
3. **"框架内置 HTML 页面"需要显式判据**（`isFrameworkHtmlPage()`：`/_devtools`、`/_scalar`），dev 请求路由据此跳过整个 HTML transform——否则应用客户端入口会被注入到没有 `#app` 的框架页面上。
4. **框架自己的 CSP 不得拦死框架自己的页面。** 内置 Scalar 页需要 CDN 来源时，只在**那一条响应**上从生效策略追加来源，而不是放宽默认策略；用户显式关闭 CSP 时不设头。
5. **`env-runner` 必须留在 `packages/cli`，不得成为 `@ubean/build` 的依赖**——它会触发 pnpm 的 peer 变体分裂，表现为 `Plugin` 类型身份不一致的类型错误。`@ubean/build` 用本地结构性接口避免这个依赖。

## 刻意不对齐 Nitro 的部分

避免被"对齐"带偏，以下**刻意不做**（前三条已在上面各节说明理由）：

1. **不拆 `ssr` environment**（§2）。Vue 专属框架不需要框架无关的多 SSR 入口抽象。
2. **不引入 `.output/` 布局**（§5）。`dist/` 已被文档与工具链承诺。
3. **不把 prerender 提到 server bundle 之前**（§4）。ubean 的 SSG 依赖构建产物。
4. **不做 RSC / Server Components 抽象**——ADR-0010 已判为刻意不做。
5. **不追求 `nitro build` 式双 CLI 入口**——`ubean build` 只作别名，不做绕过 Vite 的独立构建器。
6. **不移植纯 Nitro 内部管线**（`applyToEnvironment` 插件下发、生产 lazy-import 的 `viteServices`）——它们服务于 service 泛化；在不拆 SSR 的前提下没有落点。

## 未决

- **多环境服务（`services`）与 worker 拓扑的启用时机**：机制保留、不做实现，触发条件是出现"API 服务与 SSR 独立部署"的真实需求。当前 dev 只跑一个环境。**相关联的两项评估结论**：跨环境单例代理与 `services` 环境机制暂不采用（理由同上）；编译期资产清单（`?assets`）**不引入**——标签构建期内联已达成同一目标，`?assets` 只会替换一个不存在的问题。
- **平台 runner 接入的边界**：`cloudflare`（miniflare）已做；`vercel` / `netlify` 的 runner **不做**，在出现真实需求前不扩面。
- **是否最终删除 `ubean dev|build|preview` 命令**：当前决定是永久保留薄别名。若用户实际全部转向 `vite` 命令，可在更晚的版本重新评估。
- **体积绝对上限的接线**：机制已实现但未接入 CI 参数（见 [perf-regression-net.md](../perf-regression-net.md) §8）。
- **`vite-plus` 的 Builder / Environment API 仍标注 `@experimental`**：缓解方式是契约测试（断言 environments 注册、`buildApp` 调用顺序、`builder.build(env)` 返回形态）+ 版本锁；升级 `vite-plus` 时必须重跑上面的验收矩阵。

（原「已验证前提」的 spike 证据表与「Phase 2.3 资产清单时序」等条目已随实现收敛：资产标签改为构建期内联，运行时不再读 `dist/public/.vite/manifest.json`。）
