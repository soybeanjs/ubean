# ADR-0001 · 将 Vue 应用工厂 `createUbeanApp` 重命名为 `createUbeanVueApp`

- **状态**: accepted
- **日期**: 2026-08-02
- **关联任务**: [optimize.md OPT-01](../optimize.md#总览)
- **决策者**: grilling 会话（用户 + 助手）

## 背景

`@ubean/app` 与 `@ubean/runtime` 各导出一个同名函数 `createUbeanApp`，语义不同：

| 位置 | 角色 | 返回 |
| --- | --- | --- |
| `packages/app/src/app.ts:422` | Hono 应用工厂 | `UbeanApp` |
| `packages/runtime/src/app.ts:551` | Vue 客户端应用工厂 | `UbeanAppInstance`（`{ app, router, head, page }`） |

grilling 阶段对实际代码的核查结论：

1. **聚合器已消歧**。`packages/ubean/src/index.ts` 的选择性 `export { ... } from '@ubean/runtime'` 块（L51–145）刻意未包含 `createUbeanApp`，因此 `import { createUbeanApp } from 'ubean'` 仅得 Hono 版本。原 OPT-01 措辞「消除聚合器 re-export 时的语义歧义」描述的状态已不存在。
2. **AGENTS 已记录双义**（L184–185、L793）。文档纠偏验收项部分已满足。
3. **第三处出现**：`packages/builder/src/production.ts:319` 在生成的 server entry 模板里 `export { createUbeanApp }`，来源为 `ubean/runtime/app`（Hono 版），无歧义。optimize.md 未提及此处。
4. **Vue 工厂的真实消费者仅一处**：`packages/vite/src/virtual-modules.ts:496`（虚拟模块生成器内部调用）。其余命中均为 JSDoc 注释。examples / apps 中**零**外部 `import`。

## 真实危害（grilling 结论）

聚合器层面歧义已消，但**团队/上手心智**仍是首要危害：任何人直接 `import { createUbeanApp } from '@ubean/runtime'` 会拿到 Vue 工厂而非 Hono，与命名直觉相悖。重命名是根治手段，纯文档不足以消除。

## 决策

1. **重命名**：`@ubean/runtime` 的 Vue 工厂 `createUbeanApp` → **`createUbeanVueApp`**。
   - 与 `createUbeanSSRApp`、`createUbeanRouter`（Vue 版）命名族一致，语义最清晰。
2. **硬重命名，无弃用别名**，随下一个 **major** 版本发布。
   - 依据：零外部真实 `import` 消费者，破坏面仅限内部虚拟模块生成器与若干 JSDoc 注释。
3. **`createUbeanApp` 语义专指 Hono 工厂**（来自 `@ubean/app` / `ubean/runtime/app`）。
4. **`production.ts:319` 的 re-export 保持原样**：来源为 Hono 版，无歧义；在 AGENTS / 本 ADR 中显式记录此为预期行为，避免后续误判为「遗漏的第三处冲突」。

## 影响面（需变更文件）

| 文件 | 变更 |
| --- | --- |
| `packages/runtime/src/app.ts` | 函数定义重命名（L551） |
| `packages/runtime/src/index.ts` | 导出名更新（L51） |
| `packages/vite/src/virtual-modules.ts` | 唯一真实调用点：import + 调用更新（L496） |
| `packages/actions/src/middleware.ts` | JSDoc 注释更新（L47） |
| `packages/islands/src/server-component.ts` | JSDoc 注释更新（L49） |
| `packages/ubean/src/runtime/app.ts` | JSDoc 注释更新（L5/L10） |
| `AGENTS.md` | L40/L184/L185/L793 双义表更新为新命名 |
| `packages/ubean/src/index.ts` | 顶部冲突处理策略注释更新（L9）：Hono 版仍由 `@ubean/app` 提供；如需将 `createUbeanVueApp` 纳入主入口选择性导出，见「待决子项」 |

## 待决子项

- **是否将 `createUbeanVueApp` 纳入主入口 `ubean` 的选择性导出**？现状：Vue 工厂不在主入口导出（仅 `@ubean/runtime` 直连可达），且唯一消费者是内部虚拟模块。倾向：保持不纳入主入口，避免扩大对外表面。待实施时确认。

## 验收（细化原 OPT-01）

- `@ubean/runtime` 不再导出名为 `createUbeanApp` 的 Vue 工厂；`createUbeanApp` 在全仓内专指 Hono 工厂。
- `pnpm typecheck` 通过；`examples/ubean-test` 集成测试通过。
- AGENTS 双义表更新；本 ADR 引用自 optimize.md OPT-01。
- `production.ts:319` 行为不变，且在 AGENTS 注明其为 Hono 版 re-export。
