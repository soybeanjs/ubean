# 测试覆盖面优化方案 · 对标主流框架的任务明细

> 开发任务型（[ADR-0007](adr/0007-docs-content-classification.md)）。来源：2026-10-03 的一次全仓测试覆盖面审计（只读，未改任何代码）+ 12 个主流全栈框架 CI/测试体系的一手调研（Next.js / Nuxt / Astro / SvelteKit / Vite / Nitro / React Router / Waku / TanStack Router / Analog / SolidStart / 11ty，证据取自各仓 CI 工作流与测试工具源码）。
>
> 核心目的（用户原话口径）：确保测试覆盖框架的**所有功能、配置，以及不同配置的效果**，保证框架健壮性。
>
> **审计总结论**：ubean 的测试资产量不弱（208 文件 / 45,033 行 / 3,498 用例，超过 Astro、Vite 同类量级），短板在**结构**而非数量——缺矩阵、缺门禁、缺「跳过必须可见」的纪律。最高杠杆的动作不是写更多测试，而是**让现有绿灯更难被伪造**。
>
> 七例历史漏检（RM-V14 双编译、asset-manifest 空产物、示例 typecheck 失效、docs 站点不渲染、文档 i18n 漂移、codegen 快照从未执行、dev 热重载整体失效）的共同模式：**dev 侧有断言、build/产物侧无断言**，且每次都伴随「失败被静默吞掉」。本方案以此为第一优先级。

## 0. 结论速览

| # | 动作 | 任务 | 工作量 |
| --- | --- | --- | --- |
| 1 | `packages/ubean` 导出面快照 + 补 test 脚本 + 去掉 `--passWithNoTests` 掩护 | TS-01/02 | 0.5 天 |
| 2 | 中间件 13 步链的**序列断言**（现仅有效果证据） | TS-07 | 1 天 |
| 3 | miniflare 进 devDeps + CI（worker 真机防线现为零） | TS-04 | 1 天 |
| 4 | preset 行为矩阵（Nitro `testNitro()` 模式：9 preset 跑同一套行为断言） | TS-12 | 1 周 |
| 5 | 聚合门禁 + OS/Node 矩阵 + 覆盖率报告（诊断用，不设阈值） | TS-05/13/22 | 3 天 |

## 1. 现状基线（量化）

### 1.1 五层测试资产

| 层 | 位置 | 规模 | 运行方式 |
| --- | --- | --- | --- |
| L1 包内单测 | `packages/*/test/` | 23 包 / 159 文件 / ~34,430 行 / 2,560 用例 | `vp test`（vitest 5.0.3） |
| L2 示例集成 | `examples/ubean-test/test/` | 37 文件 / 8,250 行 / 783 用例 | 真实 `ubean dev`（:3999，global-setup 拉起） |
| L3 浏览器 E2E | `test/browser/specs/`（12 spec）+ `packages/cli/test/dev-dx.test.ts`（10 用例） | ~211 用例 | 真实 Chromium |
| L4 构建/产物契约 | `packages/cli/test/build-contracts.test.ts` 等 | 4 mode × 9 preset = 15 格 + 真机 miniflare | 临时目录真实构建 |
| L5 纯 SPA 示例 | `examples/client-only-spa/test/` | 4 文件 / 30 用例 | vitest + happy-dom |

### 1.2 既有强项（不重做，只补缺）

- 用例密度：`packages/builder` 381 用例、`packages/server` 389 用例、`packages/islands` 217 用例。
- 已有真实浏览器 E2E（多数框架只跑 jsdom）。
- 已有构建矩阵（`build-contracts.test.ts:45`）且**断言产物内容而非仅存在**——是 Nitro `testNitro()` 的雏形。
- 已有性能回归网（`benchmark-lifecycle.mjs` + `perf-baseline.json` + 生效证明，见 [perf-regression-net.md](perf-regression-net.md)）。
- 已有契约文档与 meta 测试（`packages/builder/test/codegen-doc-contract.test.ts:19-37` 用 [contracts/codegen-v1.md](contracts/codegen-v1.md) 反查 `packages/builder/src/codegen/index.ts:56-65` 的 `CODEGEN_FILES`）。
- 全仓 0 个 `vi.mock`（测试更真实）；`it.only` 为 0。

### 1.3 测试技巧盘点

| 技巧 | 用量 | 评价 |
| --- | --- | --- |
| 快照（`toMatchSnapshot` 系列） | **0** | ADR-0002 声明的「codegen 快照单测」从未执行 → TS-28 |
| `vi.mock` | 0 | 保持（优点） |
| `vi.useFakeTimers` | 仅 1 文件 | cron / ISR TTL / rate-limit 窗口未用假时钟 → TS-19 |
| `describe.skipIf` | 4 文件（其中 helper.ts 是注释提及） | 静默腐化主通道 → TS-03 |
| 覆盖率工具 | 无 | → TS-22（仅诊断） |

## 2. 对标：主流框架的共性做法

12 框架横向对比后，以下 8 条是**几乎所有成熟框架都有、而 ubean 没有**的：

| # | 共性做法 | 代表实现 | ubean 现状 | 任务 |
| --- | --- | --- | --- | --- |
| 1 | 聚合门禁 job（分支保护只挂一个） | Next `tests-pass`、Nuxt `ci-ok`、Vite `test-passed` | ❌ 单 job 串行 | TS-05 |
| 2 | OS × Node 矩阵（至少 win 一个点） | Vite node 20/22/24/26 + mac/win；Astro 3 OS × 2 Node（exclude 注明理由） | ❌ 仅 ubuntu + lts | TS-13 |
| 3 | preset 矩阵：同一套断言跑遍所有目标 | Nitro `testNitro(ctx, getHandler, additionalTests?)`（`nitro-tests.ts:200`）；React Router 5 harness；Waku 44 fixture | ⚠️ 仅产物存在性 | TS-12 |
| 4 | 分片（按耗时装箱或 `--shard`） | Next KV timings 装箱 + `--require-timings` 缺数据即硬失败；SvelteKit/Waku `--shard` | ❌ | TS-24 |
| 5 | flakiness 追踪 | Nuxt `FLAKINESS_*`；SvelteKit `print-flaky-test-report.js`；Nitro `retry: 5` | ❌ | TS-25 |
| 6 | 产物/生成物过期守卫（重新生成 + git diff） | Nuxt `ui-templates-generated`；SvelteKit `prepublishOnly && git status --porcelain` | ❌ | TS-20 |
| 7 | 死代码/未使用导出检测 | Nuxt `knip` + `knip:production`（PR 上就跑） | ❌ | TS-21 |
| 8 | 公共 API 类型面守卫 | Nuxt `test:public-api` + `test:attw` | ❌ | TS-19→TS-01 体系 |

两条高价值非普遍做法：**构建失败测试**（SvelteKit `test/build-errors/`：env/prerender/remote/removed-modules/server-only/syntax-error 六个 spec，断言「错误配置以正确信息失败」）→ TS-10；**依赖版本 override 矩阵**（Waku 用 `yq` 改 `pnpm-workspace.yaml` overrides 在多个 React 版本下跑同一套 e2e）→ TS-18。

**值得单独记录的 Nitro 手法**（对 ubean 最有借鉴价值）：

- 中间件顺序直接断言（`nitro-tests.ts:286`）：每个中间件往数组 push 自己的名字，断言 `expect(data).toEqual(["rules","global","routed"])`——纯黑盒、不依赖内部 API。
- 平台差异**在断言内表达**而非整条 skip（`nitro-tests.ts:750`）：同一断言按 `ctx.preset` 分支期望值（如 `statusText` 在 deno/bun/aws 上的合法差异），差异被记录成规格。
- 类型化 Context：`ctx.preset / isDev / isWorker / isLambda / isIsolated / isWindows` 把「平台属性」提升为一等概念。

**调研校准（反直觉发现）**：覆盖率**阈值门禁**在元框架圈并不普遍；成熟框架用「导出面快照 + 产物守卫 + 平台矩阵」替代行覆盖率。对 ubean：**不盲目引入 `--coverage` 阈值**（会诱导凑行数），覆盖率只作诊断 → TS-22；`packages/ubean` 这类纯 re-export barrel 的覆盖率无意义，真正需要的是**导出面快照** → TS-01。

## 3. 缺口清单

### P0（高危：影响框架承诺的核心能力）

| # | 缺口 | 证据 |
| --- | --- | --- |
| P0-1 | `packages/ubean` 聚合入口零测试且无 `test` 脚本 | 9 文件 498 行纯 re-export barrel；`packages/ubean/package.json` scripts 仅 build/dev/typecheck；根 `test` 脚本 `pnpm -r --parallel test -- --passWithNoTests` 两层掩护下静默跳过；8 个子路径导出面完全未验证 |
| P0-2 | worker 真机验证默认自跳过 | `packages/builder/test/cloudflare-preview.test.ts:186`、`:241` 均为 `ctx.skip('miniflare 未安装…')`；本机与 CI 都没装 miniflare；ADR-0013 的 10 条修法（node:fs 虚拟桩、`import.meta.url` 替换、compatibility_date、noExternal 打包、NODE_ENV/global 垫片、wrangler.toml 生成）只在这两条用例里被验证 → 防线恒绿 |
| P0-3 | 中间件相邻顺序无内省断言 | `packages/app/src/app.ts:258-381` 13 步链；`packages/app/test/app-registration.test.ts:73,103` 仅 `toBeGreaterThanOrEqual/GreaterThan` 比数量；唯一顺序证据是间接效果（`packages/cli/test/dev-topology.test.ts:397-436` 头/cookie 观测）→ csrf↔dataCache 互换、i18n 移到 cache 之后，现有测试全绿 |
| P0-4 | 三个示例零测试且不在 CI | `examples/frontend-only`（6 文件 722 行）、`examples/routing-file-mode`（9 文件 634 行，`routing.mode:'file'` 产物+HMR 无守卫）、`examples/ssg-catchall`（11 文件 420 行，仅被 `scripts/benchmark-ssg.mjs:37` 当 fixture）；`examples/platform-drivers` 5 个 .ts、src 下 0 文件，不是可运行示例 |
| P0-5 | 门禁结构缺口 | 覆盖率 0；性能基准不在 CI；体积绝对上限已实现未接线（`packages/cli/src/analyze-lib.ts:133-152`）；`release.yml` 在 `pnpm -r publish` 前零 test/typecheck/lint，且 `--no-frozen-lockfile` 意味着发布时依赖可能与验证时不同 |

### P1（中危：能力存在但验证维度不足）

| # | 缺口 | 证据 |
| --- | --- | --- |
| P1-6 | 非 cloudflare preset 只有形状断言 + mock driver | `packages/preset/test` 89 用例全是配置表形状；`packages/server/test/drivers.test.ts` 7 个驱动全 mock binding；cron 在 serverless 下跳过进程内调度器、ISR 在 serverless 用内存均无行为断言 |
| P1-7 | `no_prefix` / `prefix_and_default` 无 HTTP 层验证 | 纯函数层（`packages/i18n/test/paths.test.ts`）与 SSG 层（`static-render.test.ts:186-225`）四策略齐；HTTP 层仅 `prefix_except_default` 有（`examples/ubean-test/test/i18n.test.ts:18,75`） |
| P1-8 | `logging` 集成层 0 命中 | `packages/config/test/logging.test.ts` 8 用例只测配置归一化（含 ssg/spa 强制关闭置位 `requestSuppressed`）；**无任何测试断言日志真的被输出/被抑制** |
| P1-9 | devtools 客户端 25 文件 5,377 行零测试 | 唯一测试 `packages/devtools/test/devtools.test.ts`（41 用例）全测服务端（16 RPC 函数名精确断言）；客户端 11 views + 6 dialogs + `useRpc.ts` 无测试 |
| P1-10 | `scan.ts` 562 行仅 8 用例、scan 包零负向 | route group `(group)/`、并行路由 `@slot/`、`xxx.reuse.ts` 在 scan 层未测（`packages/vue` 层测的是手工构造输入，不是扫描器输出） |
| P1-11 | 六个包零负向断言 | client / preset / integrations / icon / markdown / scan；全仓负向 192 处 / 25 包（约 5.5%） |

### P2（低危：边界与优化）

- `cache-handler.test.ts` 仅 1 用例；`fs-cache.test.ts` 3 用例（并发写、损坏文件恢复未测）。
- `rate-limit-lifecycle.test.ts` 3 用例（未用假时钟测窗口滑动）。
- `dataCache` 默认 true 的实际语义只测了条数（`app-registration.test.ts:100-107`）；`routeRules.cache` 字段 0 命中。
- 岛屿注册表构建期填充（`packages/islands/src/vite.ts:1384-1385,1525-1526,buildStart:1284-1296`）无构建期断言。
- codegen 可选产物 `typed-router.d.ts` / `openapi.d.ts` / `bundle-baseline.json` 零契约断言（`codegen-manifest.test.ts:24` 只断 3 个文件的 generated 旗标）。
- `electron:true` → `ssr` 默认 false 的联动零验证；`mode:'spa'` + `ssr:true` 的语义未定义未验证。
- `apps/docs` 零测试，CI 里只有 build（内容正确性无断言）。

## 4. 任务明细

> 编号 TS-xx（Test Suite）。每项含：依据（审计证据）/ 做法 / 涉及 / 验收 / 参照（对标来源）/ 工作量。
> 约束继承原始需求：**本文件是方案**，逐项实施时另行开 PR，不与本审计混在一起。

### 阶段 0 · 堵住静默腐化（合计约 3 天；改动最小、收益最直接）

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

#### TS-03 · 统一 dev-server 依赖的 skip 语义

- 依据：`examples/ubean-test/test/helper.ts:8-12` 注释声称「无 dev server 时测试会 skip」，实际 37 个依赖 dev server 的文件中仅 3 个有 `describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)`（`streaming-metadata.test.ts:11`、`data-cache.test.ts:10`、`draft-mode.test.ts:11`），其余 34 个硬失败（ECONNREFUSED）。**反向风险**：global-setup 因故没跑时，恰好这 3 个静默跳过并报成功——腐化的正是这 3 个。
- 做法：统一为「缺 `UBEAN_TEST_BASE_URL` 即 fail 并给出指引」（指向 `pnpm --filter ubean-test test` 的正确入口）：删掉 3 处 `describe.skipIf`，替换为文件级前置断言（`beforeAll` 里检查 env，缺失即 `throw new Error('... 需先启动 dev server 或设置 UBEAN_TEST_BASE_URL')`）。
- 涉及：上述 3 个文件 + `helper.ts`（同步注释）。
- 验收：
  - [ ] 不起 dev server 跑该目录 → 所有文件以**统一的明确错误**失败，无 ECONNREFUSED 噪声、无静默 skip。
  - [ ] 起 dev server 跑 → 全绿，用例数与现在一致。
- 参照：Next.js `--require-timings` 硬失败哲学——「宁可失败也不静默退化」。
- 工作量：0.5 天

#### TS-04 · miniflare 进 devDeps + CI，真机用例改为显式 opt-out

- 依据：P0-2。`cloudflare-preview.test.ts:186,241` `ctx.skip('miniflare 未安装…')` 在 CI 与本地恒跳过。
- 做法：根 devDeps 加 miniflare；CI 安装步骤自然获得；把两处 `ctx.skip` 改为「仅在显式 `UBEAN_SKIP_MINIFLARE=1` 时跳过」，跳过时打印一行**可见警告**。
- 涉及：根 `package.json`、`packages/builder/test/cloudflare-preview.test.ts`、`.github/workflows/ci.yml`。
- 验收：
  - [ ] CI 中两条真机用例真实执行并断言 `runner.fetch` 响应（`:249-251` 的 `'cf:/from-miniflare'` 路径）。
  - [ ] 设 `UBEAN_SKIP_MINIFLARE=1` 时跳过且有可见警告。
- 参照：诚实台账原则——绿灯的含义必须是「验证过」，不是「没装」。
- 工作量：1 天

#### TS-05 · CI 聚合门禁 job

- 依据：现有 `.github/workflows/ci.yml` 单 `ci` job；分支保护直接挂它，加减步骤都要改保护规则。
- 做法：新增 `ci-ok` job：`needs: [ci]` + `if: always()`，`ci` 非 success 即失败；分支保护改挂 `ci-ok`。未来拆矩阵（TS-13）后把所有 job 挂进 `needs`。
- 涉及：`.github/workflows/ci.yml`。
- 验收：
  - [ ] 人为红一个子步骤 → `ci-ok` 红。
  - [ ] GitHub 分支保护只需配置 `ci-ok` 一个 check。
- 参照：Next `tests-pass`、Nuxt `ci-ok`、Vite `test-passed`/`test-failed`。
- 工作量：0.2 天

#### TS-06 · `release.yml` 加发布前质量门禁

- 依据：P0-5。`grep -c "pnpm test|typecheck|lint" release.yml` = 0；`--no-frozen-lockfile` 使发布依赖可能偏离验证依赖。
- 做法：publish 前加 `pnpm typecheck && pnpm lint && pnpm test`；`pnpm install` 改 `--frozen-lockfile`。
- 涉及：`.github/workflows/release.yml`。
- 验收：
  - [ ] release 工作流含三步质量门禁且在 publish 之前。
  - [ ] lockfile 冻结安装。
- 工作量：0.2 天

### 阶段 1 · 补 P0 断言（合计约 1 周）

#### TS-07 · 中间件 13 步链序列断言

- 依据：P0-3（本方案最高价值单项）。13 步链：handle-hook → requestId → actionContext ALS → securityHeaders → CSRF → dataCache → cacheStore init → i18n → routeRules → cache → websocket → lifecycle hooks → `/_health`（`packages/app/src/app.ts:258-381`，各步行号见审计）。
- 做法：照 Nitro `nitro-tests.ts:286` 手法——`examples/ubean-test` 加探针路由（或复用 `/_health` 扩展头），各中间件按条件向 `c.set('__ubean_mw_order__', [...])` push 名称，测试断言**完整 13 步序列**。纯黑盒，不 import 内部 API；门控关闭的中间件（如 `security:false`）断言其缺席。
- 涉及：`packages/app/src/app.ts`（各中间件工厂内一行 push）、`examples/ubean-test/test/`（新 `middleware-order.test.ts`）。
- 验收：
  - [ ] 断言通过且覆盖 13 步全序。
  - [ ] 人为交换两个中间件注册顺序（临时）→ 测试红并指出错位位置。
  - [ ] 三份文档同步：本文件任务表、`app.ts` 链顶注释、（可选）站点 architecture 文档。
- 参照：Nitro。另建议把 13 步链写成显式规格列表并随 TS-07 落进文档（改顺序必须同时改文档与测试）。
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
  - [ ] 断言落在 15 格构建矩阵中至少 fullstack+node 一格（其余格随 TS-12 推广）。
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

### 阶段 2 · 建矩阵（合计约 2 周；收益最大）

#### TS-12 · preset 行为矩阵（Nitro `testNitro()` 模式）

- 依据：P1-6。`build-contracts.test.ts` 只断言产物存在，不起服务、不发请求。
- 做法：
  1. 抽 `testPreset(ctx, getHandler, additionalTests?)`：断言族含 `/_health`、API JSON、404（HTML vs JSON 分支）、缓存命中、安全头、CSRF、i18n 重定向、route rules 生效。
  2. 9 个 preset（node/cloudflare/standard/bun/deno/vercel/vercel-edge/netlify/aws/azure 中按可运行性取舍）各自调用；cloudflare 走 TS-04 的 miniflare。
  3. 平台差异**在断言内表达**（照 `nitro-tests.ts:750`：同一条断言按 `ctx.preset` 分支期望值），不用整条 skip；确需 skip 用 `it.runIf/skipIf` 并注明原因。
  4. 类型化 `ctx`：`preset / mode / isEdge / isWorker / isServerless / isWindows`。
- 涉及：新 `packages/cli/test/preset-runtime/`（或 `packages/builder/test/`），复用 `build-contracts.test.ts` 的临时 outDir 设施。
- 验收：
  - [ ] ≥4 个 preset（node/cloudflare/bun/deno）跑同一套行为断言。
  - [ ] 差异分支有注释说明原因（引 ADR-0013）。
  - [ ] cron 进程内调度器在 serverless preset 下缺席有断言；ISR store 在 serverless 下为内存有断言。
- 参照：Nitro（核心）、React Router（harness 拆分）。
- 工作量：1 周

#### TS-13 · CI OS × Node 矩阵

- 依据：现仅 ubuntu + lts；Windows 路径/CRLF/`fs.watch` 行为不可见。
- 做法：`ci.yml` 改矩阵：`os: [ubuntu-latest, windows-latest]` × `node: [22, 24]`，`fail-fast: false`；在 include/exclude 处注释取舍理由（照 Astro 注释风格）。playwright 缓存键按 OS 分离。
- 验收：
  - [ ] ≥4 格矩阵；windows 至少跑 L1+L4（浏览器 E2E 可仅 ubuntu，注释说明）。
  - [ ] `ci-ok`（TS-05）聚合全部格。
- 参照：Vite / Astro / Waku。
- 工作量：1 天 + 修 Windows 暴露的问题（不预估）

#### TS-14 · 配置组合矩阵（`it.each` 生成）

- 依据：「确保覆盖所有配置及不同配置的效果」的直接落实；当前只测一条主链（fullstack+node+ssr+prefix_except_default+全开）。
- 做法：临时 fixture 项目 × `it.each`：
  - `mode × i18n strategy`：4×4=16 格（当前 HTTP 层仅 1 格）→ 与 TS-15 合并覆盖。
  - `security:false` × `csrf:false` × `dataCache:false` 三关全关：行为断言（头不出现、CSRF 不拦、dataCache 直通），不只数 `use("*")` 条数。
  - `electron:true` → `ssr` 默认 false 联动；`mode:'spa'` + `ssr:true` 语义确认（若未定义，先在 ADR 或 glossary 定稿再测）。
  - `ssr` 优先级链端到端：`definePage({ssr})` > `routeRule.ssr` > 全局 `ssr.exclude`（各层单测已有，链无端到端）。
  - `autoImports` × `components` × `i18n` 三关同开的集成验证。
- 验收：
  - [ ] 每格断言「配置效果」（响应头/重定向/产物），不是配置回读。
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

- 依据：Nuxt `ui-templates-generated` / SvelteKit `prepublishOnly + git status --porcelain`；历史事故 #3/#6 同族。`.ubean/` 产物无 stale 守卫；`typed-router.d.ts`/`openapi.d.ts`/`bundle-baseline.json` 零契约断言。
- 做法：CI step 重新生成 codegen 产物 → `git diff --exit-code`，不一致即失败（提示重新提交）；`codegen-manifest.test.ts` 补全 6 个契约文件的 generated 旗标断言。
- 验收：
  - [ ] 人为手改 `.ubean/` 产物（临时）→ CI 红。
  - [ ] 契约表全部文件的旗标有断言。
- 工作量：0.5 天

#### TS-21 · knip 死代码检测

- 做法：引 `knip`（含 production 口径），PR 上就跑（Nuxt 注释：让 knip 回归在 merge queue 之前暴露）；先跑基线、清理存量或入 ignore 名单。
- 验收：
  - [ ] `pnpm knip` 进 CI；存量清零或显式豁免。
- 工作量：1 天

#### TS-22 · 覆盖率报告（诊断，不设阈值）

- 依据：调研校准——覆盖率阈值门禁会诱导凑行数；但「零执行文件」定位（如 devtools/client 25 文件）很有价值。
- 做法：加 `@vitest/coverage-v8`，CI 上传报告（Codecov 或 artifact）不设阈值；用报告复核本方案遗漏的零覆盖文件。
- 验收：
  - [ ] CI 产出覆盖率报告。
  - [ ] 报告能列出 devtools/client 25 文件为 0%。
- 工作量：0.5 天

#### TS-23 · 体积绝对上限接线

- 依据：机制已实现（`analyze-lib.ts:133-152` `--max-total-kb/--max-entry-kb/--max-chunk-kb`）未传参启用；相对基线 +5% 只防增量不防量级。
- 做法：给 `examples/ubean-test` 的 `analyze:check` 传绝对上限（数值以 TS-22 报告 + perf-regression-net 基线定）。
- 验收：
  - [ ] `analyze:check` 带绝对上限且 CI 绿。
- 参照：[perf-regression-net.md](perf-regression-net.md)「绝对上限待接线」条目收口。
- 工作量：0.2 天

#### TS-24 · 测试分片（条件触发）

- 依据：`fileParallelism:false`（builder/cli/ubean-test）+ 单 job → 全串行；用例增长后线性变慢。
- 做法：待单轮时长超阈值（建议 >15 分钟）再引入 `--shard`；**必须**照 Next.js 做法：分片数据缺失即报错（`--require-timings` 哲学），不静默退化。
- 验收：
  - [ ] （引入时）分片数据缺失 → 显式失败。
- 工作量：暂缓

#### TS-25 · flakiness 追踪（记录，不阻塞）

- 做法：引 Nuxt `FLAKINESS_*` 式汇总或 SvelteKit `github-flaky-warning-reporter.js` 式 reporter；至少**记录**重试即过的用例。
- 验收：
  - [ ] CI 产物含 flaky 用例清单（可为空）。
- 工作量：1 天

#### TS-26 · 性能基准周期化

- 依据：`benchmark-lifecycle.mjs`/`benchmark-ssg.mjs` 完全不在 CI；`perf-regression-net.md` 已正确判断「不做 PR 阻塞门禁」——保留该判断，补周期性观测。
- 做法：nightly/手动 workflow 跑基准，与 `perf-baseline.json` 对照，结果存 artifact。
- 验收：
  - [ ] workflow 手动可触发，产出对比报告 artifact。
- 工作量：0.5 天

### 阶段 4 · 长期机制（持续）

#### TS-27 · 回归 fixture 编号化

- 做法：每次线上/事故修复，在 `examples/ubean-test/test/regressions/`（或对应包 test/）固化以编号命名的 fixture + 断言，写明事故根因一行。
- 参照：11ty `test_node/3824-incremental/`（以 issue 编号命名的永久回归 fixture——最便宜最有效的组织方式）。
- 验收：
  - [ ] 下一次 bug 修复起执行（无存量任务）。

#### TS-28 · ADR-0002 边界落地或修订

- 依据：ADR-0002 声明的「codegen 快照单测」从未执行（全仓 0 快照）；helper 注释与实际的 skip 语义也不符（TS-03）。
- 做法：二选一——真加 codegen 快照单测（TS-01 的导出快照 + `packages/builder/test/` 的模板快照），或修订 ADR 承认边界变化。不要留着未执行的声明。
- 验收：
  - [ ] ADR-0002 状态更新（implemented 或修订），与实际一致。
- 工作量：0.5 天

#### TS-29 · fixture 隔离，恢复并行

- 依据：builder/cli `fileParallelism:false` 注释记录的「单跑绿、一起跑红」（production-build 与 build-parity 共用 fixture；dev-reload/dev-dx/dev-topology 起真 server 并改写示例源码）——根源是共享 fixture，`fileParallelism:false` 是缓解不是修复。
- 做法：每测试独立 tmpdir（React Router `createProject` 模式：每测试声明文件清单 → 临时目录 → 起服务 → 用完销毁）。
- 验收：
  - [ ] 涉及包移除 `fileParallelism:false` 后连跑 3 次绿。
- 工作量：2 天

#### TS-30 · devtools 客户端最小测试

- 依据：P1-9。客户端 25 文件 5,377 行零测试；`dev-dx.test.ts:318` 刻意只断言外壳可达（合理），但 `useRpc.ts`（重连/轮询逻辑）值得单测。
- 做法：先只测 `composables/useRpc.ts` 纯逻辑（连接状态机、轮询、错误恢复）；views/dialogs 组件测试**不做**（成本高、易碎，ADR-0002 边界）。
- 验收：
  - [ ] `useRpc` 有单测。
- 工作量：1 天

#### TS-31 · `scan.ts` 覆盖加固

- 依据：P1-10。562 行仅 8 用例、零负向。
- 做法：补 route group `(group)/`、并行路由 `@slot/`、`xxx.reuse.ts` 的**扫描器输出**断言（输入是真实文件树，不是手工构造）；补负向（非法文件名/空目录/循环符号链接）。
- 验收：
  - [ ] 上述三类结构各有扫描器输出断言；≥4 条负向。
- 工作量：1 天

## 5. 配置覆盖矩阵与组合空白（TS-14 的输入）

**薄配置字段**（`packages/config/src/types.ts:690-1007`，测试引用数为全仓计数）：

| 字段 | 行号 | 引用 | 判定 |
| --- | --- | --- | --- |
| `logging` | 806 | 0（但有 8 个专项单测） | 行为未验证（TS-16） |
| `colorMode` | 849-868 | 0（间接被测 12+15 次） | 可接受 |
| `dataCache` | 967 | 4 | 薄（TS-14） |
| `electron` | 723 | 3 | 联动零验证（TS-14） |
| `autoImports` | 937 | 2（但归一化/分库/解析器有真实覆盖） | 可接受 |
| `pinia` | 747 | 1 | 薄 |
| `partyTown` | 873-891 | 2（`client` 包有 2 条行为断言） | 可接受 |
| `scanOptions` | 980 | 1 | 极薄 |

**组合空白**（当前只测主链 fullstack+node+ssr+`prefix_except_default`+全开）：

| 维度 | 应有格 | 已测 | 空白 |
| --- | --- | --- | --- |
| `mode` × `preset` | 36 | 15（仅构建存在性） | 运行时行为 0（TS-12） |
| `mode` × i18n strategy | 16 | 4（HTTP 层 1） | 12（TS-15） |
| `cache.store` × preset | 27 | 3（仅配置默认值） | 行为 0（TS-12） |
| `ssr` 优先级链 | 1 条链 | 各层单测 | 端到端 0（TS-14） |
| `electron` × `ssr` | 2 | 0 | 全空（TS-14） |
| `logging` level × mode | 16 | 配置层 8 | 运行时 0（TS-16） |

## 6. 不做清单（刻意不做，防伪缺口）

- **不设覆盖率阈值门禁**——调研结论：成熟框架普遍不设；用导出面快照 + 产物守卫 + 平台矩阵替代（TS-22 只诊断）。
- **不做 PR 阻塞的性能门禁**——沿用 [perf-regression-net.md](perf-regression-net.md) 既有判断（TS-26 只做周期观测）。
- **不做 devtools 客户端组件测试**——成本高易碎，只测 `useRpc` 逻辑（TS-30）。
- **不引入 `vi.mock` 风格**——全仓 0 mock 是优点（除平台驱动这类天然 mock 边界，已标注 `[mock]`）。
- **暂不做跨浏览器矩阵（firefox/webkit）**——Chromium 已覆盖主要回归面，待有真实需要再加（SvelteKit 式）。
- **不做 Nx/Turbo 式任务分发**——仓库规模未到；分片（TS-24）条件触发即可。

## 7. 验收台账

> 诚实台账（对照 [roadmap.md](roadmap.md) §4 风格）：全部任务落地后，本文件正文按 ADR-0007 删除，决策沉淀进 ADR（预计新增一篇「测试策略」ADR 收编本文件的口径决策），历史归 git。

- [ ] 阶段 0（TS-01~06）：静默腐化通道清零——`--passWithNoTests` 移除、skip 语义统一、miniflare 真机进 CI、发布门禁就位。
- [ ] 阶段 1（TS-07~11）：P0 断言就位——中间件序列、产物内容、错误配置、三示例。
- [ ] 阶段 2（TS-12~18）：≥4 preset 行为矩阵 + OS×Node 矩阵 + 配置组合矩阵。
- [ ] 阶段 3（TS-19~26）：产物过期守卫 + knip + 覆盖率报告 + 绝对体积上限 + flakiness 记录。
- [ ] 阶段 4（TS-27~31）：回归编号化、ADR-0002 对齐、并行恢复、useRpc/scan 加固。
- [ ] 每完成一项，在本文件勾选并在 PR 描述附「红→绿证明」（人为破坏 → 测试红 → 修复 → 绿），防止「断言写了个寂寞」。

## 附录：证据口径

- 审计方式：全仓静态分析（文件清单 / 用例计数 / 断言模式 / config 字段×测试引用矩阵）+ 中间件链与 CI 配置逐行核对；**未运行任何测试、未构建**——结论描述「文件里写了什么」，不描述「CI 现在是否绿」。
- 计数口径：用例数以 `it(`/`it.each(` 计；负向断言以 `toThrow|rejects|4xx|5xx` 正则计；字段引用数含注释与字符串，仅作相对比较。
- 关键事实核验日期：2026-10-03（根脚本、`packages/ubean` scripts、ci/release 工作流、miniflare skip 行号、skipIf 文件清单当日复核）。
