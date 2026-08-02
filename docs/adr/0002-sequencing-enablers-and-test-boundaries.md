# ADR-0002 · 优化序列重排：enabler 领头 + 测试边界 + 可度量门禁

- **状态**: accepted
- **日期**: 2026-08-02
- **关联任务**: [optimize.md 建议执行顺序](../optimize.md#建议执行顺序)、OPT-04、OPT-09、OPT-11
- **决策者**: grilling 会话（用户 + 助手）

## 背景

optimize.md 的「建议执行顺序」把全部 P2（含 OPT-09 / OPT-11）放在末尾「可并行」。grilling 中发现两个问题：

1. **OPT-09 / OPT-11 是 enabler，不是 feature work**。
   - OPT-09（包树 CI 校验）是本可防止 OPT-03（手动文档纠偏）发生的护栏。把护栏排在被护栏保护的工作之后，等于保证下一次漂移仍需手工修。CI 已就绪（`.github/workflows/ci.yml` 的 test 步骤），挂载点现成。
   - OPT-11（CodeGraph 进 PR 流）是证据层。OPT-01 的 blast radius 本次靠人工 grep 完成；若 OPT-11 先落地，OPT-01/04/05 均可由 `codegraph impact` 供给数据，而非临时 grep。
2. **OPT-04 4b 把 codegen 单测与集成测混为一谈**。`packages/builder/src/production.ts` 是 codegen 模块（产出 server entry 模板字符串）。验收里「关键 production 路径（临时目录）」暗示在临时目录跑真实 Vite build，属慢集成测，与 4b 自身目标「缩短反馈环」冲突。
3. **OPT-04 验收「缩短反馈环」无度量**，无法判定成功。

## 决策

### 1. 序列重排：enabler 领头

新顺序：

```
OPT-09 (包树 CI 校验)   ← 从 P2 提前，便宜护栏先行
OPT-11 (CodeGraph 进 PR 流) ← 从 P2 提前，证据层先行
  → OPT-01 (createUbeanApp 消歧，已决，见 ADR-0001)
  → OPT-04 (config / @ubean/build / cli 单测)
  → OPT-05 (app + routing 补测)
  → OPT-06 (server 子路径)
  → OPT-07 (扩展契约表)
  → OPT-08 / OPT-10（可并行）
```

OPT-09 / OPT-11 的优先级由 P2 上调为 **P1**（enabler 性质，非纯 P0 紧急，但须先于被其服务的工作落地）。

### 2. OPT-04 4b 测试边界：快照单测为主

- `production.ts` / `virtual-modules.ts` 等 codegen 模块：**对生成的字符串做 snapshot/断言**，作为快速单元门禁。
- 临时目录真实 Vite build 归入 **e2e**（`examples/ubean-test` 或专门的 integration 套件），**不进 4b**。
- `transformMacros`、虚拟模块注册等纯函数 / 纯注册逻辑：常规单元测试。

### 3. OPT-04 可度量门禁

验收增设可度量目标（先量基线，再设阈值）：

- 基线：记录当前 `pnpm -F @ubean/config test` / `@ubean/build` / `@ubean/cli` 的单测时长（当前为 0 或不存在）与 CI `test` 步骤总时长。
- 目标：三包单测合计 < 10s（快照单测应远低于此）；CI `test` 步骤不应因新增单测而显著上升（增量可由 parallelism 吸收）。
- `--passWithNoTests` 不再作为这三包的掩护：补测后这三包必须有真实测试文件。

## 影响面

| 项 | 变更 |
| --- | --- |
| `optimize.md` | 「建议执行顺序」段重写；OPT-09 / OPT-11 优先级改 P1；OPT-04 验收补度量与边界说明 |
| `.github/workflows/ci.yml` | OPT-09 落地时新增包树校验步骤（脚本对比 `packages/*` 与文档包列表/数量） |
| `packages/builder` | 4b 新增 `__tests__/production.spec.ts`（snapshot）等；真实 build 验证留在 e2e |

## 待决子项

- OPT-09 校验脚本的范围：仅校验数量，还是校验包名集合？倾向后者（数量相等但名称漂移仍可能发生）。
- OPT-11 的「样板 PR」由哪次核心改动承担？候选：OPT-01 的重命名 PR 本身即可作为首块样板。
