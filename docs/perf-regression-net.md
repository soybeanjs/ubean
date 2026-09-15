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

## 3. 度量对象与口径

in-scope 四项耗时指标 + 一项正确性对照。定义必须可复现、可归因：

| 指标 | 定义 | 采集方式 | 任务 |
| --- | --- | --- | --- |
| dev 冷启动 | spawn dev 命令 → 首个 SSR 页面响应 200 的墙钟 | 子进程 stdout 解析 + 端口轮询就绪 | RM-P01 |
| 变更生效延迟 | 文件写入 → 变更在服务端 / 客户端可见的墙钟（两类分开） | 文件写入 + 探针请求断言标记 | RM-P05 |
| build 墙钟 | build 命令墙钟（旧变体与新变体各一次） | 复用现有 `benchmark-ssg.mjs` 的子进程计时 | RM-P01 |
| build 峰值 RSS | 构建进程树 RSS 峰值 | 复用现有 `psSnapshot` / `treeRssKB`（50ms 轮询求和） | RM-P01 |
| reload 正确性 | 变更后服务端单例是否保留（是 / 否，非耗时） | 探针断言同一实例标识 | RM-P04 |

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

### Phase 0 · 度量地基（无行为变更，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P01** | 生命周期基准脚本 | 新增 `scripts/benchmark-lifecycle.mjs`：`--toggle viteBuilder` 双变体；采集 dev 冷启动、build 墙钟、build 峰值 RSS；复用 `benchmark-ssg.mjs` 的 `psSnapshot` / `treeRssKB` | `pnpm benchmark:lifecycle` 可跑；输出表格 + `--json`；`--fixture` 可换项目 |
| **RM-P02** | 生效证明 | 采集前断言被测路径生效（environments 注册 / 单 `createBuilder` / worker 内 `ModuleRunner`） | 人为让开关失效（模拟 R6）时基准必须失败，且失败信息指明「未走新路径」 |
| **RM-P03** | 统计口径 | warmup + N 迭代、p50 / p95、原始样本落盘、`--iterations`、环境记录 | 样本文件含全部原始值；输出含 p50 / p95；中位数口径保留以兼容 `benchmark-ssg.mjs` |
| **RM-P04** | reload 正确性对照 | 变更后探针断言服务端单例是否保留（同一实例标识）；与 RM-V28（跨环境单例代理）对齐 | 旧实现与新实现各有明确是 / 否结论；作为 R3 的正确性对照，不计入耗时 |

### Phase 1 · 基线冻结（Phase 1 dev 迁移的硬前置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P05** | 旧实现基线冻结 | 在 `experimental.viteBuilder: false` 上跑 RM-P01–P04，产出 committed `examples/ubean-test/benchmarks/perf-baseline.json` | 基线含四项指标 p50 / p95 + 原始样本 + 环境记录；**在旧实现上生成**；`vite-plugin-migration.md` 的 R3 以该文件替代「现状」措辞 |

### Phase 2 · 体积闸门升级（与迁移解耦，可独立合入）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P06** | 体积闸门绝对上限 | `analyze-lib.ts` 的 `compareBundleBaseline` 扩展绝对上限（`maxTotalGzip` / `maxEntryGzip` / `maxChunkGzip`）；启用已落盘但未参与判定的 per-chunk `entries`；可选 brotli | 超限失败信息含 chunk 名与绝对值；现有 5% 相对门禁与 `analyze:check` 行为不变，CI 保持绿 |

### Phase 3 · 浏览器运行时（可选，后置）

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P07** | 运行时延迟测量 | 启用根目录已装未用的 `@vitest/browser` + Playwright，测 hydration 完成时刻与导航切换延迟（含 islands 首次 mount 双 rAF 调度） | 至少两个指标有 p50 / p95；不进入 CI 阻塞 |

### Phase 4 · 纪律与文档

| ID | 任务 | 关键改动 | 完成定义 |
| --- | --- | --- | --- |
| **RM-P08** | 纪律条款与文档 | `AGENTS.md` 增加性能主张条款（可复现基准 + 正确性对照 + 前后数字）；`apps/docs` 的 `contributing/engineering.md` 补 dev / build 基准章节；`docs/README.md` 与本文件索引 | 文档与实现一致；条款可被 PR 直接引用 |

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
2. 生效证明有反例测试：开关失效时基准必须失败。
3. Phase 1 / Phase 2 每个 PR 的验收引用 RM-P05 基线数字，不接受定性的「感觉没变慢」。
4. 迁移全程 `analyze:check` 保持绿；RM-P06 落地后绝对上限同时生效。
5. RM-V36 收敛前，最后一次在旧路径上跑基准并归档——旧路径删除后不再需要该动作。
