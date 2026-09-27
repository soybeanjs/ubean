# ADR-0003 · `@ubean/server` 子路径拆分：重订理由 + 语义聚合分组

- **状态**: accepted
- **日期**: 2026-08-02
- **修订**: 2026-09-27（删除提案表 / 影响面 / 待决子项；子路径表改为指向 AGENTS.md §2.3；修正死包名）
- **关联任务**: optimize.md OPT-06（原 `optimize.md` 已归档删除，见 git 历史）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。

## 背景

OPT-06 原始理由：「降低 barrel 导入心智负担与 tree-shaking 压力」。grilling 核查**证伪**了 tree-shaking 半边：

- `packages/server/src/index.ts` 是纯 barrel，对 `./cache`、`./database`、`./queue` 等 20+ 子文件做**静态函数 re-export**。
- `packages/server/package.json` 的 `dependencies` 仅 `@ubean/shared` / `hono` / `hookable` / `pathe`；重依赖（unstorage / db0 / crossws / drizzle 生态）**未**静态列入，说明它们在子模块内已由 `import()` 动态加载。
- 结论：barrel 的函数 re-export 本身可 tree-shake，重依赖又不经静态 `dependencies` 拖入 —— **tree-shaking 压力基本不存在**。

真实存在的成本是另外两项：

1. **心智模型**：从单 barrel 导入一切，新人难以判断哪些能力属于同一域。
2. **`tsc` / IDE 类型解析成本**：barrel 强制解析全部 20+ 子模块的类型，即便只导入一个符号。这是 IDE 响应与 typecheck 时长成本，**非** bundle 体积成本。

另发现：OPT-06 的「等」掩盖了一个非平凡设计 —— 子路径与内部文件**不 1:1**。`./realtime` / `./security` / `./cache` / `./cron` / `./analytics` / `./middleware` 都是**聚合子路径**，需手写聚合点（如 `realtime.ts` re-export `./websocket` + `./sse`）。

## 决策

### 1. 重订理由（仍生效）

OPT-06 的推进理由改为**唯一**：心智模型 + `tsc` / IDE 类型解析成本。**删除 tree-shaking / bundle 体积论述**。验收改为「子路径可独立导入且类型正确；IDE 单符号导入不触发全量子模块类型解析」，不提 bundle 体积。

### 2. 子路径分组：语义聚合（权威表已外移）

采用语义聚合子路径，而非与文件 1:1 对齐。原则：**同一能力域聚合，不强求 1:1**。

> **权威表见 [AGENTS.md §2.3](../../AGENTS.md)。** 本 ADR 不再复制那张表。

原「初始提案」表已删除，因为它既不准确也不完整：`./static` 一行把跨请求生命周期的中间件（cors / rate-limit / after / fetch-memo / draft-mode / single-flight）塞进了「静态文件服务」，而实际实现把它们归 `./middleware`；同时它漏掉了后来落地的 `./cache-directive`、`./drivers`、`./middleware` 三行。带文件路径与行号的表会立刻腐烂 —— 语义表只应存在于一处。

### 3. 主入口（barrel）行为（仍生效）

主入口 `.` **保持 re-export 兼容**（不破坏现有 `import { x } from '@ubean/server'`），但在 AGENTS.md / engineering 文档中**标注 barrel 为便利入口**，新代码推荐子路径。不在本次任务里 deprecate barrel（deprecate 属后续重大版本决策）。
