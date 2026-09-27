# ADR-0002 · 优化序列重排：enabler 领头 + 测试边界 + 可度量门禁

- **状态**: accepted
- **日期**: 2026-08-02
- **修订**: 2026-09-27（删除已落地的任务序列与影响面/待决子项；补记快照边界从未落地）
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

### 2. OPT-04 可度量门禁

验收增设可度量目标（先量基线，再设阈值）：

- 基线：记录 `@ubean/config` / `@ubean/build` / `@ubean/cli` 三包的单测时长（当时为 0 或不存在）与 CI `test` 步骤总时长。
- 目标：三包单测合计 < 10s（快照单测应远低于此）；CI `test` 步骤不应因新增单测而显著上升（增量可由 parallelism 吸收）。
- `--passWithNoTests` 不再作为这三包的掩护：补测后这三包必须有真实测试文件。

> 门禁本身仍有效，并被 [ADR-0012](0012-vite-plugin-first-lifecycle.md) 与 [docs/glossary.md](../glossary.md) 引用。
