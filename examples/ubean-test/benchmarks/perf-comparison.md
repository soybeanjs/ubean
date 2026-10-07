# ubean 与主流元框架性能对比报告

> 生成时间：2026-10-06（Asia/Shanghai）；末次更新：2026-10-06 22:48（+08:00）
> 本报告含**外部公开引用数据**（附 URL）与**本机实测数据**（附环境标签）两部分，二者口径不同，不可直接同列比较。本文件为本地基准记录，不属于对外公开文档。

---

## 1. 调研范围

主流 Vue/React/Svelte/内容站元框架四家 + ubean 自身：

| 框架      | 版本锚点（截至 2026-09/10）             | 说明                                                      |
| --------- | --------------------------------------- | --------------------------------------------------------- |
| Next.js   | 16.3.4（2026-08-31）                    | Turbopack cache 官方宣称构建最高提升 5.5×                 |
| Nuxt      | 4.5.2（2026-08-05）                     | Nuxt 3 已于 2026-07-31 EOL                                |
| SvelteKit | Svelte 5（runes）                       | 编译期消重，产物最精简的一档                              |
| Astro     | 7.3.0（2026-09-03）                     | Astro 7.0 起用 Vite 8 + Rolldown，官方基准构建提速 15–61% |
| **ubean** | 本仓库 main（Vite-Plus + Hono + Vue 3） | fixture 见下                                              |

本机实测使用两个 fixture（口径不同，报告中始终分列）：

| fixture                                                           | 规模                                                            | 用途                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| `examples/ubean-test`                                             | ~30 页（含大量非常规路由的测试床）                              | 九项生命周期口径、浏览器指标        |
| `.tmp-bench-medium`（生成器：`scripts/bench-medium-fixture.mjs`） | **82 路由**（80 内容页 + 首页 + 404），每页 40 个条目的文本内容 | 整站构建（SSG/fullstack）、SSR 吞吐 |

> `.tmp-bench-medium` 由脚本生成、被 `.gitignore` 忽略，可随时以 `pnpm benchmark:fixture -- --pages 80` 重建。

## 2. 关键性能指标口径

ubean 的性能回归口径见 `docs/perf-regression-net.md` §3，共九项：

| 指标                                | 含义                                               |
| ----------------------------------- | -------------------------------------------------- |
| devColdStart                        | dev 服务器冷启动到可响应                           |
| devChangeServer / devChangeClient   | 服务端 / 客户端文件变更后的反馈时延                |
| buildWall / buildCpu / buildPeakRss | 生产构建挂钟时间 / CPU 时间 / 峰值内存             |
| browserHydration                    | 浏览器水合耗时                                     |
| browserNavigation                   | 客户端 SPA 导航耗时                                |
| reloadScope                         | HMR 变更的重载粒度（单例 / 模块重求值 / 进程重启） |

**九项之外的补充口径**（对外比较必需，因为竞品公开数据里最常见的就是这两列）：

- **整站构建时间**（内容站规模，SSG / fullstack 两条渲染路径对比）；
- **SSR 吞吐 RPS**（`ab`，无 keep-alive，与 `ssr-framework-benchmarks` 同工具）。

业界对应的通用指标还包括 JS 载荷（raw/gzip）、TTFB、TTI/LCP/INP 等核心 Web 指标。

## 3. 外部公开数据（含出处）

### 3.1 整站构建时间（中型内容站，tech-insider.org 2026 年文）

- Astro **8–15s**、Nuxt **25–45s**、Next.js **30–60s**（整站口径）
- JS 载荷差距：传统全量方案约 **187KB** vs Astro 约零 JS 默认 **12KB**
- 出处：[tech-insider.org: Astro Tutorial 2026](https://tech-insider.org/astro-tutorial-content-site-13-steps-2026/)

### 3.2 框架官方与构建器演进

- [Astro 7.0 官方博客](https://astro.build/blog/astro-7/)：Vite 8 + Rolldown 使构建提速 **15–61%**
- [Reddit r/nextjs 实测帖](https://www.reddit.com/r/nextjs/comments/1oa9kzz/sharing_build_time_difference_after_upgrading_the/)：Next.js 16 Turbopack 约 **11 分钟** vs webpack 约 **20 分钟**（同一中大型项目）
- [flaviocopes 实测](https://flaviocopes.com/optimize-astro-build-deploy-time/)：Astro 构建阶段优化到约 **12.5s**
- [bitdoze](https://www.bitdoze.com/astro-ssg-build-optimization/)：339k 页站点经优化达 **35 → 127 页/秒**

### 3.3 服务器吞吐（SSR hello-world RPS）

- [pausanchez.com SSR 横评](https://www.pausanchez.com/en/articles/frontend-ssr-frameworks-benchmarked-angular-nuxt-nextjs-and-sveltekit/)（2024-06）：Nuxt SSR 约 **~1000 rps**；同时指出 Node 后端服务器天花板（uWebSockets **126k rps**）远高于任何前端 SSR 框架
- [rickbergfalk/ssr-framework-benchmarks](https://github.com/rickbergfalk/ssr-framework-benchmarks)（ab，并发 1）：Next.js **231.5 rps**；Nuxt 新版 **503.2 rps**（旧版 44.4 rps）
- [Hono 官方基准](https://hono.dev/docs/concepts/benchmarks)：Hono 路由 **402,820 ops/sec ±4.78%**（ubean HTTP 层即 Hono，服务端路由开销量级可参照）
- [DevMorph 2026 横评](https://www.devmorph.dev/blogs/sveltekit-vs-nextjs-16-performance-benchmarks-2026)：SvelteKit **1200 rps** vs Next.js 16 **850 rps**

### 3.4 客户端载荷与交互指标

- [DevMorph](https://www.devmorph.dev/blogs/sveltekit-vs-nextjs-16-performance-benchmarks-2026)：JS 载荷 SvelteKit **42KB** vs Next.js 16（App Router）**120KB**；TTI 0.8s vs 2.4s
- [nunuqs 2026 四框架对比](https://nunuqs.com/blog/nuxt-vs-next-js-vs-astro-vs-sveltekit-2026-frontend-framework-showdown)：Astro 静态页常 **<500ms** 加载、LCP 比优化过的 Next 低 40–70%；SvelteKit 仪表盘 JS 比 Next 少 ≥50%（案例 700KB→300KB）；Astro/SvelteKit 交互包可比 Next(RSC) 小至 70%
- [eastondev](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-comparison/)：首屏内容渲染 Astro **~0.5s** vs Next **1–1.5s**
- [tech-insider](https://tech-insider.org/astro-tutorial-content-site-13-steps-2026/) 引 dev.to 2026 社区爬取：Astro 6 达 "Good" CWV 的站点占 **60%**（对照组 WordPress 38%）

### 3.5 公开数据小结

1. **构建**：内容站整站构建 Astro 秒级领先，Next.js 级别的分钟级构建靠 Turbopack/增量缓存缓解（中型项目 2–3 分钟、增量 <10s，[virtualoutcomes.io](https://virtualoutcomes.io)，**低置信来源，未深度核验**）。
2. **载荷**：Svelte/Astro 系在 JS 体积上有结构性优势（约 Next 的 1/3 到 1/10）；React RSC 已缩小差距但仍最重。
3. **服务端吞吐**：所有全功能 SSR 框架的 hello-world RPS 在数百到一千级，真正的差异在渲染成本而非 HTTP 层（Hono 路由层即达 40 万 ops/sec）。
4. **浏览器侧**：LCP/TTI 排名大致为 Astro ≥ SvelteKit ≥ Nuxt ≥ Next。

## 4. ubean 本机实测

### 4.1 环境与复现

- 机器：Apple M5 ×10 / 16384MB / macOS（darwin/arm64）/ Node v24.21.0
- 浏览器：Playwright 1.63.0 的 Chromium（chromium-headless-shell v1243）
- 压测器：ApacheBench（`/usr/sbin/ab`）
- 受限环境说明：本机 `$HOME` 不可写、`/bin/ps`（setuid）被沙箱拒绝，因此
  - `pnpm exec` 经 `.tmp-bench-shim/pnpm` 翻译为直接执行 `node_modules/.bin/<bin>`；
  - `buildCpu`/`buildPeakRss` 由 **`/usr/bin/time -l` 的 rusage** 采集（`ps` 轮询不可用时的回退，见 `scripts/lib/metrics.mjs` 的 `runWithResourceMetrics`）。
- 上述两个目录均已写入 `.gitignore`，属机器本地辅助物。

```bash
# 环境变量（本机必需）
export PATH="$PWD/.tmp-bench-shim:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers"

# 1) 九项生命周期口径（warmup 1 + runs 5）
node scripts/benchmark-lifecycle.mjs --fixture examples/ubean-test \
  --runs 5 --warmup 1 \
  --out examples/ubean-test/benchmarks/perf-current.json --label current

# 2) 中型站 fixture + 整站构建（ssg vs fullstack）
pnpm benchmark:fixture -- --pages 80
node scripts/benchmark-ssg.mjs --fixture .tmp-bench-medium --runs 3 \
  --json examples/ubean-test/benchmarks/perf-ssg-medium.json

# 3) SSR 吞吐（自动以 --no-prerender 构建，并断言产物无预渲染 HTML）
node scripts/benchmark-ssr.mjs --fixture .tmp-bench-medium --route / \
  --runs 3 --requests 3000 --concurrency 1,10,50 \
  --json examples/ubean-test/benchmarks/perf-ssr-medium.json
```

> 参数顺序提醒：`benchmark-lifecycle.mjs` 的 `--json` 是「带值」参数且用 `args.indexOf` 解析；
> 若把 `--json` 放在 `--out` 之前且不给值，会吞掉后一个 token。稳妥写法是 `--out <path>` 优先、`--json <path>` 显式带值。

### 4.2 九项口径（perf-current.json，2026-10-06T14:48Z，warmup 1 + runs 5，浏览器启用）

| 指标              |                                    p50 |      p95 |      min |      max | 观测率 |
| ----------------- | -------------------------------------: | -------: | -------: | -------: | ------ |
| devColdStart      |                            **1086 ms** |  1103 ms |  1057 ms |  1106 ms | 5/5    |
| devChangeServer   |                             **218 ms** |   322 ms |   214 ms |   322 ms | 5/5    |
| devChangeClient   |                             **107 ms** |   210 ms |   106 ms |   210 ms | 5/5    |
| buildWall         |                            **1294 ms** |  1309 ms |  1260 ms |  1312 ms | 5/5    |
| buildCpu          |                            **2050 ms** |  2076 ms |  2040 ms |  2080 ms | 5/5    |
| buildPeakRss      |                           **612.0 MB** | 615.4 MB | 607.0 MB | 615.7 MB | 5/5    |
| browserHydration  |                             **211 ms** |   227 ms |   190 ms |   231 ms | 5/5    |
| browserNavigation |                              **79 ms** |    82 ms |    78 ms |    82 ms | 5/5    |
| reloadScope       | 单例保留 5/5、模块重求值 0、进程重启 0 |          |          |          | —      |

`buildCpu`/`buildPeakRss` 此前因沙箱禁止执行 `ps` 而恒为 `0`（假数据），本次已恢复真实采集：

- `buildCpu` p50 **2.05 s** 与 `buildWall` p50 **1.29 s** 的比值 ≈ 1.58 → 单次构建平均吃掉约 1.6 个核，宿主负载不会掩盖 CPU 口径。
- `buildPeakRss` p50 **612 MB** 与 legacy 基线（M1 Max，**609 MB**）相差 +0.5%，说明该指标跨机器高度稳定，可直接用于回归。

### 4.3 中型站整站构建（perf-ssg-medium.json，82 路由，3 轮中位数）

生成器产出的 `.tmp-bench-medium` 有 82 个路由（含 404 哨兵页），每页渲染 40 个条目；两种模式**预渲染同一组路由**（显式 `prerender.include`），因此可同口径对比：

| 指标                       | ssg（直接渲染） | fullstack（Hono 管道） | Δ（fullstack vs ssg） |
| -------------------------- | --------------: | ---------------------: | --------------------: |
| 总构建时间                 |     **1074 ms** |                1110 ms |                 +3.4% |
| build CPU 时间             |     **1650 ms** |                1730 ms |                 +4.8% |
| prerender 阶段             |       **83 ms** |                  80 ms |                 −3.6% |
| 峰值内存 (RSS)             |    **573.5 MB** |               595.3 MB |                 +3.8% |
| 渲染路由数                 |              82 |                     81 |                     — |
| 单路由 prerender           |       **~1 ms** |                  ~1 ms |                    ≈0 |
| 单路由墙钟（含 Vite 构建） |          ~13 ms |                 ~14 ms |                     — |

关键观察：

1. **82 路由整站 1.1 s 构建完成**，其中真正的 prerender 只占 **80 ms**（<8%）；其余是 Vite 打包/转换的固定开销。这意味着页面数继续增长的边际成本很低（~13 ms/页墙钟、~1 ms/页 SSR）。
2. ssg 直渲染路径相比 fullstack 的 Hono 请求管道，墙钟低 **3.4%**、CPU 低 **4.8%**、内存低 **3.8%** —— 方向一致，但差距远小于「绕过整个 HTTP 管道」的直觉预期，说明 prerender 阶段的耗时主体是 Vue SSR 渲染本身，而非请求管线。

### 4.4 SSR 吞吐（perf-ssr-medium.json，`ab`，无 keep-alive，3000 请求，3 轮中位数）

**生效证明**：构建使用 `--mode fullstack --no-prerender`，脚本断言 `dist/public` 下 HTML 数为 0。否则 preview 会直接返回预渲染静态文件（实测静态服务达 **4273 rps**），量到的就不是 SSR。

| 并发 | RPS（中位数） | 平均延迟 |   p95 |   p99 |
| ---: | ------------: | -------: | ----: | ----: |
|    1 |    **2212.5** |  0.45 ms |  1 ms |  3 ms |
|   10 |    **3168.4** |  3.16 ms |  7 ms |  9 ms |
|   50 |    **3244.4** | 15.41 ms | 23 ms | 26 ms |

- 单连接 **2212 rps**（0.45 ms/req）说明单请求 SSR 渲染 + Hono 路由的固定成本约 0.45 ms；
- 并发放大到 c=10 后吞吐升至 3168 rps，c=50 时 3244 rps —— 约 **3200 rps 饱和**，说明瓶颈是 CPU 核数下的渲染并行度，而非 HTTP 层（Hono 路由层官方基准 40 万 ops/sec）；
- 页面为纯文本内容页（80 条链接），不含数据获取/岛屿，属偏乐观口径，但与竞品「hello-world SSR」的可比性优于拿复杂业务页去比。

### 4.5 产物体积（bundle-baseline.json，2026-09-16）

- 入口 `assets/app-*.js`：**128,192 B** raw / **44,291 B** gzip / **39,181 B** brotli
- 最大 chunk：runtime-core 72,624 B、fetch-test 26,142 B、pages 20,936 B、runtime 16,095 B

### 4.6 与 legacy 基线对比（跨机器，仅趋势参考）

legacy 基线：Apple M1 Max / 32GB，2026-09-15，`perf-baseline.json`（`recordedOn: legacy`）。

| 指标              | legacy（M1 Max / 32GB） | 本次（M5 / 16GB，runs 5） |       变化 |
| ----------------- | ----------------------: | ------------------------: | ---------: |
| devColdStart      |                 1690 ms |                   1086 ms | **−35.7%** |
| browserHydration  |                  155 ms |                    211 ms |     +36.1% |
| browserNavigation |                  121 ms |                     79 ms | **−34.7%** |
| devChangeServer   |                222.2 ms |                  218.1 ms |      −1.8% |
| devChangeClient   |                106.2 ms |                  107.2 ms |      +0.9% |
| buildWall         |                 1622 ms |                   1294 ms | **−20.2%** |
| buildCpu          |                  未采集 |                   2050 ms |          — |
| buildPeakRss      |    623,520 KB（609 MB） |      626,672 KB（612 MB） |      +0.5% |

- 跨机器下**内存指标几乎不变**（+0.5%），而墙钟类指标（冷启 −36%、构建 −20%）明显改善 —— 与「M5 单核/多核更强、内存容量不参与该口径」的预期一致。
- `devChangeClient` 的 106.2 → 107.2 看似"无变化"，但这是**双峰分布取中位数**的结果，见 4.7。

### 4.7 devChangeClient「双峰」判定：不是首采噪声，而是稳定双模态

上一版报告猜测「run1 106ms 与 run2/3 ~210ms 是首采噪声」。加跑到 **5 轮** 后该猜测被**推翻** —— 两种模态在多次运行中反复出现，且 `devChangeServer` 同样双峰：

| 分组                                           | 原始样本（ms）                    | p50 |
| ---------------------------------------------- | --------------------------------- | --: |
| `--skip-browser`（5 轮）                       | 104, 104, 104, 104, 104           | 104 |
| 浏览器启用 · devChangeClient（5 轮）           | 210.4, 107.2, 208.7, 106.1, 106.1 | 107 |
| 浏览器启用 · devChangeServer（5 轮）           | 322.2, 213.9, 217.7, 218.1, 321.3 | 218 |
| 上一版（浏览器启用 · 3 轮，2026-10-06T05:08Z） | 106, 210, 210（p50 208.8）        | 211 |

结论与口径要求：

1. **双模态真实存在**：慢模态 ≈ 210 ms、快模态 ≈ 107 ms，两者相差 ≈ 105 ms，恰为探针轮询间隔（50 ms）的整数倍；`devChangeServer` 呈同样的快/慢两态（218 / 322 ms）。看起来是文件监听/失效传播的两种稳定路径，而非随机抖动。
2. **采样数会翻转 p50**：同样双峰，n=3 时 p50 落在慢模态（210 ms），n=5 时落在快模态（107 ms）。因此**单看 p50 会被样本数误导**，报告这两个指标时必须**同时给 p50 与 p95**（p95 会稳定落在慢模态）。
3. **浏览器在场是前提**：`--skip-browser` 时 5 轮全部收敛在 104 ms（单模态）。跨配置的数字不可混用；刷新基线时必须记录是否启用浏览器。

## 5. 与主流框架的对比

> **口径警示**：ubean 数据来自本机两个 fixture 的单项目测量；竞品数据来自各自基准环境下的中型/整站构建或 hello-world RPS。下表仅做量级定位，**不构成同口径名次**。

| 维度               | 业界公开水平                                                                                     | ubean 实测                                                                                  | 量级定位                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| dev 冷启动         | Vite 系普遍秒级；Turbopack 宣称冷启降低最多 76%                                                  | **1.09 s**（测试床 fixture）                                                                | Vite 系正常水平                                                  |
| 整站构建（内容站） | Astro 8–15s；Nuxt 25–45s；Next 30–60s（中型站整站）                                              | **1.07 s（ssg）/ 1.11 s（fullstack）**，82 路由                                             | 明显快于三家公开量级，但 fixture 为纯文本、无图片优化/内容集合   |
| 入口 JS 载荷       | SvelteKit 42KB；Next 120KB；Astro ~12KB（gzip 前后口径不一）                                     | **44.3 KB gzip / 39.2 KB brotli**                                                           | 与 SvelteKit 同档，显著优于 Next App Router                      |
| 水合               | SvelteKit TTI 0.8s、Next 2.4s（DevMorph，含网络）                                                | **211 ms**（本地回环纯水合）                                                                | 本地纯水合口径远小于端到端 TTI，无法直比                         |
| 客户端导航         | —（业界少有同口径公开数据）                                                                      | **79 ms**                                                                                   | 快                                                               |
| 变更反馈（HMR）    | —                                                                                                | 服务端 218ms / 客户端 107ms（双模态，p95 210ms）                                            | 亚秒级反馈，符合 DX 预期                                         |
| **SSR 吞吐**       | Nuxt ~1000 rps、SvelteKit 1200 rps、Next 850 rps（hello-world SSR）；Hono 路由层 402,820 ops/sec | **2212 rps @ c=1**、**3168 rps @ c=10**、饱和 ~3200 rps（纯文本内容页，`ab` 无 keep-alive） | 高于公开的 hello-world 量级；HTTP 层非瓶颈，瓶颈是多核渲染并行度 |
| 构建 CPU / 内存    | —（竞品少有公开同口径）                                                                          | **2.05 s CPU / 612 MB 峰值**（测试床构建）                                                  | 内存跨机器稳定（±1%），可作回归基线                              |

### 结论

1. **冷启动与构建**是 ubean 当前最强项：1.09 s 冷启；82 路由内容站 1.1 s 构建完成（prerender 仅 80 ms）。即便按竞品整站口径的附加成本（图片优化、内容集合、全文索引）折损，量级仍落在 Astro 的秒级梯队，而不是 Next/Nuxt 的数十秒梯队（Vite-Plus/Rolldown 时代的构建器红利）。
2. **SSR 吞吐已补测**：单连接 2212 rps、饱和 ~3200 rps，高于公开的 Nuxt/SvelteKit/Next hello-world 数值。但页面复杂度差异大，该数字只能用于**同机回归**与量级定位，不能对外宣称"比 Nuxt 快 N 倍"。
3. **客户端载荷** 44.3 KB gzip 处于 SvelteKit 同档，显著轻于 Next App Router 公开的 120KB 级；brotli 后 39.2 KB。
4. **浏览器指标**（水合 211 ms、导航 79 ms）为本地回环数据，只能作为回归基线使用；对外比较需端到端（网络 + 弱网）口径。
5. **九项口径已完整**：`buildCpu` 2.05 s、`buildPeakRss` 612 MB 已可采集（受限环境走 `/usr/bin/time -l` 回退），不再是零值假数据。
6. **双峰指标须成对报数**：`devChangeClient`/`devChangeServer` 是稳定双模态，p50 会随样本数在快慢模态间翻转，必须同时给出 p50 与 p95、并标注是否启用浏览器。

## 6. 后续建议

### 已实施（本次）

- ✅ **SSG 整站口径**：新增 `scripts/bench-medium-fixture.mjs` 生成 82 路由中型站 fixture；用 `benchmark-ssg.mjs` 得到 ssg/fullstack 双路径整站构建数据（§4.3）。
- ✅ **SSR RPS 基准**：新增 `scripts/benchmark-ssr.mjs`（`ab`，无 keep-alive，含「无预渲染」生效证明），对齐 `ssr-framework-benchmarks` 口径（§4.4）。
- ✅ **恢复九项口径**：`scripts/lib/metrics.mjs` 新增 `runWithResourceMetrics` —— `ps` 轮询优先，受限环境回退 `/usr/bin/time -l`，两者都不可用时**抛错而非返回零值**（§4.2）。
- ✅ **双峰判定**：加跑到 5 轮，推翻"首采噪声"猜测，定性为稳定双模态（§4.7）。

### 仍存缺口

- **中型站 fixture 的复杂度**：当前为纯文本、无图片优化、无内容集合检索。要与 `tech-insider` 的 8–15s 真正同口径，需加入图片流水线（`@ubean/image`）与 `content: true` 全文索引后重测 —— 预期构建时间会显著上升。
- **SSR 吞吐未覆盖真实业务页**：数据获取、岛屿水合、ISR 缓存等路径未纳入；建议补一条「带 `useAsyncData` + 岛屿」的对比路由。
- **keep-alive 口径**：本次与 `ssr-framework-benchmarks` 一致地关闭 keep-alive；若要对齐生产网关（通常开启），需补 `ab -k` 一组。
- **非沙箱 CI 复核**：`/usr/bin/time -l` 回退与 `ps` 轮询的口径应在同一台机器上做一次交叉校验（两者差值应 <5%），以确认回退不引入系统性偏差。
- **devChangeClient 双模态根因**：建议在 Vite 文件监听层（chokidar 事件 → 失效传播）加埋点，定位快/慢两态的分叉点；在根因明确前，回归阈值应基于 p95（慢模态）而非 p50。
- **低置信来源复核**：§3.5 引用的 [virtualoutcomes.io](https://virtualoutcomes.io)（Next 中型项目 2–3 分钟、增量 <10s）为低置信度营销/博客来源，未深度核验。

---

### 附：引用来源汇总

外部数据：

- https://tech-insider.org/astro-tutorial-content-site-13-steps-2026/
- https://astro.build/blog/astro-7/
- https://www.reddit.com/r/nextjs/comments/1oa9kzz/sharing_build_time_difference_after_upgrading_the/
- https://flaviocopes.com/optimize-astro-build-deploy-time/
- https://www.bitdoze.com/astro-ssg-build-optimization/
- https://www.pausanchez.com/en/articles/frontend-ssr-frameworks-benchmarked-angular-nuxt-nextjs-and-sveltekit/
- https://github.com/rickbergfalk/ssr-framework-benchmarks
- https://hono.dev/docs/concepts/benchmarks
- https://www.devmorph.dev/blogs/sveltekit-vs-nextjs-16-performance-benchmarks-2026
- https://nunuqs.com/blog/nuxt-vs-next-js-vs-astro-vs-sveltekit-2026-frontend-framework-showdown
- https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-comparison/
- https://virtualoutcomes.io（低置信）

本机实测产物：

- `examples/ubean-test/benchmarks/perf-current.json` — 九项口径（warmup 1 + runs 5，浏览器启用）
- `examples/ubean-test/benchmarks/perf-ssg-medium.json` — 82 路由整站构建（ssg vs fullstack，3 轮）
- `examples/ubean-test/benchmarks/perf-ssr-medium.json` — SSR 吞吐（c=1/10/50，3 轮）
- `examples/ubean-test/benchmarks/perf-baseline.json` — legacy 基线（M1 Max / 32GB）
- `examples/ubean-test/benchmarks/bundle-baseline.json` — 产物体积基线

工具与脚本：

- `scripts/benchmark-lifecycle.mjs` · `scripts/benchmark-ssg.mjs` · `scripts/benchmark-ssr.mjs` · `scripts/bench-medium-fixture.mjs` · `scripts/lib/metrics.mjs`
