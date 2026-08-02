# ubean 架构优化任务

> 来源：[architecture-analysis.md](./architecture-analysis.md)（CodeGraph 全库审计，2026-08-02）  
> 范围：可维护性 / 可扩展性 / 代码质量（**不含**功能路线图，功能见 [roadmap.md](./roadmap.md)）  
> 状态：`todo` · `doing` · `done` · `wontfix`

---

## 优先级说明

| 级别 | 含义 | 建议节奏 |
| --- | --- | --- |
| **P0** | 易造成 API/文档误用或核心链路不可观测 | 尽快落地 |
| **P1** | 明显拖累维护成本或测试信心 | 下一迭代 |
| **P2** | 工程卫生与长期扩展 | 有空 / 随 release |

---

## 总览

| ID | 优先级 | 状态 | 任务 |
| --- | --- | --- | --- |
| OPT-01 | P0 | todo | 消歧同名 `createUbeanApp`（Hono vs Vue） |
| OPT-02 | P0 | done | 构建包目录避开 CodeGraph `build/` 忽略（→ `packages/builder`） |
| OPT-03 | P0 | done | 文档纠偏（包数量 / 包树 / 文档导航） |
| OPT-04 | P1 | todo | 核心包包内单测：`config` / `build`（`packages/builder`） / `cli` |
| OPT-05 | P1 | todo | 补强 `app` init 与 `routing` 扫描边角用例 |
| OPT-06 | P1 | todo | `@ubean/server` 子路径 exports 拆分（渐进） |
| OPT-07 | P1 | todo | 扩展包接入契约表 |
| OPT-08 | P2 | todo | 高扇入弱测包补测：`utils` / `modules` |
| OPT-09 | P2 | todo | AGENTS 包树 CI 校验 |
| OPT-10 | P2 | todo | DevTools 体积与依赖边界收敛 |
| OPT-11 | P2 | todo | CodeGraph 纳入核心 PR 工作流约定 |

---

## P0

### OPT-01 · 消歧同名 `createUbeanApp`

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.1-A；`@ubean/app` 与 `@ubean/runtime` 各导出一同名函数 |
| 目标 | 消除聚合器 re-export 时的语义歧义与 IDE 跳转混淆 |
| 方案（择一） | **A.** runtime 侧改名为 `createUbeanVueApp` / `createClientApp`，保留 `createUbeanApp` = Hono；**B.** Hono 仅从 `ubean/runtime/app`（`@ubean/app`）导出，Vue 工厂改名且仅从 `ubean/runtime/vue` 导出 |
| 涉及包 | `@ubean/runtime`、`@ubean/app`、`ubean`、文档 / examples |
| 验收 | 主入口不再出现两个同名可导入符号；AGENTS / apps/docs / README 用表格写清差异；examples 与类型导出更新；`pnpm typecheck` + 相关测试通过 |

### OPT-02 · 构建包目录重命名避开 CodeGraph `build/` 忽略 ✅

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §2.2；CodeGraph 内置忽略任意名为 `build/` 的目录 |
| 落地 | `packages/build` → **`packages/builder`**；npm 包名仍为 **`@ubean/build`**（`import from '@ubean/build'` 不变） |
| 验收 | `codegraph files --filter packages/builder` 列出 `src/*`；`ubeanPlugin` 可 query 到 `packages/builder/src/vite.ts`；文档树写 `builder/` |

### OPT-03 · 文档纠偏（包树 / 导航） ✅

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.1-C |
| 落地 | README / README.zh_CN / AGENTS 包数改为 37；补 `actions`/`pinia`；AGENTS §10 指向 `apps/docs`；overview 增加 CodeGraph 摘要 |
| 验收 | 文档中的包数量与 `ls packages` 一致；无失效的 `skills/ubean/docs/**`、`docs/modes.md` 主路径链接 |

---

## P1

### OPT-04 · 核心包包内单测：`config` / `@ubean/build` / `cli`

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.1-B；三包包内测试为 0 或严重依赖 examples |
| 目标 | 把配置解析、宏/虚拟模块、CLI smoke 从 e2e 中拆出，缩短反馈环 |
| 子任务 | |
| | **4a** `@ubean/config`：`configDefaults` / `resolveSsrConfig` / `resolveRoutingConfig` / routeRules 合并 |
| | **4b** `@ubean/build`（目录 `packages/builder`）：`transformMacros`、虚拟模块注册、关键 `production` 路径（临时目录） |
| | **4c** `@ubean/cli`：`prepare` / `build` / `dev` smoke（临时目录 + `afterEach` 清理，勿用 `process.cwd()`） |
| 验收 | 各包 `pnpm -F <pkg> test` 可独立跑通；覆盖上述关键路径；不依赖启动完整 ubean-test 服务 |

### OPT-05 · 补强 `app` init 与 `routing` 边角

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.1-B；`createUbeanApp` / `scanProject` 标注无充分单测 |
| 目标 | 锁定请求入口与扫描约定的回归 |
| 子任务 | |
| | **5a** `@ubean/app`：`init` 挂载 routeRules / Actions / Server Component / OpenAPI / health |
| | **5b** `@ubean/routing`：matcher、parallel、intercept、reuse、特殊页（404/loading/error） |
| 验收 | 包内测试覆盖上表场景；改 `registerRoutes` / `scanProject` 时 CI 能在 examples 外先红 |

### OPT-06 · `@ubean/server` 子路径 exports（渐进拆分）

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.2-D；单包职责过重（cache/db/queue/cron/ws/sse/security…） |
| 目标 | 降低 barrel 导入心智负担与 tree-shaking 压力，**暂不拆 npm 包名** |
| 方案 | 先稳定 `package.json` `exports`：`./cache`、`./db`、`./realtime`、`./security` 等；文档与 AGENTS 按子路径索引；主入口保持 re-export 兼容 |
| 验收 | 子路径可独立导入且类型正确；主入口行为不变；apps/docs / AGENTS 补充子路径表 |

### OPT-07 · 扩展包接入契约表

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.2-G |
| 目标 | 统一 `auth` / `icon` / `pwa` / `image` / `content` / `fonts` / `electron` / `pinia` / `ui` 的接入形态 |
| 交付物 | 写入 engineering 文档（建议 `apps/docs/.../architecture/engineering.md`）的表格：`config key` → `/vite` 插件 → runtime 入口 → peerDeps → 默认行为 |
| 验收 | 九个扩展包均有一行契约；新增扩展包 PR 必须更新该表 |

---

## P2

### OPT-08 · 高扇入弱测包：`utils` / `modules`

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.3-H；`@ubean/utils` 扇入 9、`modules` 被 build/cli/dev-server 依赖 |
| 目标 | 为纯函数与模块解析补最小单测，降低隐式回归 |
| 验收 | 两包各有可运行的 vitest 套件；覆盖公开 API 的主路径与边界 |

### OPT-09 · AGENTS 包树 CI 校验

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.3-I；曾出现 40 / 38 / 37 文档不一致 |
| 目标 | 防止 AGENTS / README 包树再次漂移 |
| 方案 | 脚本对比 `packages/*` 目录名与文档中的包列表（或至少校验数量）；挂到 CI 或 `pnpm` script |
| 验收 | 故意删改文档包数时 CI/脚本失败；release checklist 含「同步 AGENTS 截至日期」 |

### OPT-10 · DevTools 体积与依赖边界

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.2-F；devtools 索引文件数最高 |
| 目标 | 明确 `client/` 与 Node RPC 边界，大功能 lazy 化 |
| 子任务 | 依赖方向审计（UI → Node 禁止）；AI / CRUD scaffold 改为可选子入口；评估对默认 `ubean` 安装体积感知的影响 |
| 验收 | 边界文档化；可选能力不进入默认关键路径的强制依赖 |

### OPT-11 · CodeGraph 纳入核心 PR 工作流

| 字段 | 内容 |
| --- | --- |
| 状态 | todo |
| 依据 | 分析 §6.3-J；OPT-02 已使 `packages/builder` 可 impact |
| 目标 | 改核心符号时有统一影响面检查习惯 |
| 约定 | 改 `defineHandler` / `scanProject` / `registerRoutes` / `ubeanPlugin` / macros 时：`codegraph sync && codegraph impact <symbol>`，PR 描述附简要 blast radius |
| 验收 | engineering 或 CONTRIBUTING 中写明约定；至少 1 次核心 PR 按此执行作为样板 |

---

## 建议执行顺序

```
OPT-01 (createUbeanApp 消歧)
  → OPT-04 (config / @ubean/build / cli 单测)
  → OPT-05 (app + routing 补测)
  → OPT-06 (server 子路径)
  → OPT-07 (扩展契约表)
  → OPT-08 / OPT-09 / OPT-10 / OPT-11（可并行）
```

已完成的 OPT-02 / OPT-03 为后续任务提供文档与索引基线，无需回滚。

---

## 关联文档

| 文档 | 用途 |
| --- | --- |
| [architecture-analysis.md](./architecture-analysis.md) | 审计原文与证据 |
| [roadmap.md](./roadmap.md) | 功能实现规划（与本文件正交） |
| [AGENTS.md](../AGENTS.md) | API 速查（随 OPT-01 / OPT-06 / OPT-07 更新） |
| [engineering.md](../apps/docs/src/content/zh/architecture/engineering.md) | 工程规范（OPT-07 / OPT-11 落点） |
