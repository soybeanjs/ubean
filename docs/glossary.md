# ubean 架构词汇表

> 术语在相关 ADR（`docs/adr/`）中按此定义使用。

## 应用工厂

- **`createUbeanApp`**（Hono 工厂）：`@ubean/app` / `ubean/server` 导出，返回 `UbeanApp`（Hono 应用）。此名**专指** Hono 工厂。
- **`createUbeanClientApp`**（Vue 工厂）：`@ubean/client` 导出，返回 `UbeanAppInstance`（`{ app, router, head, page }`）。唯一真实消费者是 `@ubean/build` 的虚拟模块生成器。
- **聚合器（aggregator）**：`ubean` 主包，纯 re-export 全部 `@ubean/*` 子包，对外维持单一包名 API 表面。其选择性 `export type { ... } from '@ubean/client'` 块用于消歧（见 ADR-0001）。

## 导入入口

- **barrel（聚合入口）**：包主入口 `.`，静态 re-export 全部子模块符号。`@ubean/server` 的 barrel 是函数 re-export，本身可 tree-shake（见 ADR-0003）。
- **子路径（subpath）**：`package.json` `exports` 中的 `./xxx` 入口。
- **语义聚合子路径**：聚合多个内部文件的子路径，与文件非 1:1。例：`./realtime` = `./websocket` + `./sse`（见 ADR-0003）。
- **1:1 子路径**：与内部文件一一对应的子路径。

## 任务性质

- **enabler（使能任务）**：本身不交付用户可见功能，但为后续任务提供护栏或证据层。如 OPT-09（防漂移护栏）、OPT-11（impact 证据层）。enabler 应领头序列（来源: ADR-0002）。
- **feature task**：直接交付用户可见改进的任务。

## 测试

- **注册断言（registration assertion）**：对 `app.hono` 的路由栈/中间件栈做断言，验证某中间件/路由已挂载，**不发起 HTTP 请求**。适用于 `UbeanApp` init 这类以同步注册为主的场景（见 ADR-0002）。
- **快照单测（snapshot unit test）**：对 codegen 模块产出的字符串做 snapshot/断言，作为快速单元门禁（见 ADR-0002 Decision 1）。**实际形态是显式断言（锁契约片段），不是 `toMatchSnapshot()`** —— 整串快照会在改一行注释时变红，那是噪音不是信号。已落地两处：`packages/builder/test/virtual-modules.test.ts`（`virtual-modules.ts`）与 `packages/builder/test/codegen-entry-templates.test.ts`（`production.ts` 的三份 preset 入口模板 + islands SSR 空壳插件）。
- **临时目录集成测**：在临时目录跑真实 Vite build 验证产出可执行。属慢集成测；ADR-0002 Decision 1 原意是归 e2e，但**现状刻意保留在单测层**（`packages/builder/test/production-build.test.ts`，0.86s）—— 理由见 ADR-0002「未按 ADR 字面执行的一处，明确保留」：它是全仓唯一的 build 侧端到端断言，移走等于把历史事故 #1 的盲区还给默认路径。
- **codegen 模块**：产出模板字符串（如生成的 server entry）的模块。`production.ts` / `virtual-modules.ts` 均属此类，其测试边界是**快照单测（显式断言形态）**；`production.ts` 里的**文件写入**部分（`generateVirtualModulesToDisk`、`writePresetWrapper`）是 IO 装配，不由字符串断言覆盖。

## 依赖形态

- **核心依赖形态**：扩展包对其核心库的依赖类型，三值：
  - **hard**：列入 `dependencies`，安装扩展即自动安装（如 `@ubean/integrations/pwa` 对 `vite-plugin-pwa`）。
  - **peer**：列入 `peerDependencies`，用户须自行安装。
  - **optional-peer**：列入 `peerDependencies` 且 `optional: true`。
- **传递硬依赖（transitive hard dependency）**：经 `dependencies` 链传递的硬依赖。ADR-0004 处理的 `ubean → @ubean/devtools → ai` 即此类。

## 页面路由

- **并行路由（Parallel Routes, P9-18）**：`@slotName/` 目录约定，同一路径下多个页面渲染到布局的不同命名插槽；虚拟模块按路径分组为 Vue Router named views（`components: { default, slotName }`），布局用 `<SlotView name="slotName" />` 渲染对应插槽。
  _Avoid_: 拦截路由（见下条，两回事）
- **拦截路由（intercepting routes）**：Next 专属的 `(.)` / `(..)` / `(...)` 目录约定，按 ADR-0010 及其 2026-09-17 补记判为**刻意不做**。扫描器扫到标记段**直接抛错**，不会静默降级成 `/feed/(.)photo/:id` 这种字面路径；对话框用并行路由自己实现（页面放 `src/pages/@dialog/…`，布局里用 `<SlotView name="dialog" />`，由导航守卫决定何时以对话框呈现）。
- **reuse 路由**：`xxx.reuse.ts` / `xxx.reuse.vue`。未显式声明 `cache` 时自动继承 target 的 `cache` 值，可显式 `cache: false` 关闭。
- **matcher 全局注册表**：`defineMatcher(name, fn)` 写入的进程单例（读口 `getMatcher` / `hasMatcher` / `listMatcherNames` / `clearMatchers`），服务端与客户端两侧都要注册。注册表挂在 `globalThis` 上——dev 的 SSR 图**内联** `ubean` 但**外部化** `@ubean/vue`，不挂全局就会拿到两份实例。

## 过程

- **blast radius（影响面）**：一次改动的真实波及范围。强调用 grep / `codegraph impact` 核查，而非凭文档措辞估计（见 ADR-0001 对 OPT-01 影响面的核查）。

## 文档内容分类

- **开发任务型内容（dev-task content）**：面向贡献者/开发者自身、以推进开发为目的的文档，归属根 `docs/`（仓库内部，中文）。判据见 ADR-0007。
- **架构说明性内容（architecture-explanation content）**：面向用户/评估者、以帮助理解与选型为目的的文档，归属 `apps/docs`（公开站点，中英双语）。
- **任务清单（task list）**：开发任务型文档里的 ID 表。全部完成后**删除正文**（git 留历史）；决策进 ADR，词汇进 glossary。别的产品（studio、SoybeanAdmin）的方案不进本仓 `docs/`。

## 产品规划

- **真缺口（real gap）**：缺失能力同时满足「用户习惯缺口或架构还债」以及「性能或差异化」。进入路线图任务 ID。对照 [docs/roadmap.md](roadmap.md)。
  _Avoid_: 竞品差距（过载：竞品有 ≠ 我们该做）
- **刻意不做（wontfix by positioning）**：竞品有、但按 ADR-0010 的「值得做」门槛判为不做。记录在路线图「刻意不做」表，不进任务队列。

## 渲染路径与渲染规则

- **直接渲染路径（direct render path）**：`mode: 'ssg'` 的构建期渲染方式，与 fullstack prerender 并列的两条路径之一。符号：`buildStaticSsgEntry()` / `renderStaticPage` / `createStaticSsgRenderer()`。
- **静态 entry（static entry）**：`buildStaticSsgEntry()` 代码生成的最小渲染 bundle（不含 Hono app / API 路由 / 中间件 / crons / IPX）。
- **fetcher 同构契约（fetcher contract）**：`(url) => { html, statusCode }` 返回形态。fullstack（`createSsrFetcher`）与 ssg（`createStaticSsgRenderer`）两条路径共用同一 `prerender()` 管线的关键接缝。
- **模板漂移（template drift）**：fullstack 与 static 两个 entry 模板各自演化导致水合结构不一致的风险。防法：`buildRendererSetup` / `buildAssetTagsSetup` 提取为共享函数，两变体引用同一份代码。
- **404 哨兵路由（not-found sentinel）**：`STATIC_NOT_FOUND_ROUTE` 假路由，入队渲染 `pages/404.vue` → `404.html`。
- **`routeRules.ssr` 三态**：`boolean | 'streaming' | 'data-only'`。`false` 跳过 loader，`'data-only'` 跑 loader 但 HTML 为 CSR shell；优先级 `definePage({ ssr })` > `routeRule.ssr` > 全局 `ssr.exclude` / `SsrOptions.streaming`。
- **`mode` 优先于 `ssr`**：`ssr` 只在 `mode: 'fullstack'` 下生效。判据是 `packages/builder/src/vite/build-app.ts` 与 `packages/builder/src/production.ts` 里同一行表达式 `ssrEnabled = (mode === 'fullstack' && config.ssr.enabled) || mode === 'ssg'` —— 即 `mode: 'spa'` / `'backend'` 下 `ssr: true` 被**静默忽略**（`spa` 产出静态客户端外壳 `public/index.html`、不产出 `server/entry.mjs`；`ssg` 走构建期渲染、与 `ssr` 开关无关）。所以「开 SSR」必须同时满足 `mode: 'fullstack'`。TS-14 的 `spa + ssr: true` 一格把这个口径钉在测试里。
- **`ppr`**：`routeRules` 的 `ppr: true` 是**强制流式 SSR + 预渲染发现**的别名（等价 `ssr: 'streaming'`，隐含 `prerender: true`），**不是** Next.js 式静态壳。
  _Avoid_: Partial Prerendering（字面误导：这里没有静态壳）

## 真理源与校验

- **真理源（source of truth）**：CI 校验时比对的标准。OPT-09 的真理源是 `packages/*/package.json` 的 `name` 字段（非目录名——`builder`≠`@ubean/build`、`ubean` 无 scope，目录名会误报）。OPT-07 的扩展集真理源是**派生**的（见 ADR-0005/0006）。
- **派生真理源（derived source）**：不从硬编码列表读，而从包的客观属性推导集合，避免「护栏列表」自身与被保护对象同病漂移。扩展集判据（`scripts/verify-packages.mjs`）：有 `./vite` 导出 **且** 不是主包 `ubean` **且** 不在主包 `dependencies` **且** 不在核心排除集（`CORE_VUE_VITE_PKGS`，含 `@ubean/vue`）。
- **存在性 + 计数检查**：OPT-09 的校验形态——读全部包名，断言每个出现在 AGENTS.md 且计数一致。不解析树结构（`├──`/`└──` 正则太脆），不生成清单文件。
- **强制 peer（mandatory peer）**：在 `peerDependencies` 且**非** `optional:true`，用户必须自行安装（如 `@ubean/pages`、`@ubean/markdown` 对 `vue`）。区别于 optional-peer（`optional:true`）与 hard（`dependencies` 自动装）。
  - 更正：`@ubean/integrations/ui` 的 `@vean/ui` 在 `packages/integrations/package.json` 中同时列入 `peerDependencies` 与 `peerDependenciesMeta`（`optional: true`），按定义属 **optional-peer**；`apps/docs/src/content/{zh,en}/contributing/engineering.md` 的「@vean/ui（强制）」与「peer（非 optional）」是错的，须在站点侧另行更正（不在本文件范围内）。
- **定规与首用**：OPT-11（约定文本）与 OPT-01（首个遵循该约定的样板 PR）的关系。**定规先行**——约定独立于代码 PR 先落地；首用随后。勿将 `codegraph impact` 输出塞入定规自身的非代码 PR（见 ADR-0005）。
- **dir≠name 不匹配**：包目录名与 `package.json` `name` 不一致的情况。当前恰好两处：`packages/builder`→`@ubean/build`、`packages/ubean`→`ubean`（无 scope）。CI 校验须用 name 字段否则误报。

## studio 开口契约

- **开口契约（studio opening contract）**：开源侧只承认的两条给 studio（独立私有仓）的外部接口，不排 studio 里程碑。RM-S01 = 稳定脚手架 CLI / `ubean/scaffold`（机器可读 catalog，`getScaffoldManifest()`）；RM-S02 = `.ubean/` 生成物契约（见 [docs/contracts/](contracts/)）。
- **契约冻结（contract freeze）**：把外部接口固化成带版本号的文档 + 机器可读产物（`contractVersion`），破坏性变更才升版本；`docs/contracts/` 即冻结记录。

## 国际化

- **翻译引擎（message engine）**：把 message key 变成字符串（插值、复数、链接文案、日期/数字格式）。ubean 采用 Intlify：Vue 侧 `vue-i18n`，非 Vue 侧 `@intlify/core`。
  _Avoid_: i18n（过载）、vue-i18n（仅指 Vue 插件层）
- **语言路由（locale routing）**：URL 如何携带 locale。策略名与 Nuxt 对齐（`prefix` / `prefix_except_default` / `prefix_and_default` / `no_prefix`），实现是 **约束前缀**（`compileLocalePaths`），不是 vue-i18n，也不是 Nuxt 的 `___locale` 路由名复制。
  _Avoid_: i18n routing（与翻译引擎混淆）
- **语言检测（locale detection）**：从 path / cookie / `Accept-Language` / `defaultLocale` 决定当前 locale，以及是否 302。检测顺序与 `redirectOn` 由框架中间件拥有。
- **语言实例（i18n instance）**：一次 Vue app 或一次 HTTP 请求持有的引擎状态（locale + messages）。反面是进程单例 `globalThis.__ubean_i18n_state__`（已废弃）。
  _Avoid_: 全局 i18n、i18n store
- **约束前缀（compact locale path）**：每个页面最多两条 path——默认语言的裸路径，加上 `/:locale(zh|ja)/path` 这种 **code 白名单** 前缀。Hono 与 vue-router 共用同一编译结果。
  _Avoid_: locale prefix duplication、Nuxt named route suffix
- **框架 setLocale**：加载目标语言文案、写 locale cookie、导航到对应语言 URL。不是 vue-i18n Composer 上直接赋值 `locale`。

## Vite 插件化

- **生命周期下放（lifecycle handoff）**：把 dev / build / preview 的流程控制权从 CLI 交给 Vite——`vite dev` / `vite build` / `vite preview` 成为一级命令，框架以 Vite 插件的身份接入（environments 注册、请求路由、构建编排、preview 接管）。`ubean dev|build|preview` 退为**薄别名**（仅参数解析、banner、logging 闸门，不做行为分叉）。
  _Avoid_: 迁移 CLI（过载：CLI 只让出三个生命周期命令，工程化命令仍归 CLI）
- **Vite 环境（Vite environment）**：Vite 6+ Environment API 的构建/运行单元。ubean 注册两个：`client`（`consumer: 'client'` → `dist/public`）与 `ubean`（`consumer: 'server'` → `dist/server`）。**不拆分独立的 `ssr` 环境**——那是框架无关框架（Nitro 服务 React/Vue/Solid）的需求，Vue 专属的 ubean 把 SSR 渲染器留在 server bundle 内。
- **环境服务（service environment）**：可作为独立 fetch 目标的服务端环境（Nitro 的 services 泛化）。ubean 只保留机制不做实现，作为"API 服务与 SSR 独立部署"的逃生口。
- **环境运行器（env runner）**：承载服务端模块执行的隔离运行时，由 `env-runner` 提供。ubean **不**绑定它的 `EnvRunner`，只声明用到的结构化最小面 `EnvRunnerLike`（`packages/builder/src/dev/dev-environment.ts`）：builder 不必为 dev 环境把 env-runner 拉进类型依赖。默认 `node-worker`（worker 线程），可选 `miniflare` / `vercel` / `netlify` 等平台保真 runner；该 worker 拓扑**尚未接入实际 dev 路径**（见该文件头注释）。
  _Avoid_: dev server（过载：dev server 指 Vite 的 HTTP server 本身）
- **开发宿主（dev host）**：Vite dev server 所在的进程。持有 `DevApp`（devtools、错误页、`/_openapi.json`、VFS）与路由匹配；未命中的请求经 `dispatchFetch` 分流。`DevApp` 定义在 `packages/builder/src/dev/dev-app.ts`，由 `packages/builder/src/vite.ts` 以 `type DevApp` 导出。
- **作用域化重载（scoped reload）**：服务端文件变更时只失效该文件及其 importer 的求值结果，其余模块保留单例与状态；仅 scan 目录增删才全量失效并重扫路由表。取代现状「任何服务端变更 → 全量 rescan + 重建 app + full-reload」。
- **资产-导航歧义（asset-navigation ambiguity）**：dev 下 catch-all 或未匹配的请求既可能是页面导航（→ 框架）、也可能是静态资产（→ Vite）。判据为显式路由优先，其余按 `Sec-Fetch-Dest` / 扩展名 / `?import` query / `Accept` 启发式分流。
- **构建期快照（build-time snapshot）**：`.ubean/virtual/*` 落盘文件的定位——供 preset 包装与调试读取，**不再**被 virtual id → 磁盘文件的 alias 映射依赖（虚拟模块由无状态插件提供）。

---

_术语按 ADR 沉淀整理：内容分类 ← ADR-0007；产品规划与拦截/并行路由 ← ADR-0010；SSG 渲染路径 ← ADR-0011；`routeRules.ssr`/`ppr` ← P9-03/P9-04；reuse 路由与 matcher ← `definePage`/Task 7 约定；studio 开口 ← RM-S01/RM-S02；i18n ← ADR-0009；Vite 插件化 ← ADR-0012；真理源与校验 ← ADR-0005/ADR-0006 及第二轮 grilling。决策与论证归各 ADR。_
