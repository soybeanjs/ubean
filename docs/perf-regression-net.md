# ubean 性能回归网方案（先于 Vite 插件化）

> 开发任务型文档。门槛口径见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)（性能权重 25%）；服务对象见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md) 与 [vite-plugin-migration.md](vite-plugin-migration.md)。**不写人天**。
>
> 方法来源：farm.js 性能工程实践（单变量开关 / 生效证明 / 前后数字三条纪律），适配 ubean 的进程级与端到端口径，**不照搬**其编译器级精度（见 §4.5、§7.3）。

## 1. 为什么先做这一步

三条论据，逐条对应源码与文档现状：

1. **ADR-0012 的性能收益没有判据。** ADR-0012 §3 明确列出「单次 builder 多环境取代两次独立 build；reload 粒度从全量降到文件级」两条性能主张，但任务清单与验收矩阵里没有任何性能维度：`vite-plugin-migration.md` 的 RM-V23 只把 `scripts/benchmark-ssg.mjs` 当作「能跑通」的验收工具（无阈值）；RM-V05 回归网定义为纯功能断言（中间件顺序、SSR HTML 注入、页面 404 vs API 404、`/_devtools` 302、`/_openapi.json`）。
2. **风险 R3 的缓解建立在未测量的基线上。** R3 写的是「作用域化重载必须 ≥ 现状（现状为全量 rescan + full-reload）」。但「现状」从未被测量——`≥` 一个不存在的数字无法判定。
3. **机会窗口是唯一的。** RM-V36（双轨收敛）会删除 CLI 旧路径。迁移之后，回到旧实现测一次将永久不可能。基线必须在 Phase 0 于旧实现上冻结。

结论：本方案是 5.5 的**硬前置**（与 RM-V05 / RM-V06 并列），但可独立合入，不产生任何行为变更。

## 2. 现状（对照源码）

| 设施 | 位置 | 覆盖 | 边界 |
| --- | --- | --- | --- |
| 客户端 JS 体积预算 | `packages/cli/src/analyze-lib.ts`；CI `.github/workflows/ci.yml:45-48` | `totalGzip` / `entryGzip` 相对 committed 基线 +5% 即失败 | 仅 gzip；per-chunk `entries` 已落盘但**不参与判定**；单一 fixture；相对口径 |
| 构建 / prerender 基准 | `scripts/benchmark-ssg.mjs`（`pnpm benchmark:ssg`） | ssg vs fullstack 的 wall / prerender / 单路由 / peakRss | 手动启用；无断言；只报中位数且样本不落盘；对比「同版本两 mode」而非迁移前后 |
| dev 启动 / 变更生效 / 浏览器运行时 | — | 无 | — |

补充事实：`examples/ubean-test/vitest.config.ts` 是 `environment: 'node'`，仓库内无 browser mode 测试；根 `devDependencies` 已含 `@vitest/browser` + `@vitest/browser-playwright`（基建在，未启用）。

### 2.1 首次实测发现：dev 服务端变更不生效（已定位并修复）

RM-P01 首次运行时，旧路径上 **dev 下服务端文件变更完全不生效**：改 `src/routes/api/hello.ts` 后 `GET /api/hello` 在 10s / 60s 内均不反映新值（就地写入与原子替换各测一次），新增路由文件持续 404，日志里也没有重新扫描行。Vite 自身 watcher 有反应（`[vite] page reload ...`），所以浏览器仍会刷新 —— 症状看起来像「必须重启 dev server」。

**根因（路径被拼接两次）**：

1. `packages/config/src/loader.ts` 解析配置时把 `srcDir` 变成绝对路径（`resolve(cwd, srcDir)`）；
2. `packages/cli/src/dev.ts` 因此传入绝对目标：`dirs: watchDirs.map(d => \`${config.srcDir}/${d}\`)`；
3. `createDevWatcher` 的 `start()` / `addDir()` 又做了一次 `join(cwd, dir)`。`path.join` 遇到绝对路径段**不会重置**、只会继续追加 —— 监听目标变成 `<cwd><cwd>/src/<dir>`，`fs.watch` 全部 ENOENT，而 `watchDir` 的空 `catch` 把它静默吞掉。

结果：**注册成功的 watcher 数为 0**，任何服务端改动都不触发 rescan。

**证据**：用 `NODE_OPTIONS=--require` 注入包装 `fs.watch` 的探针（配合 `module.syncBuiltinESMExports()` 让 ESM 命名导入看到补丁），启动 dev 后拿到 7 行 `<cwd>/<cwd>/src/*` 的 ENOENT；把重复前缀剥掉后 `src/pages`/`src/middleware`/`src/layouts`/`src/routes` 注册成功，改 API 路由约 500ms 生效并打出完整链路 `File change detected → Found 62 API routes → Reloading → Reloaded` —— 说明 `rescan()` / `runner.reload()` 本身健康，故障只在注册环节。

**范围**：CLI dev 路径独有。`packages/builder/src/vite.ts` 的 watcher 用 `resolve` 处理且带有这个坑的注释（"join 会把绝对路径追加到 rootDir 后"），未受影响；该拼接写法自 2026-07-25 的那次迁移就存在，不是近期回归。

**修复**：`watcher.ts` 新增 `resolveTarget()`（绝对路径直接用、相对路径才 join cwd），`start()` 与 `addDir()` 统一走它；失败不再静默 —— 新增 `onError` 回调，由 `dev.ts` 预过滤不存在的可选目录（`src/plugins` 等）后把真实错误打成 warn，并在「一个都没注册成功」时额外警告。回归测试 `packages/cli/test/dev-watcher.test.ts`（旧代码下 `count() === 1` 断言失败，即零 watcher 症状）。顺带补上两处监听覆盖：`locales` 目录（与 builder 侧一致：此前语言文件改动不触发 rescan），以及**入口文件**（`app.ts` / `app.vue` / `server.ts` 等，取自扫描器的检测结果；此前改它们完全不触发 rescan，因为监听列表只认目录名）。

**修复后基线（RM-P05）**：服务端变更 **220ms**（p95 222ms，5/5 观测）、客户端变更 **8ms**（p95 9ms，5/5）、reload 后**单例保留 5/5**（模块重新求值 0，进程重启 0）。修复前的两次采集这两项变更指标为「未观察到」，故当前 committed 基线以修复后数据为准。

**R3 前提的完整修正（RM-P04 实测）**：旧实现的真实语义是「**服务端模块图按文件失效**（无关模块实例保留）**+ 浏览器整页刷新**」，而不是文档写的「全量 rescan + full-reload」—— 服务端从没做过「全量重新求值」。这对 5.5 的含义是：RM-V13 / RM-V28 的「保留单例状态」**不是要新增的能力，而是不能倒退的行为**，基线已把判据固定为 5/5。浏览器侧整页刷新来自 `dev.ts` 的时序注释（本轮未在浏览器中实测，仅服务端模块实例是实测值）。

**遗留给 5.5 的后果**：`vite-plugin-migration.md` 风险 R3 原文写的「现状为全量 rescan + full-reload」与实测不符 —— 实测是「完全没有重载」。修复后 R3 的对照口径应为基线里的 221ms，而不是旧实现的「全量重载」。

### 2.2 客户端变更指标的度量陷阱（RM-V10 复查时发现并修复）

在 RM-V09 / RM-V10 之后复查基线时，客户端变更一度报出 **4.7ms**（基线 106ms）。就地测量（起 dev server → 请求模块 → 写入 → 每 20ms 轮询）得到的是 **~130ms**，与基线一致，说明 4.7ms 是指标退化而非真实提速。

**根因**：`measureClientChange` 原本是「先写文件、再轮询模块端点」。跳过浏览器臂时，那个模块在**客户端**环境里从没被转换过，改后第一次请求本就无缓存可比，于是立刻拿到新内容 —— 测到的是「首次请求耗时」而不是「失效传播耗时」。基线采集时恰好跑了浏览器阶段（Chromium 加载首页 → 拉客户端入口 → `src/app.ts` 已被转换并缓存），把缺口掩盖了。

**修复**：改文件前先请求一次模块做预热（并断言预热响应不含本轮标记，否则说明上一轮还原未生效，该轮直接记为无效并进 notes），预热失败同样记 reason 进 notes 而不是静默出一个漂亮数字。修复后 `--skip-browser` 采集回到 105ms，与基线可比。

**教训**：这类「没有缓存反而更快」的度量很容易被当成优化收益读走。带状态缓存的行为型指标必须显式建立「被测量的前提状态」（这里是「模块已进入转换缓存」），否则跳过一个采集阶段就会悄悄换掉度量对象。

## 3. 度量对象与口径

in-scope 四项耗时指标 + 一项正确性对照。定义必须可复现、可归因：

| 指标 | 定义 | 采集方式 | 任务 |
| --- | --- | --- | --- |
| dev 冷启动 | spawn dev 命令 → 首个 SSR 页面响应 200 的墙钟 | 子进程 + 端口轮询就绪（自动适配 dev 只绑 `[::1]`） | RM-P01 |
| 变更生效 · 服务端 | 写入 API 路由 → `GET` 响应出现新值的墙钟 | 文件写入 + HTTP 轮询断言标记 | RM-P01 |
| 变更生效 · 客户端 | 写入客户端模块 → 该模块被重新转换并在模块请求中返回新内容的墙钟 | 文件写入 + 轮询模块端点（不依赖 Vite stdout 日志：实测无浏览器连接时一条都不打印）。**改文件前必须先请求一次该模块预热**，否则「改后第一次请求」本来就没有转换缓存可比，测到的是首次请求耗时而非失效传播耗时（详见 §2.2） | RM-P01 |
| build 墙钟 | build 命令墙钟 | 子进程计时 | RM-P01 |
| build 峰值 RSS | 构建进程树 RSS 峰值 | `psSnapshot` / `treeRssKB`（50ms 轮询求和） | RM-P01 |
| reload 正确性 | 变更后**无关模块**的实例状态是否保留（是 / 否，非耗时） | 探针路由（`examples/ubean-test/src/routes/api/perf-probe.ts`）暴露模块级实例标识，改无关文件触发 reload 前后各读一次；仅在本次变更已生效时判读（否则是假阴性） | RM-P04 |
| 浏览器 · 首个岛屿水合 | 导航到 `/islands-test` → 第一个岛屿带上 `data-hydrated` 的墙钟（页面时钟，timeOrigin 即导航起点） | 真实 Chromium：init script 在页面脚本前挂 `attributeFilter: ['data-hydrated']` 的观察器。取「第一个」而非「全部」：页面上刻意混用 idle / visible 指令，等全部会把 2s idle 超时算进来 | RM-P07 |
| 浏览器 · 站内导航 | 首页点击 `<Link to="/about">` → `/about` 根元素挂载的墙钟 | 真实 Chromium：`page.click` + `waitForSelector('.about')`。含 Playwright 往返的常量偏差（数毫秒）；整页刷新同样能正常结算 | RM-P07 |

**不计入**：函数级微基准（口径是进程级与端到端）、CI runner 之间的横向比较（机器不同无意义）。

## 4. 方法

### 4.1 单变量开关

同一 fixture、同一份源码，唯一变量是 `experimental.viteBuilder`（[ADR-0012 §R7](adr/0012-vite-plugin-first-lifecycle.md) 已定义该隔离开关）。任何时间差只能归因于被测改动，排除「换 fixture / 换机器 / 换依赖」的干扰。

### 4.2 生效证明（防 baseline-vs-baseline）

采集前断言被测路径确实接管：environments 已注册、单次 `createBuilder` 调用、worker 内 `ModuleRunner` 生效。断言失败即整个基准失败。

这条不是洁癖：R6（双轨期行为分叉：用户 config vs CLI 注入）会让开关静默失效，此时两边跑的其实都是旧路径，数字接近，会得出「迁移无性能变化」的**错误结论**。

### 4.3 统计口径

warmup + N 次迭代；报 p50 / p95（单次中位数掩盖长尾与抖动）；原始样本落盘供事后复查与换口径；`--iterations` 覆盖迭代数；输出记录 Node 版本、平台、机器标识。

### 4.4 不做 CI 阻塞门禁

GitHub 共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性，最终结局是被绕过或放宽。定位是「可复现的本地 / 定期基准 + 迁移前后的对照证据」。CI 只保留体积预算——它是确定性的。

### 4.5 不做编译器级精度

farm.js 用 MutationObserver 捕获 DOM 写入完成时刻（替代受帧量化的 rAF）+ CDP Performance domain 取 CPU，是为其约 22k 行的 AOT React 编译器准备的高风险优化护栏。ubean 当前没有对应量级的编译期优化对象；等真有（如 Vapor 类编译优化）再升级到该精度（RM-P07 保留入口）。

## 5. 任务清单

> 状态标记：✅ 完成 ｜ 🟡 部分达成（缺口见「完成定义」列）｜ 🔜 已解除阻塞（可开始，尚未实施）｜ ⏳ 顺延 / 未开始（原因见说明）。标记随实施更新，不删行。

### Phase 0 · 度量地基（无行为变更，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P01** ✅ | 生命周期基准脚本 | 新增 `scripts/benchmark-lifecycle.mjs`（度量原语抽到 `scripts/lib/metrics.mjs`）：`--toggle <arm>` 单变量切换；采集 dev 冷启动、变更生效（服务端 HTTP 轮询 / 客户端模块端点轮询）、build 墙钟与峰值 RSS | `pnpm benchmark:lifecycle` 可跑；输出表格 + `--json`；`--fixture` 可换项目；`--skip-dev` / `--skip-build` 可分段 |
| **RM-P02** ✅ | 生效证明 | `viteBuilder` 臂改为跑 **`vp dev`（无 CLI 参与）** 并用示例配置的 `UBEAN_VITE_BUILDER=1` 打开开关：请求路由与宿主 app 只可能来自插件，数字必然出自新路径；启动后 `assertEngaged(baseUrl)` 断言 `/` 真的返回 SSR 页面（`class="home"`），否则中止而不是产出假对比。每次迭代都执行，因此「两臂跑同一路径」无法悄悄发生 | RM-V07/V08 落地后从硬失败改为可运行（原硬失败的理由是开关当时不存在）。实测两臂均可跑通并各自观测 3/3；`viteBuilder` 臂的冷启动 1.63s、服务端变更 222–328ms、客户端变更 105ms、reload 单例保留 3/3 —— 与 legacy 臂同量级 |
| **RM-P03** ✅ | 统计口径 | `scripts/lib/metrics.mjs` 提供 `summarizeSamples` / `quantile`；warmup + N 迭代、p50 / p95、原始样本与运行环境（Node / 平台 / CPU / 内存）落盘；`--runs` / `--warmup` 覆盖 | 样本文件含全部原始值；报告含 p50 / p95；`benchmark-ssg.mjs` 口径不受影响（未改动） |
| **RM-P04** ✅ | reload 正确性对照 | 探针路由 `examples/ubean-test/src/routes/api/perf-probe.ts` 暴露模块级实例标识；基准脚本在服务端变更前后各读一次，复用同一次 reload 而不额外制造重载；仅在本次变更已生效时判读（防假阴性） | **旧实现结论：保留**（5/5：实例标识不变、进程未重启、模块重新求值 0 次）——即服务端模块图本就按文件失效。整改后必须仍为「保留」；若变为「重新求值」即为 R3 所指的倒退 |

### Phase 1 · 基线冻结（Phase 1 dev 迁移的硬前置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P05** ✅ | 旧实现基线冻结 | `examples/ubean-test/benchmarks/perf-baseline.json` 在旧路径上产出（warmup 1 + 5 次，Node v24.21.0 / darwin-arm64 / Apple M1 Max）；§2.1 的 watcher 缺陷修复后重采，七项指标 + reload 正确性全部有结论 | p50 / p95：dev 冷启动 1.69s / 1.70s、首个岛屿水合 155ms / 166ms、站内导航 121ms / 125ms、服务端变更 222ms / 223ms、客户端变更 106ms / 107ms、build 墙钟 1.62s / 1.64s、峰值内存 608.9MB / 616.2MB；四项观测率均 5/5，reload 单例保留 5/5。R3 与 RM-V13 / V15 / V23 引用该文件 |

**迁移中的复测（RM-V10 之后，2026-09-15）**：`pnpm benchmark:lifecycle -- --skip-browser --skip-build`（warmup 1 + 3）—— dev 冷启动 **1.61s**（基线 1.69s）、服务端变更 **219ms**（基线 222ms）、客户端变更 **105ms**（基线 106ms）、reload 单例保留 **3/3**（模块重新求值 0、进程重启 0）。RM-V09（作用域化失效）/ RM-V10（请求路由迁进 Vite 插件）均未造成可观测倒退，R3 与 RM-V13 的判据继续有效；committed 基线不动（它绑定的仍是旧路径与 5 次迭代口径）。**迁移中的复测（RM-V10 之后，2026-09-15）**：`pnpm benchmark:lifecycle -- --skip-browser --skip-build`（warmup 1 + 3）—— dev 冷启动 **1.61s**（基线 1.69s）、服务端变更 **219ms**（基线 222ms）、客户端变更 **105ms**（基线 106ms）、reload 单例保留 **3/3**（模块重新求值 0、进程重启 0）。RM-V09（作用域化失效）/ RM-V10（请求路由迁进 Vite 插件）均未造成可观测倒退，R3 与 RM-V13 的判据继续有效；committed 基线不动（它绑定的仍是旧路径与 5 次迭代口径）。

**RM-V15 的开关两侧对照（2026-09-16，`--skip-browser --skip-build --runs 3 --warmup 1`）**：

| 指标 | legacy（`ubean dev`） | viteBuilder（`vp dev`，开关打开） |
| --- | --- | --- |
| dev 冷启动 | 1.58s | 1.63s |
| 变更生效 · 服务端 | 222ms（样本 220/220/338） | 325ms（样本 328/222/325） |
| 变更生效 · 客户端 | 105ms | 105ms |
| reload 单例保留 | 3/3 | 3/3 |

两臂的**分布形态相同**（都存在 ~220ms 与 ~325ms 两档），说明差异来自采样落在哪一档，而不是路径本身；带浏览器阶段的那次采集（Chromium 同时占用 CPU）三档全落在 ~329ms，而未跑浏览器时 p50 回到 222ms —— 据此判断慢档是**重载路径上的 CPU 密集工作（scanProject + generateTypes + app 重建）在负载下被拉长**，而不是 fs 事件延迟（客户端变更指标同样是 fs 事件驱动，却始终稳定在 105ms）。该结论基于观测相关性，未做逐段埋点，故保留为「已刻画、未根治」；RM-V15 的判据 p50（安静环境）达标。

**RM-V23 的开关两侧对照 · build（2026-09-16，`--arms legacy,viteBuilder --skip-dev --skip-browser`）**：

| 指标 | legacy（`pnpm exec ubean build`） | viteBuilder（`pnpm exec vp build`，开关打开） |
| --- | --- | --- |
| build 墙钟 | 1.92s（p95 2.20） | 2.22s（p95 2.43） |
| build 峰值 RSS | 628.9MB（p95 632.1） | 703.0MB（p95 709.0） |
| 复采（`--runs 5`）墙钟 | 1.93s（p95 2.09） | 2.31s（p95 2.36） |
| 复采峰值 RSS | 629.8MB（p95 640.4） | 696.1MB（p95 700.6） |

两次独立采集一致：**开关路径 build 墙钟约 +0.35s、峰值 RSS 约 +66–74MB**。三点限定必须一起读：

1. **不是派发开销**。想当然的归因是「`vp` 比 CLI 重」，实测相反：`pnpm exec vp --version` 0.09s，而 `pnpm exec ubean --version` 0.73–1.23s（CLI 的急切 import 图本身就贵）。也就是说开关路径多出的时间发生在构建工作里，而不是入口差异 —— 但这同时意味着**差值被低估**（legacy 那 1.93s 里有约 0.7–1.2s 是 CLI 启动）。
2. **为什么仍不能对基线下结论**。冻结基线（RM-P05）的 build 墙钟 p50 是 **1.62s**，而今天**同一个 legacy 臂**测得 1.93s（+19%），宿主 load average 为 **15**（10 核机器，另有 5 个历史遗留的 `vite ... cli.js build` 进程与三个用户的会话）。误差量级与待测差异同阶，因此本次只产出**臂间相对结论**，不做「对基线是否回归」的判定 —— 那需要在安静环境上复测，否则就是本项目已经踩过两次的「把噪声读成结论」。
3. **归因未做**。峰值 +70MB 与墙钟 +0.35s 的合理怀疑方向是「单进程同时持有 client / ubean 两个环境的模块图（legacy 是两次顺序 `viteBuild`，中间可回收）」以及 `vp` 侧的原生 rolldown 内存，但**未逐段埋点**，保留为「已刻画、未归因」。

**build 臂的生效证明（新增，RM-V23）**：dev 臂靠「无 CLI 的 `vp dev` 能服务应用」自证，build 臂原先没有任何证明（两臂都跑 `ubean build`，而两条 CLI 路径的构建日志除产物路径字符串外**逐行相同** —— 实测 diff 过，没有可断言的标记位）。现改为 build 臂跑 `pnpm exec vp build`：没有 CLI，服务端 bundle 与预渲染 HTML 只可能来自插件注册的 `builder.buildApp`。保障比 dev 臂更硬 —— 实测**不带开关的 `vp build` 直接硬失败**（`Cannot resolve entry module index.html`，exit 1，零产物），连退化产物都产不出。`assertBuildEngaged`（断言 `dist/manifest.json` + `dist/server/` + 至少一个预渲染 HTML）是第一格构建后的第二道防线，防「退出 0 但只出半套产物」。**代价**：两臂命令不同（含 `pnpm exec` 派发），与 dev 臂同构，报告脚注中明示，不假装是纯单变量对比。

**干净产物约束（新增）**：build 阶段在每臂开始前 `rm -rf dist`。原脚本会沿用上一臂留下的 `dist`，而两条路径都设 `emptyOutDir: false` —— 这正是「体积断言把残留读成回归」那次事故的成因（见 [vite-plugin-migration.md](vite-plugin-migration.md) 的自我更正）。

### Phase 2 · 体积闸门升级（与迁移解耦，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P06** ✅ | 体积闸门绝对上限 | `analyze-lib.ts` 新增 `BundleBudgetOptions`（`maxTotalGzip` / `maxEntryGzip` / `maxChunkGzip`，字节）与 `BundleBudgetViolation`；`summarizeBundle` 增加 brotli；CLI 新增 `--max-total-kb` / `--max-entry-kb` / `--max-chunk-kb`（kB） | 超限失败信息含 chunk 名与实测值（实测：`4 chunk(s) exceed the absolute budget 5.0 kB: assets/app-*.js 46.2 kB, …`）；相对 5% 门禁与 `analyze:check` 行为不变（实测 total 0.2% / entry 0.4%，绿）；新增 3 个单测 |

### Phase 3 · 浏览器运行时（可选，后置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P07** ✅ | 运行时延迟测量 | `scripts/lib/browser-metrics.mjs` + 基准脚本的浏览器阶段：臂内启一次真实 Chromium、跨迭代复用；采水合与导航两项。**偏离说明**：没有走 `@vitest/browser`（那是组件测试通道），端到端测量直接用 Playwright；两者都已在根 `devDependencies`。浏览器不可用时记 note 并跳过，不阻塞服务端指标 | 两项指标各有 p50 / p95（实测：首个岛屿水合 155ms / 166ms、站内导航 121ms / 125ms，观测率均 5/5）。首个岛屿所走路径包含 islands 首次 mount 的双 rAF 调度（间接覆盖，未单独插桩）。不进 CI 阻塞 |

### Phase 4 · 纪律与文档

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P08** ✅ | 纪律条款与文档 | `AGENTS.md` §9 增加两条 benchmark 命令；站点 `contributing/engineering.md`（中英）新增「13. 生命周期性能基准」并补绝对上限用法与性能主张纪律；`docs/README.md` 索引本文件 | 文档与实现一致；纪律条款可被 PR 直接引用 |

## 6. 与 vite-plugin-migration 的接口

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

2026-09-16 实测发现：示例构建产物里 **岛屿组件的 chunk 全部消失**（`bundle-baseline.json` 里明确列有 `IslandClock` / `IslandCounter` / `IslandMedia` / `IslandOnly` / `IslandVisibility`，而当前产物只剩页面级的 `islands-test-*.css`），但 `pnpm analyze:check` 报的是 **budget ok (total −3.0%, entry −2.9%)** —— 因为 RM-P06 的门禁只守「相对基线**增长**不超过 5%」，**体积变小反而算通过**。

这意味着：**任何「功能被静默砍掉」的回归，只要它同时让产物变小，就会从这个门禁下溜过去。** V18/V19 的提交里都用 `analyze:check` 绿作为「产物一致」的证据 —— 在这个盲区被堵上之前，那个证据是不成立的。

**已补判据（RM-P23，2026-09-16）**：`analyze:check` 现在除体积上限外，还**按名字对照基线的 chunk 名单** —— 基线里存在、当前产物里没有的 chunk（内容哈希规范化后比较）即失败，失败信息形如 `N chunk(s) present in the baseline are missing from this build: …`，且与「超限」用不同措辞抛出（`client JS budget check failed` vs `exceeded`），避免把缺失误读成体积超标。判据本身由 `packages/cli/test/analyze.test.ts` 的两条新用例保证：一条构造「体积变小但缺 chunk」的输入并断言被拦下（正是本次岛屿回归的形状），另一条断言重命名（哈希变化）不会误报。

**原因已定位（2026-09-16，同日）**：岛屿组件不是被页面模块动态 import 的 —— 客户端 hydration 通过**注册表**按名字解析。实测 `dist/public/assets/chunks/islands-test-*.js` 里 `IslandClock`/`IslandCounter`/… 各出现一次（作为 `ubean-island` 的属性值），动态 `import(` 出现 **0** 次；组件只可能来自 `virtual:ubean-islands-registry`。而注册表的实现是：islands 插件在 **`transform` 阶段**遍历 SFC 主模块时把组件填进内存 map（`packages/islands/src/vite.ts:1255`），注册表模块 `load` 时读这份 map（`:1158`）。客户端构建里页面是**惰性** `() => import(...)`（`virtual:ubean-pages` 的 loader），注册表在入口链上先于页面被加载 → 读到的 map 为空 → `generateRegistryModule` 返回 `export const islands = {};` → 组件永不进入 bundle。

也就是说：**「注册表内容取决于模块转换顺序」是这套实现的结构性依赖**，而页面惰性加载让它在构建期天然不满足。它在某次改动前能工作，说明彼时有别的东西先把页面拉进了图（有待进一步确认），这类隐式依赖本身就是隐患。

### 6.2 第二类盲区：门禁看不见「产物内容错了」（2026-09-16）

同一族问题在 Phase 3 又出现一次，这次连「缺失」都不是，而是**内容为空**：

`virtual:ubean-asset-manifest` 曾有两个提供者，核心插件那份的 ref 在 CLI 驱动的构建里始终为 `null` 却抢先解析，于是 `dist/server/*` 里内联的是 `{ css: "", preloads: "", body: "", favicon: null }` —— **生产 HTML 既没有客户端入口 `<script>` 也没有样式表**，页面不水合、无样式。而当时的门禁全部通过：

| 门禁 | 为什么不报警 |
| --- | --- |
| `analyze:check`（体积 + 缺 chunk） | 比的是客户端产物体积与 chunk 名单，与服务端内联的标签无关 |
| RM-V23 的构建矩阵（文件清单逐项比对） | 比的是**文件名**，HTML/JS 的内容不在比对范围内 |
| example 的功能测试 / dev 拓扑网 | 跑在 dev，HTML 由 Vite 注入 `/@vite/client`，与生产注入路径不同 |
| `pnpm typecheck` / lint | 类型与风格都对，只是值为空 |

**结论**：体积门禁（§6.1 的「看不见少产出」）与清单比对的「看不见内容」是同一件事的两面 —— **产物的正确性需要内容级断言**，不能由「没变大」「文件都在」推得。已在 RM-V23 的矩阵基线格补两条内容级断言（产物里必须有预渲染 HTML；服务端产物必须内联客户端入口 script），两条在修复前都是红的。

同一批修复还带出一个**度量本身的缺陷**：`prerender.staticDir` 默认写死 `'dist/public'`，不跟随 `build.outputDir` —— `--outDir` 下预渲染 HTML 写进了默认 `dist`。这意味着矩阵各格在修复前**从来没有预渲染 HTML 参与比对**：两边一样地缺，「清单一致」照样成立。也就是说，此前「矩阵覆盖了产物形状」的说法比实际更强，这一点已在该文件的进展记录里更正。


修法方向（RM-V24 候选）：让 islands 插件在 `buildStart` **主动扫描**含 `v-client.*` 的 SFC 并预填注册表，而不是依赖 transform 的到达顺序（`collectIslandComponents` 已可复用，缺的只是「扫哪些目录」的信息）。


## 7. 明确不做

1. **不做 CI 阻塞式性能门禁**（体积预算除外，它是确定性的）——共享 runner 噪声导致假阳性，最终会被跳过或放宽。
2. **不引入完整 benchmark 框架**（vitest bench / tinybench / hyperfine）——指标是进程级与端到端，不是函数级微基准；现有子进程 + `ps` 的采集方式够用。
3. **不照搬 farm.js 的编译器级精度**（MutationObserver + CDP Performance domain）——留给 RM-P07，且仅在有对应优化对象时升级。
4. **不做 per-page 体积预算**——ubean-test 是单一 fixture，per-page 预算在拥有多页面 fixture 前收益有限；RM-P06 只做 per-chunk 与绝对上限。
5. **不把性能数字写进公开站点**——口径依赖机器；站点只写可复核的命令与基线文件（沿用 RM-U07 的反向要求：禁止无数字的「更轻」，也禁止无环境的「更快」）。

## 8. 验收

1. Phase 0 结束（dev 迁移 Phase 1 开始前）：`perf-baseline.json` 已 committed，且在旧实现上可重复产出（同机两次跑的 p50 差异落在声明区间内）。
2. 生效证明有反例测试：开关失效时基准必须失败；reload 正确性同样只在本次变更已生效时判读（否则「实例保留」是假阴性）。
3. Phase 1 / Phase 2 每个 PR 的验收引用 RM-P05 基线数字，不接受定性的「感觉没变慢」。
4. 迁移全程 `analyze:check` 保持绿；RM-P06 落地后绝对上限同时生效。
5. RM-V36 收敛前，最后一次在旧路径上跑基准并归档——旧路径删除后不再需要该动作。
