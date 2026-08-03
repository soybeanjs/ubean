# ADR-0007 · 文档内容分类标准与站点/仓库文档边界

- **状态**: implemented（2026-08-03，文档网站重构）
- **日期**: 2026-08-03
- **关联**: apps/docs DESIGN.md D13（本 ADR 逆转其站点展示策略）；grill-with-docs 会话
- **决策者**: grilling 会话（用户 + 助手）

## 背景

`apps/docs`（文档站）的 Architecture 区此前按 DESIGN.md D13 决策收录了全部架构类文档，含历史设计与提案文档（`subpackage-splitting`/`modes`/`islands-auto-registry`/`ubean-studio`），以状态徽章区分（✅ implemented / ⬜ proposal）。随 ubean 框架演进，问题逐渐暴露：

1. **站点混入内部推进型内容**：`ubean-studio.md`（700 行产品方案 + ST 任务清单）、`roadmap.md`（Phase 9 任务跟踪）、`framework-comparison.md`（P0/P1/P2 缺失功能差距分析）面向的是"开发者推进框架开发"，而非"用户理解与选型框架"。
2. **内容与代码脱节**：`architecture.md` 仍称 "vite-plus"（现为 `@ubean/*` 子包）、`engineering.md` 测试基线停留在 2026-07-12。站点在展示与代码不一致的信息。
3. **根 `docs/` 引用失效**：AGENTS.md §10 引用 `docs/roadmap.md`/`docs/optimize.md`/`docs/architecture-analysis.md`，但这些文件在清理中已删除，导航表指向空路径。
4. **双轨同文**：同一批文档同时出现在站点（apps/docs）与仓库级文档（docs/）语境，缺少明确的"内容归属"标准。

## 决策

### 1. 二维内容分类标准（内容治理框架）

以**受众**与**生命周期耦合度**两个维度将仓库内所有文档划分为两类：

| 类型 | 受众 | 目的 | 生命周期 | 归属 |
| --- | --- | --- | --- | --- |
| **开发任务型（dev-task）** | 贡献者/开发者自身 | 推进开发：设计提案、实施计划、任务跟踪、差距分析、产品规划 | 强耦合（含状态表格、任务 ID、时间预估，随迭代频繁变更） | 根 `docs/`（仓库内部，中文） |
| **架构说明性（architecture-explanation）** | 用户/评估者 | 帮助理解与选型：解释框架机制、设计理念 | 弱耦合（稳定知识，仅在机制变化时更新） | `apps/docs`（公开站点，中英双语） |

分类判据（满足任一即偏向开发任务型）：① 含任务清单/状态表格/里程碑；② 含"实施计划/时间预估/分阶段"章节；③ 以"差距分析/缺失功能"为主体；④ 面向贡献流程（测试门槛、CodeGraph 约定等工程规范）。此标准收录于 `docs/glossary.md`。

### 2. 迁移清单（6 篇开发任务型 → 根 `docs/`）

| 文档 | 迁移后路径 | 类型 |
| --- | --- | --- |
| `ubean-studio` | `docs/ubean-studio.md` | 产品方案 + 任务清单 |
| `roadmap` | `docs/roadmap.md` | 路线图 + 任务跟踪（**修复 AGENTS.md §10 失效引用**） |
| `framework-comparison` | `docs/framework-comparison.md` | 差距分析 |
| `modes` | `docs/modes.md` | 设计提案（历史） |
| `subpackage-splitting` | `docs/subpackage-splitting.md` | 设计提案（历史） |
| `islands-auto-registry` | `docs/islands-auto-registry.md` | 设计提案（已实施） |

根 `docs/` 为纯中文内部文档（沿用 glossary.md 惯例），不迁移 en 副本。

### 3. D13 逆转：站点 Architecture 区不再承载历史/提案文档

- 移除 status badge 展示机制（`menus.ts` 的 `status` 字段、`status-badge.vue` 组件）——无历史/提案文档可标。
- 站点 Architecture 区按主流元框架惯例（Next.js "Architecture / How Next.js Works"、Nuxt "Concepts"）收缩为**解释性内容**：`overview` / `architecture` / `routing` / `runtime` 四篇。
- `engineering` 迁入新 **Contributing** 区（对齐 Next.js "Community → Contribution Guide"：贡献者向内容独立成区）。
- `ecosystem` 前置为独立 **Ecosystem** 区（对齐 Next.js Community 前置吸引导流）。

### 4. 过时"已实现"文档就地重写对齐

留站点的 `architecture.md` / `runtime.md` / `engineering.md` 与当前代码（AGENTS.md 2026-08 基线）不一致，**就地重写**而非归档：站点只展示与实现一致的内容；历史版本由 git 保留，不另立归档副本。

## 影响面

| 项 | 变更 |
| --- | --- |
| `apps/docs/src/content/{zh,en}/architecture/` | 12 → 4 篇（overview/architecture/routing/runtime）；6 篇迁移、engineering 移区、ecosystem 移区 |
| `apps/docs/src/constants/menus.ts` | 移除 architecture 条目 6 个；新增 Contributing / Ecosystem 区；移除 `status` 字段 |
| `apps/docs/src/components/status-badge.vue` | 删除 |
| `docs/` | 新增 6 篇 + `README.md` 索引 |
| `AGENTS.md` | §10 导航表同步（补回 roadmap.md，修正 modes/subpackage-splitting 路径，新增已迁移文档路径） |
| `apps/docs/DESIGN.md` | 记录 D13 逆转（本文档即该记录的仓库侧引用） |
| `skills/ubean/` | 检查是否引用被迁移文档的链接，一并修正 |

## 验收

1. 根 `docs/` 出现 6 篇迁移文档 + `README.md`；站点 Architecture 区仅剩 4 篇解释性文档。
2. `AGENTS.md` §10 全部链接可解析（无失效引用）。
3. 全站文档与当前代码一致（`pnpm build` 构建 docs 通过）。
4. `status-badge.vue` 及其引用被移除，无残留。
