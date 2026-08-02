# ADR-0005 · OPT-09 实现设计 + OPT-11 落地时序 + OPT-01 待决子项收尾

- **状态**: accepted
- **日期**: 2026-08-02
- **关联任务**: OPT-09、OPT-11、OPT-01（待决子项）
- **决策者**: grilling 会话（用户 + 助手）

## 背景

enabler 领头序列（ADR-0002）的首批任务进入实现设计阶段。grilling 发现三个需在实施前钉死的问题：

1. **OPT-09 计划措辞有事实错误**：「对比 `packages/*` 目录名与文档中的包列表」。实际目录名 ≠ 包名——两处不匹配：`builder`→`@ubean/build`、`ubean`→`ubean`（无 scope）。AGENTS §2 树（L44）已显式记录 `builder/`→`@ubean/build` 映射。故真理源须为 `package.json` 的 `name` 字段，非目录名。
2. **OPT-11 × OPT-01 时序悖论**：ADR-0002 既要求 OPT-11 先于 OPT-01，又指定 OPT-01 重命名 PR 为 OPT-11 的首块样板。二者不可同时成立。
3. **ADR-0001 待决子项**：是否将 `createUbeanVueApp` 纳入主 `ubean` 聚合器入口的选择性导出。

## 决策

### 1. OPT-09 实现设计

- **真理源**：`packages/*/package.json` 的 `name` 字段（37 个包名集合）。
- **校验方式**：存在性 + 计数。读全部 `packages/*/package.json` 的 `name`，断言：
  - 每个 `@ubean/*`（及 `ubean`）包名出现在 `AGENTS.md` 中；
  - AGENTS 中「N 个包」的计数（当前 37）与实际 `packages/*` 数量一致。
- **不解析树结构**（`├──`/`└──` 正则太脆）；不生成新清单文件。
- **校验范围**：仅 `AGENTS.md`（开发唯一参考）。`README.md` / `README.zh_CN` 不纳入——避免三处同步维护又生新漂移点；README 由人保证。
- **挂载点**：`.github/workflows/ci.yml` 的 test 步骤后。

### 2. OPT-11 落地时序

- **OPT-11 交付物 = `engineering.md` 中的约定文本**（无 `CONTRIBUTING.md`，落 `apps/docs/.../architecture/engineering.md`）。此文本**先落地**，独立于任何代码 PR。
- **OPT-01 重命名 PR = 首个「遵循」该约定的样板**（`codegraph impact createUbeanApp` 结果附入 PR 描述）。
- 明确区分「定规」（OPT-11）与「首用」（OPT-01）：勿将 `codegraph impact` 输出塞入 OPT-11 自身的非代码 PR。
- codegraph CLI 已确认可用（v1.5.0）。

### 3. OPT-01 待决子项收尾

- **不将 `createUbeanVueApp` 纳入主 `ubean` 聚合器入口**。
- 依据：现状 Vue 工厂不在主入口导出（仅 `@ubean/runtime` 直连可达），唯一真实消费者是内部虚拟模块生成器。纳入主入口会扩大对外 API 表面，与重命名「降漂移/降心智负担」初衷部分冲突。
- 结果：ADR-0001 的唯一待决子项关闭，OPT-01 实现设计完整，可实施。

## 影响面

| 项 | 变更 |
| --- | --- |
| OPT-09 | 实现设计钉死：package.json name 真理源 + 存在性+计数 + 仅 AGENTS |
| OPT-11 | 落地物明确为 engineering.md 约定文本，先于 OPT-01 |
| OPT-01 | 待决子项关闭（createUbeanVueApp 不入主入口），可实施 |
| `optimize.md` | OPT-09/11/01 行验收/方案更新 |

## 验收（细化）

- OPT-09：故意删改 AGENTS 包名或计数时 CI 失败；`packages/builder`→`@ubean/build` 这类 dir≠name 不误报。
- OPT-11：`engineering.md` 含 codegraph 工作流约定段落；OPT-01 PR 描述附 `codegraph impact createUbeanApp` 结果。
- OPT-01：主 `ubean` 入口选择性 export 仍不含 Vue 应用工厂；`@ubean/runtime` 导出 `createUbeanVueApp`。
