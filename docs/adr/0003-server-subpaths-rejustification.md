# ADR-0003 · `@ubean/server` 子路径拆分：重订理由 + 语义聚合分组

- **状态**: accepted
- **日期**: 2026-08-02
- **关联任务**: [optimize.md OPT-06](../optimize.md#总览)
- **决策者**: grilling 会话（用户 + 助手）

## 背景

OPT-06 原始理由：「降低 barrel 导入心智负担与 tree-shaking 压力」。grilling 核查证伪了 tree-shaking 半边：

- `packages/server/src/index.ts` 是纯 barrel，对 `./cache`、`./database`、`./queue` 等 20+ 子文件做**静态函数 re-export**。
- `packages/server/package.json` 的 `dependencies` 仅 `hono`/`hookable`/`pathe`/`@ubean/types`；重依赖（unstorage/db0/crossws/drizzle 生态）**未**静态列入，说明它们在子模块内已由 `import()` 动态加载。
- 结论：barrel 的函数 re-export 本身可 tree-shake，重依赖又不经静态 `dependencies` 拖入——**tree-shaking 压力基本不存在**。

真实存在的成本是另外两项：
1. **心智模型**：从单 barrel 导入一切，新人难以判断哪些能力属于同一域。
2. **`tsc` / IDE 类型解析成本**：barrel 强制解析全部 20+ 子模块的类型，即便只导入一个符号。这是 IDE 响应与 typecheck 时长成本，非 bundle 体积成本。

另发现：OPT-06「等」掩盖了一个非平凡设计——子路径与内部文件**不 1:1**。内部文件为 `./websocket` + `./sse`（计划要 `./realtime`）、`./security-headers` + `./csrf`（计划要 `./security`）、`./database`（计划要 `./db`）。`./realtime` / `./security` 是**聚合子路径**，需手写聚合点。

## 决策

### 1. 重订理由

OPT-06 的推进理由改为**唯一**：心智模型 + `tsc`/IDE 类型解析成本。**删除 tree-shaking / bundle 体积论述**。验收改为「子路径可独立导入且类型正确；IDE 单符号导入不触发全量子模块类型解析」，不提 bundle 体积。

### 2. 子路径分组：语义聚合

采用语义聚合子路径，而非 1:1 与文件对齐。聚合点为新增的入口文件（如 `src/realtime.ts` re-export `./websocket` + `./sse`）。

| 子路径 | 聚合自（内部文件） |
| --- | --- |
| `./cache` | `./cache` + `./cache-directive` |
| `./db` | `./database` |
| `./realtime` | `./websocket` + `./sse` |
| `./security` | `./security-headers` + `./csrf` + `./sessions` |
| `./queue` | `./queue` |
| `./cron` | `./cron` + `./cron-scheduler` |
| `./storage` | `./storage` |
| `./observability` | `./observability` |
| `./email` | `./email` |
| `./analytics` | `./analytics` + `./feature-flags` |
| `./static` | `./static` + `./cors` + `./rate-limit` + `./after` + `./fetch-memo` + `./draft-mode` + `./single-flight` |

> 上表为初始提案，实施时按实际内聚度微调。原则：同一能力域聚合；不强求 1:1。

### 3. 主入口（barrel）行为

主入口 `.` **保持 re-export 兼容**（不破坏现有 `import { x } from '@ubean/server'`），但在 AGENTS / engineering 文档中**标注 barrel 为便利入口**，新代码推荐子路径。不在本次任务里 deprecate barrel（deprecate 属后续重大版本决策）。

## 影响面

| 项 | 变更 |
| --- | --- |
| `packages/server/package.json` | `exports` 新增 `./cache`、`./db`、`./realtime`、`./security` 等子路径 |
| `packages/server/src/` | 新增聚合入口文件（`realtime.ts`、`security.ts` 等） |
| AGENTS / engineering | 补子路径索引表；barrel 标注为便利入口 |

## 待决子项

- 聚合子路径的具体边界（上表为提案，实施时定稿）。
- 是否在 barrel 入口加 `@deprecated` JSDoc 引导迁移——延后到重大版本。
