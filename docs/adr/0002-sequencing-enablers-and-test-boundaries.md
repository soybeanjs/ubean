# ADR-0002 · 优化序列重排：enabler 领头 + 测试边界 + 可度量门禁

- **状态**: accepted
- **日期**: 2026-08-02
- **修订**: 2026-09-27（删除已落地的任务序列与影响面/待决子项；补记快照边界从未落地）；2026-09-28（TS-28：补落 `production.ts` 的快照单测、记录 Decision 2 实测、确认「真实构建留在单测层」）
- **关联任务**: optimize.md 建议执行顺序、OPT-04、OPT-09、OPT-11（原 `optimize.md` 已归档删除，见 git 历史）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。

## 背景

optimize.md 的「建议执行顺序」把全部 P2（含 OPT-09 / OPT-11）放在末尾「可并行」。grilling 中发现两个问题：

1. **OPT-09 / OPT-11 是 enabler，不是 feature work**。
   - OPT-09（包树 CI 校验）本可防止 OPT-03（手动文档纠偏）发生。把护栏排在被护栏保护的工作之后，等于保证下一次漂移仍需手工修。
   - OPT-11（CodeGraph 进 PR 流）是证据层。OPT-01 的 blast radius 本次靠人工 grep 完成；若 OPT-11 先落地，OPT-01/04/05 均可由 `codegraph impact` 供给数据，而非临时 grep。
2. **OPT-04 4b 把 codegen 单测与集成测混为一谈**。`production.ts` 是 codegen 模块（产出 server entry 模板字符串）。验收里「关键 production 路径（临时目录）」暗示在临时目录跑真实 Vite build，属慢集成测，与 4b 自身目标「缩短反馈环」冲突。
3. **OPT-04 验收「缩短反馈环」无度量**，无法判定成功。

> 序列重排本身（enabler 领头 → 各 OPT 落地）已执行完毕。原「1. 序列重排」段与「影响面」表属任务跟踪，已按 [ADR-0007](0007-docs-content-classification.md) 删除；OPT-09 / OPT-11 的实现结论见 [ADR-0005](0005-opt09-impl-opt11-timing-opt01-subitem.md)。术语「enabler / 快照单测 / 临时目录集成测」见 [docs/glossary.md](../glossary.md)。

## 决策

### 1. OPT-04 4b 测试边界：快照单测为主

- `production.ts` / `virtual-modules.ts` 等 codegen 模块：**对生成的字符串做 snapshot/断言**，作为快速单元门禁。
- 临时目录真实 Vite build 归入 **e2e**（`examples/ubean-test` 或专门的 integration 套件），**不进 4b**。
- `transformMacros`、虚拟模块注册等纯函数 / 纯注册逻辑：常规单元测试。

**诚实补记（2026-09-27）**：这条边界**从未被真正执行**。`packages/builder/test/production-build.test.ts` 是全量构建集成测试（真实走 `vite build`），而 `grep -rl toMatchSnapshot packages/builder/test/` **零命中** —— codegen 模块「快照单测」这一半没有落地，留在套件里的恰是本决策想避免的慢集成测形态。要么补快照单测，要么明确承认边界已被放弃（维护者决定）。[docs/glossary.md](../glossary.md) 里「codegen 模块用快照单测」的措辞同样与现状不符。

**结论（2026-09-28，TS-28）：补落，不修订。** 逐模块实测后发现这条边界其实**只落地了一半**，而漏掉的那一半恰好是 Decision 1 点名的两个模块之一：

| 模块 | 语句覆盖 | 当时状态 |
| ---- | -------- | -------- |
| `virtual-modules.ts` | **97.7%** | 已有 `virtual-modules.test.ts`（关键片段断言） |
| `production.ts` | **6.2%** | 只有 `serializePagesForEntry` / `getPresetBuildConfig` 被间接覆盖；三份 preset 入口模板与 islands SSR 空壳插件零断言 |

因此不存在「快照单测这条路走不通」的证据 —— 走通的那一半（`virtual-modules.ts`）恰是 Decision 1 想要的形态，且成本可忽略（毫秒级）。已补 `packages/builder/test/codegen-entry-templates.test.ts`（6 例，1.0s）覆盖 `production.ts` 的纯字符串生成器，语句覆盖 6.2% → **16.5%**、函数 13.0% → **39.1%**（其余部分是 `generateVirtualModulesToDisk` 的落盘逻辑与三份 preset 入口**文件写入**，属 IO 装配，不是字符串生成，见下条）。

**形态澄清：Decision 1 说的「snapshot/断言」在本仓的实际形态是显式断言，不是 `toMatchSnapshot()`。** 整串快照会在改一行注释时变红 —— 那是噪音不是信号。锁的是**契约**（模板必须 import 哪个文件名、必须传哪个参数、必须保留哪个逃生口）。`packages/ubean/test/exports.test.ts` 的 `EXPECTED_EXPORTS` 显式表同属此形态，那里也自称「快照」而非 `toMatchSnapshot`。`grep -rl toMatchSnapshot packages/builder/test/` 仍为 **0 命中，且这是有意的** —— 因此 TS-28 验收里「若选 (a)，`grep` 非空」那一格按**形态澄清**而非字面满足（改判据：`packages/builder/test/` 下存在覆盖 codegen 字符串生成器的断言文件）。

**一处跨模块契约**（补测时发现，正是 Decision 1 想拦的那类缺陷）：三份入口模板都写死 `from './entry.mjs'`，而该文件名由 `serverOutputNames().entryFileNames` 决定。两处任一改动而另一处没跟上，产物在**运行时**才报 `No such module`。新用例把两者钉在一起（红证 M1：把 `entryFileNames` 改成 `bundle.mjs` → 1 格红）。

**未按 ADR 字面执行的一处，明确保留（不是遗漏）**：Decision 1 说「临时目录真实 Vite build 归入 e2e，**不进 4b**」。现状是 `production-build.test.ts`（真实 `vite build`，**0.86s**）留在 L1 单测层。保留的理由是**信号强度**：它是全仓唯一的 build 侧端到端断言，而历史事故 #1（RM-V14 双编译）正是「dev 侧 500+ 断言、build 侧 0 断言」造成的；把它移出单测层等于把那个盲区还给 CI 的默认路径。成本上 0.86s 对 20.5s 的 `packages/builder` 套件无感。**且这已不是孤例**：TS-33 建立的 build 轨（`UBEAN_TEST_MODE=build`）与 `packages/cli/test/build-*.test.ts` 族同样是真实构建进单测层。所以准确表述是「**慢集成测可以留在单测层，但必须显式标记且受体积/耗时闸门约束**」，而不是「必须上移」。

### 2. OPT-04 可度量门禁

验收增设可度量目标（先量基线，再设阈值）：

- 基线：记录 `@ubean/config` / `@ubean/build` / `@ubean/cli` 三包的单测时长（当时为 0 或不存在）与 CI `test` 步骤总时长。
- 目标：三包单测合计 < 10s（快照单测应远低于此）；CI `test` 步骤不应因新增单测而显著上升（增量可由 parallelism 吸收）。
- `--passWithNoTests` 不再作为这三包的掩护：补测后这三包必须有真实测试文件。

> 门禁本身仍有效，并被 [ADR-0012](0012-vite-plugin-first-lifecycle.md) 与 [docs/glossary.md](../glossary.md) 引用。

**实测数据（2026-09-28，TS-28）**：

| 包 | 用例数 | 墙钟 | 备注 |
| -- | ------ | ---- | ---- |
| `@ubean/config` | 112 | **0.27s** | 纯逻辑，达标 |
| `@ubean/build` | 446 | **20.5s** | import 占 60%、tests 36% |
| `@ubean/cli` | 400（+2 跳过） | **119.6s** | tests 占 97%，主要是真起 dev server / 真构建 / 浏览器走查 |
| **合计** | 958 | **140.4s** | 目标 < 10s，**未达标** |

**未达标的原因不是「快照单测没写够」，而是这三个包后来承担了远超 codegen 的职责**：`@ubean/build` 是全部 Vite 插件与构建编排的宿主（42 个测试文件里 40 个是集成/构建形态），`@ubean/cli` 的耗时 97% 花在真起服务、真构建、真浏览器走查上（最慢四文件：`build-contracts` 27.9s / `dev-dx` 17.9s / `build-errors` 16.1s / `preset-matrix` 15.7s）。把 10s 目标当门禁会持续假阳性。

**改判据（取代绝对秒数）**：Decision 2 的意图是「**反馈环要短**」，可执行版本是**分层 + 闸门**，且这两条都已落地：

1. **单文件耗时可见**：TS-24 让 CI 输出各包/各层耗时，慢文件无从隐藏；TS-22 的覆盖率报告按文件给出「零覆盖 / 低覆盖」清单。
2. **快层必须存在且便宜**：`pnpm test:build`（TS-33）与各包单测并行可跑；`@ubean/config` 这类纯逻辑包必须保持在亚秒级（0.27s 就是这条的现状证据）。
3. **不设秒级阈值门禁**：理由与 [docs/perf-regression-net.md](../perf-regression-net.md) 一致 —— GitHub 共享 runner 噪声大，性能数字做成阻塞阈值会持续假阳性。CI 只保留**确定性**的闸门（体积预算、覆盖率报告、flaky 台账）。
