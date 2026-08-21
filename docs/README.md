# 仓库级工程文档（docs/）

> **开发任务型（dev-task）**：给本仓库贡献者推进 *ubean 开源框架* 用。分类见 [ADR-0007](adr/0007-docs-content-classification.md)。
>
> 用户向说明归 `apps/docs`（公开站点，中英双语），不放这里。
>
> **任务清单落地后删除正文**，决策留在 ADR，词汇留在 glossary。git 保留历史。别的产品（studio、SoybeanAdmin）的方案不进本目录。

## 仍在推进

| 文档 | 说明 |
| --- | --- |
| [roadmap.md](roadmap.md) | 2026 Q4 还债 / 2027 H1 用户可见缺口（ADR-0010） |

## 长期参考

| 文档 | 说明 |
| --- | --- |
| [glossary.md](glossary.md) | 领域词汇表 |
| [adr/](adr/) | 决策记录（为什么这样做；不是任务跟踪） |

## 决策记录（ADR）

- [0001](adr/0001-rename-vue-create-ubean-app.md) — `createUbeanApp` 命名消歧
- [0002](adr/0002-sequencing-enablers-and-test-boundaries.md) — 构建时序使能项与测试边界
- [0003](adr/0003-server-subpaths-rejustification.md) — `@ubean/server` 语义聚合子路径
- [0004](adr/0004-devtools-ai-sdk-optional-deps.md) — DevTools AI SDK 可选依赖
- [0005](adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) — OPT-09 / OPT-11 / OPT-01
- [0006](adr/0006-opt07-contract-table-opt08-test-priority.md) — OPT-07 扩展契约表 + OPT-08
- [0007](adr/0007-docs-content-classification.md) — 站点 / 仓库文档边界
- [0008](adr/0008-ai-package-architecture.md) — `@ubean/ai` 包架构
- [0009](adr/0009-i18n-engine-and-compact-locale-routing.md) — vue-i18n 11 + 约束前缀语言路由
- [0010](adr/0010-competitive-north-star-and-gap-filter.md) — 竞品北极星与「值得做」过滤器

## 相关目录

- 站点正文：[apps/docs/src/content/](../apps/docs/src/content/)
- 站点设计档案：[apps/docs/DESIGN.md](../apps/docs/DESIGN.md)（D13 已被 ADR-0007 逆转）
- 助手导航：[AGENTS.md](../AGENTS.md) §10
