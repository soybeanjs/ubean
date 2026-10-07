# 仓库级工程文档（docs/）

> **开发任务型（dev-task）**：给本仓库贡献者推进 *ubean 开源框架* 用。分类见 [ADR-0007](adr/0007-docs-content-classification.md)。
>
> 用户向说明归 `apps/docs`（公开站点，中英双语），不放这里。
>
> **任务清单落地后删除正文**，决策留在 ADR，词汇留在 glossary。git 保留历史。别的产品（studio、SoybeanAdmin）的方案不进本目录。
>
> 本目录只有三类内容：**活的工程过程**（落地后按上一行删正文）、**长期参考**（词汇与流程手册）、**对外契约**（版本化冻结，为外部消费者而留）。

## 仍在推进（活文档）

| 文档 | 说明 |
| --- | --- |
| [roadmap.md](roadmap.md) | 已收口能力清单、刻意不做与后续入口（口径见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)） |
| [test.md](test.md) | 全栈元框架的功能测试方案与任务清单（TS-01–TS-37）：§5 任务明细、§6 配置覆盖矩阵、§8 验收台账 |
| [test-e2e-migration.md](test-e2e-migration.md) | `examples/ubean-test` 用例向 E2E 迁移的可行性分析（TS-34–TS-37 的输入） |
| [perf-regression-net.md](perf-regression-net.md) | 性能度量口径、基线与体积闸门（RM-P01–P08 已落地；绝对上限待接线） |
| [vite-bundled-dev-compat.md](vite-bundled-dev-compat.md) | Vite `experimental.bundledDev` 兼容性调查：**现状不支持**，三处故障已定位（其中一处根因已对照实验证明）、修法方向与未知数 |
| [config-to-vite-passthrough.md](config-to-vite-passthrough.md) | ubean 配置到 Vite 的传递与覆盖调查：**只有 CLI inlineConfig 一条通道**（裸 `vite dev` 读不到 `dev.*`）、覆盖顺序实测、三处「配了不生效」+ 四个死字段、命名取舍 |

> 行内任务清单全部 ✅ 后，按政策删除正文：决策归 ADR，词汇归 glossary，历史归 git。

## 长期参考

| 文档 | 说明 |
| --- | --- |
| [i18n.md](i18n.md) | 文档国际化流水线：译文生成、漂移门禁、刻意不翻译的面 |
| [glossary.md](glossary.md) | 领域词汇表（政策指定的词汇沉淀处） |
| [adr/](adr/) | 决策记录（为什么这样做；不是任务跟踪） |

## 对外契约

版本化冻结，供 studio / IDE 插件等外部消费者读取。改动即破坏兼容，须升 `contractVersion`。

| 契约 | 说明 |
| --- | --- |
| [contracts/codegen-v1.md](contracts/codegen-v1.md) | `.ubean/` codegen 契约 v1：文件清单、`declare module` 映射、manifest 形态 |
| [contracts/scaffold-v1.schema.json](contracts/scaffold-v1.schema.json) | scaffold catalog JSON Schema v1（`ubean/scaffold` 的机器可读出口） |

## 决策记录（ADR）

见 [adr/](adr/)（13 篇；状态写在各文件头部：`proposed` / `accepted` / `implemented` / `superseded`）。

当前主线决策：Vite 插件化的生命周期归属见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)，平台产物契约见 [ADR-0013](adr/0013-platform-artifact-contract.md)。

## 相关目录

- 站点正文：[apps/docs/src/content/](../apps/docs/src/content/)
- 站点规范：[apps/docs/AGENTS.md](../apps/docs/AGENTS.md)（架构与实现约束）、[apps/docs/TRANSLATION.md](../apps/docs/TRANSLATION.md)（中英翻译规范）
- 助手导航：[AGENTS.md](../AGENTS.md) §10
