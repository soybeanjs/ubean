# 仓库级工程文档（docs/）

> 本目录存放 **开发任务型（dev-task）** 文档：面向贡献者/开发者自身，推进 ubean 框架开发的设计提案、实施计划、任务跟踪与差距分析。
>
> 分类标准见 [ADR-0007](adr/0007-docs-content-classification.md)（二维分类：受众 × 生命周期耦合度）。**架构说明性（architecture-explanation）** 内容——面向用户理解与选型框架的稳定知识——归 `apps/docs/src/content/`（公开站点，中英双语），不放在本目录。

## 文档索引

| 文档 | 类型 | 说明 |
| --- | --- | --- |
| [ubean-studio.md](ubean-studio.md) | 产品方案 + 任务清单 | ubean-studio 产品方案与 ST 任务清单 |
| [soybean-admin-next.md](soybean-admin-next.md) | 下一代 SoybeanAdmin | 下一代 SoybeanAdmin 技术选型与开发计划（提取 ubean 客户端内核路线） |

> 用户向内容（应用模式、Islands、包架构）已整合进 `apps/docs` 公开站点，元框架对比见 [Framework Comparison](../apps/docs/src/content/en/architecture/framework-comparison.md)。

## 决策记录（ADR）

- [0001-rename-vue-create-ubean-app.md](adr/0001-rename-vue-create-ubean-app.md) — renameVue / createUbeanApp 命名
- [0002-sequencing-enablers-and-test-boundaries.md](adr/0002-sequencing-enablers-and-test-boundaries.md) — 构建时序使能项与测试边界
- [0003-server-subpaths-rejustification.md](adr/0003-server-subpaths-rejustification.md) — `@ubean/server` 语义聚合子路径
- [0004-devtools-ai-sdk-optional-deps.md](adr/0004-devtools-ai-sdk-optional-deps.md) — DevTools AI SDK 可选依赖
- [0005-opt09-impl-opt11-timing-opt01-subitem.md](adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) — OPT-09 实施 + OPT-11 时序 + OPT-01 子项
- [0006-opt07-contract-table-opt08-test-priority.md](adr/0006-opt07-contract-table-opt08-test-priority.md) — OPT-07 扩展契约表 + OPT-08 测试优先级
- [0007-docs-content-classification.md](adr/0007-docs-content-classification.md) — 文档内容分类标准与站点/仓库文档边界

## 领域词汇表

[glossary.md](glossary.md) — 领域建模词汇表（ubiquitous language），记录文档分类、真理源等关键术语。

## 相关目录

- **站点文档（公开，双语）**：[apps/docs/src/content/](../apps/docs/src/content/) — 用户向的 guide / integrations / reference / architecture / contributing / ecosystem
- **站点设计档案**：[apps/docs/DESIGN.md](../apps/docs/DESIGN.md) — 文档站的 D1–D27 设计决策（D13 已被 ADR-0007 逆转）
- **AI 助手导航**：[AGENTS.md](../AGENTS.md) §10 文档导航表
