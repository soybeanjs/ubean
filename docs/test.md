# 测试覆盖面优化方案 · 对标主流框架的任务明细

> 开发任务型（[ADR-0007](adr/0007-docs-content-classification.md)）。来源：全仓测试覆盖面审计（只读，未改任何代码）+ 12 个主流全栈框架 CI/测试体系的一手调研（Next.js / Nuxt / Astro / SvelteKit / Vite / Nitro / React Router / Waku / TanStack Router / Analog / SolidStart / 11ty，证据取自各仓 CI 工作流与测试工具源码）。
>
> 核心目的（用户原话口径）：确保测试覆盖框架的**所有功能、配置，以及不同配置的效果**，保证框架健壮性。
>
> **审计总结论**：ubean 的测试资产量不弱（**201 文件 / 45,033 行 / ~3,551 用例**，超过 Astro、Vite 同类量级），短板在**结构**而非数量——缺矩阵、缺门禁、缺「跳过必须可见」的纪律，且**已有的 201 条浏览器 E2E 用例没有入口**（见 §4 P0-6）。最高杠杆的动作不是写更多测试，而是**让现有绿灯更难被伪造**。
>
> 七例历史漏检（RM-V14 双编译、asset-manifest 空产物、示例 typecheck 失效、docs 站点不渲染、文档 i18n 漂移、codegen 快照从未执行、dev 热重载整体失效）的共同模式：**dev 侧有断言、build/产物侧无断言**，且每次都伴随「失败被静默吞掉」。本方案以此为第一优先级。

## 0. 结论速览

| # | 动作 | 任务 | 工作量 |
| --- | --- | --- | --- |
| 1 | 把 201 条孤儿浏览器 E2E 接进脚本与 CI（**零新增测试**） | TS-32 | 0.5 天 |
| 2 | `packages/ubean` 导出面快照 + 补 test 脚本 + 去掉 `--passWithNoTests` 掩护 | TS-01/02 | 0.5 天 |
| 3 | 中间件 13 步链的**序列断言**（现仅有效果证据） | TS-07 | 1 天 |
| 4 | miniflare 进 devDeps + CI（worker 真机防线现为零） | TS-04 | 1 天 |
| 5 | preset 行为矩阵（Nitro `testNitro()` 模式：9 preset 跑同一套行为断言） | TS-12 | 1 周 |
| 6 | dev/build 双轨：同一断言族跑两遍（主流默认测生产构建，我们只测 dev） | TS-33 | 3 天 |
| 7 | 聚合门禁 + OS/Node 矩阵 + 覆盖率报告（诊断用，不设阈值） | TS-05/13/22 | 3 天 |

> **推进状态（实时口径以 §8 验收台账为准）**：阶段 0（堵静默腐化）、阶段 1（补 P0 断言）、阶段 2（建矩阵：TS-12/13/14/15/16/17/18 + TS-33）已全部落地；阶段 3 进行中（TS-19 已完成）。实测基线：`pnpm test` **206 文件 / 3612 通过 + 2 跳过**，`pnpm test:build`（生产构建双轨）**37 文件 / 785 通过 + 3 可见跳过**。过程中额外修掉 2 个真缺陷（`withStep` 吞返回值导致短路响应全变 500、`electron → ssr` 派生默认值被覆盖失效），并按实测钉住 3 项待决行为（404 页为纯客户端外壳、`standard` preset 的 fs 缓存与 `node:fs` 产物、cron `runOnStart` 后续不再触发）。

## 1. 方案总纲（测试模型与三条纪律）

### 1.1 一张图说清「完整覆盖」是什么

「覆盖所有功能与所有配置效果」不可能靠穷举实现（配置组合 >10,000 格）。可行的完备性定义是**四维张量上的一个受控切片**：

```
一条断言族（同一套行为断言，只写一次）
   × { dev | build }          ← 运行形态轴（2）
   × { 平台 preset }           ← 部署目标轴（9，按可运行性取舍）
   × { 配置维度 }              ← 配置轴（每维取「主链 + 交互闭包 + 边界」，非全组合）
```

- **断言族只写一次**：`testPreset(ctx, getHandler, additionalTests?)`（照 Nitro `nitro/test/tests.ts:200`）。新增一个 preset 或新增一种运行形态，是**加一行参数**，不是复制一套测试。这是本方案里唯一能把成本从乘法压成加法的设计。
- **平台差异写在断言内部**：照 Nitro `tests.ts:750` 的 `statusText: /deno|bun|winterjs/.test(ctx.preset)`——同一条断言按 `ctx.preset` 分支期望值。整条 `skip` 只在「该平台物理上不可能」时使用，且必须注明原因。
- **配置轴取「交互闭包」而非全组合**：`mode × i18n strategy` 的 16 格值得测，`logging.level × colorMode` 的 64 格不值得。判定标准是**两个字段是否改变同一条响应**（见 §6）。
- **断言效果，不回读配置**：断言响应头 / cookie / 重定向 / 状态码 / 产物字节 / stdout / 请求序列，绝不 `expect(config.foo).toBe(true)`。回读配置只能证明「我读了我刚写的」，是本仓七例漏检的共同形态。

### 1.2 五层各证明什么（每层只证明只有它能证明的东西）

| 层 | 唯一能证明的东西 | 不能证明 |
| --- | --- | --- |
| L1 包内单测 | 纯函数、注册表、序列化、类型面 | 任何跨进程行为 |
| L2 示例集成 | 真实 `ubean dev` 的端到端请求语义 | 浏览器语义、生产构建语义 |
| L3 浏览器 E2E | 水合、路由跳转、HMR、真实 DOM | 纯函数、非浏览器平台 |
| L4 构建/产物契约 | 各 mode × preset 的产物**内容与可运行性** | 开发态行为 |
| L5 纯 SPA 示例 | 无 SSR 路径下的内核行为 | 服务端一切 |

**推论**：把 L2 的纯单测形态用例「迁移到 e2e」是**降级而非升级**——它把「函数返回值」换成「浏览器里执行同一函数」，信号量不变而成本涨 3–5 倍。真正的迁移方向是**下沉到 L1**（见 §5 阶段 5 与 [test-e2e-migration.md](test-e2e-migration.md)）。

### 1.3 三条纪律（比新增任何测试都重要）

1. **跳过必须可见**：`skip` 是红灯的合法替代品，但**不能是绿灯的替代品**。任何 skip 必须在输出里留一行可见警告，并说明触发条件。本仓现状：3 个文件靠 `describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)` 静默跳过约 20 条用例，而**同目录另外 33 个文件在缺 dev server 时硬失败**——同一目录两套语义，恰好最该跑的那 3 个最容易被静默掉（TS-03）。
2. **不许 `--passWithNoTests` 掩护**：根脚本 `pnpm -r --parallel test -- --passWithNoTests` 让「这个包没有测试」与「这个包测试全绿」在 CI 里不可区分（TS-02）。
3. **每条断言必须有「故意破坏 → 红」证明**：这是唯一能证明断言真的在执行、且真的在断言那件事的方法。落进 PR 描述，写进 §8 台账。

### 1.4 与主流框架的差距定位（12 框架调研结论）

调研中最反直觉的一条：**「聚合门禁 job」在 12 个仓库里只有 2 个**（Next `tests-pass`、Nuxt `ci-ok`）。Vite 的 `test-passed` / `test-failed` 是 **echo-only**（`.github/workflows/ci.yml:141-147`，job 体只有 `run: echo "Build & Test Passed or Skipped"`），不构成真门禁。所以本方案不把「加聚合门禁」当行业标配来抄，而按**自身痛点**排序（TS-05 是 0.2 天的小改动，顺手做）。

**覆盖率阈值：12 个仓库里 0 个设阈值。** 唯一近似项是 Nitro 带了 `@vitest/coverage-v8` 和 `.github/codecov.yml`（`threshold: 50%`），但 **CI 里没有任何 codecov 步骤**——配置从未生效。这为 §7「不做清单」里「不设覆盖率阈值」提供了证据支撑：主流做法是**用导出面快照 + 产物内容守卫 + 平台矩阵替代阈值**。

## 2. 现状基线（量化）

### 2.1 五层测试资产

> **计数口径**（本文件全文统一）：文件 = `*.test.ts` / `*.e2e.spec.ts`；行数 = 上述文件的行数；用例 = `it(` 出现次数 + `it.each(` 的**展开元素数**（本仓 14 个 `it.each` 调用点，展开后共 67 条，其中 `PRESET_CONTRACTS`=9、`MODES`=4 为变量引用）。**`.vue` fixture 文件不计入**（本仓 `packages/*/test/` 下有 7 个 `.vue`，全部是 fixture，0 条用例）。

| 层 | 位置 | 规模 | 运行方式 |
| --- | --- | --- | --- |
| L1 包内单测 | `packages/*/test/` | 23 包 / **149** 文件 / 34,430 行 / **2,537** 用例 | `vp test`（vitest 5.0.3） |
| L2 示例集成 | `examples/ubean-test/test/` | **36** 文件 / 8,250 行 / 783 用例 | 真实 `ubean dev`（:3999，global-setup 拉起） |
| L3 浏览器 E2E | `test/browser/specs/`（12 spec / 1,712 行 / 201 用例）+ `packages/cli/test/dev-dx.test.ts`（447 行 / 10 用例） | 211 用例 | 真实 Chromium（:3998 / 随机端口） |
| L4 构建/产物契约 | `packages/cli/test/build-contracts.test.ts` | 279 行 / 4 mode × 9 preset = 36 格 | 临时目录真实构建 |
| L5 纯 SPA 示例 | `examples/client-only-spa/test/` | 4 文件 / 641 行 / 30 用例 | vitest + happy-dom |

**去重后的全仓总数：149 + 36 + 12 + 4 = 201 文件；34,430 + 8,250 + 1,712 + 641 = 45,033 行；2,537 + 783 + 201 + 30 = 3,551 用例。**

> ⚠️ **口径提醒（本文件此前版本的两处错误，已修正）**：
> - 旧版写「159 文件 / 2,560 用例」——159 是「`test/` 下全部 `.ts` + `.vue`」（152 + 7）的混合口径，与同一行「34,430 行」（只数 `*.test.ts`）**不同源**；2,560 无法由任何一致口径复现。现统一为「149 个 `*.test.ts` / 34,430 行 / 2,537 用例」。
> - 旧版把 L1 与 L3/L4 当成互斥层相加（208 文件 / 3,498 用例）。实际上 **`packages/cli/test/build-contracts.test.ts`（L4）与 `packages/cli/test/dev-dx.test.ts`（L3）就住在 L1 的目录里**，已被 149 计入。本表因此把 L1 定义为「包内测试目录全集」，L3/L4 是它的**子集**（下表标注具体成员），全仓总数按「L1 ∪ L2 ∪ L3-specs ∪ L5」去重计算。

### 2.2 既有强项（不重做，只补缺）

- 用例密度：`packages/builder` 416 用例、`packages/server` 389 用例、`packages/islands` 217 用例（展开口径）。
- 已有真实浏览器 E2E（多数框架只跑 jsdom）——**但未接进 CI**（§4 P0-6）。
- 已有构建矩阵（`build-contracts.test.ts:45` 的 `MODES`、`:55-68` 的 `PRESET_CONTRACTS`）且**断言产物内容而非仅存在**——是 Nitro `testNitro()` 的雏形。
- 已有性能回归网（`benchmark-lifecycle.mjs` + `perf-baseline.json` + 生效证明，见 [perf-regression-net.md](perf-regression-net.md)）。
- 已有契约文档与 meta 测试（`packages/builder/test/codegen-doc-contract.test.ts:19-37` 用 [contracts/codegen-v1.md](contracts/codegen-v1.md) 反查 `packages/builder/src/codegen/index.ts:56-65` 的 `CODEGEN_FILES`）。
- 全仓 0 个 `vi.mock`（测试更真实）；`it.only` 为 0；`toMatchSnapshot` 为 0。

### 2.3 测试技巧盘点

| 技巧 | 用量 | 评价 |
| --- | --- | --- |
| 快照（`toMatchSnapshot` 系列） | **0** | ADR-0002 声明的「codegen 快照单测」从未执行 → TS-28 |
| `vi.mock` | 0 | 保持（优点） |
| `vi.useFakeTimers` | 仅 1 文件 | cron / ISR TTL / rate-limit 窗口未用假时钟 → TS-19 |
| `describe.skipIf` | **3** 文件（`data-cache.test.ts:10`、`draft-mode.test.ts:11`、`streaming-metadata.test.ts:11`；另有 `helper.ts` 注释提及，非实际使用） | 静默腐化主通道 → TS-03 |
| `ctx.skip()` | 2 文件 5 处（`route-rules.test.ts:172,181`；`cloudflare-preview.test.ts:186,199,241`） | → TS-03 / TS-04 |
| 覆盖率工具 | 无 | → TS-22（仅诊断，不设阈值） |

### 2.4 静默腐化的实证

dev server 在 `@ubean/content` 未安装时打印 `Built-in module "content" is enabled ... is not installed. The module will be skipped.`——**警告可见，但测试全绿**。即「一个模块被整个跳过」这件事没有任何红灯保护。这正是 §1.3 纪律①的由来。

## 3. 对标：主流框架的做法

12 框架横向对比后，以下 8 条是**多数成熟框架有、而 ubean 没有**的（含 prevalence 标注，避免把少数派做法当标配）：

| # | 做法 | 覆盖度 | 代表实现 | ubean 现状 | 任务 |
| --- | --- | --- | --- | --- | --- |
| 1 | 聚合门禁 job（分支保护只挂一个） | **2/12** | Next `tests-pass`（job name `thank you, next`）、Nuxt `ci-ok`；⚠️ Vite `test-passed`/`test-failed` 是 **echo-only**（`ci.yml:141-147`），**不算**真门禁 | ❌ 单 job 串行 | TS-05 |
| 2 | OS × Node 矩阵（至少 win 一个点） | 多数 | Vite node 20/22/24/26 + mac/win；Astro 3 OS × 2 Node（exclude 注明理由） | ❌ 仅 ubuntu + lts | TS-13 |
| 3 | preset 矩阵：同一套断言跑遍所有目标 | 多数 | Nitro `testNitro(ctx, getHandler, additionalTests?)`（`test/tests.ts:200`），`Context` 含 `isDev:29 / isWorker:30 / isLambda:31 / isIsolated:32`，映射见 `:85-86`；React Router 5 harness；Waku 44 fixture | ⚠️ 仅产物存在性 | TS-12 |
| 4 | 分片（按耗时装箱或 `--shard`） | 少数 | Next KV timings 装箱 + `--require-timings` 缺数据即硬失败；SvelteKit/Waku `--shard` | ❌ | TS-24 |
| 5 | flakiness 追踪 | 少数 | Nuxt `FLAKINESS_*`；SvelteKit `print-flaky-test-report.js`；Nitro `retry: 5` | ❌ | TS-25 |
| 6 | 产物/生成物过期守卫（重新生成 + git diff） | 少数 | Nuxt `ui-templates-generated`；SvelteKit `prepublishOnly && git status --porcelain` | ❌ | TS-20 |
| 7 | 死代码/未使用导出检测 | 少数 | Nuxt `knip` + `knip:production`（PR 上就跑） | ❌ | TS-21 |
| 8 | 公共 API 类型面守卫 | 少数 | Nuxt `test:public-api` + `test:attw` | ❌ | TS-19→TS-01 体系 |

### 3.1 两条高价值非普遍做法

**① 构建失败测试**（SvelteKit `packages/kit/test/build-errors/`：env / prerender / remote / removed-modules / server-only 六个 spec）。ubean 只有运行时错误测试（`errors.test.ts`），**零构建期错误断言**——「错误配置必须失败」这条路径完全没测 → TS-10。

**② 条件门控的「绊线」而非 `it.skip`**（Next `test/lib/gate/README.md:3-5`）：

> `it.skip` is a dead end. Nothing tells you when the bug it was hiding gets fixed... `// @gate` replaces it with a tripwire.

`@gate` 的机制是：条件为假时**测试照跑**，此时**期望它失败**；一旦它意外通过，报 `Gated test passed unexpectedly... The gate is stale`。这把「被跳过的测试」变成「会在环境变化时主动报警的测试」。ubean 的 5 处 `ctx.skip()` 正是需要这种升级的地方 → TS-03。

### 3.2 dev/build 双轨：主流默认测**生产构建**，我们只测 dev

这是本次调研对 ubean 最具行动指向的一条发现：

| 框架 | 双轨机制 |
| --- | --- |
| Nuxt | `createTest` = `loadFixture → buildFixture(build=true) → startServer → createBrowser`——**e2e 默认跑生产构建**，dev 是 opt-in；`playwright.config.ts:9-15` 的 `e2eMatrix` = builder(webpack\|rspack\|vite) × `isDev(t/f)` × `nitroViteEnvironment(t/f)` = 6 个项目；dev/built 差异用 `testIgnoreForProject` **整文件忽略** |
| SvelteKit | `DEV=true` / `PUBLIC_PRERENDERING=false` |
| Vite | `VITE_TEST_BUILD` / `VITE_TEST_BUNDLED_DEV` |
| Waku | `.dev.spec.ts` / `.prd.spec.ts` + `mode: DEV\|PRD\|STATIC` |
| Next.js | `NEXT_TEST_MODE`；`run-tests.js` + jest 驱动 Playwright，轴为 `--mode=dev\|start\|deploy` × `--bundler=webpack\|turbo\|rspack` |

**对 ubean 的结论**：L2 默认跑 `ubean dev`，与主流**相反**。历史漏检 #2（asset-manifest 空产物，所有体积门禁全绿）正是「dev 侧有断言、build 侧无断言」的形态。→ TS-33：引入 `UBEAN_TEST_MODE=dev|build`，让**同一断言族跑两遍**。

### 3.3 平台矩阵：SvelteKit 的真实做法（修正「SvelteKit 平台矩阵弱」的旧判断）

SvelteKit 有 `.github/workflows/platform-tests-all.yml` 编排 `platform-test.yml` 的多次调用：netlify（basic / edge / instrumentation / split / split-edge）、vercel（basic / split）、node 22/24 + windows、bun（`COMPILE_TARGET: bun-linux-x64`），共享一个 `platform-test.yml` 并传 `EDGE` 输入。这是「**一个可复用工作流 + 一组平台参数**」的范式，与 Nitro 的 `testNitro(ctx)` 同构 → TS-12 / TS-13 的直接参照。

### 3.4 上游数据不确定性的正确解法（Next `experimental/testmode`）

Next 的 `experimental/testmode` 是真实存在、框架自用、且在 `files` 中导出的（`experimental/testmode/playwright.js`，配置 `experimental.testProxy`），自测 fixture 用 `createProxyServer({ onFetch })`。**但在全部 465 个 `docs/` 文件里，`testmode|testProxy` 命中数为 0**——即：它没有出现在任何面向用户的文档中。

**对 ubean 的结论**：外部数据的不确定性必须由**专门的 fetch 层代理**解决，**不能靠加更多 e2e 覆盖**。这条写进 §7 不做清单（本阶段不做）。

## 4. 缺口清单

### P0（高价值 / 阻断性）

| # | 缺口 | 证据 |
| --- | --- | --- |
| P0-1 | `packages/ubean` 无 `test/` 目录、无 `test` 脚本 → 8 个子路径的导出面**零守卫** | `ls packages/ubean/` 无 `test`；`package.json.scripts` 无 `test`；`exports` 键 = `. ./vite ./client ./ssr ./server ./build ./i18n ./scaffold` |
| P0-2 | worker 真机防线为零：`cloudflare-preview.test.ts:186,241` 的 `ctx.skip('miniflare 未安装…')` 在 CI 与本地恒跳过（`miniflare` 既不在根也不在 `packages/builder` devDeps） | `grep -rn miniflare packages/builder/package.json package.json` 无命中 |
| P0-3 | 中间件链只有「数量」断言，**无序列断言**：`app-registration.test.ts:73,103` 只比 `use("*")` 条数，交换 CSRF 与 dataCache 顺序仍全绿 | `packages/app/src/app.ts` 12 处 `this.hono.use(`（`:266,274,276,284,296,308,325,338,353,358,360,414`；`app.use(` 为 0） |
| P0-4 | `frontend-only` / `routing-file-mode` / `ssg-catchall` 三个示例零测试 | 示例目录无 `test/` |
| P0-5 | `release.yml` 发布前无质量门禁，且 `--no-frozen-lockfile` 使发布依赖可能偏离验证依赖 | `grep -cE "pnpm (test\|typecheck\|lint)" release.yml` = 0；`:34` `pnpm install --no-frozen-lockfile` |
| **P0-6** | **201 条浏览器 E2E 用例没有入口**：根 `package.json` 无 `test:e2e` / `e2e` 脚本，`ci.yml` 无浏览器步骤，`grep -rn "test:e2e\|e2e" package.json .github/workflows/*.yml` **零命中** | 见 §4 P0-6 说明 |

> **P0-6 详述**：根 `vite.config.ts` 完整配置了浏览器模式（`test.include: ['test/browser/**/*.e2e.spec.ts']`、`browser.enabled: true`、`provider: playwright()`、`commands: e2eCommands`），`test/browser/global-setup.ts` 会拉起 `:3998` 的 dev server 并预热 20 条路径，12 个 spec / 201 条用例就绪。但根 `test` 脚本是 `pnpm -r --parallel test`，`-r` **不含根包**（否则自递归），而唯一会跑到浏览器的 `packages/cli/test/dev-dx.test.ts` 是独立的一套裸 Playwright 实现。结果是：**这套资产在本地手动 `vp test` 之外从不执行**。修复成本 0.5 天，收益是 201 条用例复活——全仓 ROI 最高的一项。

### P1（结构性 / 覆盖空洞）

| # | 缺口 | 证据 |
| --- | --- | --- |
| P1-6 | preset 只断言产物存在，不起服务、不发请求 | `build-contracts.test.ts` 无 `fetch` 断言 |
| P1-7 | i18n 四策略在 HTTP 层只覆盖 `prefix_except_default` | L2 `i18n.test.ts` 12 用例 / 5 HTTP |
| P1-8 | `logging` **运行时抑制行为**无断言（分类闸门是否真的静音/真的输出） | 定义在 `packages/config/src/types.ts:806`；**L2 引用 0 处**；解析层有 8 个单测（`packages/config/test/logging.test.ts`，只测 `resolveLoggingConfig()` 归一化）+ 级别层 19 个（`packages/shared/test/logger.test.ts`），两者都停在纯函数，无一条跑真实 dev server 观察输出 |
| P1-9 | 6 个能力域 L1 零覆盖（见下） | 符号级 `grep -rl "\b<symbol>\b"` 全仓零命中 |
| P1-10 | 无构建期错误断言 | 无 `build-errors` 类测试 |
| P1-11 | 8 个包零**错误路径**断言（无 `toThrow` / `.rejects` / 状态码断言；`toBe(false)` / `toBeNull` / `.not.to` 等负向形状仍在，故非「零负向」） | 零错误路径包：`client / icon / image / integrations / markdown / pages / preset / scan`；L1 错误路径断言 **97 处 / 15 包**（占 2,537 用例 3.8%），全仓 **150 处** |

**P1-9 的六个域（符号级验证，非模糊匹配）**：

| 域 | 零覆盖符号 |
| --- | --- |
| observability | `createObservabilityTracer` / `getRequestId` / `createSpan` / `createTracingMiddleware` / `REQUEST_ID_HEADER` |
| websocket | `defineWebSocket` / `defineRoom` / `createRoom` / `handleUpgrade` / `clearWebSocketState` |
| sse | `formatSSEMessage` / `createSSEStream` / `broadcastSSE` / `sseHeaders` / `clearSSEState`（`defineSSE` 仅在 `dev-topology.test.ts` 作为探针出现） |
| queue | `defineQueue` / `sendMessage` / `startQueueWorkers` / `stopQueueWorkers` / `createMemoryQueueDriver` |
| cron | `parseCron` / `validateCron` / `defineScheduled`（`startCronScheduler` 仅在 `dev-host-app.test.ts` 出现） |
| storage | `useStorage` / `useKV` / `createKV`（`createStorage` / `createMemoryDriver` 仅在 `fs-cache.test.ts` 顺带出现） |

> 这六个域在 L2 有 **HTTP 层**覆盖（`websocket.test.ts` 22 用例、`sse.test.ts` 18、`queue.test.ts` 25、`cron.test.ts` 19、`storage.test.ts` 28、`observability.test.ts` 53），但**纯逻辑层零覆盖**——即「走通一条路」有测，「边界与错误路径」没测。这正是 §1.1「下沉而非迁移」的落点。

### P2（低危：边界与优化）

- `cache-handler.test.ts` 仅 1 用例；`fs-cache.test.ts` 3 用例（并发写、损坏文件恢复未测）。
- `rate-limit-lifecycle.test.ts` 3 用例（未用假时钟测窗口滑动）。
- `dataCache` 默认 true 的实际语义只测了条数（`app-registration.test.ts:100-107`）；`routeRules.cache` 字段 0 命中。
- 岛屿注册表构建期填充（`packages/islands/src/vite.ts:1384-1385,1525-1526,buildStart:1284-1296`）无构建期断言。
- codegen 可选产物 `typed-router.d.ts` / `openapi.d.ts` / `bundle-baseline.json` 零契约断言（`codegen-manifest.test.ts:24` 只断 3 个文件的 generated 旗标）。
- `electron:true` → `ssr` 默认 false 的联动零验证；`mode:'spa'` + `ssr:true` 的语义未定义未验证。
- `apps/docs` 零测试，CI 里只有 build（内容正确性无断言）。
- `test/browser/pages/data-fetch.page.ts` 的 `DataFetchPage` 是**死代码**——12 个 spec 无一 import 它；对应 `/data-fetch` 页面在 L3 零覆盖。
- L3 真实剩余空洞（**填，不是迁移**）：`POST /__server-component` 的 props 重渲染（零覆盖，ADR-0013 平台契约）、`/dashboard` 的 `ssr: 'data-only'` 契约（spec 10 只断言标题/导航）、`/marketing` CSR 页（`ssr: false`，与 `/marketing-page` 不同）、并行路由 `<SlotView name="aside">`、`blog/[...slug]` catch-all、404 页**内容**（现仅断言状态码）。
- L3 对 49 条 API 路由中 **22 条零覆盖**：`cache-advanced-test`、`cors-test`、`create-error`、`cron-parse-test`、`cron-status`、`data-test`、`db-test`、`draft-mode-test`、`env-schema`、`internal-fetch-test`、`login`、`markdown-parse-test`、`queue-test`、`queue-advanced-test`、`request-demo`、`route-rules-test`、`storage-test`、`storage-advanced-test`、`streaming-metadata-test`、`test-meta`、`trace-test`、`ws-test`。（`cached-fn-demo` / `perf-probe` / `prerender-test` / `sse-demo` 由 CLI 测试覆盖，不算零覆盖。）

## 5. 任务明细

> 编号 TS-xx（Test Suite）。每项含：依据（审计证据）/ 做法 / 涉及 / 验收 / 参照（对标来源）/ 工作量。
> 约束继承原始需求：**本文件是方案**，逐项实施时另行开 PR，不与本审计混在一起。
> **每项验收都必须附「红→绿证明」**（人为破坏 → 测试红 → 修复 → 绿），否则视为未完成。

### 阶段 0 · 堵住静默腐化（合计约 3.5 天；改动最小、收益最直接）

#### TS-01 · `packages/ubean` 导出面快照

- 依据：P0-1。`import { x } from 'ubean'` 的任意导出被删/改名，运行时 undefined，无测试变红。
- 做法：新增 `packages/ubean/test/exports.test.ts`，对 8 个子路径（`.` `./vite` `./client` `./ssr` `./server` `./build` `./i18n` `./scaffold`）逐一动态 `import()`，断言导出名集合（显式数组或 `toMatchInlineSnapshot`——此快照是**首次合法使用**，正是 ADR-0002 想要的形态）。
- 涉及：`packages/ubean/package.json`（加 `"test": "vp test"`）、`packages/ubean/test/exports.test.ts`。
- 验收：
  - [x] `pnpm --filter ubean test` 可执行且绿。
  - [x] 人为删一个导出（临时）→ 测试红，报出缺失符号名。（删 `logger` → 1/9 红，`"missing": ["logger"]`）
  - [x] `pnpm -r test` 不再静默跳过该包。
- 参照：Nuxt `test:public-api`。
- 工作量：0.5 天

#### TS-02 · 去掉 `--passWithNoTests` 掩护

- 依据：ADR-0002 已将此列为目标（OPT-04）未执行；根脚本 `test: pnpm -r --parallel test -- --passWithNoTests`。
- 做法：根脚本改为 `pnpm -r test`（TS-01 完成后 `packages/ubean` 已有测试，无包会因此变红；若后续新增无测试包，应显式红灯而非静默）。
- 涉及：根 `package.json`。
- 验收：
  - [x] 根脚本不再含 `--passWithNoTests`。
  - [x] 全仓 `pnpm test` 绿。
- 工作量：0.1 天

#### TS-03 · 统一 dev-server 依赖的 skip 语义（升级为「绊线」）

- 依据：`examples/ubean-test/test/helper.ts:8-12` 注释声称「无 dev server 时测试会 skip」，实际 **36** 个依赖 dev server 的文件中仅 **3** 个有 `describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)`（`streaming-metadata.test.ts:11`、`data-cache.test.ts:10`、`draft-mode.test.ts:11`），其余 **33** 个硬失败（ECONNREFUSED）。**反向风险**：global-setup 因故没跑时，恰好这 3 个静默跳过并报成功——腐化的正是这 3 个。另有 `route-rules.test.ts:172,181` 两处 `ctx.skip()`。
- 做法：
  1. 删掉 3 处 `describe.skipIf`，替换为文件级前置断言（`beforeAll` 里检查 env，缺失即 `throw new Error('... 需先启动 dev server 或设置 UBEAN_TEST_BASE_URL')`），使全部 36 个文件**语义一致**。
  2. `route-rules.test.ts` 两处 `ctx.skip()` 改为显式条件断言（条件不满足时断言「确实不该发生」的负向行为），不留静默分支。
  3. `helper.ts` 的 `getBaseUrl()` 兜底值 `http://localhost:3000` 与真实端口 `:3999` 不符（IDE 单跑无法连接）——改为读取失败即抛错。
  4. 同步修正 `helper.ts:8-12` 注释。
- 涉及：上述 3 个文件 + `route-rules.test.ts` + `helper.ts`。
- 验收：
  - [x] 不起 dev server 跑该目录 → 所有文件以**统一的明确错误**失败，无 ECONNREFUSED 噪声、无静默 skip。（34 文件全红，错误统一为 `UBEAN_TEST_BASE_URL 未设置` 共 520 处，`ECONNREFUSED` 计数 **0**）
  - [x] 起 dev server 跑 → 全绿，用例数与现在一致（783）。（`Test Files 36 passed (36)`、`Tests 783 passed (783)`）
  - [x] 全仓 `ctx.skip(` 与 `describe.skipIf(` 仅剩 TS-04 的 miniflare opt-out（有可见警告）。（`describe.skipIf` / `it.skipIf` / `it.skip` / `describe.skip` / `test.skip` 全仓零命中）
- 参照：Next `@gate` 绊线（`test/lib/gate/README.md:3-5,27`）+ `--require-timings` 硬失败哲学——「宁可失败也不静默退化」。
- 工作量：0.5 天

#### TS-04 · miniflare 进 devDeps + CI，真机用例改为显式 opt-out

- 依据：P0-2。`cloudflare-preview.test.ts:186,241` `ctx.skip('miniflare 未安装…')` 在 CI 与本地恒跳过。
- 做法：根 devDeps 加 miniflare；CI 安装步骤自然获得；把两处 `ctx.skip` 改为「仅在显式 `UBEAN_SKIP_MINIFLARE=1` 时跳过」，跳过时打印一行**可见警告**。
- 涉及：根 `package.json`、`packages/builder/test/cloudflare-preview.test.ts`、`.github/workflows/ci.yml`。
- 验收：
  - [x] CI 中两条真机用例真实执行并断言 `runner.fetch` 响应（`:249-251` 的 `'cf:/from-miniflare'` 路径）。（本地已复现：miniflare 装好后两例真实执行并绿）
  - [x] 设 `UBEAN_SKIP_MINIFLARE=1` 时跳过且有可见警告。（`Tests 7 passed | 2 skipped`，两行 `⚠️ 跳过真机验收` 可见警告）
- 备注：该文件的**接线层**（假 miniflare，断言「worker 缺失 / 依赖缺失 / 成功」三种结果）已在运行，本次只补真机层——TS-04 的「真机防线为零」仅指真机层。
- 参照：诚实台账原则——绿灯的含义必须是「验证过」，不是「没装」。
- 工作量：1 天

#### TS-05 · CI 聚合门禁 job

- 依据：现有 `.github/workflows/ci.yml` 单 `ci` job；分支保护直接挂它，加减步骤都要改保护规则。
- 做法：新增 `ci-ok` job：`needs: [ci]` + `if: always()`，`ci` 非 success 即失败；分支保护改挂 `ci-ok`。未来拆矩阵（TS-13）后把所有 job 挂进 `needs`。
- 涉及：`.github/workflows/ci.yml`。
- 验收：
  - [x] 人为红一个子步骤 → `ci-ok` 红。（`/tmp/ts05-proof.mjs` 5/5 场景通过，含「子步骤 failure / cancelled / skipped 三种形态均判红」）
  - [x] GitHub 分支保护只需配置 `ci-ok` 一个 check。（job 名固定为 `ci-ok`；`skipped` 亦计为失败，否则缺 `if: always()` 时门禁形同虚设）
- 参照：Next `tests-pass`、Nuxt `ci-ok`（**注**：12 框架中仅此 2 例；Vite `test-passed` 是 echo-only，不构成门禁）。
- 工作量：0.2 天

#### TS-06 · `release.yml` 加发布前质量门禁

- 依据：P0-5。`grep -c "pnpm test|typecheck|lint" release.yml` = 0；`--no-frozen-lockfile` 使发布依赖可能偏离验证依赖。
- 做法：publish 前加 `pnpm typecheck && pnpm lint && pnpm test`；`pnpm install` 改 `--frozen-lockfile`。
- 涉及：`.github/workflows/release.yml`。
- 验收：
  - [x] release 工作流含三步质量门禁且在 publish 之前。（Typecheck → Lint → Test → Publish 顺序，`/tmp/ts06-proof.mjs` 3 个变异体全红）
  - [x] lockfile 冻结安装。（`pnpm install --frozen-lockfile`）
- 工作量：0.2 天

#### TS-32 · 把 201 条孤儿浏览器 E2E 接进脚本与 CI ★ 最高 ROI

- 依据：P0-6。根 `package.json` 无 `test:e2e` / `e2e` 脚本；`ci.yml` 无浏览器步骤；`grep -rn "test:e2e\|e2e" package.json .github/workflows/*.yml` 零命中。而根 `vite.config.ts` 已完整配置浏览器模式，`test/browser/global-setup.ts` 会拉起 `:3998` 并预热 20 条路径，12 spec / 201 用例就绪。
- 做法：
  1. 根 `package.json` 加 `"test:e2e": "vp test"`（在根目录执行，命中根 `vite.config.ts` 的 `include`）。
  2. `ci.yml` 加独立 step（在 Test 之后）：复用已有的 Playwright 缓存/安装步骤，`pnpm test:e2e`。
  3. 失败时上传 Playwright trace（`actions/upload-artifact`）。
  4. 清理死代码：`test/browser/pages/data-fetch.page.ts` 要么补 spec，要么删除 POM（二选一，不允许悬空）。
- 涉及：根 `package.json`、`.github/workflows/ci.yml`、`test/browser/pages/data-fetch.page.ts`、根 `vite.config.ts`（`trace.tracesDir`）、`test/browser/global-setup.ts`（`cleanTraceStaging()`）、`.gitignore`。
- 验收：
  - [x] `pnpm test:e2e` 在本地可执行，201 条用例全绿。（`Test Files 12 passed (12)`、`Tests 201 passed (201)`，EXIT=0）
  - [x] CI 中出现该 step 且**真的跑了浏览器**（日志含 `:3998` 启动与预热）。（step 已接线；日志确认需在 CI 上观察——本地 `global-setup.ts` 已打印 `:3998` 启动与 21 条路径预热）
  - [x] 人为破坏一个页面（临时）→ 对应用例红。（注释掉 `test/browser/commands.ts` 的 `waitForDomQuiet(page)` → `01-home-navigation.e2e.spec.ts:79` 红：`expected '🧪 ubean-test' to contain '关于'`，200/201 通过）
  - [x] ③ 补充实测：`trace: { mode: 'retain-on-failure', tracesDir: 'test-results' }` 确实产出可用的 `*.trace.zip`（804K）；**但 Playwright 会在同目录留下 604M / 3427 个原始中间产物**（`.trace`/`.network`/`.jpeg`/`.jsonl`/`screencast/`/`resources/`），故 `ci.yml` 上传路径收窄为 `test-results/**/*.trace.zip`，并把 `test-results` 加入 `.gitignore`。
  - [x] ③ 续：上一条的 604M 残留**不是失败运行特有**——一次**全绿**运行同样留下 549M / 3381 个文件、且 **0 个 `.trace.zip`**（绿跑时 zip 被 `retain-on-failure` 删掉，原始暂存却留着）。根因（读 `@vitest/browser-playwright/dist/index.js` 源码证实）：`deleteTracing()`（L710-729）**只 unlink 最终的 `*.trace.zip`，从不清理暂存目录**；且 `resolveLaunchOptions`（L926-927）把 `browser.trace.tracesDir` 直接透传给 Playwright 的 `launchOptions.tracesDir`，**一旦显式指定就绕过了 Playwright 自己的临时目录回收**。即：本项 ③ 的 `tracesDir` 写法本身就制造了这个泄漏。修法：在 `test/browser/global-setup.ts` 增加 `cleanTraceStaging()`，于 `setup()` 开头与 `teardown()` 各调用一次，**只保留 `*.trace.zip`、其余全删**。
  - [x] ③ 续·顺序实测（关键前提）：`globalSetup` 的 `teardown` 运行在 **zip 打包之后**，所以此时删暂存是安全的。用一次性探针（`trace.mode` 分别为 `on` / `retain-on-failure`）验证：`teardown` 时目录已有 `zips=1`，执行清理后 `removed=7 left=["…-0-0.trace.zip"]`，进程退出后目录仅剩 52K 的 zip。若 teardown 早于打包，此修法会毁掉 trace——故必须保留这条实测记录。
- 参照：Nuxt `playwright.config.ts` 的 e2e 项目编排；React Router `pretest:integration: pnpm build` 先构建再起服务的顺序。
- 工作量：0.5 天
- **说明**：本项**不新增任何测试**，纯接线——因此是全部任务中性价比最高的一项，应最先做。

### 阶段 1 · 补 P0 断言（合计约 1 周）

#### TS-07 · 中间件 13 步链序列断言 ★ 本方案最高价值单项

- 依据：P0-3（`app-registration.test.ts:73,103` 仅比数量）。
- 13 步链（`packages/app/src/app.ts`，逐行核对；行号为实施后的最终位置）：

  | # | 步骤 | 行号 | 条件 |
  | --- | --- | --- | --- |
  | 1 | `handle` hook 闸门 | 315 | 始终 |
  | 2 | `requestId()` | 324 | 始终 |
  | 3 | actionContext ALS | 328 | 始终 |
  | 4 | `securityHeaders` | 337 | `securityHeaders !== false` |
  | 5 | CSRF | 351 | `csrf !== false` |
  | 6 | `dataCache` | 364 | `dataCache !== false` |
  | 7 | cacheStore 初始化 | 379 | `cacheStore` 或 `cache.store==='fs'` |
  | 8 | i18n | 388 | `enabled !== false && locales.length > 0` |
  | 9 | routeRules | 404 | `routeRules` 非空 |
  | 10 | cache 中间件 | 420 | 存在 cache 规则 |
  | 11 | websocket | 425 | 始终 |
  | 12 | lifecycle hooks | 429 | 始终 |
  | 13 | `/_health` | 447 | `healthEndpoint !== false` |

- 做法：照 Nitro `test/tests.ts:286-290` 手法——`expect(data).toEqual(["rules", "global", "routed"])`。**实施形态**：`app.ts` 新增 `markMiddlewareStep()` / `withStep(step, handler)` 两个模块级辅助，每个中间件按注册顺序用 `withStep()` 包一层，进入时把步骤名 push 进请求级变量 `__ubean_mw_order__`；第 ⑦ 步（cacheStore 初始化）与第 ⑬ 步（`/_health` 本身）不是中间件，用纯记录空壳 `recordOnlyStep(step)` 在同一位置登记，使 13 步全序在请求期可观测。`GET /_health` 把它回显为 `mwOrder` 字段。测试断言**完整序列**：单元面 13 步全序（`packages/app/test/middleware-order.test.ts`），黑盒面真实 dev server 上的 11 步（`examples/ubean-test/test/middleware-order.test.ts`，⑦/⑩ 因示例配置关闭而缺席，缺席本身也被断言）。门控关闭的中间件断言其**缺席**。
- 涉及：`packages/app/src/app.ts`（辅助函数 + 13 处打点）、`packages/shared/src/types.ts`（`UbeanMiddlewareStep` 联合类型 + `UbeanVariables.__ubean_mw_order__`）、`packages/app/src/index.ts`（类型 re-export）、`packages/app/test/middleware-order.test.ts`（新）、`examples/ubean-test/test/middleware-order.test.ts`（新）。
- 验收：
  - [x] 断言通过且覆盖 13 步全序。
  - [x] 人为交换两个中间件注册顺序（临时）→ 测试红并指出错位位置。
  - [x] `security:false` / `csrf:false` / `dataCache:false` 三关配置下，断言对应步骤缺席（与 TS-14 联动）。
  - [x] 三份文档同步：本文件任务表、`app.ts` 链顶注释、（可选）站点 architecture 文档。
- 参照：Nitro `tests.ts:286`。
- 工作量：1 天

> **实施记录（TS-07）**
>
> - 红→绿证明：用 `/tmp/ts07-red.mjs` 把 `app.ts` 第 ④ 步（`securityHeaders`，333-345 行）与第 ⑤ 步（`csrf`，347-360 行）两个**整块**互换 → `Tests 4 failed | 5 passed (9)`，失败输出直接给出错位元素（`- "securityHeaders"` / `+ "securityHeaders"` 的 diff 位置）→ 按字节恢复原文 → `Tests 9 passed (9)`。
> - 真实 dev server 实测序列（`GET /_health`）：
>   `["handle","requestId","actionContext","securityHeaders","csrf","dataCache","i18n","routeRules","websocket","lifecycle","healthEndpoint"]`（11 步）。
> - ⑦ `cacheStore` 缺席原因：示例未设 `cache.store`，也无 `cacheStore` 实例。⑩ `routeCache` 缺席原因：`resolveRouteCacheRules()`（`packages/server/src/cache.ts:368`）仅在 `rule.cache.ttl != null` 时产出规则，示例 `routeRules` 只有 `isr`/`ppr`。两者均为**预期**缺席，已写入黑盒测试的期望值与注释。
> - 站点 architecture 文档：核对 `apps/docs` 后确认其中**没有**任何描述这 13 步链的正文（不是「改」而是「增」），故本项按「三份文档同步」的字面要求落到「本文件任务表 + `app.ts` 链顶注释」两处，站点侧留待 TS-14 联动时一并补。

#### TS-08 · 路由栈内省从「计数」升级为「顺序 + 内容」

- 依据：`app-registration.test.ts:73,103` 仅比数量。
- 做法：扩展 `registeredPaths`/`hasRoute` 辅助，断言关键路由的**注册顺序**（static-before-routes，`app.ts:485` vs `app.ts:533`）与方法集。
- 验收：
  - [x] 断言 static 中间件先于用户路由。
  - [x] 断言 API 路由方法集与源码声明一致（抽样）。
- 工作量：0.5 天

> **实施记录（TS-08）**
>
> 1. **辅助函数**（`packages/app/test/app-registration.test.ts`）：新增 `registeredEntries(app)`（把 `app.hono.routes` 映射为 `{ index, method, path, handler }`，**带下标**，因为 Hono 的 `routes` 数组顺序即注册顺序）与 `apiMethodSets(app)`（跳过 `method === 'ALL'` 与非 `/api/` 前缀，按 `(method, path)` 去重后返回排序数组）。
> 2. **为什么必须去重**：`registerApiRoutes` 每个 `(method, path)` 会注册 **3 条**条目（`metaMiddleware` → `matcherMiddleware` → `handlerWrapper`），所以「比数量」天然不可靠，必须按 `(method, path)` 归并成方法集再断言。
> 3. **为什么不能按 `handler.name` 定位**：内部中间件经 `hono.use('*', fn)` 注册时 `handler.name` 为空，而用户路由的 3 条条目全部有名字；两侧命名规律相反，按名字匹配会静默错位。static 中间件与 9 条内部 `ALL /*` 中间件**同名同形**，只能靠**位置**锚定。
> 4. **static-before-routes 的锚点**：`this.hono.use('/*', serveStatic({ publicDir }))` 在 `app.ts:485`，`await registerRoutes(...)` 在 `app.ts:533`。测试用「`init()` 之前的条目数」当分界线（而非写死 10），再在新增条目里取第一个 `method === 'ALL' && path === '/*'` 与第一个 `/api/` 前缀条目比较下标 —— 这样断言的是**顺序关系**本身，不依赖任何计数常量。
> 5. **方法集是「声明 ∩ 模块导出」的交集**：`registerApiRoutes` 对每个路由取 `normalizeMethod(route.method)`，再从 loader 返回的模块上 `resolveRouteExport`，两者不匹配时**静默 `continue`**（不抛错）。因此「声明 GET+POST、模块只导出 GET」是真实可达的退化路径，单列一条 `it()` 固定该语义。
> 6. **抽样对象是磁盘上的真实源码**：`hello.ts`/`cookies.ts`/`users/index.ts` 三个样本的期望值由 `readFileSync` + `/^export\s+const\s+(GET|POST|...)\b/gm` 从 `examples/ubean-test` 现场解析，并先断言 `methods.length > 0` 防止正则失效导致断言空转通过（否则「字面量等于字面量」）。
> 7. **红证（`/tmp/ts08-red.mjs`，三个变异体全部转红，`RESULT=PASS`）**：
>    - M1 把 `app.ts:485` 的 static 中间件移到 `registerRoutes` 之后 → `EXIT=1`，`Tests 26 failed | 16 passed`，`static 中间件先于用户路由注册` 命中。
>    - M2 把 `registerOpts.routeLoaders` 清空 → `EXIT=1`，`Tests 3 failed | 39 passed`，`抽样：注册方法集与源码声明一致` 命中（`expected undefined to deeply equal [...]`）。
>    - M3 让夹具只声明源码解析出的第一个方法 → `EXIT=1`，`Tests 1 failed | 41 passed`，同样命中。
>    - 三个变异体各自还原后文件**逐字节**回滚校验通过；绿跑 `EXIT=0`，`Tests 42 passed (42)`。
> 8. **spec 行号漂移**：任务表原文引 `app.ts:405-416` 已失效（TS-07 在链上插入了包装函数），真实锚点为 `app.ts:485` / `app.ts:533`，此处已就地更正。
> 9. **探测夹具已清理**：过程中新建的 `packages/app/test/_probe-routes.test.ts` 为一次性机制探测，落地后已删除；`packages/app/test/` 现为 `app-registration.test.ts` / `hooks.test.ts` / `middleware-order.test.ts` 三个文件。

#### TS-09 · 构建产物内容级断言（防「体积门禁全绿但产物空」重演）

- 依据：历史事故 #2——`virtual:ubean-asset-manifest` 内联空产物（生产 HTML 无入口 `<script>`、无样式表），当时所有体积门禁全绿。
- 做法：`packages/builder/test/production-build.test.ts` 增加：生产 HTML 含非空入口 `<script src>` 与 ≥1 个 `<link rel="stylesheet">`；asset-manifest 产物非空且含入口字段。
- 验收：
  - [x] 断言落在构建矩阵中至少 fullstack+node 一格（其余格随 TS-12 推广）。
  - [x] 人为制造空 manifest（临时）→ 测试红。
- 参照：React Router fixture 的 `grep(cwd, pattern)` 产物内容断言。
- 工作量：0.5 天

> **实施记录（TS-09）**
>
> 1. **断言落在 `packages/builder/test/production-build.test.ts`（fullstack 模式，node 运行时）** —— 该文件的唯一 `it()` 用 `buildWithEnvironments` 真跑一次双环境构建，正是「构建矩阵 fullstack+node」那一格。
> 2. **产物位置经实测校正**：spec 原文写「生产 HTML 含入口 `<script src>`」，但 fullstack 的 client 入口是虚拟模块 `.ubean/virtual/client-entry.mjs`，`public/index.html` 由 prerender 产出、本 fixture 未开 prerender ⇒ **磁盘上没有 `dist/public/index.html`**。因此断言改落在**服务端产物内联的 `assetTags` 字面量**上（`serverDir/entry.mjs` 里的 `var assetTags = { css, preloads, body, favicon }`），这正是历史事故 #2 的现场：值在构建期内联，事故形态就是这里为空。
> 3. **新增两个模块级辅助函数**：`readInjectedAssetTags(bundle)` 用锚点 `var assetTags = {` + 闭合 `\n};` 切出对象字面量并 `JSON.parse`（锚点缺失即断言失败，避免静默跳过）；`attrValue(fragment, attr)` 取属性值（用字符串拼接，不用模板串）。
> 4. **三条断言，各堵一个缺陷面**：① 入口 `script` 的 `src` 以 `/assets/` 开头、以 `.js` 结尾、**且文件真实存在**（防「标签写了个不存在的路径」）；② 内联 `css` 至少 1 个 `<link rel="stylesheet">`，每个 `href` 以 `/assets/` 开头、`.css` 结尾、**且文件真实存在**；③ `manifest.assets` 里的 `isEntry` 条目必须记录 `css`，且与内联 `css` 的 href 集合**逐一对应**（构建产物契约：manifest 与内联标签不许各说各话）。「产物存在 ≠ 产物可用」这条设计规则在这里落到「引用得到 + 文件在盘上」两个正交断言上。
> 5. **必须新增 fixture 文件 `packages/builder/test/fixtures/build-project/src/app.vue`（偏离 spec 的「涉及」范围，需备案）** —— 原因经实测：`computeAssetTags` 只读 client manifest 里 **`isEntry` 那一条**的 `css` 字段，而 Vite 只把「静态进入 entry chunk」的样式算作 `entry.css`。原 fixture 唯一带 `<style>` 的组件是动态入口 `src/pages/index.vue`，其 CSS 落在**独立 chunk**，`entry.css` 为空 ⇒ `assetTags.css === ""`，第 ② 条断言根本无法成立。`src/app.vue` 是小写优先的应用根组件（`packages/builder/src/vue-virtual-modules.ts:54-56` 静态 import），是让 entry chunk 带样式的最小、且语义正确的选择。
> 6. **首次探针（已删除的 `test/_probe-ts09.test.ts`）证伪了「CSS 天然存在」的假设**：加 `src/app.vue` 之前 `manifest.assets[0]` 无 `css` 字段、`.vite/manifest.json` 全文无 `css`、内联 `assetTags.css === ""`；加之后 `entry.css = ["assets/app-CdINcnPK.css"]`、内联 `css` 出现 `<link rel="stylesheet" href="/assets/app-CdINcnPK.css">`。
> 7. **`src/app.vue` 是共享 fixture** —— `packages/builder/test/cloudflare-preview.test.ts:217` 用同一个 `fixtures/build-project` 跑 `ubean build --preset cloudflare`，故**必须重跑**：`Tests 9 passed (9)`（含真实 miniflare/workerd 那条）。
> 8. **红证（`/tmp/ts09-red.mjs`，三个突变体各自命中不同断言）**：测试经 `@ubean/build/production` 走**构建后的 `dist/`**，故每个突变体都 `pnpm --filter ./packages/builder build` 重建后再跑。
>    - **M1 空 manifest（RM-V21 模拟）**：把 `resolveInjectedAssetTags` 的 memory/disk 两个分支都改成 `computeAssetTags(null)`（即历史事故「两个 provider 竞态后内联永远是空」）→ `EXIT=1`，`Tests 1 failed (1)`，失败在**先于** TS-09 的既有断言 `expected '…' to contain 'assets/app-'`（空 tags 连入口 `<script>` 都没有，说明事故现场被最早的那道门也拦住了）。
>    - **M2 `computeAssetTags` 丢 css**（`tags.css = ''`）→ `EXIT=1`，失败于新断言②：`内联 assetTags.css 应至少含 1 个 <link rel="stylesheet">，实际：""`。
>    - **M3 `manifest.assets` 丢 css**（`css: undefined`）→ `EXIT=1`，失败于新断言③：`manifest 入口条目应记录 css（构建产物契约）: expected [] to deeply equal [ 'assets/app-CdINcnPK.css' ]`。
>    - **还原为字节级同一**（`RESTORED=byte-identical`），`git diff -- packages/builder/src` 为空；还原后重跑 `EXIT=0`、`Tests 1 passed (1)`。全包回归 `Test Files 37 passed (37) / Tests 416 passed (416)`。
> 9. **未与单测重复**：`test/asset-manifest.test.ts` 已在单元层覆盖 `computeAssetTags` 的 css 拼接与 `resolveInjectedAssetTags` 的 memory/disk/none 优先级；TS-09 不重复这些，而是让**同一批事实**经一次真实双环境构建端到端成立（「每层只证明只有它能证明的事」）。
> 10. 遗留：断言目前只覆盖 fullstack+node 一格，其余平台格按 spec 交 TS-12 推广。

#### TS-10 · 「错误配置必须失败」测试域

- 依据：SvelteKit `packages/kit/test/build-errors/` 六个 spec 是唯一把它做成独立目录的框架；ubean 只有运行时错误测试（`errors.test.ts`），无构建期错误断言。
- 做法：新建 `packages/cli/test/build-errors.test.ts`（或 builder 侧），用临时 fixture 项目断言：非法 `ubean.config.ts`、`srcDir` 不存在、拦截路由 `(.)/(..)/(...)` 标记（扫描器已知会抛错）、非法路由组/并行路由标记 → 构建**以非零码退出**且错误信息**可操作**（含修复建议文案片段）。
- 验收：
  - [x] ≥5 类非法输入各有断言（退出码 + 错误信息片段）。
- 参照：SvelteKit build-errors。
- 工作量：1 天

> **实施记录（TS-10）** — 已完成，15/15 绿，红证 3 条全通过。
>
> 1. 落地物：新建 [packages/cli/test/build-errors.test.ts](packages/cli/test/build-errors.test.ts)（约 300 行）。调用**已构建**的 CLI（`packages/cli/dist/cli.js`），沿用 `build-contracts.test.ts` 的既有范式；`NODE_ENV=production`；`--outDir .temp-build`；`runBuild()` 采用**非零码 resolve** 变体（`build-contracts.test.ts` 的 `build()` 是非零即 reject，无法断言退出码本身）。
> 2. 独立 fixture 根：`packages/cli/test/fixtures/build-errors/`，`beforeAll` + `afterAll` 双向清理。**刻意不复用** `packages/builder/test/fixtures/build-project`（理由同 `build-contracts.test.ts:37-38`：共享 `.temp-*`/`.ubean` 在 `pnpm -r --parallel` 下会造成「单跑绿、全量跑红」）。
> 3. 覆盖 **9 类**非法输入，每类断言「退出码非零」+「错误信息片段」（全部片段来自探针实测，非猜测）：① `ubean.config.ts` 语法错误（`ParseError`）；② 配置模块内 `throw`（自定义文案原样透出）；③ 配置模块 `import` 不存在的文件（`Cannot find module`）；④ 配置默认导出不可构造（`cannot be invoked without`）；⑤ 拦截路由 `(.)` 标记（`拦截路由目录约定不被支持` + `发现了 "`）；⑥ 页面 SFC 语法错误（`Interpolation end sign was not found`）；⑦ API 路由模块语法错误（`Build failed with 1 error`）；⑧ API 路由模块 `import` 缺失（`UNRESOLVED_IMPORT`）；⑨ `vite.config.ts` 语法错误（`failed to load config from`）。
> 4. **偏差（必须记录）**：spec 点名的两类没有抛错点，实测**静默成功（exit 0）**，因此不能作为「必须失败」的断言，改以其余 9 类替代，并把这两类降级为 `SILENT_CASES` 反向固化：
>    - `srcDir` 不存在：`resolveUbeanConfig` 绝对化路径但**不校验存在性**；`scan-pages.ts` 的 `glob(...).catch(() => [])` 把 glob 失败吞成空数组 ⇒ 0 页面 + `Build complete`。
>    - 非法路由组/并行路由标记：`stripRouteGroups()` 只做正则剥离，**从不校验**；`(group/index.vue` 这类未闭合组同样 exit 0。
> 5. 附加 **4 类静默用例**（`SILENT_CASES`，断言 exit 0 + 证据串），把「当前会静默通过」固化成可见事实、便于日后加校验时立刻变红：`srcDir` 不存在（`0 pages`）、未知 `--preset bogus`（回落 `Using preset: standard`）、未知 `--mode bogus`（`App mode: bogus`）、未闭合路由组（`Build complete`）。这是**故意埋的绊线**：一旦补上 `mode`/`preset`/`srcDir` 校验，这些用例必须同步改写。
> 6. 反向对照：合法基线项目断言 exit 0 + `Build complete` + 产出 `server/server.mjs`，确保「非零退出」不是恒真断言。
> 7. 绿证：`pnpm --filter "./packages/cli" exec vp test run test/build-errors.test.ts` → `Tests 15 passed (15)`，EXIT 0。
> 8. 红证（`/tmp/ts10-red.mjs`，3 条互相独立的可证伪轴，每条都「改源码 → 重建 owning 包 dist → 跑测试必须红 → 逐字节还原 → 重建 → 再跑必须绿」）：
>    - M1 让 `INTERCEPT_MARKER_RE` 永不匹配（拦截路由守卫失效）→ `Tests 1 failed | 14 passed`，命中的正是 `intercept-route-marker`；`RESTORED=byte-identical`。
>    - M2 改写错误文案（`拦截路由目录约定不被支持` → `拦截路由已停用`，模拟「可操作信息丢失」）→ `Tests 1 failed | 14 passed`，同用例变红；`RESTORED=byte-identical`。
>    - M3 把 `packages/cli/src/build.ts:245` 的 `process.exit(1)` 改成 `process.exit(0)`（模拟 CLI 吞掉失败）→ `Tests 9 failed | 6 passed`，9 条错误用例全部变红；`RESTORED=byte-identical`。
>    - 收尾 `GREEN EXIT=0 Tests 15 passed (15)`，`RESULT=ALL-PROOFS-PASS`。三个被改文件在 `git status` 中确认零残留。
> 9. 断言通道说明（写测试时的硬约束）：`build.ts:243-246` 只打印 `err.message` 后 exit 1，**没有** CLI 自有的错误前缀，所以片段必须取自被抛出的原始 message；而 Vite/Rolldown 的构建失败会额外打印多行报告（`Build failed with 1 error:` + 插件标签 + 代码帧），因此 ⑦⑧⑨ 的片段取自该报告。
> 10. 仍未覆盖：构建期**警告**（非错误）没有断言；错误信息里「修复建议」目前只覆盖拦截路由一类，其余类别靠原始 message 间接体现。按 spec 交后续任务。

#### TS-11 · 三个示例纳入守卫

- 依据：P0-4。`frontend-only`（无后端路径）、`routing-file-mode`（`routing.mode:'file'` 产物 + `onGenerated` + HMR）、`ssg-catchall`（SSG catch-all chunk 能被 preview 静态服务器访问——其注释自述的存在理由）。
- 做法：各加最小 smoke：真实构建 + 产物内容断言 + 关键路径请求 200；纳入 CI 的 `pnpm test`（或 CI 独立 step）。`platform-drivers` 补成可运行示例或显式标注「代码片段集，非示例」。
- 验收：
  - [x] 三示例各有 ≥1 个进 CI 的 smoke 测试。
  - [x] `platform-drivers` 定性明确。
- 参照：SolidStart fixture 应用矩阵（`bare`/`bare-js` 测降级路径的思路）。
- 工作量：2 天

> **实施记录（TS-11）**
>
> 1. 新增 `packages/cli/test/example-smoke.test.ts`（4 个 `describe`、13 个用例），放在 `packages/cli/test/` 而非示例目录内：同目录的 `preview-cli.test.ts`、`build-contracts.test.ts` 已经用「构建产物 + 真实起服务」的同一套设施，且 `packages/cli/vite.config.ts` 设了 `fileParallelism: false`，CLI 集成测试串行跑不会互踩端口。**这是相对 spec「涉及」的偏差**（spec 只写了三个示例目录 + `platform-drivers`）。
> 2. 每个示例各自 `build --outDir .temp-build` 再 `preview --outDir .temp-build`：**绝不动示例里已提交的 `dist/`**（`.gitignore` 的 `.temp-build*` 已覆盖）。构建产物在 `beforeAll` 里生成，`afterAll` 里连同 `.temp-build` 一起删除，因此示例目录本身保持 git clean。
> 3. **`preview` 必须显式带 `--outDir .temp-build`。** 不带时它读 `config.build.outputDir`（即 `dist`），而 `examples/ssg-catchall/dist`、`examples/routing-file-mode/dist` 是**陈旧产物**，会返回一堆假 404（`/search`、`/__search.json`、`/api/hello` 全 404）。这是本轮踩到的最大的坑，已固化为「探针脚本与测试一律传 `--outDir`」。
> 4. **`preview` 只绑 IPv6 `::1`**：轮询 `127.0.0.1` 恒为 000，必须按 `['::1','127.0.0.1']` 顺序取第一个可达地址（复用 `preview-cli.test.ts:61-89` 的形状）。
> 5. **fullstack（node preset）不产出 `public/index.html`**：HTML 由生产 handler 请求时渲染，只有 spa/ssg 才写静态壳。第一版断言「客户端 HTML 壳存在」直接把测试打红，改为「`server/server.mjs` + `server/entry.mjs` + `manifest.json` + `public/.vite/manifest.json` + `app-*.js` 入口 chunk 存在」**外加一条负向断言** `expect(existsSync(public/index.html)).toBe(false)`，把这个事实钉死。
> 6. **`__search.json` 的顶层键是 `content`，不是 `sections`**：`generateSearchSectionsSnapshot`（`packages/content/src/search.ts:126-135`）按**内容集合名**做 key，`content: true` 时集合名就是 `content`；`prerender-step.ts:189-190` 日志里的「N sections」是各集合内 section 数组长度之和，不是顶层键数量。第一版按 `sections` 断言同样直接打红。
> 7. 其余断言遵循三条纪律：断言**效果**（HTTP 状态/Content-Type/正文标记/产物字节）而非配置回读；`ssg-catchall` 的 chunk 文件名带内容 hash，**只能按 `_...slug_-` 前缀 + `readdirSync` 过滤**（≥3 个），再逐个 `GET /assets/chunks/<name>` 断言 200 + `javascript`（产物存在 ≠ 可服务）；`/../etc/passwd` 必须 404。
> 8. `platform-drivers` 定性双保险：`README.md` 顶部加「**代码片段集，非示例**」blockquote；测试里加负向断言（`package.json`/`ubean.config.ts`/`src/` 三者**都不存在**），一旦有人把它补成真示例，这条会红，提醒同步更新定性记录。
> 9. **红证**（`/tmp/ts11-red.mjs`，`RESULT=ALL-PROOFS-PASS`）：基线 `13 passed (13)` EXIT=0；M1 改 `examples/routing-file-mode/src/routes/api/hello.ts` 的文案 → EXIT=1 `1 failed | 12 passed`，失败的正是「文件模式生成的产物可服务」；M2 改 `examples/frontend-only/src/pages/about.vue` 的根 class → EXIT=1 `1 failed | 12 passed`，命中「预渲染页面可服务」；M3 改 `packages/builder/src/vite/prerender-step.ts:188` 的 `__search.json` 写盘文件名（并重建 `./packages/builder`）→ EXIT=1 `2 failed | 11 passed`，命中「预渲染出完整静态站点」。三次变异全部 `RESTORED=byte-identical`（sha256），最后整体重跑 `GREEN EXIT=0 Tests 13 passed (13)`，`git status` 零残留。
> 10. 仍未覆盖：`routing-file-mode` 的 **HMR**（spec 提到但属于 dev 态，归 TS-20 的 dev 矩阵）；三个示例的 `pnpm test` 归属仍是 `packages/cli` 的测试文件，示例自身没有 `test` script。

### 阶段 2 · 建矩阵（合计约 2.5 周；收益最大）

#### TS-12 · preset 行为矩阵（Nitro `testNitro()` 模式）★

- 依据：P1-6。`build-contracts.test.ts` 只断言产物存在，不起服务、不发请求。
- 做法：
  1. 抽 `testPreset(ctx, getHandler, additionalTests?)`：断言族含 `/_health`、API JSON、404（HTML vs JSON 分支）、缓存命中、安全头、CSRF、i18n 重定向、route rules 生效。
  2. 9 个 preset（node/cloudflare/standard/bun/deno/vercel/vercel-edge/netlify/aws/azure 中按可运行性取舍）各自调用；cloudflare 走 TS-04 的 miniflare。
  3. 平台差异**在断言内表达**（照 Nitro `tests.ts:750`：同一条断言按 `ctx.preset` 分支期望值），不用整条 skip；确需 skip 用 `it.runIf/skipIf` 并注明原因。
  4. 类型化 `ctx`（对齐 Nitro `tests.ts:29-32`）：`preset / mode / isDev / isWorker / isLambda / isIsolated / isServerless / isWindows`。
  5. 复用 Nitro 的 **per-preset 临时 outDir** 模式：一个共享 fixture app + 每个 preset 一个临时输出目录（cloudflare 用仓内 `.tmp/<preset>`，其余 `tmpdir()/ubean-tests/<preset>`），解决 `fileParallelism:false` 下的共享 fixture 冲突。
- 涉及：新 `packages/cli/test/preset-runtime/`（或 `packages/builder/test/`），复用 `build-contracts.test.ts` 的临时 outDir 设施。
- 验收：
  - [x] ≥4 个 preset（node/cloudflare/bun/deno）跑同一套行为断言。→ 实测 **9 个** preset（node/bun/deno/standard/cloudflare/vercel/netlify/aws/azure）× **11 条断言族** = 99 用例（97 绿 + 2 显式 skip）。
  - [x] 差异分支有注释说明原因（引 ADR-0013）。→ `harness.ts` 顶部「执行形态」段、`artifact-contracts.ts` 的 `cronModules` 判据说明、`packages/builder/src/vite/cloudflare-preview.ts` 的 `redirect` 转发说明均引 ADR-0013 / 实测依据。
  - [x] cron 进程内调度器在 serverless preset 下缺席有断言；ISR store 在 serverless 下为内存有断言。→ ⑪（`cronModules`，两个方向变异均红）+ ⑦（fs 落盘观测，4 个 serverless preset 变异转红）；cloudflare 由 ① 的 `cacheStore` 步骤缺席覆盖（⑦/⑪ 在 workerd 上永真，已 `it.skipIf` 可见跳过并注明）。
- 参照：Nitro（核心，`test/tests.ts:200` / `:85-86` / `:286` / `:750`）、SvelteKit `platform-tests-all.yml`（可复用工作流 + 平台参数）、React Router（harness 拆分）。
- 工作量：1 周

#### TS-33 · dev/build 双轨：同一断言族跑两遍 ★

- 依据：§3.2。L2 默认跑 `ubean dev`，与主流相反（Nuxt e2e 默认 `build=true`；Next 推荐测生产代码）。历史漏检 #2 正是「dev 侧有断言、build 侧无断言」。
- 做法：
  1. 引入 `UBEAN_TEST_MODE=dev|build`，`examples/ubean-test/test/global-setup.ts` 按此值决定跑 `ubean dev` 还是 `ubean build && ubean preview`。
  2. 抽「断言族」：把 L2 中**依赖运行形态**的用例（缓存、ISR、prerender、安全头、i18n 重定向、route rules、dataCache）参数化到同一个 `describe.each(['dev','build'])`。
  3. 首次只对**高风险子集**开双轨（约 40 条），不全量翻倍——控制 CI 时间。
  4. build 模式产物断言与 TS-09 共用断言族。
- 涉及：`examples/ubean-test/test/global-setup.ts`、`examples/ubean-test/test/{cache,prerender,seo,i18n,route-rules,data-cache}.test.ts`、根 `package.json`（`test:e2e:build` 或环境变量）。
- 验收：
  - [x] `UBEAN_TEST_MODE=build pnpm --filter ubean-test test` 可执行且绿。→ 实测 **37 文件 / 785 通过 + 3 显式 skip（788）**，17.0s（另加一次 `.temp-build` 构建，teardown 自动清理）；根 `pnpm test:build` 是同一入口。dev 轨同步为 37 文件 / 788 全绿。
  - [x] 至少 1 条断言在 build 模式下**发现 dev 模式下发现不了的差异**。→ 实测 **4 类差异**（不是「无差异」）：① `/_openapi.json` + `/_scalar` 只在 dev 注册、build 轨必须 404（顺势改写成**生产泄漏守卫**）② ⑦ `cacheStore` 中间件步只在生产 fs 缓存后端下打点 ③ 数据缓存按 `NODE_ENV` 开关（`devNoCache` 的 `fetchCount`：dev=2 / build=1）④ `download.test.ts` 的 OpenAPI schema 断言在 build 轨无对象可查（已 `runIf` **可见跳过**）。**不对称红证**：把 `resolveProductionCacheStore()` 的 auto 分支改成恒 `memory`（＝生产不再落盘缓存）→ **dev 轨 788 全绿、build 轨 1 红**（`middleware-order` 的 `/_health` 序列）→ `BYTE-IDENTICAL` 还原。这正是「dev 看不见、只有生产路径能看见」的漏检形态。
  - [x] CI 中 dev 与 build 两轨都跑。→ `ci.yml` 在 `Test`（dev 轨，`pnpm test`）之后新增 `Test (build track)` step 跑 `pnpm test:build`；与 dev 轨同一 job，故 `ci-ok` 聚合门禁自动覆盖（无需改 `needs`）。
  - 做法③偏差（实测驱动）：spec 建议「首次只对高风险子集（约 40 条）开双轨，不全量翻倍」。首轮 build 轨探针显示 789 条里只有 **9 条红（5 个文件）**，修掉 4 类差异后全量在 build 轨只需 **17s**。因此**改为全量双轨**：只挑 40 条会让另外约 740 条断言的生产路径无人守，正是本任务要消灭的形态。
- 参照：Nuxt `e2eMatrix`（`playwright.config.ts:9-15`）、SvelteKit `DEV=true`、Vite `VITE_TEST_BUILD`、Next `NEXT_TEST_MODE`。
- 工作量：3 天

#### TS-13 · CI OS × Node 矩阵

- 依据：现仅 ubuntu + lts；Windows 路径/CRLF/`fs.watch` 行为不可见。
- 做法：`ci.yml` 改矩阵：`os: [ubuntu-latest, windows-latest]` × `node: [22, 24]`，`fail-fast: false`；在 include/exclude 处注释取舍理由（照 Astro 注释风格）。playwright 缓存键按 OS 分离。
- 验收：
  - [x] ≥4 格矩阵；windows 至少跑 L1+L4（浏览器 E2E 可仅 ubuntu，注释说明）。→ `os: [ubuntu-latest, windows-latest]` × `node: [22, 24]` = **4 格**，`fail-fast: false`，`runs-on: ${{ matrix.os }}`。Windows 格跑 `pnpm typecheck`（内含全量构建）+ `pnpm lint` + `pnpm test`（= L1 + L4 的构建产物契约）+ `pnpm test:build`（TS-33 双轨）；浏览器 E2E / 体积门禁 / 示例 type-check / 文档站构建 / 仓库护栏脚本用 `if: runner.os == 'ubuntu-latest'` 门控（**不用** `matrix.exclude` 缩矩阵，保证「某格少跑了什么」在 workflow 里可见）。chromium 在**每一格**都装（`packages/cli/test/dev-dx.test.ts` 属 L1、需要真实浏览器；缺了只会看到一个 suite 级错误 + 10 条显示为 skipped 的用例），缓存键按 OS 分离，且刻意不覆盖 `PLAYWRIGHT_BROWSERS_PATH`（让 CI 与本地共用同一安装位置）。
  - [x] `ci-ok`（TS-05）聚合全部格。→ `needs: [ci]` 对矩阵 job 天然等待**全部格**，故矩阵化无需改聚合门禁。新增结构断言 `packages/cli/test/ci-matrix.test.ts`（6 例）钉死：「矩阵 ≥4 格且含 windows」「`fail-fast: false`」「`runs-on` 走 `matrix.os`」「平台专属步骤都有门控」「`ci-ok.needs` 覆盖**每一个** job」「`if: always()`」。红证：5 个变异（删 windows 轴 / fail-fast 改 true / 去掉 E2E 门控 / `needs: []` / `runs-on` 写死 ubuntu）逐个在该用例上转红并只红在预期的那条，`BYTE-IDENTICAL` 还原后复绿。
  - 顺带修掉矩阵本该暴露的 Windows 隐患：`packages/builder/test/asset-manifest.test.ts` 有 6 条断言把**文件系统绝对路径**写成 POSIX 字面量（`'/app/dist/public'`、`'/abs/site'`），在 Windows 上**必红**且是两重原因——`join()` 产出 `\` 分隔符比不过 `'/'`；且 `'/abs/site'` 在 Windows 上**不算绝对路径**（需盘符/UNC），会走「拼 cwd」那条分支，语义与断言假设不同。已改为用 `resolve()` 构造平台基准 + `join()` 构造期望值（本地 11/11 复绿）。
- 参照：Vite / Astro / Waku / SvelteKit `platform-tests-all.yml`。
- 工作量：1 天 + 修 Windows 暴露的问题（不预估）

#### TS-14 · 配置组合矩阵（`it.each` 生成）

- 依据：「确保覆盖所有配置及不同配置的效果」的直接落实；当前只测一条主链（fullstack+node+ssr+prefix_except_default+全开）。
- 做法：临时 fixture 项目 × `it.each`，**只取交互闭包**（判定标准：两字段是否改变同一条响应，详见 §6）：
  - `mode × i18n strategy`：4×4=16 格（当前 HTTP 层仅 1 格）。
  - `security:false` × `csrf:false` × `dataCache:false` 三关全关：行为断言（头不出现、CSRF 不拦、dataCache 直通），不只数 `use("*")` 条数；与 TS-07 的「缺席断言」联动。
  - `electron:true` → `ssr` 默认 false 联动；`mode:'spa'` + `ssr:true` 语义确认（若未定义，先在 ADR 或 glossary 定稿再测）。
  - `ssr` 优先级链端到端：`definePage({ssr})` > `routeRule.ssr` > 全局 `ssr.exclude`（各层单测已有，链无端到端）。
  - `autoImports` × `components` × `i18n` 三关同开的集成验证。
- 验收：
  - [x] 每格断言「配置效果」（响应头/重定向/产物），**不是配置回读**。→ 三处交付：`packages/app/test/config-matrix.test.ts`（17 例）—— 8 格 `security × csrf × dataCache` 断言**响应头在场/缺席**、**同一条 POST 的 403/200**、`dataCache` 步骤在场/缺席 + 13 步链全序；9 格 `ssr` 优先级链断言 `X-SSR-Mode` + SSR 渲染是否发生 + loader 是否执行。`packages/config/test/derived-defaults.test.ts`（3 例）—— 断言 `electron` **派生**的 `ssr` 默认值（派生值就是契约本身，与「输入 5 断言读回 5」的回读不同）。`packages/cli/test/config-combos.test.ts`（2 例）—— `mode` 优先于 `ssr` 的**产物判据**、三关同开的 codegen 产物 + 策略穿到 server entry。红证：5 个变异（page/routeRule 优先级对调 → 3 格红、glob exclude 也跳 loader → 1 格红、三个开关恒开 → 各 4 格红）**每个只红在预期格**，`BYTE-IDENTICAL` 还原。
  - [x] 新增字段时，§6 矩阵表同步更新（配置轴的可维护性依赖这张表）。→ 本次未新增字段，但把 §6.2 的 `dataCache` / `electron` 与 §6.3 的 `ssr 优先级链` / `electron × ssr` 四行的「缺口」改为已覆盖，并给 `mode × i18n strategy` 一行补注「TS-14 只落 `mode` 轴，4×4 全交叉归 TS-15」。
  - **未交付（如实记录）**：`mode × i18n strategy` 的 **4×4 全交叉（16 格）**。理由：策略轴正是 TS-15 的交付物（验收＝4 策略在 HTTP 层各 ≥2 断言），在此再铺一遍会与它重复；且 §6「交互闭包」判定问的是「两字段是否改变同一条响应」——`mode` 决定「页面是否被 SSR / 是否只产出静态壳」，`strategy` 决定「语言前缀与重定向」，二者对同一响应的影响**可分离**，全交叉的边际信息很低。本任务已把 `mode` 轴的语义（`spa + ssr:true` → mode 胜）固定下来并写进 `docs/glossary.md`（spec 要求「若未定义，先在 glossary 定稿再测」，此前该口径只存在于代码里）。
- 工作量：3 天

#### TS-15 · i18n 四策略 HTTP 层补全

- 依据：P1-7。
- 做法：`no_prefix` / `prefix` / `prefix_and_default` 各起 fixture（或 `it.each` + 临时项目）断言路由匹配、默认语言重定向、cookie 交互（对照 `dev-topology.test.ts:413` 的 `ubean_locale` 观测法）。
- 验收：
  - [x] 4 策略在 HTTP 层各有 ≥2 断言（路由匹配 + 重定向行为）。→ `packages/app/test/i18n-strategies.test.ts`（8 例 = 4 策略 × 2，进程内 53ms，**约 30 条**逐路径断言）。每策略两条：① **路由表按策略装配**（`app.hono.routes` 去重后恰好等于期望集合，直接钉死「哪些路径存在」）② 逐路径断言**状态码 / `Location` / `content-language` / `ubean_locale` cookie / SSR 是否渲染**（`prefix_except_default` 9 条、`prefix` 8 条、`prefix_and_default` 7 条、`no_prefix` 7 条），覆盖默认语言重定向、显式前缀剥离、`Accept-Language` 与 `ubean_locale` cookie 两种协商来源。红证 `/tmp/ts15-red.mjs`：4 个变异逐个只红在预期 describe —— M1 默认语言显式前缀不再剥离、M2 `prefix` 的无前缀路径不再补前缀、M3 不再写 locale cookie → **3 个策略文件同时红**、M4 `no_prefix` 不再做语言协商（`content-language` 恒 en）。`BYTE-IDENTICAL` 还原（`routing.ts` sha256 `755a7fac…`）后复绿。**三处与直觉不同的行为已按实测钉住并写进注释**：① `prefix_and_default` **从不重定向**（三种形态都可达，连 `Accept-Language: zh` 也不触发）② `prefix_except_default` 的 locale cookie **只在根路径起作用**（带 `ubean_locale=zh` 请求 `/` 会跳 `/zh`，请求 `/about` 则直接以 en 渲染），而 `prefix` 策略下同样 cookie 会跳 `/zh/about` ③ `no_prefix` 会 404 掉**所有**带前缀路径，但 `content-language` 仍随协商变。
- 工作量：1 天

#### TS-16 · `logging` 运行时断言

- 依据：P1-8。`requestSuppressed` 置位后是否真的不打印，无验证。
- 做法：捕获 stdout（或注入 logger），断言：fullstack 默认有请求日志；ssg/spa（`requestSuppressed`）无请求日志；`level` 过滤生效。
- 验收：
  - [x] ≥3 条行为断言（输出/抑制/级别）。→ `packages/builder/test/logging-runtime.test.ts`（**7 例，54ms**，走 spec 的「注入 logger」通道）。**输出**：`fullstack` + `logging.request: true` → 真的打印一条 `GET /about 200 <n>ms` 的 info 行（行格式契约 `METHOD PATH STATUS DURATIONms` 也一并钉住）。**抑制**：`spa` / `ssg` + 显式 `request: true` → **一条日志都不打**（info/warn/error 全空），且 `resolveLoggingConfig()` 派生出 `request:false` + `requestSuppressed:true` —— P1-8 的「置位后是否真的不打印」就此有验证；`fullstack` 未开 `request` → 默认不打印。**级别**：200 → info、内部路径（`/_` 前缀）成功请求不打扰、4xx 与慢请求 → warn、5xx → error（且内部路径的 5xx **照打**）。另加 `resolveLoggingConfig` 的 4 模式派生矩阵（fullstack/backend 可开、spa/ssg 置位、未开启时不置位）与 `level` 透传。实现方式：`createDevApp()`（真的扫临时项目、真的 `app.hono.fetch()`）+ 注入捕获 logger；5xx 用 `configureApp` 注入以保证路由存在。红证：本例首跑就抓到一条**自己的错** —— 我把必然 5xx 的路由写进 fixture 让扫描器去找，结果 404（`expected 404 to be >= 500`），改为 `configureApp` 注入后绿；这正是「断言要钉在能成立的判据上」的一次即时修正。
- 工作量：0.5 天

#### TS-17 · server 驱动与缓存边界加固

- 依据：P2 与 P1-6 的 drivers 部分。`drivers.test.ts` 7 驱动全 mock；`cache-handler` 1 用例；`fs-cache` 3 用例。
- 做法：测试名标注 `[mock]`（诚实标注）；补 fs-cache 并发写、损坏文件恢复；rate-limit 用 `vi.useFakeTimers` 测窗口滑动；cron/ISR TTL 补假时钟用例。
- 验收：
  - [x] 7 个驱动测试名含 `[mock]`。→ `packages/server/test/drivers.test.ts` 7 个 `it()` 全部改为 `it('[mock] …')`，并在文件头补一段说明：这些用例注入的是**手工伪造的平台绑定**（fake `prepare()` / `jobs` / `query` / `redis` / 内存 Map），验证的是适配层的形状转换，证明不了真实平台行为。命名只是显性化，7/7 复跑绿。
  - [x] fs-cache 并发写与损坏恢复各有断言。→ `packages/server/test/fs-cache.test.ts` 新增 2 例：**并发写**（20 个不同键同时写互不踩踏、全部可读；同一键 12 次并发写收敛为**单一完整值**，绝不出现半截 JSON）与**损坏恢复**（手工写坏 `{"body":` 半截 JSON → `get`/`peek` 都按 miss 处理而非抛给调用方 —— 调用方是缓存中间件，一抛就把整条请求打 500 → 下一次 `set` 直接覆盖修复 → `clear` 不受坏文件影响）。
  - [x] rate-limit / ISR TTL 各有假时钟用例。→ 新增 `packages/server/test/rate-limit-fake-clock.test.ts`（4 例）与 `packages/routes/test/isr-fake-clock.test.ts`（4 例），都只 `vi.setSystemTime()`（没有定时器可推进，只有时钟读数）。rate-limit：窗口内计数到上限、**`resetAt - 1ms` 仍 429、跨过 `resetAt` 才重置**、`Retry-After` 随时间收紧（单位是秒 —— `defaultHandler` 里 `ceil(ms/1000)`，首跑按毫秒断言被抓出）、不同键窗口独立。ISR：`expiresAt - 1ms` 仍 HIT、**到达 `expiresAt` 即过期**（swr=true → STALE 旧内容 + 后台重生成真的写回、swr=false → serveIsr 自己同步重生成并返回 `X-ISR: MISS` + 回写缓存，下次 HIT 到新内容）、SWR 并发去重（过期后连发 3 次只触发 1 次后台重生成）。既有 `isr.test.ts` 的 TTL 用例靠真实 sleep「等时钟走过」，边界无法精确到毫秒；假时钟把边界收紧到 `expiresAt` 本身。
  - 红证 `/tmp/ts17-red.mjs`（3 个变异逐个只红在预期文件）：M1 `rate-limit.ts:92` 窗口重置条件改成 `if (!existing)` → 「跨过 resetAt 才重置」转红；M2 `cache-fs.ts:50` 的 `catch { return undefined }` 改成抛错 → 并发写与损坏恢复两例都红（防御一失，连「写」都会炸）；M3 `isr.ts:175` 的过期判定 `>=` 改 `>` → 3 例红（恰好 `expiresAt` 的三条路径全变）。逐轮还原 `BYTE-IDENTICAL`（rate-limit `e701c501…`、cache-fs `ecb1703a…`、isr `cd15db73…`）。
  - 首跑抓到自己两条错（均已修正为实测契约）：① ISR 用 `store.set('/p', …)` 直接写缓存，键是字面量 `/p`，而 `serveIsr` 读 `isr:/p` ⇒ 恒 MISS —— 必须经真实写入入口 `setIsrCache()`（它负责加前缀）；② ISR 写入 payload 的字段是 `html` 不是 `body`。另外 `swr=false` 到期后的行为我原以为「返回 undefined 交回调用方渲染」，实测是 `serveIsr` **自己**同步重生成并返回 `X-ISR: MISS` —— `isr.ts` 里那条「非 SWR：继续到同步重新生成(不返回)」的注释说的是「不走 STALE 分支」，不是「把渲染责任交回调用方」，已在测试注释里澄清。
- 工作量：1.5 天

#### TS-18 · 依赖版本兼容矩阵（长期）

- 依据：Waku `react_version` override（`yq` 改 `pnpm-workspace.yaml` → 重装 → 跑同一套 e2e）。
- 做法：对 Vue 3.x 多版本 / Vite 大版本（含 beta 活口，照 SvelteKit 注释掉的 `vite: 'beta'` 先例）周期性跑 e2e——nightly 或手动触发，不进 PR 门禁。
- 验收：
  - [x] 至少 Vue 当前 minor 与前一 minor 各跑一轮 L2。→ 实测两轮全绿：Vue **3.4.38**（前一 minor）与 **3.5.43**（当前 minor，各 `packages/*/package.json` 的 `^3.5.43`）各跑一轮 `pnpm --filter ubean-test test`（37 文件 / 788 全绿），且脚本**实测打印实际安装版本**（`实际安装 vue: 3.4.38` / `3.5.43`）证明 override 真的生效，不是「改了配置但装的还是旧的」。
  - 交付物：`scripts/dep-matrix.mjs`（可执行器：改 `pnpm-workspace.yaml` 的 `overrides` → 重新 install → 跑同一套 L2 → **逐字节还原**两份入库文件并重装）+ `.github/workflows/compat.yml`（nightly 18:30 UTC + `workflow_dispatch` 手动触发，`fail-fast: false`，matrix `vue ∈ {3.5.43, 3.4.38}`）。**刻意不进 PR 门禁**：装一遍 node_modules 很慢，且兼容矩阵的价值在**揭示**「升级会坏在哪」而非阻断 merge —— 真正阻断的是 workspace 里钉住的精确版本。因此 `compat.yml` 是独立 workflow、不在 `ci.yml` 的 `ci-ok` 聚合内（TS-05 的门禁设计不受影响）。
  - 红证：把 Vue 强制到 **3.0.0**（远低于框架最低要求）→ 脚本实测打印 `实际安装 vue: 3.0.0` 且 **L2 EXIT=1** —— 证明 override 真的生效、L2 真的在跑被覆盖的依赖、矩阵有能力揭示真实破坏（而不是「永远绿」的摆设）。跑完 workspace/lockfile 逐字节还原、`vue` 回到 3.5.43。
  - 实现取舍：对 `pnpm-workspace.yaml` 做**文本级**插入而非 YAML parse→stringify —— 该文件里有大段解释性注释（vite 钉住的理由、`allowBuilds` 逐条原因），parse→write 会把它们全部抹掉。
- 工作量：1 天 + 周期维护

### 阶段 3 · 门禁与量化（合计约 4 天）

#### TS-19 · 假时钟覆盖推广（从 TS-17 独立出的通用项）

- 说明：cron（`defineScheduled`/`parseCron`）、ISR TTL、sessions 过期均涉及时间；统一用 `vi.useFakeTimers`。
- 验收：
  - [x] cron 触发窗口、ISR 再生间隔各有假时钟用例。→ ISR 由 **TS-17** 覆盖（`packages/routes/test/isr-fake-clock.test.ts` 4 例：`expiresAt - 1ms` HIT / 到达即过期 / SWR 并发去重 / 同步重生成回写缓存）。cron 本任务补：`packages/server/test/cron-fake-clock.test.ts`（**7 例，11ms**）—— `parseCron` 字段解析与非法输入拒绝（含 `validateCron` 一致性）、推进到匹配分钟触发一次且同一分钟不重复、跨过匹配分钟后不再执行（cron 不是 interval）、`runOnStart` 启动即执行、`stop()` 后不再触发。红证：M1 `matches()` 的 `dow` 恒不匹配 → 2 格红（cron 永不触发）、M2 `parseCron` 把 `*/15` 判非法 → 5 格红，逐轮 `BYTE-IDENTICAL` 还原。
  - **顺带发现缺陷 #17（疑似，未修，按实测钉住）**：带 `runOnStart: true` 的 cron 任务在 `start()` 执行一次后，**后续任何匹配分钟都不再执行** —— 即使调度器自己的 `getNextRuns()` 明确指向下一个命中点。对照用例（无 `runOnStart`）在同一驱动下能正常触发，故差异确系 `checkAndRun` 里「消耗 `runOnStartExecuted` 标记」那个分支。用户同时写 `schedule` 与 `runOnStart: true` 的语义应是「启动先跑一次，之后照 schedule 跑」；现状是 schedule 从此失效。已写 `AGENTS.md`/类型文档均宣称支持该组合。**测试按现状钉住**（防回归时无声漂移），修复后应把期望改成「下一个命中分钟再触发一次」。
  - 关键实现经验（写进测试头注释）：cron 的 `matches()` 读的是 `date.getHours()` 等**本地时间**字段，而调度节流用 `setInterval` —— 两者都要 fake（`vi.useFakeTimers()` + `vi.setSystemTime()`），且**模拟时间必须用本地时区构造**。首跑把模拟时间写成 `new Date('…T10:00:00Z')`（UTC 10:00 = 本地 18:00），结果调度器一整小时不触发 —— 这正是真实用户会踩到的语义坑，值得留在注释里。
- 工作量：1 天（若 TS-17 已覆盖则并入）

#### TS-20 · codegen 产物过期守卫 + 可选产物契约断言

- 依据：P2。`typed-router.d.ts` / `openapi.d.ts` / `bundle-baseline.json` 零契约断言；`codegen-manifest.test.ts:24` 只断 3 个文件的 generated 旗标。
- 做法：重新生成 codegen 产物 → `git diff --exit-code`（照 SvelteKit `prepublishOnly && git status --porcelain`）；对可选产物补存在性 + 关键字段断言。
- 验收：
  - [ ] 产物过期时守卫红。
  - [ ] 3 个可选产物各有契约断言。
- 参照：Nuxt `ui-templates-generated`、SvelteKit `prepublishOnly`。
- 工作量：0.5 天

#### TS-21 · knip 死代码/未使用导出检测

- 依据：全仓无死代码检测；L3 已发现 `DataFetchPage` 死 POM（TS-32 处理该具体项）。
- 做法：引入 knip，先只跑报告（非阻断），列出未使用导出与文件，人工判定后转为 PR 门禁。
- 验收：
  - [ ] knip 可执行并输出报告。
  - [ ] 报告中每个命中项有「删除 / 加 ignore + 原因」的结论。
- 参照：Nuxt `knip` + `knip:production`。
- 工作量：1 天

#### TS-22 · 覆盖率报告（诊断用，不设阈值）

- 依据：全仓无覆盖率工具；12 框架中 0 个设阈值（唯一近似项 Nitro 的 `.github/codecov.yml` `threshold: 50%` **在 CI 中从未生效**）。
- 做法：加 `@vitest/coverage-v8`，CI 输出报告并上传 artifact；**不设 threshold**。用途是**发现零覆盖文件**（如 P1-9 的六个域），不是卡数字。
- 验收：
  - [ ] CI 产出覆盖率报告 artifact。
  - [ ] 报告中能定位到 P1-9 的六个域为零覆盖（验证诊断有效性）。
  - [ ] **确认无 threshold 配置**（与 §7 不做清单一致）。
- 工作量：0.5 天

#### TS-23 · 产物绝对体积上限（补相对回归网的盲区）

- 依据：现有 `perf-regression-net.md` 是**相对**回归（对比 baseline），产物从 0 涨到很大但仍在 baseline 附近时不可见；且历史事故 #2 是「体积门禁全绿但产物空」。
- 做法：对关键产物（client entry、server entry）设**绝对值上限**（宽松阈值，只挡数量级异常），与相对回归网并存。
- 验收：
  - [ ] 至少 2 个产物有绝对上限断言。
  - [ ] 上限触发时有可读的失败信息（含实际值 vs 上限）。
- 工作量：0.2 天

#### TS-24 · 分片（条件触发 / 延后）

- 依据：当前 L1 单测总时长未超阈值；Next 用 KV timings 装箱 + `--require-timings` 缺数据即硬失败。
- 做法：**先测量**（CI 输出各包耗时）；仅当总时长超过阈值时才引入 `--shard`，并照 Next 的「缺 timings 数据即硬失败」避免分片静默失效。
- 验收：
  - [ ] CI 输出各包/各层耗时。
  - [ ] 若未分片，在 CI 注释中写明「未超阈值，延后」及阈值数字。
- 工作量：0.5 天（若触发则 +1 天）

#### TS-25 · flakiness 追踪

- 依据：无重试策略、无 flaky 记录；E2E 与 dev-server 类测试天然易 flaky。
- 做法：L3 与 L2 记录重试与 flaky 用例，输出报告；**不自动重试通过**（照 SvelteKit `print-flaky-test-report.js` 的做法：报告而非掩盖）。
- 验收：
  - [ ] 有 flaky 报告产出。
  - [ ] flaky 用例进入待修清单，而非靠 retry 转绿。
- 参照：Nuxt `FLAKINESS_*`、SvelteKit `print-flaky-test-report.js`。
- 工作量：1 天

#### TS-26 · 周期性基准（沿用现有网，不新增门禁）

- 依据：`benchmark-lifecycle.mjs` + `perf-baseline.json` 已存在且已验证生效。
- 做法：把基准跑纳入 nightly，产出趋势；**不进 PR 门禁**（与 §7 一致）。
- 验收：
  - [ ] nightly 产出基准趋势。
  - [ ] PR 门禁中无性能阻断。
- 工作量：0.5 天

### 阶段 4 · 收尾与加固（合计约 5 天）

#### TS-27 · 回归用例编号化

- 依据：七例历史漏检无编号，无法在 CI 中追踪「这一条守的是哪次事故」。
- 做法：把七例事故各落成 ≥1 条带编号注释的回归用例（`// RM-V14: ...`），集中在一个 `regressions/` 目录或按层就近放置并在本文件登记。
- 验收：
  - [ ] 七例事故各有 ≥1 条编号化回归用例。
  - [ ] 本文件 §8 台账列出编号 → 文件映射。
- 工作量：1 天

#### TS-28 · ADR-0002 落地或修订（land-or-revise）

- 依据：ADR-0002 Decision 1 声明「codegen 模块（`production.ts`、`virtual-modules.ts`）用快照/断言生成字符串作为快速单测门禁，临时目录真实 Vite 构建属于 e2e」——**该边界从未执行**：`grep -rl toMatchSnapshot packages/builder/test/` = 0 命中，而 `production-build.test.ts` 是一个完整的真实 `vite build` 集成测试。
- 做法：二选一——(a) 按 ADR 补 codegen 字符串快照断言，把 `production-build.test.ts` 的真实构建移到 e2e 层；(b) 修订 ADR-0002，承认「真实构建留在单测层」并写明理由（构建耗时 vs 信号强度）。**必须落成代码或文档改动，不允许继续悬空**。
- 验收：
  - [ ] ADR-0002 的 Decision 1 与实际代码一致（或代码与 ADR 一致）。
  - [ ] 若选 (a)，`grep -rl toMatchSnapshot packages/builder/test/` 非空。
  - [ ] Decision 2 的「三包单测 < 10s」目标有实测数据。
- 工作量：0.5 天

#### TS-29 · fixture 隔离 → 恢复并行

- 依据：L2 `fileParallelism: false` + 共享 fixture 导致串行；Nitro 用 per-preset 临时 outDir 解决了同类问题。
- 做法：照 Nitro 模式，给共享 fixture 加 per-suite 临时目录（或按 suite 隔离可变文件），恢复 `fileParallelism: true`，用 CI 耗时数据验证收益。
- 验收：
  - [ ] L2 并行执行且全绿。
  - [ ] CI 耗时下降有数据（若未下降，记录原因并回退）。
- 工作量：2 天

#### TS-30 · devtools `useRpc.ts` 加固

- 依据：`packages/devtools` 仅 41 用例，且 §7 明确「不做 devtools 组件测试」——因此只在**非组件**层加固。
- 做法：对 `useRpc.ts` 的请求构造/错误处理补单测（纯逻辑，不渲染组件）。
- 验收：
  - [ ] `useRpc.ts` 的错误路径有断言。
  - [ ] 未引入组件渲染测试（与 §7 一致）。
- 工作量：1 天

#### TS-31 · `scan.ts` 加固

- 依据：`packages/scan` 仅 13 用例，是路由/页面扫描的唯一所有者。
- 做法：补扫描边界用例：路由组、并行路由、matcher 语法、非法标记抛错（与 TS-10 联动）。
- 验收：
  - [ ] 上述 4 类各有断言。
  - [ ] 非法标记抛错路径有断言（错误信息含修复建议）。
- 工作量：1 天

### 阶段 5 · 跨层归位（迁移与去重，合计约 1 周）

> 依据 [test-e2e-migration.md](test-e2e-migration.md)。核心判断：L2 的 783 条用例中约 **35%（275 条）是 HTTP/远端形态**（已被 L3 等价覆盖，迁移过去是**纯重复**且成本涨 3–5 倍），约 **65%（508 条）是纯单测形态**（无浏览器可观测面，`page.evaluate(() => fn())` 信号为零）。真正该做的是**下沉到 L1**，而非上移到 L3。

#### TS-34 · L2 → L1 下沉（填补 P1-9 六个空白域）

- 依据：P1-9 的六个域（observability / websocket / sse / queue / cron / storage）在 L1 符号级零覆盖，却在 L2 有 HTTP 层覆盖。L2 在替 L1 做单测——这是**结构性错位，不是缺口**。
- 做法：按域把 L2 中的纯逻辑用例（mock `UbeanContext` / `setInternalFetcher` 适配器等 in-process 形态）下沉为对应包的单测，顺序：observability → websocket + sse → queue + cron → storage → prerender 增量 → `route-rules`（仅删除重复）。
- 验收：
  - [ ] 六个域各有 L1 单测，覆盖边界与错误路径（HTTP 层未覆盖的部分）。
  - [ ] L2 中已下沉的用例删除（不留双份）。
  - [ ] 每域附「红→绿证明」。
- 工作量：3 天

#### TS-35 · L2 / L3 去重

- 依据：islands / view-transitions 等 smoke 在 L2 与 L3 双份；L2 的 HTTP 形态与 L3 等价。
- 做法：逐条比对，保留**只有该层能证明**的那一份：浏览器语义留 L3，纯 HTTP 语义留 L2，纯函数留 L1。
- 验收：
  - [ ] 无跨层重复断言（逐条列出保留理由）。
  - [ ] 删除后全层绿灯。
- 工作量：1 天

#### TS-36 · 补 L3 真实空洞（填，不是迁移）

- 依据：P2 中列出的 L3 剩余空洞。
- 做法：补 `POST /__server-component` props 重渲染、`/dashboard` 的 `ssr: 'data-only'` 契约、`/marketing` CSR 页、并行路由 `<SlotView name="aside">`、`blog/[...slug]` catch-all、404 页内容断言。
- 验收：
  - [ ] 上述 6 项各有浏览器层断言。
  - [ ] `data-fetch` 页面：补 spec 或删 POM（与 TS-32 一致，不留悬空）。
- 工作量：2 天

#### TS-37 · 收敛两套 E2E harness

- 依据：现有两套并行实现——`test/browser/`（vitest browser mode + 自定义 `e2e*` 命令经 `__vitest_browser_runner__` 桥接）与 `packages/cli/test/dev-dx.test.ts`（裸 Playwright）。
- 做法：能合并的合并；**但 `dev-dx.test.ts` 的源码变更 / HMR 语义必须留在裸 Playwright**（vitest browser mode 下无法安全改源码文件）。
- 验收：
  - [ ] 两套 harness 的职责边界有文档说明。
  - [ ] 无重复实现的 POM / helper。
- 工作量：1 天

## 6. 配置覆盖矩阵与组合空白

### 6.1 配置轴判定标准

**只有「两个字段改变同一条响应」才值得做组合覆盖。** 下表按此标准分三类：

| 类别 | 处理 |
| --- | --- |
| 交互闭包（必须组合） | 进 TS-14 的 `it.each` |
| 单维（独立测即可） | 单维行为断言，不组合 |
| 无引用（零覆盖） | 先补单维断言，再判定是否进组合 |

### 6.2 薄配置清单（「定义行」= `packages/config/src/types.ts` 行号；「测试引用数」= `packages/*/test` + `examples/*/test` + `test/` 内 `\b<字段>\b` 命中数，仅作相对比较）

| 字段 | 定义行 | 测试引用数 | 现状 |
| --- | --- | --- | --- |
| `logging` | 806 | **0** | 解析层 8 单测 + 级别层 19 单测 → TS-16 已补**运行时断言**（`packages/builder/test/logging-runtime.test.ts`：注入 logger 走真实 `createDevApp`，覆盖输出/抑制/级别分流与 4 模式派生）。**仍缺**：真实 dev server 的 stdout 捕获（`dev.ts` 里「`requestSuppressed` → 提示一次」那段内联逻辑未测） |
| `colorMode` | 849-868 | 0 | 单维 |
| `dataCache` | 967 | 4 | 只测条数 → TS-14 已补：8 格 `security × csrf × dataCache` 组合断言「接线在场/缺席」+ 响应头/状态码效果 |
| `electron` | 723 | 3 | `ssr` 联动零验证 → TS-14 已补并**修掉一个真缺陷**（见 §8：`loader.ts` 里 electron 派生的 `ssr=false` 被紧随其后的重算覆盖，派生默认值静默失效） |
| `autoImports` | 937 | 2 | 单维 |
| `pinia` | 747 | 1 | 单维 |
| `partyTown` | 873-891 | 2 | 单维 |
| `scanOptions` | 980 | 1 | 单维 |

### 6.3 组合空白（应有 / 已测）

| 组合 | 应有 | 已测 | 缺口性质 |
| --- | --- | --- | --- |
| `mode` × `preset` | 36 | 15（仅构建存在性） | **交互闭包** → TS-12 |
| `mode` × i18n strategy | 16 | 4 | **交互闭包** → 两条轴都已各自钉住：`mode` 轴（TS-14，`spa + ssr:true` 的「mode 优先」语义）+ 策略轴（TS-15，4 策略 HTTP 层全量逐路径断言）。**字面上的 16 格交叉未跑**：`mode` 决定「页面是否被 SSR / 是否只产出静态壳」，`strategy` 决定「语言前缀与重定向」，二者对同一响应的影响可分离（TS-15 的 `no_prefix`/`spa` 组合已隐式覆盖「无 SSR + 无前缀」这一角） |
| `cache.store` × preset | 27 | 3 | **交互闭包**（serverless 必须 memory）→ TS-12 |
| `ssr` 优先级链 | 1 条端到端 | 0 | **交互闭包**（三层覆盖）→ TS-14 已补 9 格端到端（`packages/app/test/config-matrix.test.ts`：page > routeRule > exclude，含 `ppr` / 全局 `streaming` / `data-only`，5 个变异证明有牙） |
| `electron` × `ssr` | 2 | 0 | **交互闭包** → TS-14 已补 3 格（`packages/config/test/derived-defaults.test.ts`：electron 默认关 / 显式 `ssr:true` 优先 / 无 electron 默认开） |
| `logging` level × mode | 16 | 8 | 单维为主 → TS-16 |

> 这张表是**配置轴的可维护性依赖**：新增配置字段时同步更新此表，否则「覆盖所有配置」会随时间重新腐化。

## 7. 不做清单（明确边界，避免范围蔓延）

1. **不设覆盖率阈值**——12 框架中 0 个设阈值；用导出面快照 + 产物内容守卫 + 平台矩阵替代。
2. **不做 PR 阻断的性能门禁**——基准进 nightly，不进 PR。
3. **不做 devtools 组件测试**——只在 `useRpc.ts` 等纯逻辑层加固（TS-30）。
4. **不用 `vi.mock`**——保持全仓 0 命中，测试更真实（drivers 全 mock 的部分改为测试名显式标注 `[mock]`，TS-17）。
5. **暂不做跨浏览器矩阵**——先只跑 chromium；`msedge` / `webkit` / `firefox` 等浏览器 E2E 稳定后再评估（React Router 用 `retries: CI ? 3 : 0` + 风险分级套件，可作后续参照）。
6. **不引入 Nx / Turbo**——现有 pnpm 脚本足够。
7. **不为上游数据不确定性加 e2e 覆盖**——Next `experimental/testmode` 证明正确解法是专门的 fetch 层代理，且它自身在 465 个 docs 文件里 0 提及；本阶段不做，留待有真实需求时立项。

## 8. 验收台账

> 诚实台账（对照 [roadmap.md](roadmap.md) §4 风格）：全部任务落地后，本文件正文按 ADR-0007 删除，决策沉淀进 ADR（预计新增一篇「测试策略」ADR 收编本文件的口径决策），历史归 git。

- [x] 阶段 0（TS-01~06 + TS-32）：静默腐化通道清零——`--passWithNoTests` 移除、skip 语义统一、miniflare 真机进 CI、**201 条浏览器 E2E 接入 CI**、发布门禁就位。
  - TS-01 红→绿：删 `src/index.ts` 的 `logger` 导出 → `packages/ubean` 1/9 红（`"missing": ["logger"]`）→ 恢复 → 9/9 绿。
  - TS-02：根 `test` 去掉 `--passWithNoTests`（并去掉 `--parallel`）；`pnpm -r test` 不再有「零测试也算过」的包。
  - TS-03 红→绿（3 腿）：无 dev server → 34 文件全红、错误统一为 `UBEAN_TEST_BASE_URL 未设置`（`ECONNREFUSED` 计数 **0**）、520 处显式报错；有 dev server → **783/783 绿**；红证 = 临时 `describe.skipIf` 用例在无 server 时 `EXIT=0`（静默假绿复现）；`ctx.skip(` 全仓仅剩 TS-04 的 miniflare 显式退出。
  - TS-04 红→绿：真机 miniflare 两例在 CI 真实执行（断言 `runner.fetch` 返回 `cf:/from-miniflare`）；藏掉 `node_modules/miniflare` → 2 例红（`:209`/`:267` 断言 `not.toBeNull()`）；`UBEAN_SKIP_MINIFLARE=1` → 2 例 skip 且打印可见 ⚠️ 警告。
  - TS-05 红→绿：`node /tmp/ts05-proof.mjs` 5/5 场景通过——子步骤失败 → `ci-ok` 红（`skipped` 亦计为失败，否则 `if: always()` 缺失时门禁形同虚设）。
  - TS-06 红→绿：`node /tmp/ts06-proof.mjs` 3 个变异体全红——缺 `--frozen-lockfile`、缺 typecheck/lint/test、门禁置于 publish 之后。
  - TS-32 红→绿：`pnpm test:e2e` → **12 文件 / 201 用例全绿**；红证 = 注释掉 `waitForDomQuiet(page)` → `01-home-navigation.e2e.spec.ts:79` 红（`expected '🧪 ubean-test' to contain '关于'`），200/201 通过，并产出 `test-results/chromium-*.trace.zip`（804K）。
  - TS-32 ③ 泄漏修复（补做）：发现**绿跑**亦留 549M / 3381 文件 / 0 zip；根因 = `deleteTracing()` 只删 zip、且显式 `tracesDir` 绕过了 Playwright 自身回收。已加 `cleanTraceStaging()`（保留 `*.trace.zip`）于 `setup()`/`teardown()`；顺序实测确认 `teardown` 晚于 zip 打包（`zips=1` → 清理后仅剩 zip）。
  - 环境修复（非代码缺陷，阻塞门禁）：`pnpm typecheck` 在 `apps/docs` 失败，根因是 `node_modules` 被系统性剥文件——**6 个包的 `binary-search*` 文件缺失**，且 pnpm store 内同样缺失（故 `pnpm install --frozen-lockfile` 无法自愈）。已按 npm registry 上游 tarball 恢复并校验 SHA-256：`@volar/source-map@2.4.28`、`muggle-string@0.4.1`、`source-map@{0.6.1,0.7.6,0.8.0}`。修复后 6 个包均可 `require`，`pnpm typecheck` / `pnpm lint` / `pnpm test` 三门禁全绿（`783 + 9 + 201` 等全通过）。属环境态问题，不入仓。
- [x] 阶段 1（TS-07~11）：P0 断言就位——中间件 13 步序列、产物内容、错误配置、三示例。
  - TS-07 红→绿：中间件顺序成为**可观测的请求级事实**（`__ubean_mw_order__` 由 13 步链写入 `c.var`，不再靠读源码数 `this.hono.use(`）。`packages/app/test/middleware-order.test.ts` 9/9 + `examples/ubean-test/test/middleware-order.test.ts` 6/6；红证 = 删除 `markMiddlewareStep` 的某一步记录 → 顺序数组缺项、断言红；恢复 → 绿。`cacheStore` / `routeCache` 在 dev 下按配置 gated off，用例显式列出 `GATED_OFF` 而非 skip。
  - TS-08 红→绿：注册顺序的**结构性事实**（静态 `serveStatic` 必须排在用户路由之前）。`packages/app/test/app-registration.test.ts` 新增 3 例，全量 42/42 绿。红证 3 个变异体全红：M1 打乱 `use('*')` 注册序（`26 failed | 16 passed`）、M2 移动 static 块（`3 failed | 39 passed`）、M3 让 `writeBuildManifest` 少遍历一个 clientManifest 条目（`1 failed | 41 passed`）；逐次按字节还原并重建后回到 `42 passed (42)`。
  - TS-09 红→绿：`assetTags` **真的被内联进产物**（`serverDir/entry.mjs` 里的 `var assetTags = { css, preloads, body, favicon }` 字面量），而不是「产物存在」。「CSS 天然存在」的第一次探针被证伪——CSS 只有在被 `virtual:ubean-app` **静态导入**的组件（`src/app.vue`）上才会进 entry chunk，为此新增 fixture `packages/builder/test/fixtures/build-project/src/app.vue`（与 `cloudflare-preview.test.ts` 共享，9/9 绿）。红证 `/tmp/ts09-red.mjs` M1/M2/M3 全 `EXIT=1` + `RESTORED=byte-identical` + 重跑 `EXIT=0`。
  - TS-10 红→绿：构建期**错误契约**（非法输入必须非零退出 + 报错信息含关键片段）。新增 `packages/cli/test/build-errors.test.ts`（9 类错误 + 4 类「静默通过」tripwire）15/15 绿。**偏差**：spec 点名的「`srcDir` 不存在」与「非法路由组/并行路由标记」**没有 throw 点**（`resolveUbeanConfig` 不校验存在性、`glob(...).catch(() => [])` 吞错、`stripRouteGroups()` 从不校验），实测退出码 0——已如实改为 `SILENT_CASES` 钉住当前行为并注明根因。红证 `/tmp/ts10-red.mjs` M1（`1 failed | 14 passed`）/M2（同）/M3（`9 failed | 6 passed`）全 `RESTORED=byte-identical`，`RESULT=ALL-PROOFS-PASS`。
  - TS-11 红→绿：三示例（`frontend-only` / `routing-file-mode` / `ssg-catchall`）各进一个真实构建 + 起服务 + 请求断言的 smoke（`packages/cli/test/example-smoke.test.ts`，13/13 绿），`platform-drivers` 定性为「代码片段集，非示例」（README 标注 + 负向断言 tripwire）。红证 `/tmp/ts11-red.mjs`：M1 改示例 API handler 文案、M2 改示例页面根 class、M3 改 `prerender-step.ts:188` 的 `__search.json` 写盘名（并重建 builder）→ 三次全 `EXIT=1` 且失败的正是预期用例，全部 `RESTORED=byte-identical`，末次 `GREEN EXIT=0 Tests 13 passed (13)`，`git status` 零残留。首跑 2 条红均为**自己的过度断言**（fullstack 不产出 `public/index.html`；`__search.json` 顶层键是 `content` 不是 `sections`），已按实测修正并写入实施记录。
  - 阶段 1 收口门禁（全绿）：`pnpm build` / `pnpm typecheck-only` / `pnpm lint` 三者 EXIT=0；`pnpm test` **EXIT=0 —— 195 个测试文件 / 3449 用例全绿**（`packages/cli` 22 文件 / 229 用例、`examples/ubean-test` 37 文件 / 789 用例、`packages/builder` 37 文件 / 416 用例）。**首跑 EXIT=1 曾出现 2 处超时**（`example-smoke` 的 420s `beforeAll`、`build-contracts` 的 300s 构建守卫），根因经证伪为**环境资源枯竭而非代码缺陷**：单次示例构建实测仅 **976ms**（守卫阈值约 300×）；两次运行的失败集合**不同**（第二跑 `example-smoke` 反而全绿）；`ps` 显示有**存活 20 小时的泄漏 `cli.js preview --port 3993`** 与存活 5 小时的 `vite-plus-core preview --port 30483`；`vm_stat` 仅剩 226MB 空闲、`vm.swapusage` 已用 3.73G/5G。清理泄漏进程后 CLI 套件由 **1737s 降至 68s** 并全绿——这条「测试自身会泄漏 preview 进程、进而饿死后续整仓测试」已作为第 14 例缺陷记入 §7。
- [x] 阶段 2（TS-12~18 + TS-33）：≥4 preset 行为矩阵 + OS×Node 矩阵 + 配置组合矩阵 + **dev/build 双轨**。
  - TS-12 红→绿：9 个 preset 跑**同一套**行为断言族（新增 `packages/cli/test/preset-runtime/`，`testPreset(ctx, getHandler, additionalTests?)` 对齐 Nitro `testNitro`），**99 用例 97 绿 + 2 显式 skip**。cloudflare 走 TS-04 的 `createCloudflarePreviewRunner()` 真机 workerd，其余 8 格进程内执行产物（`entryType: 'node'` 三格共用同一 bundle，`'fetch'` 五格加载**平台包装** `handler.mjs` 的 `default fetch`）。每格独立 `.temp-build-<preset>`。**偏差**：spec 建议「cloudflare 用仓内 `.tmp/<preset>`、其余 `tmpdir()`」，实测产物 external 了 `hono`/`vue`/`@ubean/*`，离开仓内祖先 `node_modules` 后 Node 解析不到这些裸 specifier（`ERR_MODULE_NOT_FOUND`），故 9 格全部落在 fixture 内。**2 处显式 skip**：workerd 有隔离虚拟 FS（fs 落盘断言永真）、worker 产物整体压缩（`cronModules` 文本被改写，即使强制打开调度计数仍为 0），两格改用 `it.skipIf` 可见跳过并在注释写明原因；cloudflare 的 serverless 归属改由 ① 的「⑦ `cacheStore` 步骤缺席」守着（该断言在变异下实测转红）。新增 fixture `packages/cli/test/fixtures/preset-runtime-app/`（含 `404.vue`、`/cached` routeRule、i18n、token 模式 CSRF、`src/crons/01.heartbeat.ts`）。
  - **TS-12 顺带挖出并修掉一个我自己在 TS-07 引入的 P0 回归**：`_setupBaseMiddleware()` 的 `withStep()` 写成了 `await handler(c, next)` 而**没有 return**。Hono `compose` 只在中间件**返回** Response 时才 `context.res = res`（`hono/dist/compose.js`），于是所有「靠 `return Response` 短路」的中间件全部变成 500 `Context is not finalized`：⑩ `routeCache` 缓存命中、⑧ i18n 语言重定向、⑤ CSRF 拒绝、① handle hook 短路。既有 3449 条用例**全绿**——因为 `examples/ubean-test` 的 routeRules 只有 `isr`/`ppr`（无 `cache.ttl`，`routeCache` 根本不注册），测试客户端也从不发 `Accept-Language: zh`。修复 = `withStep`/`recordOnlyStep` 各转发返回值一处。新增回归 `packages/app/test/middleware-short-circuit.test.ts`（3 例：缓存命中 / i18n 302 / CSRF 403）；红证 = 把 `withStep` 改回吞返回值 → **3/3 红**（`expected 500 to be 200 / 302 / 403`）→ 按字节还原（sha256 `c88a9e38…`）→ 绿。
  - TS-12 验收③ 红证（两个方向，均 `BYTE-IDENTICAL` 还原）：① `isEphemeralCachePreset` 变异成恒 `false`（重建 `@ubean/preset`）→ **14 例红**，恰好全落在 5 个 serverless/edge preset（① 链多出 `cacheStore`、⑥/⑦ 缓存、⑪ cron）。② `enableInProcessCron` 变异成恒 `false`（重建 `@ubean/build`）→ **恰 4 例红**（node/bun/deno/standard 的 ⑪）。
  - TS-12 修掉一处 harness 保真度缺陷：`MiniflareInstanceLike.dispatchFetch` 未转发 `request.redirect`，而 workerd 的 `dispatchFetch` 默认 `redirect: 'follow'` → i18n 的 302 被**跟随**掉，⑨ 只看到 200（假绿）。已在 `packages/builder/src/vite/cloudflare-preview.ts` 转发 `redirect`，TS-12 用 `redirect: 'manual'` 断言 302；TS-04 复跑 9/9 绿。
  - TS-12 断言族（11 条/preset）：① `/_health` + 13 步链（按 preset 分支 `cacheStore` 是否缺席）② API JSON ③ SSR HTML ④ 404 分支（导航 HTML 选中 `NotFound` vs API JSON）⑤ 安全头（nosniff + CSP）⑥ routeRules 生效（头注入 + **307** 重定向 + `X-Cache: HIT`）⑦ 缓存后端落盘观测 ⑧ CSRF（403/200）⑨ i18n（`/zh/` + 根路径 302）⑩ 包装入口存在 ⑪ 进程内 cron 接线。`redirect-me` 的实测状态码是 **307**（不是 302），已按实测钉住。
  - TS-12 环境观察（非仓内改动）：本机 `~/Library/Caches/ms-playwright` 原本**完全不存在**，`packages/cli/test/dev-dx.test.ts` 因此以一个 **suite 级错误**失败（`beforeAll` 里 `chromium.launch()` 抛错 → 10 条用例全部显示为 `skipped`，极易被误读成「跳过而非失败」）。`ci.yml:41-46` 显式 `pnpm exec playwright install --with-deps chromium` 并缓存 `~/.cache/ms-playwright`，故 CI 不受影响；本地补装后 `dev-dx` 10/10 通过、`packages/cli` **23 文件 330 通过 + 2 跳过（332）全绿**。**未改仓**：缺少浏览器时**硬失败**是合理语义（静默跳过才是 TS-03 要消灭的），只是报错形态容易误读，记录备查。
  - TS-12 新发现（**未修，记为待决**）：① `404.vue` 的响应是**纯客户端外壳**（`<div id="app"><!----></div>` 为空，只有 `__UBEAN_PAGE_DATA__` 的 `{"component":"NotFound"}`），非 JS 客户端/SEO 拿不到 404 正文，与「导航返回 404 并渲染该组件」的口径存在落差——④ 因此按实测写成「选中 NotFound 页」，**不**断言服务端正文。② `standard` preset 是 `entryType: 'fetch'` 却拿到 `store: 'fs'` + 进程内 cron（不在 `EPHEMERAL_CACHE_PRESETS` 内），产物因此携带 `node:fs`/`node:fs/promises`；同类 `node:*` import 也出现在 vercel/netlify/aws/azure 产物里（生成的服务端头无条件 `import { readFileSync } from 'node:fs'`）。
  - TS-12 收口门禁（全绿）：`pnpm test` **EXIT=0 —— 197 个测试文件 / 3553 通过 + 2 跳过（3555）**（`packages/cli` 23 文件 / 330 通过 + 2 跳过、`examples/ubean-test` 37 / 789、`packages/builder` 37 / 416、其余包全绿）；`pnpm typecheck-only` **EXIT=0**；本任务新增/改动的文件 `vp lint` **0 warnings / 0 errors**，`packages/app` 84/84、`packages/builder` cloudflare-preview 9/9 复跑绿。run 前 `cli.js preview` / `vite-plus-core` 泄漏进程计数 **0/0**。
  - TS-13 红→绿（OS × Node 矩阵）：`ci.yml` 的 `ci` job 改为矩阵 —— `os: [ubuntu-latest, windows-latest]` × `node: [22, 24]` = **4 格**，`runs-on: ${{ matrix.os }}`，`fail-fast: false`（否则一格失败会**取消**其余格，既看不到 Windows 挂在哪条断言，也不知道 ubuntu 是否本就绿）。轴取舍与门控理由全部写进 workflow 注释：不加 macOS（runner 单价约 10×、无 darwin 专属路径）；Node 下限取 22（当前最老 LTS，`engines` 未声明）；**不用 `exclude`** 缩矩阵，平台/成本专属步骤一律 `if: runner.os == 'ubuntu-latest'` 门控（浏览器 E2E / 体积门禁 / 示例 type-check / 文档站构建 / 两个仓库护栏脚本），这样「某格少跑了什么」在 workflow 里一眼可见。chromium 每格都装（`packages/cli/test/dev-dx.test.ts` 属 L1 且需要真实浏览器），缓存 `path` 按平台分支（`~/.cache/ms-playwright` vs `~/AppData/Local/ms-playwright`）但**不**设 `PLAYWRIGHT_BROWSERS_PATH`（保持与本地同一位置），`key` 只按 OS + lockfile（浏览器版本由 lockfile 钉住，与 Node 无关；两个 Node 格并发写同一 key 时后到者被跳过，是无害空操作）。
  - TS-13 新增**结构断言** `packages/cli/test/ci-matrix.test.ts`（6 例，`createRequire(根 package.json)` 解析根 `yaml`）。为什么必须有：把 `windows-latest` 从 os 轴删掉会让矩阵**静默**退化成 2 格而 CI 依然全绿（少跑的东西不会报错）；矩阵化后新增 job 若忘了挂 `ci-ok.needs`，那个 job 就变成**不阻断 merge 的装饰**。用例覆盖：矩阵 ≥4 格且含 windows / `fail-fast: false` / `runs-on: ${{ matrix.os }}` / 6 个平台专属步骤都有 `runner.os == 'ubuntu-latest'` 门控 / **`ci-ok.needs` 全序等于「除 ci-ok 外的每一个 job」** / `if: always()`。红证 `/tmp/ts13-red.mjs`：5 个变异（M1 删 windows 轴 → 2 红；M2 fail-fast=true → 1 红；M3 去掉 E2E 门控 → 1 红；M4 `needs: []` → 1 红；M5 `runs-on` 写死 ubuntu → 1 红）**每个都只红在预期的那条断言**，`BYTE-IDENTICAL` 还原（sha256 `d523ea0a…`）后基线 `EXIT=0`。
  - TS-13 顺带修掉矩阵本该暴露的 Windows 隐患：`packages/builder/test/asset-manifest.test.ts` 有 6 条断言把**文件系统绝对路径**写成 POSIX 字面量 —— Windows 上必红且是两重原因：① 实现走 `join()`，产出 `\` 分隔符，与 `'/'` 字面量比不过；② `'/abs/site'` 在 Windows 上**不是**绝对路径（需盘符或 UNC），于是 `resolvePrerenderStaticDir()` 走「拼 cwd」分支，语义与断言假设完全不同。已改为 `resolve()` 构造平台基准 + `join()` 构造期望值（本地 11/11 复绿）。**未验证**：Windows 能否整体转绿无法在本机判定（本机是 darwin），按 spec「工作量：1 天 + 修 Windows 暴露的问题（不预估）」的口径，首次 CI 运行即为该修复循环的输入；已把可静态判定的路径分隔符/绝对路径假设先清掉一轮。
  - TS-14 红→绿（配置组合矩阵，三处交付共 22 例）：
    - `packages/app/test/config-matrix.test.ts`（17 例，54ms，进程内）—— 组 1 = `security × csrf × dataCache` ∈ {开,关}³ 的 **8 格**：每格断言 ① 安全头的**在场/缺席** ② **同一条 POST** 在 csrf 开时 403、关时 200 ③ `dataCache` 步骤在场/缺席 ④ 13 步链全序（关掉的门控整段缺席、其余不重排）。组 2 = `ssr` 优先级链**端到端 9 格**：`definePage({ssr})` > `routeRule.ssr` > 全局 `ssr.exclude`，含 `'data-only'` / `ppr → streaming` / 全局 `streaming` / glob exclude「走 csr 但 loader 仍跑」与显式 `ssr:false`「loader 不跑」的语义差别；观测三通道 = `X-SSR-Mode` + SSR 渲染是否发生（假 renderer 的 marker）+ loader 是否执行。
    - `packages/config/test/derived-defaults.test.ts`（3 例）—— `electron × ssr` 派生默认值。**这一格直接挖出并修掉一个真缺陷（本季第 16 例）**：`packages/config/src/loader.ts` 里 electron 派生的 `ssr = resolveSsrConfig(false)` 被紧随其后的 `resolved.ssr = resolveSsrConfig(config.ssr)`（此时 `config.ssr === undefined` → 默认 `enabled: true`）**覆盖回去**，于是 `electron: true` 根本不关 SSR，`AGENTS.md`/类型文档写明的契约静默失效。红证＝先写断言跑出 `expected true to be false`（另两条对照用例通过，隔离出缺陷）；修复＝把 electron 覆盖块移到 ssr 重算**之后**；复跑 `packages/config` **112/112 绿**。此前 §6.2 对该字段的注记正是「`ssr` 联动零验证」——零验证的字段就是这么腐化的。
    - `packages/cli/test/config-combos.test.ts`（2 例，约 2s）—— `mode` 优先于 `ssr`（`--mode spa` + 默认 `ssr:true` → 产出 `public/index.html`、**不**产出 `server/entry.mjs`）与 `autoImports × components × i18n` 三关同开（三套 codegen 生成物齐备 + `prefix_except_default` 确实出现在生产 `server/entry.mjs` 里）。顺带把「`mode` 优先于 `ssr`」这条此前只存在于代码里的口径写进 `docs/glossary.md`（spec 要求先定稿再测）。
    - 红证 `/tmp/ts14-red.mjs`：5 个变异逐个只红在预期格 —— M1 `select-ssr.ts` 把 `routeRule.ssr` 提到 `pageSsr` 之前 → 3 格红；M2 glob exclude 改成也跳过 loader → 1 格红；M3/M4/M5 把 `securityHeaders`/`csrf`/`dataCache` 三个开关改成恒开 → 各 4 格红。`BYTE-IDENTICAL` 还原（`app.ts` sha256 `c88a9e38…`、`select-ssr.ts` `c0479e35…`）后基线 `EXIT=0`。
    - **偏差**：`mode × i18n strategy` 的 4×4 全交叉（16 格）未做，留给 TS-15（策略轴是它的交付物；且 §6 判定二者对同一响应的影响可分离）。此偏差已同步写进 §6.3 表格与该任务的验收块。
  - TS-15 红→绿（i18n 四策略 HTTP 层补全）：新增 `packages/app/test/i18n-strategies.test.ts`（**8 例 = 4 策略 × 2，进程内 53ms，约 30 条逐路径断言**）。做法与 spec 的「各起 fixture / `it.each` + 临时项目」不同：**不需要构建** —— `UbeanApp` 直接接收 `i18nConfig` + `pages` + `pageRenderer`，路由表装配与 i18n 中间件都能真实执行，因此能在 53ms 内把 4 策略 × 9 种请求路径全部跑一遍。每策略两条：① 路由表按策略装配（`app.hono.routes` 去重后恰好等于期望集合）② 逐路径断言状态码 / `Location` / `content-language` / `ubean_locale` cookie / SSR 是否渲染。cookie 观测沿用 `dev-topology.test.ts:415` 的 `ubean_locale=` 形态。
    - **三处与直觉不同的行为按实测钉住**（先探针后定稿）：① `prefix_and_default` **从不重定向** —— 三种形态都可达，连 `Accept-Language: zh` 也不触发（`routing.ts:94-96` 该分支只设 `defaultLocale`，没有重定向逻辑）② `prefix_except_default` 的 locale cookie **只在根路径起作用**：带 `ubean_locale=zh` 请求 `/` 会 302 `/zh`，但请求 `/about` 直接以 en 渲染、不跳 `/zh/about`；而 `prefix` 策略下同样 cookie 会跳 ③ `no_prefix` 会 404 掉**所有**带前缀路径（`/zh/`、`/en/about`），但 `content-language` 仍随 `Accept-Language`/cookie 变。
    - 红证 `/tmp/ts15-red.mjs`（变异 `packages/i18n/src/routing.ts` 并重建 `@ubean/i18n`）：M1 默认语言显式前缀不再剥离 → `prefix_except_default` 红；M2 `prefix` 的无前缀路径不再补前缀 → 红；M3 `writeCookie(c, detectedLocale)` 置空 → **3 个策略 describe 同时红**（cookie 是四策略共用的观测通道）；M4 `no_prefix` 不再做语言协商 → 只红该策略的 content-language 断言。逐轮还原、`BYTE-IDENTICAL`（sha256 `755a7fac…`）、末次复绿 `EXIT=0`。
    - **同时收编 TS-14 留下的 `mode × i18n strategy` 交叉**：`mode` 轴已由 TS-14 钉住、策略轴由本任务全量钉住；字面上的 16 格交叉仍未跑，理由已更新进 §6.3（二者对同一响应的影响可分离，且 `no_prefix` + `spa` 组合已隐式覆盖「无 SSR + 无前缀」这一角）。
  - TS-16 红→绿（`logging` 运行时断言）：新增 `packages/builder/test/logging-runtime.test.ts`（**7 例，54ms**），走 spec 给的「注入 logger」通道 —— `createDevApp()` 真的扫一个临时项目（`src/pages/index.vue` + `about.vue`）、请求用真的 `app.hono.fetch()`，只是把打印目标换成捕获 logger。三条行为断言各就各位：**输出**（fullstack + `request:true` → 一条 `GET /about 200 <n>ms` info 行，行格式契约一并钉住）、**抑制**（spa/ssg + 显式 `request:true` → info/warn/error 全空，且 `resolveLoggingConfig()` 派生出 `request:false` + `requestSuppressed:true`；fullstack 未开 → 默认不打）、**级别**（200→info、`/_` 前缀成功请求不打扰、4xx/慢→warn、5xx→error 且内部路径的 5xx 照打）。另加 `resolveLoggingConfig` 的 4 模式派生矩阵与 `level` 透传各 1 例。
    - 为什么这一层就够：`requestSuppressed` 的**唯一消费点**是 `resolveLoggingConfig()` 的派生结果（CLI 读它决定「提示一次并跳过」），而**唯一打印点**是 `attachRequestLogger(app, config.logging?.request === true, logger)` —— 后者正是本层注入的对象，前者在本层直接断言。所以「置位后是否真的不打印」这条 P1-8 的疑问已被端到端回答。**仍缺**：`dev.ts` 里「`requestSuppressed` → 打印一次 `Request logging is not applicable in ...`」那段内联逻辑没有真实 dev server 的 stdout 捕获守着，已如实记进 §6.2。
    - 首跑就抓到自己的一条错：我把「必然 5xx 的路由」写成 fixture 文件让扫描器去找，结果请求返回 **404**（`expected 404 to be >= 500`）—— 扫描产物并不保证包含它。改为 `configureApp()` 注入（`CreateDevAppOptions` 本就提供的钩子）后绿。教训：判据必须钉在**能成立的机制**上，而不是钉在「我假设存在的文件」上。
  - TS-17 红→绿（server 驱动与缓存边界加固，三项验收全部落地，新增 **15 例** + 7 处改名）：
    - ① 诚实标注：`packages/server/test/drivers.test.ts` 的 7 个 `it()` 全部加 `[mock]` 前缀并补文件头说明 —— 它们注入的是手工伪造的平台绑定，验证的是**适配层形状转换**，不是真实平台行为。验收①零成本（纯改名），但把「这不是集成测试」显性化，防止有人误以为 D1/Vercel/Bun/Deno/Netlify 已被集成覆盖。
    - ② fs-cache 边界（`fs-cache.test.ts` 3 → 5 例）：**并发写**（20 键同时写互不踩踏 + 同一键 12 次并发写收敛为单一完整值）与**损坏恢复**（半截 JSON → `get`/`peek` 按 miss 处理而非抛错 → 下一次 `set` 覆盖修复）。后者钉住的是一条**安全属性**：`cache-fs.ts` 的 `readEntry` 吞掉解析失败，调用方是缓存中间件，坏文件一旦抛错就把整条请求打 500。
    - ③ 假时钟（新增 `rate-limit-fake-clock.test.ts` 4 例 + `isr-fake-clock.test.ts` 4 例，全部只用 `vi.setSystemTime()`）：把「窗口已重置」「TTL 已过期」从真实 sleep 的碰运气断言收紧到**毫秒级边界**（`resetAt - 1ms` 仍 429、`expiresAt - 1ms` 仍 HIT、到达 `expiresAt` 即 STALE/重生成），并把 SWR 的并发去重（过期后连发 3 次只重生成 1 次）钉住。
    - 红证 `/tmp/ts17-red.mjs`：3 个变异逐个只红在预期文件 —— M1 `rate-limit.ts:92` 窗口重置条件改 `if (!existing)`、M2 `cache-fs.ts:50` 吞错改抛错（连「写」用例都红）、M3 `isr.ts:175` 过期判定 `>=`→`>`（恰好 `expiresAt` 的三条路径全红）。逐轮 `BYTE-IDENTICAL` 还原。
    - 首跑抓到自己两条错并改为实测契约：ISR 缓存必须经 `setIsrCache()` 写（负责加 `isr:` 键前缀，直接 `store.set('/p')` 会恒 MISS）；ISR 写入 payload 字段是 `html` 不是 `body`；`swr=false` 到期后实测是 `serveIsr` 自己同步重生成并返回 `X-ISR: MISS`，而源码注释「不返回」指的是「不走 STALE 分支」—— 已在测试注释里澄清这条误导性注释。另有我自己的正则写错（`/^v10\d$/` 漏掉 `v11x`）导致 fs-cache 绿基线假红，已放宽为值域断言并连跑 5 次确认稳定。
  - TS-18 红→绿（依赖版本兼容矩阵，长期项）：交付 `scripts/dep-matrix.mjs` + `.github/workflows/compat.yml`。机制照 Waku 的 `react_version` override 先例：改 `pnpm-workspace.yaml` 的 `overrides` → `pnpm install` → 跑**同一套 L2** → 逐字节还原两份入库文件并重装。**验收实测两轮全绿**：Vue `3.4.38`（前一 minor）与 `3.5.43`（当前 minor）各跑一轮 `pnpm --filter ubean-test test`（37 文件 / 788 全绿）。红证：强制 Vue `3.0.0` → 实测安装 3.0.0 且 **L2 EXIT=1**，证明 override 生效、矩阵有能力揭示真实破坏。跑完 `vue` 回到 3.5.43、两份入库文件逐字节还原。
    - 两条实现取舍：① 对 workspace 文件做**文本级**插入而非 YAML parse→stringify（那里有大段解释性注释，parse→write 会全部抹掉）；② 还原后**必须重装**，否则 `node_modules` 还停留在被覆盖的版本，「跑完不留痕」就只做了一半。
    - 门禁关系（刻意设计）：`compat.yml` 是独立 workflow（nightly 18:30 UTC + 手动触发，`fail-fast: false`），**不进** `ci.yml` 的 `ci-ok` 聚合 —— 装 node_modules 很慢，且兼容矩阵的价值在揭示而非阻断；`ci-matrix.test.ts` 的「`ci-ok.needs` 覆盖每一个 job」断言只读 `ci.yml`，不受影响。
  - TS-33 红→绿（dev/build 双轨）：新增 `examples/ubean-test/test/mode.ts`（`UBEAN_TEST_MODE=dev|build`），`test/global-setup.ts` 按模式启动 —— dev 轨 `ubean dev :3999`（行为不变），build 轨 `ubean build --outDir .temp-build` + `ubean preview --outDir .temp-build --host 127.0.0.1 --strictPort`。两处刻意的选择：产物目录用 **`.temp-build` 而非 `dist`**（`examples/ubean-test/dist` 是既有产物，直接构建过去会覆盖它 —— TS-11 的教训），且 `preview` 必须收到同一个 `--outDir`（`preview.ts:108-113` 记录了「未知参数被 citty 静默忽略、于是预览到旧 `dist`」的坑）；显式 `--host 127.0.0.1` 因为默认 host `localhost` 在这台机器上只绑 IPv6 `::1`。`teardown` 删除 `.temp-build`，跑完不留痕。
  - TS-33 首轮 build 轨探针（全量 789 条）：**只有 9 条红、集中在 5 个文件** ⇒ 4 类真实差异，全部按「两端期望值都钉住」修掉（不是整条 skip）：① `/_openapi.json` + `/_scalar` 只在 dev 注册，build 必须 404（`devtools` / `static-files` 的 dev-only 断言改写成 `perMode(200, 404)`，顺势成为**生产泄漏守卫**）② ⑦ `cacheStore` 中间件步只在生产 fs 缓存后端下打点（`middleware-order` 的 `LIVE_ORDER` / `GATED_OFF` 按模式分支）③ 数据缓存按 `NODE_ENV` 开关（`data-cache` 的 `devNoCache`：dev `fetchCount` 2 / build 1）④ `download.test.ts` 的 OpenAPI schema 断言在 build 轨无对象可查 → `describe.runIf(!isBuildMode)` **可见跳过**（3 条）。
  - TS-33 不对称红证（本任务的核心证明）：把 `resolveProductionCacheStore()` 的 auto 分支改成恒 `{ store: 'memory' }`（＝生产不再落盘缓存，一条纯生产路径）→ **dev 轨 `EXIT=0` / 788 全绿**（dev 本来就不初始化 store，看不见这条路径）、**build 轨 `EXIT=1` / 1 红**（`middleware-order` 的 `/_health` 序列缺 `cacheStore`）→ 按字节还原（sha256 `076e0ee7…`）→ 双轨复绿。这就是「dev 绿、build 坏」漏检形态的直接复现与拦截。
  - TS-33 收口：dev 轨 **37 文件 / 788 全绿**、build 轨 **37 文件 / 785 通过 + 3 可见跳过**；`ci.yml` 新增 `Test (build track)` step（跑 `pnpm test:build`，与 dev 轨同一 job，故 `ci-ok` 自动覆盖）；根 `package.json` 与示例 `package.json` 各加 `test:build`。**偏差**：做法③建议只对约 40 条高风险子集开双轨，实测后改为**全量双轨**（build 轨只要 17s + 一次构建），理由是只挑 40 条会让另外约 740 条断言的生产路径无人守。**另一处偏差**：spec 的「涉及」点名 `{cache,prerender,seo,i18n,route-rules,data-cache}.test.ts`，但实测这些文件**绝大多数是纯单元测试**（直接 import `createMemoryStore` / `compileLocalePaths` / `compileRouteRules` / `mergeMetadata` 等，不发 HTTP，天然与运行形态无关）；真正的 dev/build 分歧面在 `devtools` / `static-files` / `download` / `middleware-order` / `data-cache`（`data-cache` 是点名文件里唯一命中 HTTP 分歧的）。因此按**实测分歧面**而非按文件名改，避免为了对齐清单去制造无意义的双轨断言。
  - 归属说明：本会话期间工作树里另外出现了 `scripts/benchmark-lifecycle.mjs` / `benchmark-ssg.mjs` / `scripts/lib/metrics.mjs` / `scripts/bench*.mjs` / `examples/ubean-test/benchmarks/*` / `packages/cli/test/benchmark-metrics.test.ts` 的改动，**不是本任务产出**（本任务从未触碰 benchmark 相关文件）；全仓 `pnpm lint` 仅剩的 2 个 `no-shadow` 错误即来自其中的 `scripts/benchmark-lifecycle.mjs`。已原样保留、未触碰、未回滚。
- [ ] 阶段 3（TS-19~26，**TS-19 已完成，TS-20~26 待办**）：产物过期守卫 + knip + 覆盖率报告（无阈值）+ 绝对体积上限 + flakiness 记录。
  - TS-19 红→绿（假时钟覆盖推广）：新增 `packages/server/test/cron-fake-clock.test.ts`（7 例，11ms），cron 的 `matches()`/`setInterval` 全部走 fake（`vi.useFakeTimers()` + `vi.setSystemTime()`）。ISR 部分由 TS-17 已覆盖（4 例）。红证 `/tmp/ts19-red.mjs`：M1 `matches()` 的 `dow` 恒不匹配 → 2 格红、M2 `parseCron` 把 `*/15` 判非法 → 5 格红，`BYTE-IDENTICAL` 还原（sha256 `959aba5c…`）。**发现缺陷 #17**：`runOnStart: true` 的 cron 任务在 `start()` 执行一次后不再按 `schedule` 触发（`getNextRuns()` 明确指向下一个命中点也不跑；无 `runOnStart` 的对照用例能正常触发，差异确系 `checkAndRun` 消耗 `runOnStartExecuted` 标记的分支）—— 按现状钉住并在测试里标注「修复后应改期望」，未修。另有一条实现经验值得留档：cron 匹配用**本地时间**字段，fake 时模拟时间必须用本地时区构造，否则调度器一整小时不触发（首跑踩到）。
- [ ] 阶段 4（TS-27~31）：回归编号化、ADR-0002 落地或修订、并行恢复、useRpc/scan 加固。
- [ ] 阶段 5（TS-34~37）：L2 单测形态下沉 L1（填六域）+ L2/L3 去重 + L3 空洞补全 + harness 收敛。
- [ ] 每完成一项，在本文件勾选并在 PR 描述附「红→绿证明」（人为破坏 → 测试红 → 修复 → 绿），防止「断言写了个寂寞」。
- [ ] 七例历史漏检各有编号化回归用例（TS-27 产出映射表）。

## 附录：证据口径

- 审计方式：全仓静态分析（文件清单 / 用例计数 / 断言模式 / config 字段×测试引用矩阵）+ 中间件链与 CI 配置逐行核对 + 12 框架部分克隆源码核对；**未运行任何测试、未构建**——结论描述「文件里写了什么」，不描述「CI 现在是否绿」。
- 计数口径：文件 = `*.test.ts` / `*.e2e.spec.ts`（`.vue` fixture 不计）；用例 = `it(` 次数 + `it.each(` 展开元素数；**错误路径断言**以 `toThrow\(|\.rejects|\.status\)\.toBe\([45][0-9][0-9]\)` 正则计（注意：不能写成 `4xx|5xx`——该写法只会匹配注释里的字面量 `4xx`/`5xx`（全仓 7 处），匹配不到 `toBe(404)` 这类真实状态码，会把负向计数系统性算错）；字段引用数含注释与字符串，仅作相对比较。
- 层间去重：L1 定义为 `packages/*/test/` 全集，**包含** L4 的 `build-contracts.test.ts` 与 L3 的 `dev-dx.test.ts`；全仓总数按 L1 ∪ L2 ∪ L3-specs ∪ L5 计算（201 / 45,033 / 3,551）。
- 关键事实核验日期：**2026-10-04**（根脚本、`packages/ubean` scripts 与 exports 键、ci/release 工作流、miniflare skip 行号、skipIf 文件清单、中间件 12 处 `this.hono.use(` 行号、Nitro `test/tests.ts:200/29-32/85-86/286/750`、Nuxt `playwright.config.ts:9-15`、Next `test/lib/gate/README.md`、Vite `ci.yml:141-147` echo-only 门禁、Nitro `.github/codecov.yml` 无 CI 步骤——当日复核）。