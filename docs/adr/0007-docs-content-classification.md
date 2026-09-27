# ADR-0007 · 文档内容分类标准与站点/仓库文档边界

- **状态**: implemented（2026-08-03，文档网站重构）
- **日期**: 2026-08-03
- **修订**: 2026-09-27（迁移清单 / 影响面 / 验收折叠为历史段；补记归属逆转与站点区篇数）
- **关联**: apps/docs DESIGN.md D13（本 ADR 逆转其站点展示策略）；grill-with-docs 会话
- **决策者**: grilling 会话（用户 + 助手）
- **注（2026-09）**: `apps/docs/DESIGN.md` 与 `GLOSSARY.md` 已随文档站重构删除，其规范职责由 [apps/docs/AGENTS.md](../../apps/docs/AGENTS.md)（架构与实现约束）与 [apps/docs/TRANSLATION.md](../../apps/docs/TRANSLATION.md)（中英翻译规范）承接。本文以下对 DESIGN.md D13 的引用属历史记录，不再指向现存文件。

## 背景

`apps/docs`（文档站）的 Architecture 区此前按 DESIGN.md D13 决策收录了全部架构类文档，含历史设计与提案文档（`subpackage-splitting` / `modes` / `islands-auto-registry` / `ubean-studio`），以状态徽章区分（✅ implemented / ⬜ proposal）。随 ubean 框架演进，问题逐渐暴露：

1. **站点混入内部推进型内容**：`ubean-studio.md`（700 行产品方案 + ST 任务清单）、`roadmap.md`（Phase 9 任务跟踪）、`framework-comparison.md`（P0/P1/P2 缺失功能差距分析）面向的是「开发者推进框架开发」，而非「用户理解与选型框架」。
2. **内容与代码脱节**：`architecture.md` 仍称 "vite-plus"（现为 `@ubean/*` 子包）、`engineering.md` 测试基线停留在 2026-07-12。站点在展示与代码不一致的信息。
3. **根 `docs/` 引用失效**：AGENTS.md §10 引用 `docs/roadmap.md` / `docs/optimize.md` / `docs/architecture-analysis.md`，但后两者在清理中已删除，导航表指向空路径。
4. **双轨同文**：同一批文档同时出现在站点（apps/docs）与仓库级文档（docs/）语境，缺少明确的「内容归属」标准。

## 决策

### 1. 二维内容分类标准（内容治理框架）

以**受众**与**生命周期耦合度**两个维度将仓库内所有文档划分为两类：

| 类型 | 受众 | 目的 | 生命周期 | 归属 |
| --- | --- | --- | --- | --- |
| **开发任务型（dev-task）** | 贡献者/开发者自身 | 推进开发：设计提案、实施计划、任务跟踪、差距分析、产品规划 | 强耦合（含状态表格、任务 ID、时间预估，随迭代频繁变更） | 根 `docs/`（仓库内部，中文） |
| **架构说明性（architecture-explanation）** | 用户/评估者 | 帮助理解与选型：解释框架机制、设计理念 | 弱耦合（稳定知识，仅在机制变化时更新） | `apps/docs`（公开站点，中英双语） |

分类判据（满足任一即偏向开发任务型）：① 含任务清单/状态表格/里程碑；② 含「实施计划/时间预估/分阶段」章节；③ 以「差距分析/缺失功能」为主体；④ 面向贡献流程（测试门槛、CodeGraph 约定等工程规范）。此标准收录于 [docs/glossary.md](../glossary.md)。

### 2. 迁移清单（历史，已完成）

迁移执行于 2026-08-03：站点 6 篇（`ubean-studio` / `roadmap` / `framework-comparison` / `modes` / `subpackage-splitting` / `islands-auto-registry`）迁至根 `docs/`，根 `docs/` 为纯中文内部文档（不迁 en 副本）；配套动作是 `menus.ts` 移除 architecture 条目 6 个、新增 Contributing / Ecosystem 区、删除 `status-badge.vue`、`docs/` 新增 `README.md` 索引、`AGENTS.md` §10 导航表同步，另检查 `skills/ubean/` 的链接。当时四项验收（6 篇 + README 到齐 / 链接可解析 / 站点构建通过 / status-badge 无残留）全绿。**迁移清单正文与影响面表已按第 1 节标准删除** —— 除 `roadmap.md` 外，迁移来的任务型正文都在落地后删掉了（见文末修订）。

### 3. D13 逆转：站点 Architecture 区不再承载历史/提案文档

- 移除 status badge 展示机制（`menus.ts` 的 `status` 字段、`status-badge.vue` 组件）—— 无历史/提案文档可标。
- 站点 Architecture 区按主流元框架惯例（Next.js "Architecture / How Next.js Works"、Nuxt "Concepts"）收缩为**解释性内容**：`overview` / `architecture` / `routing` / `runtime` 四篇。
- `engineering` 迁入新 **Contributing** 区（对齐 Next.js "Community → Contribution Guide"：贡献者向内容独立成区）。
- `ecosystem` 前置为独立 **Ecosystem** 区（对齐 Next.js Community 前置吸引导流）。

### 4. 过时「已实现」文档就地重写对齐

留站点的 `architecture.md` / `runtime.md` / `engineering.md` 与当时代码（AGENTS.md 2026-08 基线）不一致，**就地重写**而非归档：站点只展示与实现一致的内容；历史版本由 git 保留，不另立归档副本。

## 修订（2026-09-27）

- **迁移清单 5/6 文件已不存在**：当时迁往根 `docs/` 的 6 篇里只剩 `roadmap.md`；`ubean-studio` / `framework-comparison` / `modes` / `subpackage-splitting` / `islands-auto-registry` 均已删除（git 保留历史）。这正是第 1 节标准要求的终局，所以「迁移清单」不该留在 ADR 正文里。
- **`framework-comparison` 的归属被 [ADR-0010](0010-competitive-north-star-and-gap-filter.md) 第 5 条逆转回站点**：现存 `apps/docs/src/content/{zh,en}/architecture/framework-comparison.md`，并注册于 `apps/docs/src/constants/menus.ts` 的 Architecture 区。即对比矩阵属**架构说明性**内容，不进根 `docs/` —— 第 2 节把它当「差距分析 → 根 docs」的判断已被推翻。
- **站点 Architecture 区实为 5 篇，不是承诺的 4 篇**：`overview` / `architecture` / `routing` / `runtime` 之外还有 `framework-comparison`（见 `menus.ts`）。第 3 节的「4 篇」是当时快照。
- 本文引用的 `apps/docs/DESIGN.md` / `GLOSSARY.md` 已删除（见头部注）；D13 逆转记录以第 3 节与 [apps/docs/AGENTS.md](../../apps/docs/AGENTS.md) 为准。
