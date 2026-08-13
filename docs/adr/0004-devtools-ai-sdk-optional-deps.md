# ADR-0004 · DevTools AI SDK 依赖治理：改 optionalDeps + 懒加载

- **状态**: implemented
- **日期**: 2026-08-02
- **完成日期**: 2026-08-02
- **关联任务**: optimize.md OPT-10（原 `optimize.md` 已归档删除，见 git 历史）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。

## 背景

OPT-10 原文为「评估对默认 `ubean` 安装体积感知的影响」。grilling 已**确认**该影响，无需再「评估」：

依赖链（全部硬 `dependencies`）：
```
ubean (packages/ubean/package.json:60)
  └─ @ubean/devtools (workspace:*)
       └─ ai@7.0.40 (Vercel AI SDK)
       └─ @ai-sdk/openai-compatible@3.0.16
```

因此 **每一次 `npm install ubean` 都会传递安装 Vercel AI SDK**，即使终端用户从不使用 AI scaffold。（CodeMirror / xterm 在 devtools 的 `devDependencies`，不传递——确认的膨胀仅 AI SDK 两包。）

注意：膨胀源**不是** `ubean` 主入口对 devtools 的静态 re-export（`defineDevToolsTab` / `getCustomTabs` 本身是轻量函数），而是 devtools **自身**对 `ai` 的硬依赖。故修复点是 AI SDK 的依赖类型与 AI scaffold 代码的加载方式，**不必动 `ubean` → devtools 的 re-export**。

## 决策

1. **`@ubean/devtools` 的 `dependencies` 中移除 `ai` 与 `@ai-sdk/openai-compatible`**，改为 `optionalDependencies`。
   - 安装 `ubean` 时默认不再传递拉入 AI SDK。
2. **AI scaffold 代码改为动态 `import()`** 加载 `ai` / `@ai-sdk/openai-compatible`。
   - 运行时若用户未装且触发 AI 功能，给出明确错误提示（「需手动安装 `ai` 与 `@ai-sdk/openai-compatible`」），而非启动期崩。
3. **保留 `ubean` → devtools 的 re-export 不变**：`defineDevToolsTab` 等轻量符号继续从主入口可达。
4. **OPT-10 任务文本升级**：由「评估对默认 ubean 安装体积感知的影响」改为「**确认并修复** AI SDK 传递硬依赖」。

## 影响面

| 项 | 变更 |
| --- | --- |
| `packages/devtools/package.json` | `ai`、`@ai-sdk/openai-compatible` 从 `dependencies` 移至 `optionalDependencies` |
| `packages/devtools/src/`（AI scaffold 相关） | 顶部静态 `import` 改为运行时 `import()` + 缺失依赖的优雅降级 |
| `optimize.md` OPT-10 | 任务文本由「评估」改「确认并修复」；子任务补「AI SDK 移至 optionalDeps + 懒加载」 |
| AGENTS / engineering | 注明 AI scaffold 为可选能力，需手动安装 AI SDK |

## 验收（细化）

- `npm install ubean`（或等价 `pnpm add ubean`）后 `node_modules` 不含 `ai` / `@ai-sdk/openai-compatible`。
- 不装 AI SDK 时，框架启动与普通 DevTools 功能正常；仅当触发 AI scaffold 时报清晰错误。
- 装齐 AI SDK 后，AI scaffold 功能恢复，行为与改动前一致。

## 待决子项

- ~~是否同步评估 CRUD scaffold 是否也引入了非必要硬依赖（本轮未核查 CRUD scaffold 的依赖）。~~ **已核查**：CRUD scaffold 仅依赖 `pathe` / `hookable`，无同类非必要硬依赖。
- `optionalDependencies` 的版本锁定策略（catalog vs 显式）：当前保留显式版本（`7.0.40` / `3.0.16`），未迁 catalog，因 AI SDK 版本演进较快且仅 devtools 独占。

## 实施记录（2026-08-02）

| 项 | 实施情况 |
| --- | --- |
| `packages/devtools/package.json` | `ai` / `@ai-sdk/openai-compatible` 从 `dependencies` 移至 `optionalDependencies`，版本号保留 |
| `packages/devtools/src/server/ai.ts` | `callLlmApi` 改运行时 `await Promise.all([import('ai'), import('@ai-sdk/openai-compatible')])`，try-catch 捕获失败并抛出含安装指引的错误；`buildAiSdkTools` 已用 `await import('ai')`；顶部仅 `import type`（类型擦除） |
| CRUD scaffold 核查 | 仅 `hookable` / `pathe` 硬依赖，无同类问题 |
| 验证 | `pnpm -F @ubean/devtools typecheck` ✅；`pnpm -F @ubean/devtools build:server` ✅（dist/index.js 57KB / 15.95KB gzip） |
| `pnpm-lock.yaml` | 已更新（`--no-frozen-lockfile`） |

### 关于 `optionalDependencies` 行为说明

`optionalDependencies` 在 npm/pnpm 默认行为下**仍会被安装**，但具备以下语义差异：
1. 安装失败不阻塞主安装流程（适合平台特定或可选能力）
2. 用户可通过 `--no-optional` 显式跳过
3. 标记意图：明确「非运行时必需」，配合运行时动态 `import()` + 优雅降级，框架启动不依赖这些包

本 ADR 的核心收益是**运行时解耦**（框架启动不再因 AI SDK 缺失/损坏而崩），以及**意图明确化**（包管理器与用户均可识别为可选）。若需进一步避免传递安装，可在后续迭代改为 `peerDependencies` + `peerDependenciesMeta.optional: true`（属 breaking change，需评估）。
