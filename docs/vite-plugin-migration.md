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
| **RM-V02** | 虚拟模块无状态化 | 移除 `production.ts:92-93` 构建期 `clear()`；registry 改为 scan 层注入、插件只读；`virtual-registry.test.ts` / `virtual-modules.test.ts` 保持通过 | 连续两次 build 产出字节一致；插件实例无跨构建可变状态 |
| **RM-V03** | 统一 Node↔Web 适配 | 新建单一适配模块，替换 `vite-server.ts:95/119` 与 `server.ts:17/41` 两份重复实现 | 重复实现删除；dev 与 preview 行为不变 |
| **RM-V04** | `env-runner` 兼容性 spike | 在 `examples/ubean-test` 验证 `node-worker` 与 vite-plus 0.3.1 的 `DevEnvironment` / `createServerHotChannel` / `vite/module-runner` 协同；同时验证 `miniflare` runner 可用性 | 最小 worker 能 fetch 返回 200；产出结论文档（含 Plan B 成本量化） |
| **RM-V05** ✅ | **dev 拓扑回归网（硬前置）** | 新增 `packages/cli/test/dev-topology.test.ts`：子进程起 `ubean dev` + **纯 HTTP** 断言（刻意不碰内部 API —— 内部 server 会在 RM-V12 被删除，走内部 API 的测试届时会一起失效）。覆盖 SSR HTML 注入、页面 404 vs API 404、静态与源码资源不被兜底吞掉、内置 `_` 路由、中间件顺序（安全头/请求 ID 覆盖四类响应；i18n 与 CSRF cookie）。fixture 补 `src/pages/404.vue`，使「页面 404 → HTML」可断言 | 18 个断言在**旧实现**上全绿。实施中发现并修复一个拓扑缺陷：`pages/404.vue` 存在时页面兜底 `*` 会按注册顺序抢先匹配晚注册的内置路由，导致 `/_openapi.json`、`/_scalar` 变 404（修复=把 OpenAPI 注册提前到 `registerRoutes` 之前，并订正 router.ts 中「rou3 会优先具体路径」的错误注释）。**未修**：404 组件内容在 dev 下不 SSR，登记为 R8 |
| **RM-P01–P05** | **生命周期性能基线（硬前置，见 [perf-regression-net.md](perf-regression-net.md)）** | 新增 `scripts/benchmark-lifecycle.mjs`：以 `experimental.viteBuilder` 为单变量开关；采集 dev 冷启动、变更生效延迟、build 墙钟与峰值 RSS；采集前断言新路径确实生效（防 R6 双轨分叉） | 旧实现上产出 committed `examples/ubean-test/benchmarks/perf-baseline.json`（p50 / p95 + 原始样本 + 环境记录）；R3 的「现状」由该文件定义 |
| **RM-V06** | Builder API 契约测试 | 断言 vite-plus 的 environments 注册、`buildApp` 调用顺序、`builder.build(env)` 返回形态、`sharedConfigBuild` 行为 | 契约测试覆盖 ADR-0012 依赖的全部实验性 API；锁 `vite-plus-core@0.3.1` |

> 硬前置：**RM-V05 ✅ 与 RM-P01–P05 ✅ 已落地** —— 前者提供 DX 不倒退的**功能**判据，后者提供**性能**判据（否则 ADR-0012 §3 的性能收益与 R3 的「≥ 现状」都无数字可依）。**RM-V06 仍待做**，提供 `@experimental` API 的漂移告警。
>
> RM-P05 必须在 Phase 1 之前完成：RM-V36 收敛后旧实现删除，基线将无法再产出。（已完成。）

### Phase 1 · dev 迁移（收益最大、风险最高）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-V07** | environments 注册 | `builder/src/vite.ts` 的 `ubeanPlugin()` 增加 `config` 钩子返回 `environments: { client, ubean }`（对齐 `nitro:src/build/vite/plugin.ts:113-133`） | `vite build` 能识别两个环境；client outDir 指向 `dist/public` |
| **RM-V08** | `UbeanDevEnvironment` | 新建 `builder/src/vite/dev-environment.ts`，继承 `DevEnvironment`，`dispatchFetch` 转发 worker（对齐 `nitro:src/build/vite/dev.ts:93-164`） | dev 下请求可进入 worker 内的 Hono app 并返回响应 |
| **RM-V09** | dev worker entry | worker 内 `ModuleRunner` + 作用域化 `invalidateFile` 重载 + environment 分发 + `transformHTML` RPC（对齐 `nitro:src/runtime/internal/vite/dev-worker.mjs`） | 修改服务端文件仅相关模块重新求值，单例状态保留；HTML 经宿主 `transformIndexHtml` |
| **RM-V10** | `configureServer` 请求路由 | pre 中间件：显式路由直通 + 资产/导航启发式（`Sec-Fetch-Dest` / 扩展名 / `?import` / `Accept`）；post 中间件兜底。**难点：页面 catch-all `/**` 必须正确区分于显式 API 路由，静态资源不得被 catch-all 吞掉** | 对齐 RM-V05 基线：静态资源正常、页面 404 返回 HTML、API 404 返回 JSON |
| **RM-V11** | 宿主 `UbeanDevApp` | 迁移 `vite-server.ts:295-327` 的 bootstrap（`ssrLoadModule('virtual:ubean-server')` → `resolveServerConfig('dev')` → `applyServerConfig`）及 devtools、错误页、`/_openapi.json`、VFS 到宿主 dev app | devtools、OpenAPI、`defineServer` 配置生效，行为与现状一致 |
| **RM-V12** | 摘除 CLI server 层 | 删除 `vite-server.ts:247-381`（http server 与 handler）、`:463-471`（DTK hack）、`:524-530`（middlewareMode + HMR 端口）、`:330/345/353`；`createViteDevServer` 退化为"装配 Vite 配置" | 文件大幅瘦身；`vite dev` 直接可用 |
| **RM-V13** | watcher 合一 | 退役 `dev-server/watcher.ts` 的独立监听，复用 `server.watcher`；统一 `builder/src/vite.ts:120` 与 `vue-plugin.ts:261` 的监听策略；rescan 仅在 scan 目录增删时触发 | 单套 watcher；变更后 reload 行为不劣于 RM-V05 基线；变更生效延迟 p50 不劣于 RM-P05 基线；**无关模块单例保留**不劣于 RM-P04 基线（5/5），即不得从「按文件失效」退化为「全量重新求值」 |
| **RM-V14** | `ubean dev` 薄别名 | `cli/src/dev.ts:61-316` 改为调 Vite `createServer`；保留参数解析、端口/网络地址 banner（`:225-260`）与 logging 闸门（`:106-125`） | `ubean dev` 与 `vite dev` 行为一致 |
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
   ├─ RM-P05 性能基线 ✅ ───┤（硬前置已满足）
   ├─ RM-V06 契约测 ───────┤ ← 剩余
   └─ RM-V04 spike ────────┘ ← 剩余
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
| R2 | `env-runner@0.2.3` 为 0.x 新包 | dev 稳定性直接受其影响 | 全部调用封装在 `EnvRunner` 接口（`runner.ts:55-59`）后；RM-V04 量化自研 Plan B 成本 |
| R3 | dev DX 倒退（HMR 语义变化） | 用户感知最敏感 | 作用域化重载必须 ≥ `examples/ubean-test/benchmarks/perf-baseline.json` 的 p50（服务端变更 220ms；RM-P05）。**前提修正（2026-09-15）**：旧实现的真实语义是「服务端模块图**按文件失效**（无关模块实例保留，RM-P04 实测 5/5）+ 浏览器整页刷新」，而非文档所写的「全量 rescan + full-reload」；此前还因 watcher 路径拼接缺陷**完全不重载**（已修复并补回归测试，见 [perf-regression-net.md](perf-regression-net.md) §2.1）。因此 RM-V13 / RM-V28 的「保留单例状态」是**不得倒退的行为**，不是新增能力。RM-V05 拓扑基线与 RM-V15 走查 |
| R4 | bundle 基线 / `analyze:check` 5% 门禁 | CI 红灯 | 迁移中以"产物语义等价"为准，RM-V22 完成后重定基线 |
| R5 | DevTools 依赖 httpServer 绑定 | 移除 `httpServerBinderPlugin` 后 DTK 可能失效 | Vite 拥有 server 后绑定天然成立；RM-V11 / RM-V15 专项验证 |
| R6 | 双轨期行为分叉（用户 config vs CLI 注入） | 两类项目表现不一致 | 两轨共用同一份 environment 构建配置；RM-V36 收敛 |
| R7 | Phase 1 / Phase 2 长时间并行导致中间态不可发布 | 无法增量交付 | 两阶段各自以 `experimental.viteBuilder` 隔离，独立可发布 |
| R8 | dev 下 `pages/404.vue` 的组件内容不 SSR（2026-09-15 实测） | 404 响应状态码与内容类型正确（404 + text/html），但只渲染出布局外壳，组件自身 DOM 缺失，日志伴随 `VUE_ROUTER_R0004`（无 catch-all 匹配） | 与 RM-V10（页面 catch-all 的语义）一并处理；`dev-topology.test.ts` 已留出内容断言位置，修好后补上，避免把当前行为固化成基线 |

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
