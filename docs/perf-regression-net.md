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
| **RM-P02** 🟡 | 生效证明 | 每臂采集前调用 `assertEngaged()`；`viteBuilder` 臂在开关不存在时**硬失败**并说明「开关缺失会让两臂都跑在旧路径」 | 反向场景已成立：`--toggle viteBuilder` 现在直接失败，不会产出假对比。**待补**：开关落地后改为「检测新路径特征（environments 注册 / 单 `createBuilder` / worker `ModuleRunner`）失败即中止」 |
| **RM-P03** ✅ | 统计口径 | `scripts/lib/metrics.mjs` 提供 `summarizeSamples` / `quantile`；warmup + N 迭代、p50 / p95、原始样本与运行环境（Node / 平台 / CPU / 内存）落盘；`--runs` / `--warmup` 覆盖 | 样本文件含全部原始值；报告含 p50 / p95；`benchmark-ssg.mjs` 口径不受影响（未改动） |
| **RM-P04** ✅ | reload 正确性对照 | 探针路由 `examples/ubean-test/src/routes/api/perf-probe.ts` 暴露模块级实例标识；基准脚本在服务端变更前后各读一次，复用同一次 reload 而不额外制造重载；仅在本次变更已生效时判读（防假阴性） | **旧实现结论：保留**（5/5：实例标识不变、进程未重启、模块重新求值 0 次）——即服务端模块图本就按文件失效。整改后必须仍为「保留」；若变为「重新求值」即为 R3 所指的倒退 |

### Phase 1 · 基线冻结（Phase 1 dev 迁移的硬前置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P05** ✅ | 旧实现基线冻结 | `examples/ubean-test/benchmarks/perf-baseline.json` 在旧路径上产出（warmup 1 + 5 次，Node v24.21.0 / darwin-arm64 / Apple M1 Max）；§2.1 的 watcher 缺陷修复后重采，七项指标 + reload 正确性全部有结论 | p50 / p95：dev 冷启动 1.69s / 1.70s、首个岛屿水合 155ms / 166ms、站内导航 121ms / 125ms、服务端变更 222ms / 223ms、客户端变更 106ms / 107ms、build 墙钟 1.62s / 1.64s、峰值内存 608.9MB / 616.2MB；四项观测率均 5/5，reload 单例保留 5/5。R3 与 RM-V13 / V15 / V23 引用该文件 |

**迁移中的复测（RM-V10 之后，2026-09-15）**：`pnpm benchmark:lifecycle -- --skip-browser --skip-build`（warmup 1 + 3）—— dev 冷启动 **1.61s**（基线 1.69s）、服务端变更 **219ms**（基线 222ms）、客户端变更 **105ms**（基线 106ms）、reload 单例保留 **3/3**（模块重新求值 0、进程重启 0）。RM-V09（作用域化失效）/ RM-V10（请求路由迁进 Vite 插件）均未造成可观测倒退，R3 与 RM-V13 的判据继续有效；committed 基线不动（它绑定的仍是旧路径与 5 次迭代口径）。

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
