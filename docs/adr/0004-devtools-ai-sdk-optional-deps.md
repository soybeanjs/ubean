# ADR-0004 · DevTools AI SDK 依赖治理：改 optionalDeps + 懒加载

- **状态**: implemented（决策 3 已作废，见 2026-09-27 补记）
- **日期**: 2026-08-02
- **完成日期**: 2026-08-02
- **修订**: 2026-09-27（删除实施记录 / 待决子项；记决策 3 作废、验收 1 自我反驳；版本号对齐现状）
- **关联任务**: optimize.md OPT-10（原 `optimize.md` 已归档删除，见 git 历史）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。

## 背景

OPT-10 原文为「评估对默认 `ubean` 安装体积感知的影响」。grilling 已**确认**该影响，无需再「评估」：

依赖链（立项时全部为硬 `dependencies`）：

```
ubean
  └─ @ubean/devtools (workspace:*)
       └─ ai (Vercel AI SDK)
       └─ @ai-sdk/openai-compatible
```

因此 **每一次 `npm install ubean` 都会传递安装 Vercel AI SDK**，即使终端用户从不使用 AI scaffold。（CodeMirror / xterm 在 devtools 的 `devDependencies`，不传递 —— 确认的膨胀仅 AI SDK 两包。）

注意：膨胀源**不是** `ubean` 主入口对 devtools 的静态 re-export（`defineDevToolsTab` / `getCustomTabs` 本身是轻量函数），而是 devtools **自身**对 `ai` 的硬依赖。故修复点是 AI SDK 的依赖类型与 AI scaffold 代码的加载方式，**不必动** `ubean` → devtools 的 re-export。

## 决策

1. **`@ubean/devtools` 的 `dependencies` 中移除 `ai` 与 `@ai-sdk/openai-compatible`**，改为 `optionalDependencies`。
   - 安装 `ubean` 时默认不再**静态**传递拉入 AI SDK。
2. **AI scaffold 代码改为动态 `import()`** 加载 `ai` / `@ai-sdk/openai-compatible`。
   - 运行时若用户未装且触发 AI 功能，给出明确错误提示（「需手动安装 `ai` 与 `@ai-sdk/openai-compatible`」），而非启动期崩。
3. ~~**保留 `ubean` → devtools 的 re-export 不变**：`defineDevToolsTab` 等轻量符号继续从主入口可达。~~ **已作废**，见补记。
4. **OPT-10 任务文本升级**：由「评估对默认 ubean 安装体积感知的影响」改为「**确认并修复** AI SDK 传递硬依赖」。

## 补记（2026-09-27）

**决策 3 已作废。** 聚合器不再 re-export devtools：`grep -c devtools packages/ubean/package.json` → **0**，devtools 也不在 `packages/ubean` 的 `dependencies` 里。DevTools 现由 CLI 作为**可选 peer** 加载（见 [AGENTS.md §2](../../AGENTS.md)）。「`defineDevToolsTab` 从主入口可达」已不成立。

**原验收第 1 条被本 ADR 自己的分析反驳。** 原文要求「`npm install ubean` 后 `node_modules` 不含 `ai` / `@ai-sdk/openai-compatible`」，但本 ADR「关于 `optionalDependencies` 行为说明」已指出：它们在 npm/pnpm 默认行为下**仍会被安装**。该验收项从一开始就不可能通过（自相矛盾），故删除 —— 真正的收益是**运行时解耦**与**意图明确化**，不是「装不上」。

**optional-peer 变体成为本仓常规形态。** 本文档结尾提出的 `peerDependencies` + `peerDependenciesMeta.optional: true` 变体，在 [ADR-0008](0008-ai-package-architecture.md) 里成为 `@ubean/ai` 的正式做法；devtools 保留 `optionalDependencies` 是**刻意的例外**（它与 CLI 同层，不能声明 `ubean` peer 以免成环）。

**版本号对齐现状。** 原文记的是立项时的 `ai@7.0.40` / `@ai-sdk/openai-compatible@3.0.16`；当前 `packages/devtools/package.json` 为 **`ai@7.0.116`** / **`@ai-sdk/openai-compatible@3.0.57`**，仍是显式版本、未迁 catalog。

## 关于 `optionalDependencies` 行为说明（保留）

`optionalDependencies` 在 npm/pnpm 默认行为下**仍会被安装**，但具备以下语义差异：

1. 安装失败不阻塞主安装流程（适合平台特定或可选能力）
2. 用户可通过 `--no-optional` 显式跳过
3. 标记意图：明确「非运行时必需」，配合运行时动态 `import()` + 优雅降级，框架启动不依赖这些包

本 ADR 的核心收益是**运行时解耦**（框架启动不再因 AI SDK 缺失 / 损坏而崩），以及**意图明确化**（包管理器与用户均可识别为可选）。若需进一步避免传递安装，可改为 `peerDependencies` + `peerDependenciesMeta.optional: true`（属 breaking change，需评估）—— 该变体已在 [ADR-0008](0008-ai-package-architecture.md) 落地。
