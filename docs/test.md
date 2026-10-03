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
  - [ ] `pnpm --filter ubean test` 可执行且绿。
  - [ ] 人为删一个导出（临时）→ 测试红，报出缺失符号名。
  - [ ] `pnpm -r test` 不再静默跳过该包。
- 参照：Nuxt `test:public-api`。
- 工作量：0.5 天

#### TS-02 · 去掉 `--passWithNoTests` 掩护

- 依据：ADR-0002 已将此列为目标（OPT-04）未执行；根脚本 `test: pnpm -r --parallel test -- --passWithNoTests`。
- 做法：根脚本改为 `pnpm -r test`（TS-01 完成后 `packages/ubean` 已有测试，无包会因此变红；若后续新增无测试包，应显式红灯而非静默）。
- 涉及：根 `package.json`。
- 验收：
  - [ ] 根脚本不再含 `--passWithNoTests`。
  - [ ] 全仓 `pnpm test` 绿。
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
  - [ ] 不起 dev server 跑该目录 → 所有文件以**统一的明确错误**失败，无 ECONNREFUSED 噪声、无静默 skip。
  - [ ] 起 dev server 跑 → 全绿，用例数与现在一致（783）。
  - [ ] 全仓 `ctx.skip(` 与 `describe.skipIf(` 仅剩 TS-04 的 miniflare opt-out（有可见警告）。
- 参照：Next `@gate` 绊线（`test/lib/gate/README.md:3-5,27`）+ `--require-timings` 硬失败哲学——「宁可失败也不静默退化」。
- 工作量：0.5 天

#### TS-04 · miniflare 进 devDeps + CI，真机用例改为显式 opt-out

- 依据：P0-2。`cloudflare-preview.test.ts:186,241` `ctx.skip('miniflare 未安装…')` 在 CI 与本地恒跳过。
- 做法：根 devDeps 加 miniflare；CI 安装步骤自然获得；把两处 `ctx.skip` 改为「仅在显式 `UBEAN_SKIP_MINIFLARE=1` 时跳过」，跳过时打印一行**可见警告**。
- 涉及：根 `package.json`、`packages/builder/test/cloudflare-preview.test.ts`、`.github/workflows/ci.yml`。
- 验收：
  - [ ] CI 中两条真机用例真实执行并断言 `runner.fetch` 响应（`:249-251` 的 `'cf:/from-miniflare'` 路径）。
  - [ ] 设 `UBEAN_SKIP_MINIFLARE=1` 时跳过且有可见警告。
- 备注：该文件的**接线层**（假 miniflare，断言「worker 缺失 / 依赖缺失 / 成功」三种结果）已在运行，本次只补真机层——TS-04 的「真机防线为零」仅指真机层。
- 参照：诚实台账原则——绿灯的含义必须是「验证过」，不是「没装」。
- 工作量：1 天

#### TS-05 · CI 聚合门禁 job

- 依据：现有 `.github/workflows/ci.yml` 单 `ci` job；分支保护直接挂它，加减步骤都要改保护规则。
- 做法：新增 `ci-ok` job：`needs: [ci]` + `if: always()`，`ci` 非 success 即失败；分支保护改挂 `ci-ok`。未来拆矩阵（TS-13）后把所有 job 挂进 `needs`。
- 涉及：`.github/workflows/ci.yml`。
- 验收：
  - [ ] 人为红一个子步骤 → `ci-ok` 红。
  - [ ] GitHub 分支保护只需配置 `ci-ok` 一个 check。
- 参照：Next `tests-pass`、Nuxt `ci-ok`（**注**：12 框架中仅此 2 例；Vite `test-passed` 是 echo-only，不构成门禁）。
- 工作量：0.2 天

#### TS-06 · `release.yml` 加发布前质量门禁

- 依据：P0-5。`grep -c "pnpm test|typecheck|lint" release.yml` = 0；`--no-frozen-lockfile` 使发布依赖可能偏离验证依赖。
- 做法：publish 前加 `pnpm typecheck && pnpm lint && pnpm test`；`pnpm install` 改 `--frozen-lockfile`。
- 涉及：`.github/workflows/release.yml`。
- 验收：
  - [ ] release 工作流含三步质量门禁且在 publish 之前。
  - [ ] lockfile 冻结安装。
- 工作量：0.2 天

#### TS-32 · 把 201 条孤儿浏览器 E2E 接进脚本与 CI ★ 最高 ROI

- 依据：P0-6。根 `package.json` 无 `test:e2e` / `e2e` 脚本；`ci.yml` 无浏览器步骤；`grep -rn "test:e2e\|e2e" package.json .github/workflows/*.yml` 零命中。而根 `vite.config.ts` 已完整配置浏览器模式，`test/browser/global-setup.ts` 会拉起 `:3998` 并预热 20 条路径，12 spec / 201 用例就绪。
- 做法：
  1. 根 `package.json` 加 `"test:e2e": "vp test"`（在根目录执行，命中根 `vite.config.ts` 的 `include`）。
  2. `ci.yml` 加独立 step（在 Test 之后）：复用已有的 Playwright 缓存/安装步骤，`pnpm test:e2e`。
  3. 失败时上传 Playwright trace（`actions/upload-artifact`）。
  4. 清理死代码：`test/browser/pages/data-fetch.page.ts` 要么补 spec，要么删除 POM（二选一，不允许悬空）。
- 涉及：根 `package.json`、`.github/workflows/ci.yml`、`test/browser/pages/data-fetch.page.ts`。
- 验收：
  - [ ] `pnpm test:e2e` 在本地可执行，201 条用例全绿。
  - [ ] CI 中出现该 step 且**真的跑了浏览器**（日志含 `:3998` 启动与预热）。
  - [ ] 人为破坏一个页面（临时）→ 对应用例红。
- 参照：Nuxt `playwright.config.ts` 的 e2e 项目编排；React Router `pretest:integration: pnpm build` 先构建再起服务的顺序。
- 工作量：0.5 天
- **说明**：本项**不新增任何测试**，纯接线——因此是全部任务中性价比最高的一项，应最先做。

### 阶段 1 · 补 P0 断言（合计约 1 周）

#### TS-07 · 中间件 13 步链序列断言 ★ 本方案最高价值单项

- 依据：P0-3（`app-registration.test.ts:73,103` 仅比数量）。
- 13 步链（`packages/app/src/app.ts:258-381`，逐行核对）：

  | # | 步骤 | 行号 | 条件 |
  | --- | --- | --- | --- |
  | 1 | `handle` hook 闸门 | 266 | 始终 |
  | 2 | `requestId()` | 274 | 始终 |
  | 3 | actionContext ALS | 276 | 始终 |
  | 4 | `securityHeaders` | 284 | `securityHeaders !== false` |
  | 5 | CSRF | 296 | `csrf !== false` |
  | 6 | `dataCache` | 308 | `dataCache !== false` |
  | 7 | cacheStore 初始化 | 311-319 | `cacheStore` 或 `cache.store==='fs'` |
  | 8 | i18n | 325 | `enabled !== false && locales.length > 0` |
  | 9 | routeRules | 338 | `routeRules` 非空 |
  | 10 | cache 中间件 | 353 | 存在 cache 规则 |
  | 11 | websocket | 358 | 始终 |
  | 12 | lifecycle hooks | 360 | 始终 |
  | 13 | `/_health` | 377 | `healthEndpoint !== false` |

- 做法：照 Nitro `test/tests.ts:286-290` 手法——`expect(data).toEqual(["rules", "global", "routed"])`。在 `examples/ubean-test` 加探针路由（或扩展 `/_health` 的响应头），各中间件按条件向 `c.set('__ubean_mw_order__', [...])` push 名称，测试断言**完整 13 步序列**。纯黑盒，不 import 内部 API；门控关闭的中间件（如 `security:false`）断言其**缺席**。
- 涉及：`packages/app/src/app.ts`（各中间件工厂内一行 push）、`examples/ubean-test/test/middleware-order.test.ts`（新）。
- 验收：
  - [ ] 断言通过且覆盖 13 步全序。
  - [ ] 人为交换两个中间件注册顺序（临时）→ 测试红并指出错位位置。
  - [ ] `security:false` / `csrf:false` / `dataCache:false` 三关配置下，断言对应步骤缺席（与 TS-14 联动）。
  - [ ] 三份文档同步：本文件任务表、`app.ts` 链顶注释、（可选）站点 architecture 文档。
- 参照：Nitro `tests.ts:286`。
- 工作量：1 天

#### TS-08 · 路由栈内省从「计数」升级为「顺序 + 内容」

- 依据：`app-registration.test.ts:73,103` 仅比数量。
- 做法：扩展 `registeredPaths`/`hasRoute` 辅助，断言关键路由的**注册顺序**（static-before-routes，`app.ts:405-416`）与方法集。
- 验收：
  - [ ] 断言 static 中间件先于用户路由。
  - [ ] 断言 API 路由方法集与源码声明一致（抽样）。
- 工作量：0.5 天

#### TS-09 · 构建产物内容级断言（防「体积门禁全绿但产物空」重演）

- 依据：历史事故 #2——`virtual:ubean-asset-manifest` 内联空产物（生产 HTML 无入口 `<script>`、无样式表），当时所有体积门禁全绿。
- 做法：`packages/builder/test/production-build.test.ts` 增加：生产 HTML 含非空入口 `<script src>` 与 ≥1 个 `<link rel="stylesheet">`；asset-manifest 产物非空且含入口字段。
- 验收：
  - [ ] 断言落在构建矩阵中至少 fullstack+node 一格（其余格随 TS-12 推广）。
  - [ ] 人为制造空 manifest（临时）→ 测试红。
- 参照：React Router fixture 的 `grep(cwd, pattern)` 产物内容断言。
- 工作量：0.5 天

#### TS-10 · 「错误配置必须失败」测试域

- 依据：SvelteKit `packages/kit/test/build-errors/` 六个 spec 是唯一把它做成独立目录的框架；ubean 只有运行时错误测试（`errors.test.ts`），无构建期错误断言。
- 做法：新建 `packages/cli/test/build-errors.test.ts`（或 builder 侧），用临时 fixture 项目断言：非法 `ubean.config.ts`、`srcDir` 不存在、拦截路由 `(.)/(..)/(...)` 标记（扫描器已知会抛错）、非法路由组/并行路由标记 → 构建**以非零码退出**且错误信息**可操作**（含修复建议文案片段）。
- 验收：
  - [ ] ≥5 类非法输入各有断言（退出码 + 错误信息片段）。
- 参照：SvelteKit build-errors。
- 工作量：1 天

#### TS-11 · 三个示例纳入守卫

- 依据：P0-4。`frontend-only`（无后端路径）、`routing-file-mode`（`routing.mode:'file'` 产物 + `onGenerated` + HMR）、`ssg-catchall`（SSG catch-all chunk 能被 preview 静态服务器访问——其注释自述的存在理由）。
- 做法：各加最小 smoke：真实构建 + 产物内容断言 + 关键路径请求 200；纳入 CI 的 `pnpm test`（或 CI 独立 step）。`platform-drivers` 补成可运行示例或显式标注「代码片段集，非示例」。
- 验收：
  - [ ] 三示例各有 ≥1 个进 CI 的 smoke 测试。
  - [ ] `platform-drivers` 定性明确。
- 参照：SolidStart fixture 应用矩阵（`bare`/`bare-js` 测降级路径的思路）。
- 工作量：2 天

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
  - [ ] ≥4 个 preset（node/cloudflare/bun/deno）跑同一套行为断言。
  - [ ] 差异分支有注释说明原因（引 ADR-0013）。
  - [ ] cron 进程内调度器在 serverless preset 下缺席有断言；ISR store 在 serverless 下为内存有断言。
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
  - [ ] `UBEAN_TEST_MODE=build pnpm --filter ubean-test test` 可执行且绿。
  - [ ] 至少 1 条断言在 build 模式下**发现 dev 模式下发现不了的差异**（记录在案，即使结论是「无差异」也要记录验证过）。
  - [ ] CI 中 dev 与 build 两轨都跑（或 build 轨 nightly）。
- 参照：Nuxt `e2eMatrix`（`playwright.config.ts:9-15`）、SvelteKit `DEV=true`、Vite `VITE_TEST_BUILD`、Next `NEXT_TEST_MODE`。
- 工作量：3 天

#### TS-13 · CI OS × Node 矩阵

- 依据：现仅 ubuntu + lts；Windows 路径/CRLF/`fs.watch` 行为不可见。
- 做法：`ci.yml` 改矩阵：`os: [ubuntu-latest, windows-latest]` × `node: [22, 24]`，`fail-fast: false`；在 include/exclude 处注释取舍理由（照 Astro 注释风格）。playwright 缓存键按 OS 分离。
- 验收：
  - [ ] ≥4 格矩阵；windows 至少跑 L1+L4（浏览器 E2E 可仅 ubuntu，注释说明）。
  - [ ] `ci-ok`（TS-05）聚合全部格。
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
  - [ ] 每格断言「配置效果」（响应头/重定向/产物），**不是配置回读**。
  - [ ] 新增字段时，§6 矩阵表同步更新（配置轴的可维护性依赖这张表）。
- 工作量：3 天

#### TS-15 · i18n 四策略 HTTP 层补全

- 依据：P1-7。
- 做法：`no_prefix` / `prefix` / `prefix_and_default` 各起 fixture（或 `it.each` + 临时项目）断言路由匹配、默认语言重定向、cookie 交互（对照 `dev-topology.test.ts:413` 的 `ubean_locale` 观测法）。
- 验收：
  - [ ] 4 策略在 HTTP 层各有 ≥2 断言（路由匹配 + 重定向行为）。
- 工作量：1 天

#### TS-16 · `logging` 运行时断言

- 依据：P1-8。`requestSuppressed` 置位后是否真的不打印，无验证。
- 做法：捕获 stdout（或注入 logger），断言：fullstack 默认有请求日志；ssg/spa（`requestSuppressed`）无请求日志；`level` 过滤生效。
- 验收：
  - [ ] ≥3 条行为断言（输出/抑制/级别）。
- 工作量：0.5 天

#### TS-17 · server 驱动与缓存边界加固

- 依据：P2 与 P1-6 的 drivers 部分。`drivers.test.ts` 7 驱动全 mock；`cache-handler` 1 用例；`fs-cache` 3 用例。
- 做法：测试名标注 `[mock]`（诚实标注）；补 fs-cache 并发写、损坏文件恢复；rate-limit 用 `vi.useFakeTimers` 测窗口滑动；cron/ISR TTL 补假时钟用例。
- 验收：
  - [ ] 7 个驱动测试名含 `[mock]`。
  - [ ] fs-cache 并发写与损坏恢复各有断言。
  - [ ] rate-limit / ISR TTL 各有假时钟用例。
- 工作量：1.5 天

#### TS-18 · 依赖版本兼容矩阵（长期）

- 依据：Waku `react_version` override（`yq` 改 `pnpm-workspace.yaml` → 重装 → 跑同一套 e2e）。
- 做法：对 Vue 3.x 多版本 / Vite 大版本（含 beta 活口，照 SvelteKit 注释掉的 `vite: 'beta'` 先例）周期性跑 e2e——nightly 或手动触发，不进 PR 门禁。
- 验收：
  - [ ] 至少 Vue 当前 minor 与前一 minor 各跑一轮 L2。
- 工作量：1 天 + 周期维护

### 阶段 3 · 门禁与量化（合计约 4 天）

#### TS-19 · 假时钟覆盖推广（从 TS-17 独立出的通用项）

- 说明：cron（`defineScheduled`/`parseCron`）、ISR TTL、sessions 过期均涉及时间；统一用 `vi.useFakeTimers`。
- 验收：
  - [ ] cron 触发窗口、ISR 再生间隔各有假时钟用例。
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
| `logging` | 806 | **0** | 解析层 8 单测 + 级别层 19 单测，**运行时零断言** → TS-16 |
| `colorMode` | 849-868 | 0 | 单维 |
| `dataCache` | 967 | 4 | 只测条数 → TS-14 |
| `electron` | 723 | 3 | `ssr` 联动零验证 → TS-14 |
| `autoImports` | 937 | 2 | 单维 |
| `pinia` | 747 | 1 | 单维 |
| `partyTown` | 873-891 | 2 | 单维 |
| `scanOptions` | 980 | 1 | 单维 |

### 6.3 组合空白（应有 / 已测）

| 组合 | 应有 | 已测 | 缺口性质 |
| --- | --- | --- | --- |
| `mode` × `preset` | 36 | 15（仅构建存在性） | **交互闭包** → TS-12 |
| `mode` × i18n strategy | 16 | 4 | **交互闭包** → TS-14 |
| `cache.store` × preset | 27 | 3 | **交互闭包**（serverless 必须 memory）→ TS-12 |
| `ssr` 优先级链 | 1 条端到端 | 0 | **交互闭包**（三层覆盖）→ TS-14 |
| `electron` × `ssr` | 2 | 0 | **交互闭包** → TS-14 |
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

- [ ] 阶段 0（TS-01~06 + TS-32）：静默腐化通道清零——`--passWithNoTests` 移除、skip 语义统一、miniflare 真机进 CI、**201 条浏览器 E2E 接入 CI**、发布门禁就位。
- [ ] 阶段 1（TS-07~11）：P0 断言就位——中间件 13 步序列、产物内容、错误配置、三示例。
- [ ] 阶段 2（TS-12~18 + TS-33）：≥4 preset 行为矩阵 + OS×Node 矩阵 + 配置组合矩阵 + **dev/build 双轨**。
- [ ] 阶段 3（TS-19~26）：产物过期守卫 + knip + 覆盖率报告（无阈值）+ 绝对体积上限 + flakiness 记录。
- [ ] 阶段 4（TS-27~31）：回归编号化、ADR-0002 落地或修订、并行恢复、useRpc/scan 加固。
- [ ] 阶段 5（TS-34~37）：L2 单测形态下沉 L1（填六域）+ L2/L3 去重 + L3 空洞补全 + harness 收敛。
- [ ] 每完成一项，在本文件勾选并在 PR 描述附「红→绿证明」（人为破坏 → 测试红 → 修复 → 绿），防止「断言写了个寂寞」。
- [ ] 七例历史漏检各有编号化回归用例（TS-27 产出映射表）。

## 附录：证据口径

- 审计方式：全仓静态分析（文件清单 / 用例计数 / 断言模式 / config 字段×测试引用矩阵）+ 中间件链与 CI 配置逐行核对 + 12 框架部分克隆源码核对；**未运行任何测试、未构建**——结论描述「文件里写了什么」，不描述「CI 现在是否绿」。
- 计数口径：文件 = `*.test.ts` / `*.e2e.spec.ts`（`.vue` fixture 不计）；用例 = `it(` 次数 + `it.each(` 展开元素数；**错误路径断言**以 `toThrow\(|\.rejects|\.status\)\.toBe\([45][0-9][0-9]\)` 正则计（注意：不能写成 `4xx|5xx`——该写法只会匹配注释里的字面量 `4xx`/`5xx`（全仓 7 处），匹配不到 `toBe(404)` 这类真实状态码，会把负向计数系统性算错）；字段引用数含注释与字符串，仅作相对比较。
- 层间去重：L1 定义为 `packages/*/test/` 全集，**包含** L4 的 `build-contracts.test.ts` 与 L3 的 `dev-dx.test.ts`；全仓总数按 L1 ∪ L2 ∪ L3-specs ∪ L5 计算（201 / 45,033 / 3,551）。
- 关键事实核验日期：**2026-10-04**（根脚本、`packages/ubean` scripts 与 exports 键、ci/release 工作流、miniflare skip 行号、skipIf 文件清单、中间件 12 处 `this.hono.use(` 行号、Nitro `test/tests.ts:200/29-32/85-86/286/750`、Nuxt `playwright.config.ts:9-15`、Next `test/lib/gate/README.md`、Vite `ci.yml:141-147` echo-only 门禁、Nitro `.github/codecov.yml` 无 CI 步骤——当日复核）。