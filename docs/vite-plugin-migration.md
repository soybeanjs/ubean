# ubean Vite 插件化整改方案（dev / build / preview 生命周期下放）

> 开发任务型文档。决策理由见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)；本文只承载实施方案与任务清单。
>
> 口径：门槛按 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md) 过滤器（本方案整体归「架构还债」，附带性能与用户可见收益）。**不写人天**。
>
> 参照实现：[nitrojs/nitro](https://github.com/nitrojs/nitro) v3 `main` 分支 `src/build/vite/`、`src/runtime/internal/vite/`；文中 `nitro:` 前缀路径均指该仓库。

## 1. 目标形态

```
vite.config.ts（用户唯一入口）
  plugins: [ubeanPlugin(), vue()]
      │
      ├─ environments
      │    client  (consumer: client)  → dist/public
      │    ubean   (consumer: server)  → dist/server/entry.mjs
      │    [services…]                  （预留，ADR-0012 §2）
      │
      ├─ vite dev    Vite 拥有 node:http
      │    middlewares
      │      ├─ ubean:dev-routing (pre)   显式路由直通 / 资产-导航启发式
      │      ├─ Vite 静态与模块           /@vite/*、/src/**
      │      └─ ubean:dev-middleware (post)
      │            ├─ UbeanDevApp（宿主进程：devtools、错误页、/_openapi.json、VFS）
      │            └─ 404 → ubeanEnv.dispatchFetch(req)
      │                       └─ env-runner worker（node-worker | miniflare | vercel | netlify …）
      │                             └─ ModuleRunner → virtual:ubean-server → Hono app.fetch
      │
      ├─ vite build  createBuilder + buildApp 钩子
      │    prepare → client env → ubean env → prerender → preset 包装 → manifest.json
      │
      └─ vite preview configurePreviewServer → ubean preview handler（复用 dist/server）
```

`ubean dev|build|preview` 保留为薄别名；`page|env|scaffold|init|prepare|config|analyze` 等工程化命令留在 CLI。

## 2. 现状 → 目标 差异映射

| 现状 | 锚点 | 目标 |
| --- | --- | --- |
| CLI 用 `node:http` 自建 server | `cli/src/dev-server/vite-server.ts:247-381` | 删除；Vite 拥有 `node:http` |
| Vite `middlewareMode: { server: httpServer }` | `vite-server.ts:524-527` | 删除 |
| `appType: 'custom'` + 手工两段 fallthrough | `vite-server.ts:279-291` | `configureServer` pre/post 两段中间件 + 路由表匹配（`nitro:src/build/vite/dev.ts:333-419`） |
| HMR 独立端口 `port + 1000` | `vite-server.ts:528-530` | 删除（同端口） |
| DTK 绑定补丁 `httpServerBinderPlugin` | `vite-server.ts:463-471` | 删除 |
| `toWebRequest` / `sendWebResponse` 重复两份 | `vite-server.ts:95/119`、`cli/src/dev-server/server.ts:17/41` | 统一单模块（或 `srvx` 的 `NodeRequest` / `sendNodeResponse`） |
| 全部服务端代码宿主进程 `ssrLoadModule` | `vite-server.ts:295-313`、`:571-693` | 自定义 `DevEnvironment` + worker 内 `ModuleRunner` |
| 三套并行 watcher（debounce 各异） | `dev-server/watcher.ts:25`、`builder/src/vite.ts:120`、`builder/src/vue-plugin.ts:261` | 复用 `server.watcher` 单套 |
| reload = rescan + 重建 Hono app + 全量 full-reload | `cli/src/dev.ts:166-188`、`builder/src/vite.ts:148-153` | 作用域化模块重载（文件级失效，保留单例状态） |
| 手工 `transformIndexHtml` + CSS link 注入 | `vite-server.ts:343-345` | worker RPC 回宿主（`nitro:src/build/vite/dev.ts:245-260`） |
| 两次独立 `viteBuild()` | `builder/src/production.ts:692-729`、`:750-805` | 一次 `createBuilder` + `buildApp` 编排 |
| 虚拟模块落盘 + alias 映射 | `production.ts:78-461`、`:653-669` | 无状态插件；落盘降级为构建期快照 |
| prerender 为 build 之后的独立阶段 | `cli/src/build.ts:49-81`、`:219-303` | 挪入 `buildApp`，位置保持 server env 之后（ADR-0012 §4） |
| preview 自建静态服务器 / `spawn` | `cli/src/preview.ts:46-125`、`:304-346` | `configurePreviewServer` 接管 |

## 3. 任务清单

### Phase 0 · 地基与回归网（无行为变更，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V01** ✅ | ADR-0012 立项 | `docs/adr/0012-vite-plugin-first-lifecycle.md`；`docs/README.md` 索引 | ADR 含决策、偏离说明、风险与回滚 |
| **RM-V02** ✅ | 虚拟模块无状态化 | `virtual-registry.ts` 新增只读视图 `VirtualModuleResolver` 与工厂 `createVirtualRegistry()`；`ubeanPlugin` / `ubeanVite` 增加 `registry` 注入选项（未注入时自建**实例级**注册表）；三处构造点（`production.ts`、`cli/vite-server.ts`、主包 `ubean/vite`）各建一个实例并注入给 core+vue 两个插件；删除 `production.ts` 构建期 `clear()`；`generateVirtualModulesToDisk` 改为接收注册表；`useVirtualRegistry` / `resetVirtualRegistry` 标为 `@deprecated`（仅为既有测试保留） | 连续两次构建产物**逐字节一致**（实测 `dist` 树哈希两次均为 `c331dc16…`）；`virtual-registry.test.ts` / `virtual-modules.test.ts` 保持通过并新增 3 个断言（工厂预填、实例隔离且不写单例、同实例重复注册不累积）；builder 246 + cli 128 + fixture 783 测试全绿，`analyze:check` 不变（-1.8%） |
| **RM-V03** ✅ | 统一 Node↔Web 适配 | 收拢 `vite-server.ts` 与 `server.ts` 中**逐字节相同**的 `toWebRequest` / `sendWebResponse`（纯搬移，逻辑未改）；两侧改为引用。**RM-V10 起该模块迁到 `packages/builder/src/dev/node-web.ts`** —— 请求路由由 `@ubean/build` 的插件负责，适配器必须与被两边共用的插件同层，CLI 不再持有自己的一份 | 重复实现删除（各文件 0 处本地定义）；`packages/builder/test/node-web.test.ts` 用真实 `node:http` + `fetch` 往返锁定契约（URL 拼接、GET/HEAD 不带 body、POST 流式传体、状态/状态文本/头/流式响应）；cli 全量测试（含真实 dev server 的拓扑回归网与 preview）全绿 |
| **RM-V04** ✅ | `env-runner` 兼容性 spike | 安装 `env-runner@0.2.3`（devDependency）并实测：最小 worker 经 `node-worker` runner 处理请求返回 200（进程隔离成立）；worker 侧 `createViteTransport` 的 Vite 协议消息可达宿主；vite-plus 接受 `dev.createEnvironment` 并成功构造注入 transport 的 `DevEnvironment`。**未打通**：worker 的 `ModuleRunner` invoke 无人应答（宿主通道契约不足），机制与建议见结论文档 | 完工定义见 [env-runner-spike.md](env-runner-spike.md)：最小 worker fetch 200 ✓、含 Plan B 成本量化（约 100–200 行，低于 ADR 原估）✓、`miniflare` runner 可用性已确认（API 就绪，需项目自装 `miniflare`）✓ |
| **RM-V05** ✅ | **dev 拓扑回归网（硬前置）** | 新增 `packages/cli/test/dev-topology.test.ts`：子进程起 `ubean dev` + **纯 HTTP** 断言（刻意不碰内部 API —— 内部 server 会在 RM-V12 被删除，走内部 API 的测试届时会一起失效）。覆盖 SSR HTML 注入、页面 404 vs API 404、静态与源码资源不被兜底吞掉、内置 `_` 路由、中间件顺序（安全头/请求 ID 覆盖四类响应；i18n 与 CSRF cookie）。fixture 补 `src/pages/404.vue`，使「页面 404 → HTML」可断言 | 18 个断言在**旧实现**上全绿。实施中发现并修复一个拓扑缺陷：`pages/404.vue` 存在时页面兜底 `*` 会按注册顺序抢先匹配晚注册的内置路由，导致 `/_openapi.json`、`/_scalar` 变 404（修复=把 OpenAPI 注册提前到 `registerRoutes` 之前，并订正 router.ts 中「rou3 会优先具体路径」的错误注释）。**未修**：404 组件内容在 dev 下不 SSR，登记为 R8 |
| **RM-P01–P05** | **生命周期性能基线（硬前置，见 [perf-regression-net.md](perf-regression-net.md)）** | 新增 `scripts/benchmark-lifecycle.mjs`：以 `experimental.viteBuilder` 为单变量开关；采集 dev 冷启动、变更生效延迟、build 墙钟与峰值 RSS；采集前断言新路径确实生效（防 R6 双轨分叉） | 旧实现上产出 committed `examples/ubean-test/benchmarks/perf-baseline.json`（p50 / p95 + 原始样本 + 环境记录）；R3 的「现状」由该文件定义 |
| **RM-V06** ✅ | Builder API 契约测试 | 新增 `packages/builder/test/vite-plus-contract.test.ts`（9 个断言）：版本锁 tripwire（`vite-plus` 与 `vite`→`vite-plus-core` 均在 0.3.1）、符号形状（`createBuilder`、`DevEnvironment` 的生命周期方法、`createServerHotChannel` 的通道成员、`vite/module-runner` 的 `ModuleRunner`/`ESModulesEvaluator`）、`config` 钩子注册的 environments 顺序稳定、`buildApp` 编排顺序完全由调用方决定、`build(env)` 对 client/server 都返回单个 output 并真的产出产物 | 覆盖 ADR-0012 依赖的全部实验性 API。**实测澄清两处**：① `FetchableDevEnvironment` 是**仅类型**导出（运行时 undefined），能继承的类是 `DevEnvironment`，`dispatchFetch` 需自行实现；② `sharedConfigBuild` / `sharedPlugins` 在本测试配置下开关前后「环境 config 身份」与「插件实例身份」都无变化，因此只断言「被接受且产物不变」，其真实语义留给 RM-V09 / RM-V17 用可观测信号验证（写成假契约比不写更坏） |

> 硬前置：**RM-V05 ✅、RM-V06 ✅ 与 RM-P01–P05 ✅ 已落地** —— 分别提供 DX 不倒退的**功能**判据、`@experimental` API 的漂移告警（版本锁 tripwire）、以及**性能**判据（否则 ADR-0012 §3 的性能收益与 R3 的「≥ 现状」都无数字可依）。
>
> RM-P05 必须在 Phase 1 之前完成：RM-V36 收敛后旧实现删除，基线将无法再产出。（已完成。）

### Phase 1 · dev 迁移（收益最大、风险最高）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V07** ✅ | environments 注册 | 新增 `experimental.viteBuilder` 灰度开关（`UbeanConfig.experimental` + 归一化，默认 false）；`ubeanPlugin()` 增加 `config` 钩子，**仅在开关打开时**返回 `environments: { client: { consumer: 'client', build.outDir: 'dist/public' } , ubean: { consumer: 'server', build.outDir: 'dist/server' } }`（对齐 `nitro:src/build/vite/plugin.ts:113-133`） | `createBuilder` 识别两个环境、`client` outDir 指向 `dist/public`（`vite-builder-switch.test.ts` 两个断言覆盖开关两侧）；**开关关闭时旧路径零变更**：fixture 构建 `analyze:check` 仍为 -1.8%、fixture 783 与 cli 128 测试全绿 |
| **RM-V08** ✅ | `UbeanDevEnvironment` | 新增 `packages/builder/src/dev/dev-environment.ts`（`UbeanDevEnvironment extends DevEnvironment` + env-runner IPC transport/bridge + `createUbeanDevEnvironmentFactory`），并从 `@ubean/build/vite` 导出；`dispatchFetch(request)` 直接交给 `runner.fetch(request)` 转发进 worker | dev 环境经 `dev.createEnvironment` 正确构造；请求进入 **worker 线程内**的 Hono app 返回 200；worker 内 `ModuleRunner` 经 invoke bridge 取宿主模块并求值（RM-V04 spike 卡住的那一环已闭环）。测试 `packages/cli/test/dev-environment.test.ts`（3 断言，真实 env-runner + 真实 vite dev server） |
| **RM-V09** ✅ | dev worker entry | 新增 `packages/builder/src/dev/dev-worker.ts`：**框架生成** worker 入口到项目 `.ubean/dev-worker.mjs`（避免 `.mjs` 资源被打包器漏掉、且与框架版本天然一致），模板支持注入已解析的 `env-runner/vite` / `vite/module-runner` 定位符（否则生成物在项目目录里解析不到包）；worker 内 `ModuleRunner` + `ubean:invalidate` 协议与宿主侧 `invalidateDevWorkerModules()` | worker 加载宿主模块并处理请求 ✅；**失效路径已跑通**：宿主的 `invalidateDevWorkerModules()` 按「原始路径 + realpath」两种候选键查模块图并在宿主侧失效（Vite 会沿 importer 链传播，入口因此也被失效），再把命中的模块 **URL** 发给 worker，worker 仅重置入口缓存 —— 重新求值时 `fetchModule` 因宿主 `transformResult` 已清空而返回 `invalidate: true`，ModuleRunner 据此失效该节点，未命中的模块仍走 `{ cache: true }`，**实例（单例）原样保留**。两个曾经的根因都已在实现中消解：① 模块图按 realpath 索引（macOS 上 `tmpdir()` 是符号链接，`/var/...` 的 realpath 是 `/private/var/...`），只传原路径必然落空；② 生成器模板中的**嵌套模板字符串必须转义**（`\${}`）。测试：`packages/cli/test/dev-worker.test.ts` 两个用例（含「无关模块单例保留」）+ `packages/builder/test/dev-worker-invalidate.test.ts` 四个键解析用例。**worker 侧刻意不自行按 URL 失效**：宿主若没失效同名模块，本地 meta 已被清空 + 下一次 fetch 返回 `{ cache: true }` 会让 ModuleRunner 抛 “mistakenly invalidated during fetch phase” |
| **RM-V10** ✅ | `configureServer` 请求路由 | 新增 `packages/builder/src/dev/dev-request-router.ts`：`isViteResourceRequest()` 判据（Vite 内部前缀 `/@vite/`·`/@id/`·`/@fs/`·`/node_modules/`、`?import`/`?vue`/`?raw` 等模块查询、`Sec-Fetch-Dest` 资源类型、扩展名表；**保留命名空间 `_`/`__`/`api/` 先于扩展名规则**，否则 `/_openapi.json` 会被当成静态资源）+ `createUbeanRequestHandlers()`（pre 判据 / post 兜底，均含 500 错误页与 `ssrFixStacktrace`）+ `ubeanDevRequestPlugin()`（`config` 钩子置 `appType: 'custom'` 摘掉 Vite 的 SPA 回退；`configureServer` 钩子体内注册 pre、返回函数注册 post）。HTML 出站统一处理：CSS 阻塞链接注入（FOUC 修复）→ `transformIndexHtml`（客户端入口注入），两者原先散在 CLI 内，一并迁入。Node↔Web 适配从 `packages/cli` 迁到 `packages/builder/src/dev/node-web.ts`（`vite dev` 与 `ubean dev` 必须共用）。**CLI 同步切到该路径**：`vite-server.ts` 的应用侧逻辑收成 `handleAppRequest()` 交给插件，原先「先过 Vite 中间件、再自己兜底 + 自己 transformIndexHtml」的分叉删除 | 中间件两侧位置由 Vite 装配顺序保证（钩子体内 `use()` 在 `transformMiddleware` 之前；返回的函数在 `serveStaticMiddleware` 之后、`indexHtmlMiddleware` 之前）。测试：`test/dev-request-classify.test.ts`（41 个判据断言，两侧正反例齐备）、`test/dev-request-router.integration.test.ts`（11 个真 Vite server + 真 HTTP 断言：`appType=custom`、页面经 `transformIndexHtml` 注入客户端入口、`/@vite/client` 与源码模块不经 ubean、publicDir 静态文件不被兜底吞、API 404 JSON / 页面 404 HTML、`_` 前缀归 ubean、post 兜底接管不存在的静态文件、handler 抛错 → 500、POST body 完整传递）；CLI 侧 `dev-topology.test.ts` 19 断言与全量 131 测试全绿（同一套中间件路径）。**判据取舍**：判错方向不对称 —— 资源误判给 ubean 会让模块图崩，页面误判给 Vite 只是多一次判空（post 兜底接回），故启发式宁可先给 Vite |
| **RM-V11** ✅ | 宿主 `UbeanDevApp` | app 侧 bootstrap 全部搬入 `@ubean/build`：① `dev-ssr-routes.ts` 的 `buildDevSsrRoutes()`（SSR 路由表：catch-all / reuse / locale param / 布局解析）；② `dev-host-app.ts` 的 `enhanceDevApp()`（loaders + cron 预加载 + `pageRenderer` 接线）；③ `dev-app.ts` 的 `createDevApp()`（扫描 + `createUbeanApp`，options 装配从 CLI `buildApp` 迁来）/ `createDevAppReady()`（locales → 应用 `defineServer` 配置 → `init()` → `onServerReady`，幂等）/ `bootstrapDevApp()`（三者组合 = 插件自举入口）。CLI 侧 `buildApp` 与 `handleAppRequest` 退化为调用；原先三个标志位（`serverConfigApplied` / `serverReadyCalled` / `cachedServerConfig`）由 ready 的实例内缓存取代，HMR 换 app 实例即重建（语义等价、少一处漏改） | devtools、OpenAPI、`defineServer` 配置行为与现状一致：CLI 131 与 example 783 测试全绿。**关键测试**：`dev-ssr-routes.test.ts`（10 断言，**解析客户端 `generatePagesModuleSource` 真实产出做对照** —— R8 与 locale 前缀两次事故的根因都是两张路由表不一致）；`dev-host-app.test.ts`（6 断言）；`dev-app.test.ts`（5 断言，用**真实 `UbeanApp`** + 桩 `loadModule` 验证 `applyServerConfig` 真的注册了 P9-09 `globalHooks`、`onServerReady` 只调一次、加载失败只告警不阻断）；`dev-topology.test.ts` 新增「示例 `defineServer` 的 `handle` hook 证据头出现在页面/API/404 三类响应上」—— **这条专治搬迁时最容易丢的时序**（配置必须在 `init()` 之前应用，丢了之后其余断言全都照常通过）。依赖面用结构化类型 `DevHostAppLike`，builder 只新增 `@ubean/app` 一个运行时依赖（`createUbeanApp` 需要），加完实测 24 包 typecheck 全绿且 peer 变体未再分裂。**剩余**：devtools 插件与 VFS 的插件内自举随 RM-V12 一并收口 |
| **RM-V12** ✅ | 摘除 CLI server 层 | CLI 不再自建 HTTP server（删除 `createHttpServer` 与其整段 handler、`middlewareMode.server`、`hmr.port = port + 1000`），改为 `viteServer.listen()` —— 连带消失两处 workaround：给 `@vitejs/devtools` 打补丁填 `server.httpServer` 的 `httpServerBinderPlugin`（R5 的隐患来源），以及 HMR 独立端口。端口预探测仍留在 CLI（用于「端口被占用，改用 X」提示），真实端口在 listen 后从 HTTP server 读回。停机的「keep-alive 连接仍可能投递请求」保护从「判空 viteServer」改为显式 `shuttingDown` 标志返回 503。**插件自举**：`ubeanDevRequestPlugin` 的 `handler` 变为可选，缺省时惰性自举宿主 app（首次应用请求才扫盘 + 加载配置与 SSR 图，冷启动不受影响），cron 调度器缺省动态加载 `@ubean/server/cron` | 文件从 700+ 行降到 462 行；`vite dev`（本仓库为 `vp dev`）在无 CLI 时可服务应用。测试：`dev-request-bootstrap.test.ts`（4 断言，**不使用任何 CLI 设施**：真 Vite server + core/vue/islands 插件 + 无 handler，验页面 SSR、`/@vite/client` 注入、API 路由、404 页面（含组件 DOM —— 同时回归 R8）、`_health` 与静态资源归属）；CLI 134 与 example 783 全绿（22 断言拓扑网跑真 `ubean dev` 子进程）；实测 HMR 在应用端口握手成功（`101 Switching Protocols`）且 `port + 1000` 已释放。**fixture 陷阱记录**：fixture 建在 tmpdir（工作区之外）时 Vite 预构建解析 `vue-i18n` 会 ENOENT，故 fixture 落在 `packages/builder/test/fixtures/dev-bootstrap/`（builder tsconfig 已 exclude `test`，其 `src/**` 不参与 typecheck），预构建缓存指向临时目录 |
| **RM-V13** ✅ | watcher 合一 | 新增 `packages/builder/src/dev/dev-scan.ts`（`createDevScanCoordinator` / `getDevScanCoordinator` / `onDevScan`）：**一套监听**（只用 `server.watcher`，不再用 `fs.watch`）、**一次扫描**（事件合并去抖 + 单飞，扫描期间的并发事件合并为一次补扫）、**一个顺序**（所有订阅者串行 await 完成后才发 `full-reload`）。core / vue 两个插件与 CLI 各注册一个订阅者，各自只做自己的事（重建对应虚拟模块 / 重建 Hono app）；CLI 的 `dev-server/watcher.ts` 与其回归测试删除，CLI 改为 `onScan` 回调 + `runner.rescan()`（DevTools CRUD 走同一协调器）。判据并集为目录（`routes|middleware|pages|layouts|plugins|app|api|locales`）+ `srcDir` 根部入口文件（静态正则，不依赖「先扫一次才知道」）+ markdown | **实测**：服务端变更 p50 **220ms**（基线 219–222ms）、客户端变更 **104ms**（基线 106ms）、冷启动 **1.60s**（基线 1.69s）、reload 后**单例保留 3/3**（模块重新求值 0、进程重启 0）——R3 / RM-P04 / RM-P05 三条判据均未倒退。测试：`dev-scan.test.ts` 13 断言（目录/入口/markdown 触发、目录外不触发、去抖合并、单飞补扫、**reload 在订阅者之后**、手动 rescan、失败走 onError、stop/取消订阅）；`packages/cli/test/dev-reload.test.ts` 起真 `ubean dev` 子进程改探针字面量并断言响应变化 |
| **RM-V14** ✅ | `ubean dev` 薄别名 | ① `ubeanVite` 接管 `@vitejs/plugin-vue` 的注册（可 `vue: false`），CLI 不再重复注册 —— 此前 `.vue` 由 CLI 代劳，同一份 `ubeanPlugin()` 在 `ubean dev` 下可用、`vite dev` 下报 “Install @vitejs/plugin-vue”；② 聚合入口在 `experimental.viteBuilder` 打开时追加 `ubeanDevRequestPlugin()`，`vite dev` 独立服务应用，插件自举的 app 随扫描重建（`bootstrapDevApp().rebuild()`）；③ 请求日志下沉到 `createDevApp`（配置域行为，两条路径输出一致）；④ 开关打开时 CLI 不再注册自己的请求插件、也不自建 app（否则两个 pre 中间件都认领应用请求，先注册者胜出、另一个成为影子）；⑤ **删除 `dev-server/vite-server.ts` 与 `runner.ts`（673 行）**，收敛为 `dev-vite.ts`（243 行），`dev.ts` 402 → 299 行 —— CLI 只装配插件、起 Vite server、打印 banner，并订阅扫描做类型生成与 DevTools 上报 | `ubean dev` 与 `vite dev` 行为一致：`dev-reload.test.ts` 四条用例覆盖「CLI 旧路径热重载」「开关过渡路径（`UBEAN_VITE_BUILDER=1` + `ubean dev`）」「`vp dev` 服务页面 SSR / API / 内置 `_` / 两类 404」「`vp dev` 热重载」。CLI 134、example 783 测试全绿，24 包 typecheck 干净。删除后性能网仍成立：冷启动 1.60s、服务端变更 p50 **220ms**（基线 222ms）、客户端变更 105ms、reload 单例保留 **5/5**（模块重新求值 0、进程重启 0）。**两处易错的接线**：`/_devtools` 重定向插件必须注册在请求路由插件**之前**（后者把 `_` 命名空间判为应用请求），DevTools 钩子通过闭包读取 `viteServer`（插件必须在 `createServer` 返回前给出） |
| **RM-V15** ✅ | dev 全量验收 | 自动化四层：CLI 137、example 783（i18n / islands / Server Actions / cron / DevTools 等按功能域）、`dev-reload.test.ts` 4 条真 dev server（旧路径热重载、开关过渡、`vp dev` 四类请求、`vp dev` 热重载）、**`dev-dx.test.ts` 3 条真实浏览器交互**（Playwright）：① 页面内切语言（点击 `zh` → URL 变 `/zh/...` + 文案变中文 + **期间无整页重载**）；② DevTools 外壳可从 `/_devtools` 进入；③ 改客户端文件后浏览器整页重载（R3 修正后确认的语义）；浏览器运行时经基准脚本的 Chromium 阶段采集 | **实测（新路径）**：冷启动 1.63s、服务端变更 p50 222ms（与基线一致）、客户端变更 105ms、水合 **116ms**（基线 155ms）、站内导航 **73ms**（基线 121ms）、reload 单例保留 3/3 与 5/5 —— Phase 1 具备按 `experimental.viteBuilder` 灰度发布的条件。**走查中发现并修复一个真缺陷**：CLI banner advertised 的 DevTools 入口此前**不可用** —— `/_devtools` 302 到 `/__devtools/`，后者落在 `__` 保留命名空间里被请求判据判成应用请求 → 404（旧的 http server 先过 Vite 中间件，所以一直没暴露）。修法：`ubeanDevRequestPlugin` 新增 `passThrough` 选项，CLI 传 `['/__devtools']`。**已知缺口（已补，2026-09-16）**：示例项目缺页面级 `defineAction` 表单，Server Action 的**浏览器内提交**未走查 —— 补了 `examples/ubean-test/src/pages/action-demo.vue` + `dev-dx.test.ts` 的第 4 条用例（点击 → 无整页刷新 → 结果上屏 → 字段错误回填）。**补的过程查出并修掉一个真缺陷**：SFC 页面里的 `actions` 在客户端根本没被替换（见下方缺陷 G） |

### Phase 2 · build 迁移

> **RM-V21 的两次实测阻塞（2026-09-16）**：把构建编排接到插件的 `config` 钩子（让 `vite build` 单次产出完整 `dist/`）需要连过三关，前两关已解、第三关未解，逐条记下以便下次从证据出发：
> 1. **只注册 `outDir` 式环境不行** —— 客户端环境会退回默认入口 `index.html`，构建报 `Cannot resolve entry module index.html`。解法：`config` 钩子改用与 CLI 共用的 `createBuildEnvironments()`（已在 `build-configs.ts` 就位）。
> 2. **`virtual:ubean-asset-manifest` 不能由独立插件从别的插件的 `config` 钩子注入** —— 到不了服务端环境（`Failed to resolve import …`）。解法：改由**核心插件**自身的 `resolveId`/`load` 提供（它是两条路径都必然注册的那一个）；`prepareBuild(ctx, manifestRef)` 已支持传入同一个 manifest 载体。
> 3. **未解：`vite build` 的产物不完整** —— 实测（`UBEAN_VITE_BUILDER=1 vp build` 于示例）过了前两关、`dist/{public,server,manifest.json}` 都产出，但与 `ubean build` 的产物清单 diff 出两类缺失：**① 岛屿 chunk 全缺**（`IslandClock`/`IslandCounter`/… 及其 CSS），**② 没有预渲染 HTML**（`about/index.html` 等）。②的原因清楚 —— prerender 是 CLI 侧步骤（`cli/src/build.ts` 调用 `prerender()`），`vite build` 路径下没人调它；①指向岛屿注册表在客户端环境的解析路径，需进一步定位。**结论：插件侧构建接线在补齐这两项之前不能落地** —— 产出「缺岛屿、缺预渲染页」的 dist 比不落地更坏。已回退该接线，保留并已提交的是编排拆分（`prepareBuild` / `runEnvBuilds` / `buildWithEnvironments`）与共用 env 工厂。


> **启动时的实况（2026-09-16）**：真正跑一次 `ubean build` 才发现 **RM-V14 把构建路径弄坏了** —— `ubeanVite` 接管 `@vitejs/plugin-vue` 后，dev 路径同步去掉了重复注册，build 路径（`production.ts`）漏改，`.vue` 被编译两次直接报 “At least one <template> or <script> is required”。**没有任何测试跑生产构建**（dev 侧 500+ 断言、example 783 条测运行时 API、prerender 测试直接调 `prerender()`、唯一跑真构建的 `analyze:check` 不在上轮验证清单里）。已修并补上 `production-build.test.ts`（fixture 内跑完整 `buildProduction` 并断言产物契约）。另已抽出 `vite/build-steps.ts`（输出准备 / preset 包装 / manifest 三段与 viteBuild 解耦），作为 RM-V16 的地基。


| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V16** ✅ | `buildApp` 编排 | 新增 `builder/src/vite/build-app.ts` 的 `buildWithEnvironments()`：一次 `createBuilder` 建 `client` / `ubean` 两个环境，`buildApp` 编排 prepare（清理 + 虚拟模块落盘 + HTML 模板）→ client → ubean → 公共目录拷贝 → preset 包装 → manifest。env 配置逐条对应旧路径的 `viteBuild` 入参，用 Vite 6+ 的等价位置：`ssr.noExternal`/`external` → server env 的 `resolve.noExternal`/`external`；`optimizeDeps.exclude` → client env；islands SSR 空壳经 `perEnvironmentPlugin('ubean', …)` 限定（env 不直接收 `plugins` 字段，实测报 TS2353）。空壳与三个 preset entry 生成器、`getPresetBuildConfig`、虚拟模块落盘均已导出，两条路径共用一份 | **判据：产物可比** —— 新增 `test/build-parity.test.ts`：同一 fixture 分别跑 `buildProduction`（两次 `viteBuild`）与 `buildWithEnvironments`（一次 builder + 两个 env），把输出目录名与内容哈希规范化后**比对文件清单与 `dist/manifest.json`**（含 entry/preset/目录/entry 标记)。不比对哈希：chunk 划分属打包器自由，RM-V17 的判据是「布局与语义可比」。实测两条路径清单完全一致；示例构建、`analyze:check`（total −3.0%、entry −2.9%）、builder 347 测试、24 包 typecheck 全绿 |
| **RM-V17** ✅ | `buildProduction` → environment 驱动 | 拆解 `production.ts:591-875`：client 配置（`:692-729`）与 server 配置（`:750-805`）转为两个 environment 的构建配置；`getPresetBuildConfig`（`:463-492`）映射到 env 的 `resolve` / `build`；重审 `ssrSingletonProdSsr` 的 `^ubean` external 过滤（`:757-775`） | 产物布局与现状逐字节可比（哈希除外）——由 `build-parity.test.ts` 的清单 + manifest 比对固定（RM-V16 已落地该断言） |
| **RM-V18** ✅ | 资产清单时序解耦 | 现状 SSR entry 运行时读 `../public/.vite/manifest.json`（`ssg-entry.ts:126-145`、`production.ts:731-736`）且强依赖 client 先构建；改用 `ssrManifest` 注入或编译期清单（与 RM-V26 合并评估） | **已落地**：`asset-manifest.ts` 的 `ubeanAssetManifestPlugin` 由**核心插件**提供 `virtual:ubean-asset-manifest`（两条路径都必然注册的那一个），`buildWithEnvironments` 在 client 环境构建完成后把 manifest 读进闭包变量、经 `prepareBuild(ctx, manifestRef)` 交给服务端环境 —— 不再运行时读盘。**剩余（Phase 4）**：编译期清单由 RM-V27 评估 |
| **RM-V19** ✅ | 虚拟模块落盘降级 | 删除 `production.ts` 与新路径里的 virtual id → 磁盘文件 `resolve.alias` 映射（两条路径各写一份、共 13 条），落盘保留为构建期快照（`.ubean/virtual`）供 preset 包装与调试。虚拟模块由 `ubeanPlugin` / `ubeanVite` 正常解析，alias 是历史遗留的兜底 | 删除后构建仍通过且产物一致：builder 347 测试、示例构建、`analyze:check`（total −0.6%、entry −2.3%）全绿 |
| **RM-V20** ✅ | ssg 清理时机 | **核对后无需改动**：全仓只有一处删除 `dist/server`（`cli/src/build.ts:305-312`），位置已经在 prerender 与内容搜索索引之后，且由 `mode === 'ssg' && !process.env.UBEAN_KEEP_SSR` 双条件守护 —— 计划里「挪到 prerender 之后」的目标在之前的构建整改中已达成 | 实测（`examples/ssg-catchall`，`mode: 'ssg'`）：构建后 `dist/` 只有 `manifest.json` 与 `public/`，`dist/server` 不存在；`UBEAN_KEEP_SSR=1` 构建则保留 `dist/server`；静态产物含 `index.html` 与 `404.html` |
| **RM-V21** ✅ | `ubean build` 薄别名 | **已落地**：`config` 钩子在 `experimental.viteBuilder` 打开时同时提供 `builder.buildApp`（跑 `prepareBuild` → `runEnvBuilds`）与完整的两个 environment 构建配置（`buildEnvironmentsForConfig` 复用 CLI 同款 `createBuildEnvironments`）；`virtual:ubean-asset-manifest` 改由**核心插件**的 `resolveId`/`load` 提供（它是两条路径都必然注册的那一个 —— 从别的插件 `config` 钩子注入独立插件到不了服务端环境）。于是 `vite build` 单独即可产出 `dist/{public,server,manifest.json}`。**过程中连带解决的三关**：① 极简 env（只写 outDir）会让客户端环境退回 `index.html`；② 上述虚拟模块注册位置；③ 岛屿 chunk 缺失（根因是注册表依赖 transform 顺序，已由 RM-V24 修掉 —— 同一根因同时解释了 `vite build` 与旧 CLI 路径的缺失）。**预渲染关**（最后一环）：`runPrerenderStep()` 下沉到 `@ubean/build` 并由两条路径共用的 `runEnvBuilds()` 调用，`vite build` 因此也产出静态 HTML 且进程能正常退出（此前会挂在 cron 定时器上，见下方「构建进程不退出」） | **实测**：`UBEAN_VITE_BUILDER=1 vp build` 与 `ubean build` 产物逐项一致（含岛屿 chunk 与 9 个预渲染 HTML）。**归属说明**：CLI 仍是编排入口（扫描 / 内容加载 / ssg 清理 / preset `build:after` 钩子在本侧），「纯别名」形态归 RM-V36 的双轨收敛 |
| **RM-V22** ✅ | 基线重定 | 在**产物正确的构建**上重新生成 `examples/ubean-test/benchmarks/bundle-baseline.json`（此前基线里虽有岛屿 chunk，但当前构建不再产出它们 —— 基线是对的，构建是错的，因此重定的意义在于把「正确产物」固定下来，让新加的缺 chunk 判据有可信参照） | 新基线：32 个条目、total gzip 111.1 KB、entry gzip 45.2 KB，**含 5 个岛屿 chunk**；重定后 `analyze:check` 报 `total 0.0%, entry 0.0%`（自比），此后任何增长超 5% 或**少了基线里的 chunk** 都会失败 |
| **RM-V23** ✅ 矩阵 / 🟡 性能 | 构建矩阵验收 | 4 种 mode（fullstack / backend / spa / ssg）× preset（node / cloudflare / standard / vercel / netlify / bun / deno / **aws / azure**）× 有/无用户 vite.config；`scripts/benchmark-lifecycle.mjs --toggle viteBuilder` | **功能矩阵 13 格全绿**（`packages/cli/test/build-paths.test.ts`，各格临时 outDir 独立构建 + 规范化清单比对 + 该 preset 自己的包装文件契约）。**build 臂补上生效证明**：两臂原先都跑 `ubean build`（两条 CLI 路径的构建日志除产物路径字符串外逐行相同，没有可断言的标记位），现 build 臂改跑 `pnpm exec vp build` —— 无 CLI 时服务端产物只可能来自插件，且**不带开关的 `vp build` 直接硬失败**（实测 `Cannot resolve entry module index.html`，exit 1，零产物）；另加 `assertBuildEngaged` 产物契约断言与每臂构建前 `rm -rf dist`。**性能对照**：两次采集一致给出开关路径 build 墙钟 **+0.35s**、峰值 RSS **+66–74MB**；`vp` 启动反而比 CLI 快 0.7–1.1s，故差值不是派发开销（详见 [perf-regression-net.md](perf-regression-net.md)）。**未达标项**：对冻结基线（p50 1.62s）的绝对对照未完成 —— 宿主 load 长期 10–16，同一 cli 臂的墙钟在 1.62s（基线当天）与 1.90s（今天）之间摆动，误差与待测差异同阶。**已改为采集对负载不敏感的 CPU 时间口径**（基准脚本内置；5 轮实测：cli 2.79s / vite 3.02s CPU、630MB / 706MB 峰值 RSS，见 [perf-regression-net.md §6.3](perf-regression-net.md)）；CPU 口径**没有基线可比**（冻结基线只有墙钟，且旧实现已随 RM-V36 删除），故「新实现 vs 旧实现」的绝对结论仍需在安静环境重跑 cli 臂与 1.62s 对照。**顺带查实的元数据偏差**：平台 preset 声明的 `output.dir` / `output.serverDir` / `runtime.entry`（`dist/aws/lambda/index.mjs`、`dist/netlify/functions/index.mjs` …）**构建从不产出**，全仓无消费者，产物恒定是 `<config.build.outputDir>/{public,server}` + `server/{server,worker,handler}.mjs`；已在下方「待决项」登记，不在本任务内改（会动 11 个 preset 的产物布局） |

### Phase 3 · preview 迁移

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V24** ✅ | `configurePreviewServer` 接管 | 新建 `builder/src/vite/preview.ts`（对齐 `nitro:src/build/vite/preview.ts:5-46`）；fullstack / backend 走生产 handler | **已落地**：核心插件（`ubeanPlugin()`）的 `configurePreviewServer` 挂预览中间件 —— 与 dev 的请求路由同一设计（「哪条路径都必然注册的那一个插件」）。`fullstack` / `backend` 在进程内 import `dist/server/entry.mjs` 的 `createFetchHandler()`（**不是** `server.mjs`：它自监听端口；也**不是** `handler.mjs`：那是平台适配壳），静态资源与预渲染 HTML 由产物内的 `serveStatic` 自己服务，预览环境与生产环境同形；`spa` / `ssg` 走静态服务，解析规则与 CLI 的 `startStaticServer` **同源一份实现**（`resolvePreviewFile`，含 `...` 文件名与路径穿越的既有教训）。**实测**：`vp preview`（无 CLI）在示例项目上跑通预渲染页 / API / 未预渲染页的 SSR / 404 页 / 资源 MIME 五类请求；builder 13 条单测 + CLI 5 条端到端全绿。**本任务连带查出并修复两个产物级缺陷**（见下方专节），并让 `--outDir` 下的产物恢复完整 |
| **RM-V25** ✅ | `ubean preview` 与静态服务器保留 | `cli/src/preview.ts:46-125` 的 `startStaticServer` 保留（spa / ssg 无生产 server 可复用） | **已落地**：`ubean preview` 退化为「参数 + banner + 生命周期」—— 委托 `vite preview`（`preview()` from `vite`），请求由 RM-V24 的插件预览中间件处理；CLI 不再 spawn `dist/server/server.mjs`，`spawnPreviewServer` 与 `waitForPort` 等待逻辑一并删除（约 90 行）。`startStaticServer` **保留并成为 spa / ssg 的降级路径**（纯静态产物不依赖服务端能力，Vite 预览起不来时可用；fullstack / backend 无等价兜底 —— 降级成静态服务会给出「看着能开、实际没渲染」的假象，故那里的失败直接退出）。**顺带收敛方言**：`startStaticServer` 的解析规则改为调用 `@ubean/build/vite` 的 `resolvePreviewFile`，与插件中间件同源一份（MIME 映射同样共用 `previewMimeType`），既有 7 条断言全绿。项目没有用户 `vite.config` 时显式注册 `ubeanPreviewPlugin()`（核心插件不在场）。**实测**：`ubean preview` 在示例项目（fullstack）上跑通预渲染页 / 资源 MIME / API / 404 页四类断言；临时 spa 项目验证静态 + 客户端回退 |
| **RM-V26** ✅ | cloudflare preview（可选） | 现状 `preview.ts:242-244` 直接报错提示 `wrangler dev`；改走 env-runner 的 `miniflare` runner | **runner 已落地**：`builder/src/vite/cloudflare-preview.ts` 的 `createCloudflarePreviewRunner()` 把产物 `server/worker.mjs` 交给 miniflare 在进程内跑，预览中间件按 preset 分流（cloudflare → miniflare，静态层先行；其余 → `entry.mjs`）。`miniflare` 是**可选 peer**（同 satori / `@resvg/resvg-js` 的约定）：缺失时返回 `miniflare-not-installed` 并给出可执行提示，CLI 在启动前预检、直接点明问题，不再让用户去猜。**验证边界（诚实说明）**：miniflare 4.20250214.0-rc.0 在本机实测通过（合成 worker 可派发、GET/POST 体保留、dispose 生效）；该依赖**没有进仓库**（workerd 体积大，且既有可选依赖都不入 devDeps），因此 CI 里这条真机用例会**跳过**，接线层由注入假 loader 的用例守着（7 条）。需要复现真机验证时：`pnpm add -D miniflare@4.20250214.0-rc.0` 后跑 `packages/builder/test/cloudflare-preview.test.ts`。**并修掉了当时的阻塞项**：真机跑本次构建的 cloudflare 产物时 workerd 曾报 `No such module "node:fs/promises"`（产物在 worker 里起不来）。修复清单见下方「缺陷 D」；现在 `cloudflare-preview.test.ts` 有一条**真机用例**：构建 → miniflare 启动 → `/` 返回 SSR HTML、`/hello` 返回 JSON、`/_health` 200（实测 1.8s；缺 `miniflare` 时跳过）|

### Phase 4 · 对齐后的能力红利

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V27** ✅ 评估结论：不引入 | 编译期资产清单 | 评估并可能引入 `@hiogawa/vite-plugin-fullstack` 的 `?assets` 导入（`nitro:src/build/vite/plugin.ts:56-62`），替代运行时读 manifest | **结论：RM-V18 已经达成同一目标，无需引入。** 判据（「SSR entry 编译期拿到 client 清单；消除运行时间接层」）逐条核对：① 资产标签是构建期算好**内联成字面量**的（`var assetTags = { … "body": "<script type=\"module\" src=\"/assets/app-….js\">" }`），由 `virtual:ubean-asset-manifest` 承载，构建后即固定；② SSR 路径**没有运行时读盘** —— 产物里所有 `.vite/manifest.json` 字符串都出现在被打进来的 **builder 代码**中（示例的 `src/routes/api/prerender-test.ts` 把 `ubean/build` 暴露成 HTTP 路由，属于示例自身选择），服务端渲染链路上没有任何 manifest 读取；③ `.vite/ssr-manifest.json` 仍会产出（`ssrManifest: true`）但**全仓无消费者** —— 保留它是把它当公开产物（用户自己的 preload 提示工具可能读），我们自己的注入不依赖它。因此 `?assets` 只会替换一个已经不存在的问题 |
| **RM-V28** 🟡 评估结论：暂不采用 | 跨环境单例代理 | 对齐 `nitro:src/build/vite/services.ts:56-96`：dev 下服务端对 `ubean` / `@ubean/*` 的导入代理到主环境 runner，保证同实例 | **前置条件不成立**：本任务服务于「多个 dev 环境」的拓扑（主环境 + 服务端 worker 环境），而**当前 dev 只跑一个环境** —— `UbeanDevEnvironment`（RM-V08/V09 交付、有测试）**没有接进实际路径**：全仓 grep 不到 `createEnvironment` 的注册点，RM-V14 收敛后的 `dev-vite.ts` 走的是「插件自举宿主 app + 请求路由中间件」，SSR 模块图在**主进程**里。（已把 `dev-environment.ts` 文件头那句「dev 下服务端代码在 worker 里执行」改成与实现一致 —— 那句话在接线之前是错的。）单例要求在**当前拓扑**下已由 `ssrSingletonDevPolicy()`（`dedupe` + `noExternal`/`external`）满足，并有可观测证据：`dev-reload.test.ts` 的 reload 作用域探针连续多轮保持「无关模块单例保留 5/5」，`dev-worker.test.ts` 覆盖 worker 内的作用域化失效。**若要启用**：先把 `createEnvironment` 接进 dev 拓扑（即采用 worker 托管的服务端执行），届时跨环境代理才有对象可代理 |
| **RM-V29** 🟡 评估结论：暂不采用 | `services` 环境机制 | 泛化"任意 `consumer: 'server'` 环境自动注册为 service"（对齐 `nitro:src/build/vite/plugin.ts:169-194`） | **与 RM-V28 同一前提**：机制的价值是「让主图 import 另一个 server 环境的模块」，而当前没有第二个 server 环境，也没有消费方（nitro 用它承载它的 service 泛化，ADR-0012 §7 已明确不移植纯 Nitro 内部管线）。现在落地等于为一个不存在的接线点设计 API —— 本项目对「没人用的抽象」的处理方式与 §7「不做的伪缺口」一致：**先不写**。触发条件写明：当出现第一个需要独立 server 环境的能力（如平台 runner 的保真 dev、独立的 serverless 函数隔离）时，按 RM-V28 的接线一起做 |
| **RM-V30** ✅ cloudflare / 🟡 vercel·netlify 不做 | 平台 runner 接入 | `miniflare`（cloudflare）、`vercel`、`netlify` runner 支持本地保真 dev | **完成定义要的是「至少 cloudflare 一条链路用 miniflare 运行并通过测试」—— RM-V26 已达成**（runner + 接线层测试 7 条 + 本机真机验证；依赖按可选 peer 约定不入仓库）。**vercel / netlify 不做**：二者的产物是标准 fetch handler，本地预览用 node 路径（`entry.mjs`）已经能完整跑（`preview-cli.test.ts` 覆盖），再包一层平台 runner 只增加依赖与不确定性，换不到保真度 —— vercel edge 与 netlify edge 的差异主要在绑定（KV/Blob），那属于 `@ubean/server/drivers` 的适配面，不是 dev 运行时的职责 |
| **RM-V31** ✅ | 裸 `vite` 命令可用性 | 验证用户项目仅凭 `ubeanPlugin()` + `vue()` 即可跑通 API / SSR / devtools / 构建 | **三条裸命令现在都有端到端用例**：`vite dev`（`dev-reload.test.ts`：页面 SSR / API / 内置 `_` 路由 / 404 四类请求 + 改文件生效）、`vite preview`（`preview-vite.test.ts`：预渲染页 / API / SSR / 404 / 资源 MIME）、`vite build`（`vite-build.test.ts`，本轮补：`vp build` 在开关下产出完整 `dist` —— 服务端 bundle + node 包装 + manifest + 预渲染 HTML + 岛屿产物，且**服务端产物内联了客户端入口 script**）。判据刻意不是「退出 0」而是**产物完整**：本轮两次踩到「构建成功但产物不可用」，退出码看不出来 |

### Phase 5 · 收口

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V32** | 更新 `AGENTS.md` | §3（核心约定）、§8（注意事项）、§9（开发命令）、§10（文档导航）去掉 dev server 自建相关描述，补 `vite` 命令路径 | 文档与实现一致 |
| **RM-V33** | 更新站点文档 | `apps/docs` 中英文：`guide/app-modes.md`、`quickstart.md`、`contributing/engineering.md`（`:466` 的 `dist/client/.vite/manifest.json` 笔误一并修正） | `pnpm build` 构建 docs 通过 |
| **RM-V34** | 更新 skill | `skills/ubean/command/ubean.md` 标注 `vite dev/build/preview` 为等价路径 | 与 CLI 实际行为一致 |
| **RM-V35** | 用户迁移指南 + CHANGELOG | 记录 dev HMR 语义变化、配置项变更、双轨收敛时间点 | 迁移指南覆盖 breaking 项 |
| **RM-V36** ✅ | 双轨收敛 | 删除 `findUserViteConfig` 的 CLI 注入分支，CLI 旧路径下线 | **已落地，分两步**：① `experimental.viteBuilder` 默认改为 `true` —— 这一步先暴露了一个**静默失败**：`buildWithEnvironments()` 返回 undefined（插件 `config` 钩子返回的 `builder.buildApp` 覆盖了函数内联的编排，而它自己的 `manifest` 变量从未被赋值；没有任何报错，`build-parity.test.ts` 直接红）。修法是让该函数自己声明驱动权（`UBEAN_BUILD_DRIVEN_BY_CLI`），不再依赖调用方替它声明。② 删除旧编排：`production.ts` 的 `buildProduction`（188 行）、配置里的 `experimental` 字段与其全部读取点（config 类型 / loader / 核心插件 / 聚合入口 / CLI / dev-vite）、`build-parity.test.ts`（比较对象已不存在），构建矩阵从「两条路径逐项一致」重写为**按 mode × preset 断产物契约**（15 格，且比原矩阵快一半：每格只构建一次）。`findUserViteConfig` 的**无配置注入分支保留** —— 它不是旧路径的产物：没有 `vite.config.ts` 的项目仍然只能靠 CLI 注入 builtin 插件，两条路径共用同一支实现。**新发现并修掉一个缺陷**（见下方专节 F：spa 产物没有 `index.html`，与文档承诺的「static `index.html` + assets」不符）

## 4. 依赖与顺序

```
Phase 0（RM-V01…V06 + RM-P01…P05）
   ├─ RM-V05 功能回归网 ✅ ─┐
   ├─ RM-V06 契约测 ✅ ─────┤（硬前置已满足）
   ├─ RM-P05 性能基线 ✅ ───┤
   └─ RM-V04 spike ✅ ──────┘
        ↓
Phase 1 dev（RM-V07…V15）      Phase 2 build（RM-V16…V23）
        ↓                              ↓
Phase 3 preview（RM-V24…V26） ← 依赖 Phase 2 产物布局
        ↓
Phase 4 红利（RM-V27…V31）    ← RM-V28/V29 依赖 Phase 1；RM-V27 与 RM-V18 合并评估
        ↓
Phase 5 收口（RM-V32…V36）    ← RM-V36 依赖 RM-V31
```

- Phase 1 与 Phase 2 可并行（前者只动 dev、后者只动 build），各自独立可发布。
- Phase 3 的 RM-V24 依赖 Phase 2 的产物布局稳定。
- RM-V18 与 RM-V27 是同一问题的两种解法，先做 RM-V18 解耦时序，再评估是否引入 `?assets`。
- RM-P05 必须早于 Phase 1：基线只能在旧路径上产出，RM-V36 收敛后该窗口关闭。

## 5. 风险登记

| ID | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | vite-plus Builder / Environment API 标注 `@experimental` | 契约随版本变化导致构建或 dev 失效 | RM-V06 契约测试 + 锁定 `vite-plus-core@0.3.1`；升级时跑 RM-V23 矩阵 |
| R2 | `env-runner@0.2.3` 为 0.x 新包 | dev 稳定性直接受其影响 | 全部调用封装在 `EnvRunner` 接口（`runner.ts:55-59`）后；**RM-V04 已量化 Plan B 成本（约 100–200 行，宿主侧通道用 Vite 自带的，不必自研）**；spike 另发现宿主侧通道契约需在 RM-V08 补齐（见 [env-runner-spike.md](env-runner-spike.md)） |
| R3 | dev DX 倒退（HMR 语义变化） | 用户感知最敏感 | 作用域化重载必须 ≥ `examples/ubean-test/benchmarks/perf-baseline.json` 的 p50（服务端变更 220ms；RM-P05）。**前提修正（2026-09-15）**：旧实现的真实语义是「服务端模块图**按文件失效**（无关模块实例保留，RM-P04 实测 5/5）+ 浏览器整页刷新」，而非文档所写的「全量 rescan + full-reload」；此前还因 watcher 路径拼接缺陷**完全不重载**（已修复并补回归测试，见 [perf-regression-net.md](perf-regression-net.md) §2.1）。因此 RM-V13 / RM-V28 的「保留单例状态」是**不得倒退的行为**，不是新增能力。RM-V05 拓扑基线与 RM-V15 走查 |
| R4 | bundle 基线 / `analyze:check` 5% 门禁 | CI 红灯 | 迁移中以"产物语义等价"为准，RM-V22 完成后重定基线 |
| R5 | DevTools 依赖 httpServer 绑定 | 移除 `httpServerBinderPlugin` 后 DTK 可能失效 | **RM-V12 已移除该补丁**：Vite 自己持有 server 后 `server.httpServer` 天然存在。CLI 侧 `/_devtools` 302 与 devtools 插件加载测试仍绿；RM-V15 走查补浏览器侧确认 |
| R6 | 双轨期行为分叉（用户 config vs CLI 注入） | 两类项目表现不一致 | 两轨共用同一份 environment 构建配置；RM-V36 收敛 |
| R7 | Phase 1 / Phase 2 长时间并行导致中间态不可发布 | 无法增量交付 | 两阶段各自以 `experimental.viteBuilder` 隔离，独立可发布 |
| R8 | ~~dev 下 `pages/404.vue` 的组件内容不 SSR~~ **已修复（2026-09-15）** | 症状：404 响应状态码与内容类型正确（404 + text/html），但只渲染出布局外壳，组件自身 DOM 缺失，日志伴随 `VUE_ROUTER_R0004`（无 catch-all 匹配） | **根因**：dev 的 SSR 路由表由 `app.options.pages` 手工拼装，**漏了客户端 `virtual:ubean-pages` 注册的 404 catch-all**（prod/SSG 的 `ssg-entry.ts` 反而显式 push 了 NotFound 路由）。修复：dev 侧补上同形路由 `/:locale?/:pathMatch(.*)*`（name `NotFound`），与客户端路由表同名同形以保证水合一致。`dev-topology.test.ts` 已补组件 DOM 与组件内 `useHead` 标题的断言。**迁移注意**：这段代码在 RM-V12 会被删除，RM-V11 的宿主 app 构建 SSR 路由表时必须继续带上该 catch-all（或直接改用 `virtual:ubean-pages` 的路由表作为唯一事实来源） |
| R10 | **同一份框架代码在 dev 下存在两个模块实例**（2026-09-15 实测，RM-V13 期间发现） | 插件侧与 CLI 侧各自持有模块级状态时，状态不共享且**没有任何报错**：RM-V13 首版把 dev-scan 协调器注册表放在模块级 `WeakMap`，实测现象是协调器建了、文件事件也到了、订阅者却少一个（core+vue = 2，CLI 的没进来），结果是服务端改动完全不生效（15s 内 0/3 观测），日志里只有 Vite 自己的 `page reload`。根因是用户 `vite.config.ts` 由 Vite 自己打包加载，其中的插件实例与 CLI 从 node_modules `import` 的那份是两个模块实例 | 跨「插件 ↔ CLI」共享的状态一律**挂在 `server` 对象上**（`getDevScanCoordinator` / `onDevScan` 已如此），不用模块级注册表。回归由 `packages/cli/test/dev-reload.test.ts` 守住：起真 `ubean dev` 子进程改探针字面量并断言响应变化；**已用「把注册表改回 per-copy」的补丁反向验证过它确实会红** —— 而只用 `configFile: false` + 进程内 import 插件的测试（含本仓大多数集成测试）在缺陷存在时全都照常通过 |
| R9 | **peer 变体漂移导致 `vite-plus-core` 出现多份副本**（2026-09-15 实测） | 两份 vite 各有自己的 `Plugin` / `DevEnvironment` 类型声明，`pnpm --filter @ubean/cli typecheck` 直接报 “`Plugin<any>` is not assignable to `Plugin<any>`”（类型名相同、身份不同），远端 CI 上偶发、本地难复现 | 根因是 `pnpm-workspace.yaml` catalog 里的 `typescript: npm:typescript-native-bridge@latest` —— 浮动 `latest` 让 peer 解析随新 bridge 构建漂移（实测 bridge.16 / bridge.17 各生成一份 vite 副本），而旧副本不会自动从 `node_modules` 移除。**遇到该报错先 `pnpm install` 收敛**（lockfile 已被 pnpm 自行重写），再判断是否为真实类型错误；若希望彻底消除，可把 catalog 的 `@latest` 钉到具体 bridge 版本（当前保留浮动，属维护者偏好） | 

**回滚策略**：每个 Phase 以 `experimental.viteBuilder: true` 开关隔离，CLI 旧路径保留至 RM-V36。任一 Phase 验收失败即关开关回到旧路径，无需 revert 提交。

## 6. 验收矩阵

| 维度 | 取值 |
| --- | --- |
| mode | fullstack / backend / spa / ssg |
| preset | node / standard / cloudflare / vercel / netlify / bun / deno |
| config 来源 | 有用户 `vite.config` / 无（CLI 注入） |
| 命令 | `vite dev` / `ubean dev`、`vite build` / `ubean build`、`vite preview` / `ubean preview` |
| 能力 | SSR HTML 注入、i18n 路由与切换、islands 水合、Server Actions、cron、devtools、OpenAPI、prerender 产物、`analyze:check` |
| 回归 | `examples/ubean-test`、`test/browser`、`packages/cli/test`、`packages/builder/test`、`pnpm typecheck`、性能对照 RM-P05 基线 |

## 7. 明确不对齐 Nitro 的部分

避免被「对齐」带偏，以下刻意不做：

1. **不拆 `ssr` environment**——Vue 专属框架不需要框架无关的多 SSR 入口抽象（ADR-0012 §2）。
2. **不引入 `.output/` 布局**——`dist/` 已被文档与工具链承诺（ADR-0012 §5）。
3. **不把 prerender 提到 server bundle 之前**——ubean 的 SSG 依赖构建产物，Nitro 能提前是因为它的 prerender 走内存 app（ADR-0012 §4）。
4. **不做 RSC / Server Components 抽象**——[ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md) 已明确 RSC 刻意不做。
5. **不追求 `nitro build` 式双 CLI 入口**——`ubean build` 只作别名，不做绕过 Vite 的独立构建器（Nitro 保留它主要为平台部署集成，ubean 待真实需求再评估）。
6. **不移植纯 Nitro 内部管线**——`applyToEnvironment` 插件下发、`viteServices` 生产 lazy-import 等，服务于它的 service 泛化；在不拆 SSR 的前提下没有落点。

### Phase 2 · RM-V23 起步时的发现（2026-09-16，含一处自我更正与后来的一次再更正）

1. **先报出「开关路径体积多 45%」，自我更正为「不是路径差异」，再更正为「真因是 `NODE_ENV`」。** 三次结论，最后一次有可复现证据：

   - **第一次（错）**：`analyze:check` 报 total gzip 161.4 KB / entry 75.9 KB（基线 111.1 / 45.2），归因到「开关路径更重」。
   - **第二次（也错，但方向对了）**：按统一口径（每次构建前 `rm -rf dist`）复测，三条路径逐文件大小完全相同 → 结论是「先前那个数字来自那一次 dist 的状态，最可能是残留文件累积」。
   - **第三次（实测归因，2026-09-16 复现）**：触发条件与残留无关，是 **`NODE_ENV`**。同一命令、同一目录：

     | 环境 | entry gzip | `analyze:check` |
     | --- | --- | --- |
     | `NODE_ENV=test` | **75.9 kB** | total 161.4 kB，超 45.3% → 红 |
     | `NODE_ENV=production` | 45.2 kB | 0.0% → 绿 |
     | 不设置 | 45.2 kB | 0.0% → 绿 |

     机制：Vite **尊重显式设置的 `NODE_ENV`**（`mode: 'production'` 不会覆盖它），于是客户端产物打进了 Vue 开发态代码 —— 每个文件都略大、entry 上放大 68%。`--minify` 默认开着也拦不住（这不是压缩问题，是打的代码不同）。文件数在两种状态下都是 **187**，这一点第二次的「残留」假说解释不了 —— 残留会改变文件数。
   - **两次错误归因的共同原因**：都没做**单变量复现**。第一次直接读了一个数字就下结论；第二次把「清干净后数字变了」当成因果，而真正变化的是运行环境（那次手工复测是从 shell 跑的，没有 vitest 设的 `NODE_ENV=test`）。
   - **教训（替换原先那条）**：体积类断言要固定两件事 —— **干净产物**（`rm -rf dist` 或临时 outDir）与 **环境变量**（`NODE_ENV`）。已落地：`vite-build.test.ts` 显式传 `NODE_ENV=production`；`ubean build` 在 `NODE_ENV` 存在且非 production 时打印警告（不覆盖用户的显式设置，只让它可见）。
2. **「两条路径产物一致」的集成测试暂撤。** 它本身通过（文件名逐项一致），但会把开关打开的 dist 留在磁盘上、使 `analyze:check` 变红；其恢复步骤（不带开关重建）未生效。改为：断言应在**临时 outputDir** 上构建，而不是覆盖 `dist` —— 这是把它做成稳定断言前必须解决的一件事。

#### RM-V23 矩阵进展（2026-09-16）

`packages/cli/test/build-paths.test.ts` —— **13 格全绿**（临时 outDir 各自构建 + 规范化后比对清单 + 该格自己的产物契约）：

| 维度 | 取值 | 状态 |
| --- | --- | --- |
| mode | fullstack / spa / backend / ssg | ✅ 四格 |
| preset | node / cloudflare / standard / bun / deno / vercel / netlify / aws / azure | ✅ 九格（包装文件契约：node·bun·deno → `server/server.mjs`；cloudflare → `server/worker.mjs` + `wrangler.toml`；standard·vercel·netlify·aws·azure → `server/handler.mjs`） |
| 用户 `vite.config.ts` | 有 | ✅（示例项目） |
| 用户 `vite.config.ts` | **无** | ✅ 覆盖 CLI 注入全部 builtin 插件那一支（`if (!userViteConfig)`）。**曾发现**：builder 路径比默认路径少 10 个文件（5 个岛屿 JS + 5 个 CSS）—— 根因是 `prepareBuild` 该分支漏注册 `ubeanIslandsPlugin()`，`v-client.*` 指令不被转换、注册表为空、岛屿组件整类不进产物。补齐后本格转绿（做法：把示例 `vite.config.ts` 临时改名，跑完 `finally` 还原，不必另建 fixture） |
| preset | aws / azure | ✅ 两格（2026-09-16 补）。二者 `build:after` 是空钩子、不写平台配置文件，但 `build.outputDir` 是非默认值（`dist/aws` / `dist/azure`）—— 顺带覆盖了「preset 自带 outputDir 时两条路径是否落到同一处」，实测 `--outDir` 覆盖生效、两侧一致 |

两处判断标准值得记下：**只比「两条路径清单一致」不够** —— 两边同时缺同一个包装文件也会通过，因此每格额外断言该 preset 的包装文件；反之，平台配置文件（`vercel.json` / `netlify.toml` / `deno.json`）**不单独断言**，因为一旦某条路径漏写，清单比对就会失败，那正是该覆盖它的地方。

#### preset 的输出布局声明与产物不符（2026-09-16 查实并**已修正**）

补 aws / azure 两格时顺手对照了各 preset 的元数据，发现**声明的输出布局与实际产物系统性不符**：
aws 声明 `dist/aws/lambda` + `lambda/index.mjs`，azure 声明 `dist/azure/functions` + `functions/index.mjs`，
netlify 声明 `dist/netlify/functions`，vercel 声明 `dist/vercel/server` …… 而**构建从不产出这些路径**：
`getBuildOutDirs(cwd, config.build.outputDir)` 只吃 `config.build.outputDir`（默认 `dist`，`--outDir` 可覆盖），
真实产物恒定是 `<outputDir>/public` + `<outputDir>/server`，包装文件名由 entryType 决定
（`server/server.mjs` / `server/worker.mjs` / `server/handler.mjs`）。preset 自带的
`build.outputDir`（`dist/aws` 之类）同样是**无人消费的声明**——实测 `ubean build --preset aws`
写的是 `dist`，不是 `dist/aws`。全仓 grep 也确认这些字段没有任何读取点。

**修正**（改动是「把元数据改成真话」，不碰产物布局）：11 个内置 preset 的 `output.dir` /
`output.serverDir` / `output.publicDir` / `build.outputDir` 统一为 `dist` / `dist/server` /
`dist/public` / `dist`，`runtime.entry` 改成该 preset entryType 对应的真实包装文件；并新增守卫测试
（`packages/preset/test/presets.test.ts`）逐一断言「声明即真实产物」，防止再次漂移。

**当初没在 RM-V23 里改的理由仍然成立**：让 `getBuildOutDirs` 去尊重 `output.serverDir` 会同时改变
11 个 preset 的产物布局，属破坏性变更（需连带更新部署模板、站点文档与示例的部署配置）——那条路
本轮**没有**走，走的是「元数据向实现对齐」。

#### 构建进程不退出（2026-09-16 修复，RM-V21 的隐藏关卡）

`vite build` 走插件路径时**构建完成后进程不退出**，实测挂满 13 分钟才被外部超时杀掉。排查用了堆栈探针（`.temp/timer-probe.cjs` 定时打 `process._getActiveHandles()` / 各 handle 的 `_idleStart`），定位到两处**跨构建存活的活动句柄**：

1. `createUbeanApp()` 安装的 rate-limit 清理定时器（`setInterval`）不可销毁 —— 改为把 handle 挂到 store 上并提供 `disposeMemoryRateLimitStores()`；
2. cron 调度器（错误接线的 `startCronScheduler`）—— 生成的服务端入口原先**没有 teardown**，补出 `close()` 依次调用 `disposeMemoryRateLimitStores` / `stopQueueWorkers` / `closeDatabases`。

期间还踩到一个自己造的坑：`cronScheduler` 的声明被放进了 `createApp` 内部，而 `close()` 读的是另一个作用域的（undefined）变量，且异常被 try/catch 吞掉 —— 表现为「修了但没效果」。教训：**这类「清了但没清掉」的排查必须以 handle 存活为准（探针），而不是以代码看起来对为准**。

两处修复都在 `production.ts` 的入口模板与 `@ubean/server` 侧，两条构建路径共用，故对 CLI 路径同样是修复（此前 CLI 靠 `process.exit` 掩盖了它）。

#### 两个产物级缺陷（2026-09-16 修复，由 RM-V24 的预览验收暴露）

写 `vite preview` 的验收断言时，我把「预渲染 HTML 里应当有客户端入口 `<script>`」当成了一句显然的断言 —— 它红了，追下去是两个独立缺陷，且都**静默**、都躲过了此前所有门禁。

**缺陷 A：客户端资产标签被内联成空串（生产页面不水合、无样式）。**

`virtual:ubean-asset-manifest` 有**两个提供者**：核心插件（`ubeanPlugin()` 内联的 `resolveId`/`load`）与独立插件 `ubeanAssetManifestPlugin`。核心插件那份的 ref（`assetManifestRef`）只在**它自己注册的 `buildApp`** 里被填；而 CLI 驱动的两条路径（默认路径与开关打开）都直接调 `buildWithEnvironments`/`buildProduction`，核心插件的 ref 始终是 `null` —— 偏偏它又抢先在 `resolveId` 上命中了同一个 id。结果：

```
var assetTags = { "css": "", "preloads": "", "body": "", "favicon": null };
```

两条路径**都**如此（实测：默认路径与 `UBEAN_VITE_BUILDER=1` 的产物里 `body` 都是空串）。HTML 里因此既没有 `<script type="module" src="/assets/app-….js">`，也没有任何 `<link rel="stylesheet">` —— 生产环境下页面不水合、无样式，而构建、体积门禁、文件清单比对全部照常通过。

**为什么此前没人发现**：dev 的 HTML 由 Vite 注入 `/@vite/client`，不受影响；`analyze:check` 比的是**体积**；RM-V23 的矩阵比的是**文件清单**（`HTML` 内容不在比对范围内）。三条最常用的门禁都不看 HTML 内容，而「看得见内容」的只有人肉打开产物。

**修法**：让核心插件成为**唯一**提供者，取值改为「调用方传入的内存 manifest → 服务端构建 outDir 旁的 `<outputDir>/public/.vite/manifest.json`」两级；独立插件只在缺失核心插件的那一支（`!userViteConfig`）保留。磁盘兜底用**本次构建的** `outDir`（`this.environment.config.build.outDir` 的兄弟目录），而不是配置里的 `build.outputDir` —— 后者在 `--outDir` 下是过期值，而插件实例可能来自用户 `vite.config.ts` 的另一份模块/配置副本（R10 的同族问题）。

**缺陷 B：预渲染 HTML 落进错误的产物树（`--outDir` 下产物被劈成两半）。**

`prerender()` 用 `join(cwd, config.staticDir)` 决定落盘目录，而 `staticDir` 的默认值写死为 `'dist/public'` —— 不跟随 `build.outputDir`。于是 `ubean build --outDir .temp-x` 时客户端产物落在 `.temp-x/public`，9 个预渲染 HTML 却写进 `dist/public`：**两边都不报错**，只是产物树里少文件。

**连带影响**：RM-V23 矩阵各格都在临时 outDir 上构建，而预渲染 HTML 从来就没进去过 —— 各格的「清单逐项一致」里其实**没有 HTML 参与比对**（两边一样地缺，于是「一致」照样成立）。矩阵的覆盖面因此比文档写的弱，直到修掉这个缺陷才真正成立。

**修法**：`prerender.staticDir` 不再有默认值（`ResolvedPrerenderConfig.staticDir?: string`），落盘目录由新增的 `resolvePrerenderStaticDir(cwd, buildOutputDir, prerenderConfig)` 统一派生为 `<build.outputDir>/public`（用户显式配置则优先，相对/绝对路径都支持）；搜索索引（`__search.json` / Pagefind `siteDir`）同步改用同一函数，避免两处方言。

**两个缺陷共同的教训**：**「清单一致」「体积不涨」都不等于「产物正确」**。前者看不见内容（HTML 里的 `<script>`），后者看不见缺失（少产出反而通过）。修完之后，矩阵的基线格新增两条**内容级**断言：产物目录里必须有预渲染 HTML；服务端产物必须内联客户端入口 script（按 `JSON.stringify` 的转义形态匹配）。这两条断言在修复前都是红的。

#### 另外三个产物级问题（2026-09-16，RM-V26 连带查出）

为了给 cloudflare 做「真的跑一次产物」的预览，逐个撞出三个此前没有任何门禁能发现的问题。按发现顺序记：

**C. 无用户 `vite.config` + `backend` 模式构建失败。** 用临时项目验证 cloudflare 预览时先试了 node preset，构建直接失败：

```
Failed to resolve import "virtual:ubean-app" from "…/.ubean/virtual/server-entry.mjs"
```

根因：`virtual:ubean-app` 由 `ubeanVite`（vue 插件）提供，而无配置分支只在 `hasPages` 时注册它 —— 可服务端入口模板**无条件** import 这个模块（SSR 应用壳要 `resolveAppConfig`）。于是 `mode: 'backend'`（无页面）走无配置分支必然失败。有用户 `vite.config` 时不暴露：那份 `ubeanPlugin()` 聚合入口本来就含 vue 插件 —— 这也解释了为什么 RM-V23 的矩阵（backend 格有配置、无配置格是 fullstack）两个方向都测过却没撞上：**缺的正是两者的交叉**。已修：两条路径都在 `else if (hasServer)` 时同样注册 `ubeanVite`。

**D. cloudflare 产物在 workerd 里起不来（已修复，2026-09-16）。** 症状：`dist/server/worker.mjs` 交给 miniflare，启动即失败，报 `No such module "node:fs/promises"`（workerd 即使开 `nodejs_compat` 也不支持 `node:fs`）。逐条排查后一共动了两类地方 —— **产物卫生**与**构建配置**，每条都是实测撞出来的：

| # | 原因 | 修法 |
| --- | --- | --- |
| 1 | `ubean/server` 的 barrel 重导出 `@ubean/shared/node`（端口探测 / 网卡枚举）→ **每个**服务端图都带 `node:net` / `node:os` | barrel 不再重导出，需要时从 `@ubean/shared/node` 显式导入 |
| 2 | `serveStatic`（`node:fs`）被 `@ubean/app` 静态 import | 改动态 `import()` + `isNodeRuntime()` 守卫（新增于 `@ubean/shared`）；worker 里静态资源归平台层 |
| 3 | fs 缓存存储（`node:fs/promises`）与 cache 模块同文件、静态可达 | 拆到 `cache-fs.ts`，`app.ts` 用新增的 `createLazyCacheStore()` 懒加载（构造器是同步的，不能 await） |
| 4 | SEO 约定扫描（`existsSync` 源目录）在 worker 上无意义 | 运行时守卫：非 Node 直接跳过（显式 `seoConventionModules` 照常生效） |
| 5 | SSR 构建默认把依赖外部化 → 产物留 `hono` / `vue` bare specifier | worker 目标全量打包（`noExternal: [/./]`、`serverExternal → []`） |
| 6 | 打包器为 CJS 依赖生成的垫片是 `createRequire(import.meta.url)`，而 **workerd 里 `import.meta.url` 是 undefined** | 核心插件 `renderChunk` 把 `import.meta.url` 换成 `"file:///worker.mjs"`（`define` 够不到打包器自己生成的垫片，实测） |
| 7 | vue-i18n 顶层读 `process.env.NODE_ENV`；部分依赖用 `global` | worker 目标 `define` 出 `process.env.NODE_ENV='production'` 与 `global: 'globalThis'` |
| 8 | `nodejs_compat` 的 **v2** 语义（提供 `process` / `Buffer` 全局）要求 compatibility_date ≥ 2024-09-23 | 生成的 `wrangler.toml` 用 `2024-09-23`，并补 `compatibility_flags = ["nodejs_compat"]`；预览 runner 从同一份 toml 读日期与标志 |
| 9 | `node:fs` / `node:fs/promises` 仍会被打进产物（动态 import 也会被内联） | 构建期把它们重写成**会抛错的虚拟桩模块**（`vite/shims`，导出面从 Node 真实模块生成，避免依赖漏名导致 `MISSING_EXPORT`） |
| 10 | `ubean build --preset X` 改的是 CLI 侧配置，插件实例看不到 → 按目标分流的行为（桩 / 垫片）用错 preset | CLI 通过 `UBEAN_BUILD_PRESET` 把解析后的 preset 传给插件 |

**验证**（`cloudflare-preview.test.ts` 的真机用例 + 手工）：完整示例（20 页 / 63 API）构建 cloudflare 产物后，在 miniflare 里 `/` → 200 SSR HTML、`/api/hello` → 200 JSON、`/about` → 200 预渲染 HTML、未命中 → 404 HTML；`/_health` → 200。


**产物形态（2026-09-16 追加）**：worker 目标的服务端产物**会压缩**（客户端一直是 `oxc` 压缩，服务端此前统一 `minify: false` 是为了 Node 堆栈可读 —— 但 worker 要上传给平台、冷启动也与体积正相关）。实测示例 worker **2.6 MB → 1.36 MB**（−49%），压缩后仍在 workerd 里正常启动（真机用例）。同时把已弃用的 `inlineDynamicImports` 换成 `codeSplitting: false`（rolldown 打印 WARN 提示的新写法）：三个代表性目标的文件数与体积**逐项不变**（standard 7 文件/448 KB、cloudflare 8 文件、node 24 文件/348 KB），构建日志里的弃用告警消失。

**I. 页面元数据在生产构建里丢字段（`matchers` / `slot` / `intercept*`）—— dev 正常、产物坏掉。** 补 matcher 的示例与走查时暴露：`[id=numeric]` 的路由在 **dev 返回 404（正确）、在生产构建里返回 200（错误）**。根因是服务端入口把页面表按**白名单**序列化（`pagesJson`），而白名单只列了 `relativePath/name/route/layout/reuseTarget/isReuse/pageMeta` —— `ScannedPage` 上的 `matchers` / `slot` / `interceptFrom` / `interceptTarget` 四个字段被静默丢掉。dev 之所以看不出来：路由表用的是扫描得到的**活对象**（`enhanceDevApp` / `buildDevSsrRoutes` 直接拿 `scanResult.pages`），只有产物走序列化。

修法：把序列化抽成 `serializePagesForEntry()`，白名单补齐这四个语义字段（外加 `path` / `cache` / `isMarkdown`），并加两道守卫 —— 单测逐个字段锁住（`packages/builder/test/page-metadata.test.ts`），矩阵基线格断言产物里的页面表带 `"matchers"`。

**同一根因下另有两处修复**：① matcher API 此前**没有公开导入路径**（只在 `@ubean/vue` 的 dist 里），补到 `ubean` 主入口与 `ubean/client`（文档说的是「注册到进程单例」，用户得有地方 import）—— **客户端模块要用 `ubean/client`**：主入口是聚合 barrel，从客户端图引用它会把整条聚合链带进产物（实测示例的入口 chunk 45.2 → 111.9 kB gzip，`analyze:check` 直接红）；② 注册表此前是模块级 `Map`，而 dev 的 SSR 图把 `ubean` 内联、把 `@ubean/vue` 外部化 —— 用户注册与 router 校验读的是两份 Map，表现为**所有 `[id=numeric]` 路由一律 404**（`validateParams` 对未注册名保守返回 false）。按仓库既有约定（`@ubean/build` 的模块注册表、i18n 的 ALS）改挂 `globalThis`，并加回归测试。

**示例侧**：新增 `src/matchers.ts` + `src/pages/order/[id=numeric].vue`，`src/server.ts`（服务端校验）与 `src/app.ts`（`createMatcherGuard()` 客户端守卫）两侧都注册；`dev-dx.test.ts` 新增浏览器用例覆盖「服务端 404 + SPA 导航被守卫拦下」。

**J. 并行路由（`@slot`）在服务端完全没有支持 —— 首屏与客户端不一致。** 同一次「文档承诺 vs 实际覆盖」审计的延续：`@slotName/` 目录在**客户端**是正确实现的（生成器把同路径的页面归入一条记录的命名视图，`<SlotView>` 从 `route.matched[].components` 解析），但两侧的 **SSR 路由表**都没有「按 route 分组」的概念 —— 它们把每个页面各注册成一条路由，同路径的两条记录互相覆盖。实测：`/parallel` 的首屏 HTML 渲染的是**插槽页**，水合后客户端渲染**默认视图**（首屏与客户端不一致，且 SSR 只出了一半内容）。

修法：dev 的 `buildDevSsrRoutes()` 与产物入口的 `buildRendererSetup()` 都改为按 route 分组、把插槽写成命名视图（`components: { default, <slot> }`，与 `component` 互斥），拦截路由与客户端一致地单独注册（名字加 `__intercept_` 前缀）。`SlotView` 本身已支持懒加载组件（`defineAsyncComponent` 包装），因此分组后 SSR 也能渲染插槽。断言：`dev-topology.test.ts` 与 `preview-cli.test.ts` 各一条（首屏 HTML 同时含默认视图与插槽标记）。

**同批查实的另一条，登记为待决（语义有歧义，需 owner 定）**：**拦截路由只有元数据、没有运行时**。生成器会为 `(..)target/` 之类的文件注册带 `meta.interceptFrom` / `interceptTarget` / `isIntercepting` 的路由，但全仓没有任何**消费者** —— 「从 X 导航到 Y 时渲染拦截页」这件事不会发生，拦截页只能靠它自己被清理后的路径访问。实现它需要先定语义（本仓当前把 `(.)target` 段从路径里剥掉、只把 `target` 记进元数据，与 Next 的「拦截页自身路径 = 目标路径」不同），因此不在本轮擅自落地。

**顺带记下一条使用约束**（不是框架缺陷）：运行时路由 import `ubean/build`（示例里那条 `prerender-test.ts`，为 HTTP 集成测试暴露预渲染 API）会把整条构建工具链打进服务端产物 —— Node 上只是体积浪费，worker 上会在**构建期**失败（工具链的可选依赖 `velocityjs` / `atpl` … 无法打包）。因此**矩阵的 cloudflare 格改用 builder 的最小 fixture** 构建，其余格仍用示例项目；这条约束写进了迁移指南。

**E. 配置里的 `preset` 顶层字段不被读取。** 写临时项目时按 `AGENTS.md` 的示例写了顶层 `preset: 'cloudflare'`，构建产物却是 node 形态（`server/package.json`、没有 `worker.mjs`）—— 实际被读取的是 `build.preset`（`cli/src/build.ts:138` 与 loader 默认值）。文档与实现不一致，登记到 RM-V32 一并修正。


**G. SFC 页面里的 `export const actions` 在客户端没被替换（同样由浏览器走查暴露，已修）。** 症状：给示例加了一页带 `defineAction` 表单的页面后，**该页在浏览器里永不水合**（`__vue_app__` 不出现，`import('/src/pages/action-demo.vue')` 500）。根因有三层，都在 actions 插件：

1. **过滤条件认不出 SFC**：插件只处理 `.ts|.js|.mts|.mjs|.tsx|.jsx` 后缀的 id，而 SFC 的脚本块 id 形如 `Page.vue?vue&type=script&lang.ts` —— 带 query，后缀判定失败，整类文件被跳过。
2. **只转换子请求不够**：`@vitejs/plugin-vue` 会把脚本块的 import **提升进它编译出的主模块**，`?type=script` 子请求的转换结果根本不会被使用 —— 必须转换 `.vue` 的**主模块**。
3. **注入位置**：stub 的 import 必须放进 `<script>` 块**内**（放 SFC 顶部就不是合法 SFC 了）；同时服务端注入的 `filePath` 必须按**去掉 query** 的路径算，否则客户端 stub 打到的 id 在服务端不存在。

修法：主模块与子请求都接受、`injectImport()` 按「SFC 还是 JS」决定注入位置、`toProjectRelative()` 自己负责剥掉 query 与虚拟前缀（三处都在 `actions-plugin.ts`），并在客户端转换里**剥离已失效的服务端 import**（`defineAction`/`fail` 等；残留会让浏览器去取 `ubean/server` 的预构建产物）。回归：`actions.test.ts` 新增 3 条（SFC 主模块转换、两条路径 id 一致、服务端注入路径无 query），浏览器走查见 `dev-dx.test.ts`。

**顺带**：`ubean preview` 补了 `--outDir`。排查本缺陷时被它误导过 —— citty 会**静默忽略未知参数**，`preview --outDir .temp-x` 服务的是配置里的 `dist`，表现为「明明构建过了却 404」。


**F. spa 产物从来没有 `index.html`（RM-V36 收敛时按 mode 断言产物才发现，已修）。** 站点文档承诺 spa 的产物是「static `index.html` + assets」，实测 `--mode spa` 的产物目录里**一个 HTML 都没有**：fullstack / ssg 的 HTML 由 SSR 渲染或预渲染产出，而 spa 没有服务端；客户端构建的 input 是虚拟 entry（`{ app: clientEntry }`），不是 HTML，因此 Vite 不会生成 `index.html` —— 部署出去的 SPA 没有入口文件。此前没被发现，是因为矩阵只比「两条路径的产物清单一致」（两边一样地缺），体积门禁只统计 JS。修法：客户端构建后由 `writeSpaIndexHtml()` 补出入口，资产标签复用与 SSR 相同的 `computeAssetTags()`（同一个 manifest、同一套规则），避免出现第二种「入口长什么样」的定义。矩阵的 spa 格现在直接断言 `public/index.html`。

