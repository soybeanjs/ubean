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
| **RM-V15** | dev 全量验收 | `examples/ubean-test` 全量测试 + `test/browser` e2e + 手工 DX 清单（SSR HTML、i18n 切换、islands 水合、Server Actions、cron、devtools、HMR 状态保留） | 全绿；DX 无倒退；**性能不劣于 RM-P05 基线**（dev 冷启动与变更生效延迟 p50）；Phase 1 可独立发布（`experimental.viteBuilder` 开关） |

### Phase 2 · build 迁移

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V16** | `buildApp` 编排 | 新建 `builder/src/vite/build-app.ts`：`prepare`（order: pre）→ client env → ubean env → prerender → preset 包装 → manifest（order: post） | `vite build` 单次产出完整 `dist/` |
| **RM-V17** | `buildProduction` → environment 驱动 | 拆解 `production.ts:591-875`：client 配置（`:692-729`）与 server 配置（`:750-805`）转为两个 environment 的构建配置；`getPresetBuildConfig`（`:463-492`）映射到 env 的 `resolve` / `build`；重审 `ssrSingletonProdSsr` 的 `^ubean` external 过滤（`:757-775`） | 产物布局与现状逐字节可比（哈希除外） |
| **RM-V18** | 资产清单时序解耦 | 现状 SSR entry 运行时读 `../public/.vite/manifest.json`（`ssg-entry.ts:126-145`、`production.ts:731-736`）且强依赖 client 先构建；改用 `ssrManifest` 注入或编译期清单（与 RM-V26 合并评估） | server env 不再依赖 client 磁盘产物路径；构建顺序约束解除 |
| **RM-V19** | 虚拟模块落盘降级 | 删除 `production.ts:653-669` 的 virtual id → 磁盘文件 alias 映射；落盘保留为构建期快照供 preset 包装与调试 | 删除 alias 后构建仍通过，产物一致 |
| **RM-V20** | ssg 清理时机 | `cli/src/build.ts:305-312` 的 `dist/server` 删除挪到所有 env 构建 + prerender 之后；`UBEAN_KEEP_SSR` 语义保留 | ssg 产物不含 `dist/server`；其他 mode 不受影响 |
| **RM-V21** | `ubean build` 薄别名 | `cli/src/build.ts:83-338` 改为 `createBuilder({ plugins: [ubeanPlugin({ _ubean: instance })] })` + `__ubean_build__` 标志防重复注册（对齐 `nitro:src/build/vite/build.ts:6-29`） | `ubean build` 与 `vite build` 产物一致 |
| **RM-V22** | 基线重定 | 迁移完成后重新生成 `examples/ubean-test/benchmarks/bundle-baseline.json` | `pnpm analyze:check` 绿（5% 门禁） |
| **RM-V23** | 构建矩阵验收 | 4 种 mode（fullstack / backend / spa / ssg）× preset（node / standard / cloudflare / vercel / netlify / bun / deno）× 有/无用户 vite.config；`scripts/benchmark-lifecycle.mjs --toggle viteBuilder` | 矩阵全绿；`dist/manifest.json`、preset 包装（`server.mjs` / `handler.mjs` / `worker.mjs` / `wrangler.toml`）产出与现状语义等价；build 墙钟与峰值 RSS 的 p50 / p95 对照 `perf-baseline.json` |

### Phase 3 · preview 迁移

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V24** | `configurePreviewServer` 接管 | 新建 `builder/src/vite/preview.ts`（对齐 `nitro:src/build/vite/preview.ts:5-46`）；fullstack / backend 走生产 handler | `vite preview` 可用；`packages/cli/test/preview.test.ts` 全绿 |
| **RM-V25** | `ubean preview` 与静态服务器保留 | `cli/src/preview.ts:46-125` 的 `startStaticServer` 保留（spa / ssg 无生产 server 可复用） | 行为与现状一致 |
| **RM-V26** | cloudflare preview（可选） | 现状 `preview.ts:242-244` 直接报错提示 `wrangler dev`；改走 env-runner 的 `miniflare` runner | wrangler 不可用时也能本地预览 cloudflare 产物 |

### Phase 4 · 对齐后的能力红利

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V27** | 编译期资产清单 | 评估并可能引入 `@hiogawa/vite-plugin-fullstack` 的 `?assets` 导入（`nitro:src/build/vite/plugin.ts:56-62`），替代运行时读 manifest | SSR entry 编译期拿到 client CSS/JS 清单；消除运行时间接层 |
| **RM-V28** | 跨环境单例代理 | 对齐 `nitro:src/build/vite/services.ts:56-96`：dev 下服务端对 `ubean` / `@ubean/*` 的导入代理到主环境 runner，保证同实例 | 多环境下 Vue / `@ubean/*` 单例成立（与现有 `ssrSingletonDevPolicy` 策略合流） |
| **RM-V29** | `services` 环境机制 | 泛化"任意 `consumer: 'server'` 环境自动注册为 service"（对齐 `nitro:src/build/vite/plugin.ts:169-194`） | 机制存在且有测试；本阶段不启用具体 service |
| **RM-V30** | 平台 runner 接入 | `miniflare`（cloudflare）、`vercel`、`netlify` runner 支持本地保真 dev | 至少 cloudflare 一条链路在 dev 下用 miniflare 运行并通过测试 |
| **RM-V31** | 裸 `vite` 命令可用性 | 验证用户项目仅凭 `ubeanPlugin()` + `vue()` 即可跑通 API / SSR / devtools / 构建 | `vite dev` / `vite build` / `vite preview` 全链路可用，无需 CLI |

### Phase 5 · 收口

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V32** | 更新 `AGENTS.md` | §3（核心约定）、§8（注意事项）、§9（开发命令）、§10（文档导航）去掉 dev server 自建相关描述，补 `vite` 命令路径 | 文档与实现一致 |
| **RM-V33** | 更新站点文档 | `apps/docs` 中英文：`guide/app-modes.md`、`quickstart.md`、`contributing/engineering.md`（`:466` 的 `dist/client/.vite/manifest.json` 笔误一并修正） | `pnpm build` 构建 docs 通过 |
| **RM-V34** | 更新 skill | `skills/ubean/command/ubean.md` 标注 `vite dev/build/preview` 为等价路径 | 与 CLI 实际行为一致 |
| **RM-V35** | 用户迁移指南 + CHANGELOG | 记录 dev HMR 语义变化、配置项变更、双轨收敛时间点 | 迁移指南覆盖 breaking 项 |
| **RM-V36** | 双轨收敛 | 删除 `findUserViteConfig` 的 CLI 注入分支，CLI 旧路径下线 | 双轨逻辑移除；存量项目验证通过 |

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
