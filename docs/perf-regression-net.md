# ubean 性能回归网方案（先于 Vite 插件化）

> 开发任务型文档。门槛口径见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)（性能权重 25%）；服务对象见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)；用户向迁移说明见站点 [guide/vite-plugin-migration](../apps/docs/src/content/zh/guide/vite-plugin-migration.md)（RM-V 任务清单已随 RM-V36 收口，指针见 [roadmap.md](roadmap.md)）。**不写人天**。
>
> 方法来源：farm.js 性能工程实践（单变量开关 / 生效证明 / 前后数字三条纪律），适配 ubean 的进程级与端到端口径，**不照搬**其编译器级精度（见 §4.5、§7.3）。

## 1. 为什么先做这一步

三条论据，逐条对应源码与文档现状：

1. **ADR-0012 的性能收益没有判据。** ADR-0012 §3 明确列出「单次 builder 多环境取代两次独立 build；reload 粒度从全量降到文件级」两条性能主张，但任务清单与验收矩阵里没有任何性能维度：迁移任务的 RM-V23 当时只把 `scripts/benchmark-ssg.mjs` 当作「能跑通」的验收工具（无阈值）；RM-V05 回归网定义为纯功能断言（中间件顺序、SSR HTML 注入、页面 404 vs API 404、`/_devtools` 302、`/_openapi.json`）。
2. **风险 R3 的缓解建立在未测量的基线上。** R3 写的是「作用域化重载必须 ≥ 现状（现状为全量 rescan + full-reload）」。但「现状」从未被测量——`≥` 一个不存在的数字无法判定。
3. **机会窗口是唯一的。** RM-V36（双轨收敛）会删除 CLI 旧路径。迁移之后，回到旧实现测一次将永久不可能。基线必须在 Phase 0 于旧实现上冻结。

结论：本方案是 5.5 的**硬前置**（与 RM-V05 / RM-V06 并列），但可独立合入，不产生任何行为变更。

## 2. 立项时的现状（对照源码）

| 设施 | 位置 | 覆盖 | 边界 |
| --- | --- | --- | --- |
| 客户端 JS 体积预算 | `packages/cli/src/analyze-lib.ts`；CI `.github/workflows/ci.yml:57-60` | `totalGzip` / `entryGzip` 相对 committed 基线 +5% 即失败；per-chunk `entries` 同时驱动 per-chunk 绝对上限与「基线有、当前无」的缺 chunk 判据（`analyze-lib.ts:181`） | 仅 gzip；单一 fixture；相对口径为主，绝对上限 opt-in |
| 构建 / prerender 基准 | `scripts/benchmark-ssg.mjs`（`pnpm benchmark:ssg`） | ssg vs fullstack 的 wall / prerender / 单路由 / peakRss | 手动启用；无断言；只报中位数且样本不落盘；对比「同版本两 mode」而非迁移前后 |
| dev 启动 / 变更生效 / 浏览器运行时 | — | 无 | 本方案补齐（RM-P01 / P03 / P07） |

补充事实：示例侧 `examples/ubean-test/vitest.config.ts` 是 `environment: 'node'`（无浏览器测试）；根 `vite.config.ts` 已启用 browser mode（chromium / playwright，`test/browser/**/*.e2e.spec.ts`，2026-08-02 起）。

### 2.1 路径语义与 watcher 注册（旧路径实测，结论已固化）

- **旧实现语义**：服务端模块图**按文件失效**（无关模块实例保留）**+ 浏览器整页刷新**，不是 R3 原文的「全量 rescan + full-reload」；RM-V13 / RM-V28 的「保留单例」是**不得倒退的行为**，判据 5/5（`perf-baseline.json` 的 `reloadScope`）。
- **路径拼接必须避免**：CLI 侧曾把绝对 `srcDir` 再 `join(cwd, dir)`（`path.join` 遇绝对路径不重置），`fs.watch` 全 ENOENT 且异常被吞 —— 症状是「服务端改动不生效、看起来必须重启」。判据一律用绝对路径（注释在 `packages/builder/src/dev/dev-scan.ts:144-146`），`packages/cli/src/dev.ts` 现走 `onScan`（`:159`、`:190`）。
- **规则**：失败不许静默（都失败必须 warn）；监听范围 = 目录 + `locales` + 入口文件；回归测试在 `packages/builder/test/dev-scan.test.ts` 与 `packages/cli/test/dev-reload.test.ts`。

## 3. 度量对象与口径

in-scope 四项耗时指标 + 一项正确性对照。定义必须可复现、可归因：

| 指标 | 定义 | 采集方式 | 任务 |
| --- | --- | --- | --- |
| dev 冷启动 | spawn dev 命令 → 首个 SSR 页面响应 200 的墙钟 | 子进程 + 端口轮询就绪（自动适配 dev 只绑 `[::1]`） | RM-P01 |
| 变更生效 · 服务端 | 写入 API 路由 → `GET` 响应出现新值的墙钟 | 文件写入 + HTTP 轮询断言标记 | RM-P01 |
| 变更生效 · 客户端 | 写入客户端模块 → 该模块被重新转换并在模块请求中返回新内容的墙钟 | 文件写入 + 轮询模块端点（不依赖 Vite stdout 日志：实测无浏览器连接时一条都不打印）。**改文件前必须先请求一次该模块预热**，否则「改后第一次请求」本来就没有转换缓存可比，测到的是首次请求耗时而非失效传播耗时 | RM-P01 |
| build 墙钟 | build 命令墙钟 | 子进程计时 | RM-P01 |
| build CPU 时间 | build 进程树累计 CPU（user+sys） | `ps` 采样逐 pid 取最大值求和（50ms） | RM-V23（2026-09-16 追加） |
| build 峰值 RSS | 构建进程树 RSS 峰值 | `psSnapshot` / `treeRssKB`（50ms 轮询求和） | RM-P01 |
| reload 正确性 | 变更后**无关模块**的实例状态是否保留（是 / 否，非耗时） | 探针路由（`examples/ubean-test/src/routes/api/perf-probe.ts`）暴露模块级实例标识，改无关文件触发 reload 前后各读一次；仅在本次变更已生效时判读（否则是假阴性） | RM-P04 |
| 浏览器 · 首个岛屿水合 | 导航到 `/islands-test` → 第一个岛屿带上 `data-hydrated` 的墙钟（页面时钟，timeOrigin 即导航起点） | 真实 Chromium：init script 在页面脚本前挂 `attributeFilter: ['data-hydrated']` 的观察者。取「第一个」而非「全部」：页面上刻意混用 idle / visible 指令，等全部会把 2s idle 超时算进来 | RM-P07 |
| 浏览器 · 站内导航 | 首页点击 `<Link to="/about">` → `/about` 根元素挂载的墙钟 | 真实 Chromium：`page.click` + `waitForSelector('.about')`。含 Playwright 往返的常量偏差（数毫秒）；整页刷新同样能正常结算 | RM-P07 |

**不计入**：函数级微基准（口径是进程级与端到端）、CI runner 之间的横向比较（机器不同无意义）。

## 4. 方法

### 4.1 单变量开关

同一 fixture、同一份源码，唯一变量是被测改动本身（迁移期曾以 `experimental.viteBuilder` 作隔离开关，该开关已随 RM-V36 收敛删除；现在两臂是**同一条生命周期下的两个入口** —— `ubean dev|build` 与 `vp dev|build`，差值反映入口开销而非实现差异）。任何时间差只能归因于被测改动，排除「换 fixture / 换机器 / 换依赖」的干扰。

### 4.2 生效证明（防 baseline-vs-baseline）

采集前断言被测路径确实接管：environments 已注册、单次 `createBuilder` 调用、worker 内 `ModuleRunner` 生效。断言失败即整个基准失败。

这条不是洁癖：R6（双轨期行为分叉：用户 config vs CLI 注入）会让开关静默失效，此时两边跑的其实都是旧路径，数字接近，会得出「迁移无性能变化」的**错误结论**。

### 4.3 统计口径

warmup + N 次迭代；报 p50 / p95（单次中位数掩盖长尾与抖动）；原始样本落盘供事后复查与换口径；`--iterations` 覆盖迭代数；输出记录 Node 版本、平台、机器标识。

### 4.4 不做 CI 阻塞门禁

GitHub 共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性，最终结局是被绕过或放宽。定位是「可复现的本地 / 定期基准 + 迁移前后的对照证据」。CI 只保留体积预算——它是确定性的。

**周期性趋势（RM-P24）**：`scripts/benchmark-trend.mjs` + `.github/workflows/nightly-perf.yml` 每天把一次基准的点追加进 `.temp/perf-trend.jsonl`（用 `actions/cache` 跨运行累积，故是滚动窗口），并渲染「与上一次」「与 committed 基线」两张对比表贴到 job summary。**它不设阈值、不因数值变化失败**（退出码恒 0），也不在 `ci.yml` 里（`on` 无 `pull_request`）—— 这是「PR 门禁中无性能阻断」的机器判据，由 `packages/cli/test/benchmark-trend.test.ts` 守着。一处必须注意的设计：committed 基线在 darwin/arm64 上采、nightly 在 ubuntu EPYC 上跑，`compareMetrics` 会先比对 `platform`/`arch`/`cpuModel`，不同则标 `comparable: false` 并写明差异字段（数字仍给出但整体标不可比）—— 不做这道判定，趋势就是本节说的那部假阳性制造机。

### 4.5 不做编译器级精度

farm.js 用 MutationObserver 捕获 DOM 写入完成时刻（替代受帧量化的 rAF）+ CDP Performance domain 取 CPU，是为其约 22k 行的 AOT React 编译器准备的高风险优化护栏。ubean 当前没有对应量级的编译期优化对象；等真有（如 Vapor 类编译优化）再升级到该精度（RM-P07 保留入口）。

## 5. 任务清单

> 状态标记：✅ 完成 ｜ 🟡 部分达成（缺口见「完成定义」列）｜ 🔜 已解除阻塞（可开始，尚未实施）｜ ⏳ 顺延 / 未开始（原因见说明）。
>
> **保留策略**：按仓库策略（[README.md](README.md)：任务清单落地后删除正文，决策留在 ADR，词汇留在 glossary），本文件不保留历史行、不作为历史日志 —— 它仍在，只因 §3 口径、§4 方法与 §5 的完成定义 + 基线数字没有第二处落点。

### Phase 0 · 度量地基（无行为变更，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P01** ✅ | 生命周期基准脚本 | 新增 `scripts/benchmark-lifecycle.mjs`（度量原语抽到 `scripts/lib/metrics.mjs`）：`--toggle <arm>`（臂名只有 `cli` / `vite`，未知名字直接抛错）单变量切换；采集 dev 冷启动、变更生效（服务端 HTTP 轮询 / 客户端模块端点轮询）、build 墙钟与峰值 RSS | `pnpm benchmark:lifecycle` 可跑；输出表格 + `--json`；`--fixture` 可换项目；`--skip-dev` / `--skip-build` 可分段 |
| **RM-P02** ✅ | 生效证明 | `vite` 臂跑 **`vp dev`（无 CLI 参与）**：请求路由与宿主 app 只可能来自插件，数字必然出自插件路径；启动后 `assertEngaged(baseUrl)` 断言 `/` 真的返回 SSR 页面（`class="home"`），否则中止而不是产出假对比。每次迭代都执行，因此「两臂跑同一路径」无法悄悄发生 | 两臂均可跑通并各自观测 3/3；`vite` 臂的冷启动 1.63s、服务端变更 222–328ms、客户端变更 105ms、reload 单例保留 3/3 —— 与 `cli` 臂同量级 |
| **RM-P03** ✅ | 统计口径 | `scripts/lib/metrics.mjs` 提供 `summarizeSamples` / `quantile`；warmup + N 迭代、p50 / p95、原始样本与运行环境（Node / 平台 / CPU / 内存）落盘；`--runs` / `--warmup` 覆盖 | 样本文件含全部原始值；报告含 p50 / p95；`benchmark-ssg.mjs` 口径不受影响（未改动） |
| **RM-P04** ✅ | reload 正确性对照 | 探针路由 `examples/ubean-test/src/routes/api/perf-probe.ts` 暴露模块级实例标识；基准脚本在服务端变更前后各读一次，复用同一次 reload 而不额外制造重载；仅在本次变更已生效时判读（防假阴性） | **旧实现结论：保留**（5/5：实例标识不变、进程未重启、模块重新求值 0 次）——即服务端模块图本就按文件失效。整改后必须仍为「保留」；若变为「重新求值」即为 R3 所指的倒退 |

### Phase 1 · 基线冻结（Phase 1 dev 迁移的硬前置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P05** ✅ | 旧实现基线冻结 | `examples/ubean-test/benchmarks/perf-baseline.json` 在旧路径上产出（warmup 1 + 5 次，Node v24.21.0 / darwin-arm64 / Apple M1 Max）；§2.1 的 watcher 缺陷修复后重采，七项指标 + reload 正确性全部有结论 | p50 / p95：dev 冷启动 1.69s / 1.70s、首个岛屿水合 155ms / 166ms、站内导航 121ms / 125ms、服务端变更 222ms / 223ms、客户端变更 106ms / 107ms、build 墙钟 1.62s / 1.64s、峰值内存 608.9MB / 616.2MB；四项观测率均 5/5，reload 单例保留 5/5。R3 与 RM-V13 / V15 / V23 引用该文件 |

**Phase 1 复测（已归档）**：RM-V10 / RM-V15 / RM-V23 期间各采一次，**未出现可观测倒退**；committed 基线不动（绑定旧路径 + warmup 1 / 5 次），过程与原始样本随 git 历史保留（`git log -p scripts/benchmark-lifecycle.mjs examples/ubean-test/benchmarks/`）。build 臂同构跑 **`pnpm exec vp build`** 自证生效（无 CLI，服务端 bundle 与预渲染 HTML 只可能来自插件），`assertBuildEngaged` 断言 `dist/manifest.json` + `dist/server/` + 预渲染 HTML；两臂命令不同（含 `pnpm exec` 派发），报告脚注明示。

### Phase 2 · 体积闸门升级（与迁移解耦，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P06** ✅ | 体积闸门绝对上限 | `analyze-lib.ts` 新增 `BundleBudgetOptions`（`maxTotalGzip` / `maxEntryGzip` / `maxChunkGzip`，字节）与 `BundleBudgetViolation`；`summarizeBundle` 增加 brotli；CLI 新增 `--max-total-kb` / `--max-entry-kb` / `--max-chunk-kb`（kB） | 超限失败信息含 chunk 名与实测值（实测：`4 chunk(s) exceed the absolute budget 5.0 kB: assets/app-*.js 46.2 kB, …`）；相对 5% 门禁与 `analyze:check` 行为不变；新增 3 个单测。**上限已启用**：`examples/ubean-test/package.json` 的 `analyze:check` 传 `--max-total-kb 180 --max-entry-kb 64 --max-chunk-kb 48`，CI 调该脚本（见 §8.4） |
| **RM-P23** ✅ | 缺 chunk 判据（防「少产出」） | `analyze-lib.ts:181` 在体积上限之外**按名字对照基线 chunk 名单**（内容哈希规范化后比较）：基线里存在、当前产物里没有即失败，且与「超限」用不同措辞抛出（`client JS budget check failed` vs `exceeded`），避免把缺失误读成体积超标 | `analyze:check` 能拦下「体积变小但功能被静默砍掉」的回归（由 `packages/cli/test/analyze.test.ts:64,94` 两条用例保证：一条构造「体积变小但缺 chunk」并断言被拦下，一条断言重命名不误报） |

### Phase 3 · 浏览器运行时（可选，后置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P07** ✅ | 运行时延迟测量 | `scripts/lib/browser-metrics.mjs` + 基准脚本的浏览器阶段：臂内启一次真实 Chromium、跨迭代复用；采水合与导航两项。**偏离说明**：没有走 `@vitest/browser`（那是组件测试通道），端到端测量直接用 Playwright；两者都已在根 `devDependencies`。浏览器不可用时记 note 并跳过，不阻塞服务端指标 | 两项指标各有 p50 / p95（实测：首个岛屿水合 155ms / 166ms、站内导航 121ms / 125ms，观测率均 5/5）。首个岛屿所走路径包含 islands 首次 mount 的双 rAF 调度（间接覆盖，未单独插桩）。不进 CI 阻塞 |

### Phase 4 · 纪律与文档

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P08** ✅ | 纪律条款与文档 | `AGENTS.md` §9 增加两条 benchmark 命令；站点 `contributing/engineering.md`（中英）新增「13. 生命周期性能基准」并补绝对上限用法与性能主张纪律；`docs/README.md` 索引本文件 | 文档与实现一致；纪律条款可被 PR 直接引用 |
| **RM-P24** ✅ | 周期性基准趋势 | `scripts/benchmark-trend.mjs`（趋势点提取 + JSONL 追加 + 可比性判定 + markdown 渲染）+ `.github/workflows/nightly-perf.yml`（每天 19:00 UTC + `workflow_dispatch`，**不进 PR 门禁**）+ 根 `benchmark:trend` script | nightly 产出趋势；PR 门禁中无性能阻断。见 [test.md](test.md) TS-26 |

## 6. 与 Vite 插件化迁移（RM-V）的接口

| 位置 | 现在 | 本方案落地后 |
| --- | --- | --- |
| Phase 0 硬前置 | RM-V05 + RM-V06 | 追加 RM-P01–P05（性能侧） |
| R3 缓解 | 「作用域化重载必须 ≥ 现状（现状为全量 rescan + full-reload）」 | 「≥ `perf-baseline.json` 的 p50」 |
| R4 | 体积基线 5% 门禁 | 不变；RM-P06 以绝对上限作为补充，不替换相对门禁 |
| RM-V13 完成定义 | 「变更后 reload 行为不劣于 RM-V05 基线」 | 追加「变更生效延迟 p50 不劣于 RM-P05 基线」 |
| RM-V15 完成定义 | 「全绿；DX 无倒退」依赖手工清单 | 追加「性能不劣于 RM-P05 基线」 |
| RM-V23 完成定义 | 引用 `scripts/benchmark-ssg.mjs` | 改为引用泛化脚本 + p50 / p95 对照基线 |
| 验收矩阵「回归」行 | 功能测试集 + `pnpm typecheck` | 追加「性能对照 RM-P05 基线」 |
| 依赖图 | Phase 0（RM-V01…V06） | Phase 0（RM-V01…V06 + RM-P01…P05） |

## 6.1 门禁的盲区：只看增长，看不见「少产出」

相对门禁只守「比基线**增长** ≤5%」，**产物变小反而算通过**，「功能被静默砍掉」的回归因此能溜过去；RM-P23 已补判据：按名字（哈希规范化）对照基线 chunk 名单，基线有、当前没有即失败，措辞与「超限」区分。（判据动机是实测的岛屿注册表回归：注册表内容取决于模块转换顺序，页面惰性加载让构建期注册表为空 —— 注册表 `load` 见 `packages/islands/src/vite.ts:1384-1385`，转换期更新见 `:1525-1526`；修法已落地为 `buildStart` 预扫描 `:1284-1296`。）

**操作陷阱**：`pnpm analyze` 会覆写 `examples/ubean-test/benchmarks/bundle-baseline.json`（`--out` 默认指向它）—— 只看一眼时改指临时路径，或事后 `git checkout` 还原。

## 6.2 第二类盲区：门禁看不见「产物内容错了」

体积门禁「看不见少产出」与清单比对「看不见内容」是同一件事的两面：`virtual:ubean-asset-manifest` 曾因提供者 ref 恒为 `null` 却抢先解析，在生产 HTML 里内联空产物（无入口 `<script>`、无样式表），而**所有门禁全绿**。**产物的正确性需要内容级断言**：RM-V23 矩阵基线格已补两条（必须有预渲染 HTML；服务端产物必须内联客户端入口 script）；同批的 `prerender.staticDir` 不跟随 `build.outputDir` 已在 [站点迁移指南](../apps/docs/src/content/zh/guide/vite-plugin-migration.md) 更正。

## 6.3 宿主满载时的口径：CPU 时间

- **CPU 时间是满载环境下可比的指标**：build 阶段采进程树累计 CPU（`ps` 每 50ms 采样，逐 pid 取最大累计值再求和，避免丢掉已退出子进程的消耗）；宿主 `load` 高时墙钟误差与待测差异同阶。CPU 没有冻结基线可比（`perf-baseline.json` 只有墙钟，旧路径已随 RM-V36 删除），跨实现对照须在安静环境重跑 `cli` 臂并与 1.62s 墙钟对照。
- **每臂 build 前 `rm -rf dist`**：两条路径都设 `emptyOutDir: false`，`analyze` 又按目录统计，臂间残留会让体积结论失真。
- **`NODE_ENV` 必须固定**：`NODE_ENV=test` 时 Vite 尊重该显式值（`mode: 'production'` 不覆盖），客户端产物打进 Vue 开发态代码，同一示例 entry gzip 从 45.2 kB 涨到 75.9 kB；`ubean build` 已在非 production 时警告，详见 [站点迁移指南](../apps/docs/src/content/zh/guide/vite-plugin-migration.md)。

## 7. 明确不做

1. **不做 CI 阻塞式性能门禁**（体积预算除外，它是确定性的）——共享 runner 噪声导致假阳性，最终会被跳过或放宽。
2. **不引入完整 benchmark 框架**（vitest bench / tinybench / hyperfine）——指标是进程级与端到端，不是函数级微基准；现有子进程 + `ps` 的采集方式够用。
3. **不照搬 farm.js 的编译器级精度**（MutationObserver + CDP Performance domain）——留给 RM-P07，且仅在有对应优化对象时升级。
4. **不做 per-page 体积预算**——ubean-test 是单一 fixture，per-page 预算在拥有多页面 fixture 前收益有限；RM-P06 只做 per-chunk 与绝对上限。
5. **不把性能数字写进公开站点**——口径依赖机器；站点只写可复核的命令与基线文件（沿用 RM-U07 的反向要求：禁止无数字的「更轻」，也禁止无环境的「更快」）。

## 8. 验收

1. Phase 0 结束（dev 迁移 Phase 1 开始前）：`perf-baseline.json` 已 committed，且在旧实现上可重复产出（同机两次跑的 p50 差异落在声明区间内）。
2. 生效证明有反例测试：臂未真正接管时基准必须失败（实测：不带生效条件的 `vp build` 直接硬失败）；reload 正确性同样只在本次变更已生效时判读（否则「实例保留」是假阴性）。
3. Phase 1 / Phase 2 每个 PR 的验收引用 RM-P05 基线数字，不接受定性的「感觉没变慢」。
4. 迁移全程 `analyze:check` 保持绿。RM-P06 的绝对上限**已启用**：`examples/ubean-test/package.json` 的 `analyze:check` 传 `--max-total-kb 180 --max-entry-kb 64 --max-chunk-kb 48`，CI 的 `Client JS budget` 步骤调该脚本，与相对 5% 门禁、RM-P23 缺 chunk 判据**三者并存**。数值是**宽松阈值**（只挡数量级异常）：committed 基线为 total 118.1 kB / entry 43.3 kB / 最大 chunk 27.3 kB，上限给出约 1.5–1.8× 余量 —— 挡得住「产物从 0 涨到很大但基线被一起改大」这类相对门禁看不见的事故（历史事故 #2「体积门禁全绿但产物空」），又不会把正常的 5% 增长也拦掉。上限数值与余量的自洽由 `packages/cli/test/analyze.test.ts` 的 `TS-23 · 绝对上限已启用` 四条用例守着（含「去掉 `--max-*-kb` 即红」「配得形同虚设即红」「配得过紧即红」「CI 步骤跑的就是该脚本」）。
5. （历史）RM-V36 收敛前最后一次在旧路径上跑基准并归档 —— 该动作已完成：RM-V36 已落地、旧路径已删除，`perf-baseline.json` 是旧实现唯一留存的口径。
