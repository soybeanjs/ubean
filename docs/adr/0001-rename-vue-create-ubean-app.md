# ADR-0001 · 将 Vue 应用工厂 `createUbeanApp` 重命名为 `createUbeanClientApp`

- **状态**: accepted
- **日期**: 2026-08-02
- **修订**: 2026-09-27（补记录原始命名 `createUbeanVueApp`；死路径与行号改为符号名）
- **关联任务**: optimize.md OPT-01（原 `optimize.md` 已归档删除，见 git 历史）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。

## 背景

`@ubean/app` 与客户端运行时各导出一个同名函数 `createUbeanApp`，语义不同：

| 位置（符号） | 角色 | 返回 |
| --- | --- | --- |
| `@ubean/app` 的 `createUbeanApp`（`packages/app/src/app.ts`） | Hono 应用工厂 | `UbeanApp` |
| 客户端运行时的 `createUbeanApp`（包结构重构后归 `@ubean/client`，今名 `createUbeanClientApp`，`packages/client/src/app.ts`） | Vue 客户端应用工厂 | `UbeanAppInstance`（`{ app, router, head, page }`） |

grilling 阶段对实际代码的核查结论：

1. **聚合器已消歧**。`packages/ubean/src/index.ts` 的选择性 re-export 块刻意未包含 `createUbeanApp`，因此 `import { createUbeanApp } from 'ubean'` 仅得 Hono 版本。原 OPT-01 措辞「消除聚合器 re-export 时的语义歧义」描述的状态已不存在。
2. **AGENTS.md 已记录双义**。文档纠偏验收项部分已满足。
3. **第三处出现**：`packages/builder/src/production.ts` 在生成的 server entry 模板里 `export { createUbeanApp }`，来源为 Hono 版，无歧义。`optimize.md` 未提及此处。
4. **Vue 工厂的真实消费者仅一处**：核心 Vite 插件的虚拟模块生成器（`@ubean/build` 的 `virtual-modules`）内部调用。其余命中均为 JSDoc 注释。examples / apps 中**零**外部 `import`。

## 真实危害（grilling 结论）

聚合器层面歧义已消，但**团队/上手心智**仍是首要危害：任何人直接 `import { createUbeanApp } from '@ubean/client'` 会拿到 Vue 工厂而非 Hono，与命名直觉相悖。重命名是根治手段，纯文档不足以消除。

## 决策

1. **重命名**：客户端运行时的 Vue 工厂 `createUbeanApp` → **`createUbeanClientApp`**。
   - 与 `createUbeanSSRApp`、`createUbeanRouter`（Vue 版）命名族一致，语义最清晰。
2. **硬重命名，无弃用别名**，随下一个 **major** 版本发布。
   - 依据：零外部真实 `import` 消费者，破坏面仅限内部虚拟模块生成器与若干 JSDoc 注释。
3. **`createUbeanApp` 语义专指 Hono 工厂**（来自 `@ubean/app` / `ubean/server`）。
4. **`packages/builder/src/production.ts` 的 `export { createUbeanApp }` 保持原样**：来源为 Hono 版，无歧义；在 AGENTS.md / 本 ADR 中显式记录此为预期行为，避免后续误判为「遗漏的第三处冲突」。
5. **不将 `createUbeanClientApp` 纳入主入口 `ubean`** —— 该待决子项已由 [ADR-0005](0005-opt09-impl-opt11-timing-opt01-subitem.md) 关闭（保持不扩大对外 API 表面）。

## 原始决策（2026-09-27 补记）

本 ADR 的**原始**决策目标名是 **`createUbeanVueApp`**，不是现在的 `createUbeanClientApp`：`git show c8383b9:docs/adr/0001-rename-vue-create-ubean-app.md` 的标题为「将 Vue 应用工厂 `createUbeanApp` 重命名为 `createUbeanVueApp`」，且该名字真实落地过（源码与 git 历史可证）。包结构重构提交 `360e8f8`（`refactor(packages): refactor packages structure`）把客户端运行时从原来的 runtime 包迁到 `packages/client` 时，**同步改写了本文标题与「决策」第 1 条的措辞**并改名为 `createUbeanClientApp`，但没有留下任何修订记录——这是本仓要杜绝的反模式（静默改写决策实质）。

补记录的意义是保住决策的完整轨迹：改名依据从「Vue」换成了包归属（`@ubean/client`），两次指向的是同一个函数。今后的修订一律走 `## 修订` / `## 补记`。
