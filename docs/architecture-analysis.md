# ubean 项目结构与架构分析

> **分析工具**: [CodeGraph](https://github.com/) CLI v1.5.0  
> **分析日期**: 2026-08-02  
> **索引快照**: 510 files · 5,445 nodes · 20,567 edges · 25.1 MB  
> **状态**: 基于当前源码与 CodeGraph 索引的结构化审计，供维护者与 AI 助手参考

---

## 1. 执行摘要

ubean 是一个 **pnpm monorepo + 聚合器** 形态的 Vue 专属全栈元框架：对外单一包名 `ubean`，内部拆为 **37 个** `@ubean/*` / `ubean` 包。HTTP 核心为 **Hono**，构建链为 **Vite-Plus**，页面侧为 **Vue 3 SSR / Islands**，部署侧为 nitro 风格 **preset 能力矩阵**。

CodeGraph 显示依赖图呈清晰分层：`@ubean/types` / `@ubean/utils` / `@ubean/routing` 为高扇入基础层；`ubean` 聚合器扇出最高（27 个内部依赖）；扩展包（auth/icon/pwa 等）刻意不进入主包硬依赖，由配置按需加载。

主要风险不在“包太多”，而在：**文档路径漂移**、**同名 API 语义分叉**、**核心包测试缺口**；CodeGraph 对构建包的索引问题已通过目录重命名解决（见 §2.2）。

---

## 2. CodeGraph 索引概况

| 指标 | 数值 |
| --- | --- |
| Files | 510 |
| Nodes | 5,445 |
| Edges | 20,567 |
| Backend | node:sqlite (WAL) |
| Languages | TypeScript 428 · Vue 72 · JavaScript 6 · YAML 4 |

### 2.1 节点类型分布

| Kind | Count | 含义 |
| --- | ---: | --- |
| function | 1,641 | 主导的函数式 API 风格 |
| import | 1,285 | 包间耦合边密集 |
| constant | 806 | 路由常量 / 虚拟模块 ID 等 |
| interface | 618 | 类型契约丰富 |
| file | 505 | — |
| route | 175 | 示例与文档站路由密度高 |
| type_alias | 122 | — |
| method | 102 | 类方法较少（刻意 FP） |
| component | 72 | Vue SFC（示例 + DevTools + docs） |
| class | 12 | 极少 OOP（如 `UbeanApp`、`ImageResponse`） |

### 2.2 `@ubean/build` 目录名与 CodeGraph 索引（已修复）

CodeGraph 内置默认忽略任意名为 `build/` 的目录（视为构建产物，与 `dist/`/`out/` 同类）。包原先位于 `packages/build`，因此曾被整包跳过。

**永久修复（2026-08-02）**：目录重命名为 `packages/builder`，**npm 包名仍为 `@ubean/build`**（imports / workspace 依赖不变）。`builder` 不在 CodeGraph 默认忽略列表中，无需 `.gitignore` 否定规则。

验收：`codegraph files --filter packages/builder` 列出 `src/*`；`ubeanPlugin` 可 query 到 `packages/builder/src/vite.ts`。

---

## 3. 仓库目录组织

### 3.1 实际布局（2026-08）

```
ubean/
├── packages/          # 37 个框架包（见 §4）
├── apps/
│   └── docs/          # 官方文档站（内容源：src/content/{zh,en}/）
├── examples/
│   ├── ubean-test/    # 全栈示例 + 集成测试主战场
│   ├── frontend-only/ # SPA / 无服务端
│   └── routing-file-mode/
├── skills/ubean/      # AI Skill（命令与提示词；使用指南已迁至 apps/docs）
├── docs/              # 仓库级工程文档（roadmap、本分析）
├── AGENTS.md          # AI 助手速查
└── README(.zh_CN).md  # 对外介绍
```

### 3.2 Workspace

`pnpm-workspace.yaml` 包含：

- `packages/*` — 框架包
- `apps/*` — 应用（文档站）
- `examples/*` — 示例与测试宿主

`catalog` 固定 `vite-plus@0.2.6`，并对 `typescript` / `kysely` 等做 overrides。

### 3.3 与旧文档的偏差

| 文档说法 | 实际情况 |
| --- | --- |
| AGENTS「40 个子包」/ README「38 包」 | **37** 个 `packages/*` 目录 |
| AGENTS `docs/` = 架构文档全集 | 架构正文在 **`apps/docs/src/content/`**；根 `docs/` 仅 roadmap + 本文件 |
| AGENTS `skills/ubean/docs/guide/` | **路径已失效**；指南迁至 `apps/docs` |
| README 包树缺 `actions` / `pinia` | 两包均存在 |

---

## 4. 包架构与依赖分层

### 4.1 包清单（37）

| 层 | 包 | 职责 |
| --- | --- | --- |
| Foundation | `types`, `utils`, `error`, `env` | 共享类型、工具、错误、环境变量 |
| Config / Platform | `config`, `preset`, `modules` | 配置解析、平台能力、模块 kit |
| Routing | `routing`, `api-routes`, `pages`, `actions`, `codegen` | 扫描、挂载、页面协议、Server Actions、类型生成 |
| Server Runtime | `server`, `app` | cache/db/queue/cron/ws/sse + Hono `UbeanApp` |
| Vue Runtime | `runtime`, `ssr`, `islands`, `i18n`, `seo`, `markdown` | 客户端/SSR/Islands/i18n/SEO/MD |
| Build Tooling | `builder`（包名 `@ubean/build`）、`vite`, `auto-imports`, `prerender`, `dev-server`, `cli`, `devtools` | Vite 插件链、预渲染、dev、CLI |
| Aggregator | `ubean` | 对外 API + `ubean/vite` 等子路径 |
| Extensions | `auth`, `icon`, `pwa`, `image`, `content`, `fonts`, `electron`, `pinia`, `ui` | 配置开关按需加载 |

### 4.2 依赖扇入 / 扇出（package.json `@ubean/*`）

**最高扇入（被依赖最多）**

1. `@ubean/types` — 13
2. `@ubean/routing` — 11
3. `@ubean/utils` — 9
4. `@ubean/config` — 7
5. `@ubean/pages` / `@ubean/islands` / `@ubean/build` — 6

**最高扇出（依赖最多）**

1. `ubean` — 27（预期：聚合器）
2. `@ubean/dev-server` — 12
3. `@ubean/cli` — 11
4. `@ubean/app` / `@ubean/build` — 8

**零内部依赖（叶子 / 扩展）**: `auth`, `electron`, `error`, `fonts`, `icon`, `image`, `markdown`, `preset`, `pwa`, `seo`, `types`, `utils`  
（扩展包通过动态 `import()` 或 peer 接入，避免拖进默认安装图。）

### 4.3 推荐心智模型（依赖方向）

```
types / utils / error
        ↓
config ← preset
        ↓
routing → api-routes / pages / actions / codegen
        ↓
server → app
        ↓
runtime / islands / ssr / i18n / seo / markdown
        ↓
builder(@ubean/build) / vite / auto-imports → cli / dev-server / prerender
        ↓
ubean (aggregator) + optional extensions
```

规则：**下层不依赖上层**；Vue 专属逻辑集中在 `runtime` / `vite` / `ssr` / `islands`；`routing` 保持框架无关。

---

## 5. 核心技术框架（请求 / 构建双路径）

### 5.1 运行时请求路径（CodeGraph explore）

```
CLI / DevServer
  → loadUbeanConfig (@ubean/config)
  → scanProject (@ubean/routing)
  → createUbeanApp (@ubean/app)          # Hono 工厂
       → registerRoutes (@ubean/api-routes)
            → registerApiRoutes / registerPageRoutes
       → createActionsMiddleware (/__actions)
       → createServerComponentMiddleware (/__server-component)
  → Vue SSR: createVueRenderer (@ubean/ssr)
       → defineApp / applyAppConfig (@ubean/runtime)
```

### 5.2 构建时 Vite 插件组合

`ubean/vite` → `ubeanPlugin()` 扁平组装：

1. `@ubean/build/vite` — 框架无关核心（路由扫描、虚拟模块、宏）
2. `@ubean/vite` (`ubeanVuePlugin`) — Vue 页面/入口虚拟模块、自动导入
3. `@ubean/islands/vite` — `v-client.*` 转换
4. `@ubean/actions/vite` — `defineAction` ID 注入

配置始终来自 `ubean.config.ts`（`loadUbeanConfigSync`），不接受插件参数旁路。

### 5.3 Impact 热点（改动需谨慎）

| Symbol | 包 | 备注 |
| --- | --- | --- |
| `defineHandler` | api-routes | Impact 波及大量示例 API 路由 |
| `defineConfig` / `loadUbeanConfig` | config | CLI 全链路 + 用户配置入口 |
| `scanProject` | routing | CLI build/dev/prepare + Vite 插件 |
| `registerRoutes` | api-routes | app init / lazyInit / auto-imports |
| `ubeanPlugin` | ubean | 所有 vite.config 与 dev-server |
| `createUbeanApp` | **app + runtime 同名** | 见 §6.1 |

---

## 6. 架构问题与改进建议

### 6.1 高优先级

#### A. 同名 `createUbeanApp` 语义分叉

> **⛔ 已由 [ADR-0001](./adr/0001-rename-vue-create-ubean-app.md) 超越（2026-08-02）**：grilling 核查发现聚合器主入口已不 re-export Vue 版（`packages/ubean/src/index.ts` 选择性 export 刻意省略 `createUbeanApp`），AGENTS 已记录双义（L184–185/L793）；真实危害为团队/上手心智。决策：Vue 工厂重命名为 `createUbeanVueApp`，硬重命名随下个 major；另发现 `production.ts:319` 第三处 re-export（Hono 版，无歧义，保留）。下文为审计时快照，保留作历史记录。

CodeGraph 检出两个导出同名函数：

| 位置 | 角色 |
| --- | --- |
| `packages/app/src/app.ts` | **Hono** 应用工厂 → `UbeanApp` |
| `packages/runtime/src/app.ts` | **Vue** 客户端应用工厂 → `{ app, router, head, page }` |

聚合器 `ubean` 同时 re-export 两者时，极易造成文档与 IDE 跳转混淆。

**建议**（择一）:

1. 将 runtime 侧重命名为 `createUbeanVueApp` / `createClientApp`，保留 `createUbeanApp` 专指 Hono；或  
2. 明确子路径边界：Hono 仅从 `ubean/runtime/app`（或 `@ubean/app`）导入，Vue 工厂改名并只从 `ubean/runtime/vue` 导出。

文档中必须用表格写清两者差异（当前 AGENTS 只列了 Hono 版）。

#### B. 核心包单测缺口

CodeGraph 对多个核心符号标注「no covering tests」。结合仓库内 test 文件统计：

| 包 | 风险 | 建议 |
| --- | --- | --- |
| `builder`（`@ubean/build`） | 0 包内测试 | 为 macros / virtual-modules / production 增加单测 |
| `cli` | 0 包内测试 | 对 `prepare` / `build` / `dev` 做 smoke（临时目录） |
| `config` | 依赖 example 测试 | 迁回包内单元测试（defaults / resolveSsr / routeRules） |
| `routing` (`scanProject`) | 有测试但仍不足 | 覆盖 matcher / parallel / intercept / reuse |
| `app` (`createUbeanApp`) | 仅 hooks 测试 | 补 init 中间件挂载与 OpenAPI 注册 |

`examples/ubean-test` 集成测试覆盖面很好，但不能替代包内快速单测。

#### C. 文档导航漂移

- 修正包数量与包树（README / AGENTS）
- 将 AGENTS §10 指向 `apps/docs/src/content/...`
- 删除或重定向失效的 `skills/ubean/docs/**`、`docs/modes.md`、`docs/subpackage-splitting.md` 链接

### 6.2 中优先级（可维护性 / 可扩展性）

#### D. `@ubean/server` 职责过重

> **⛔ 已由 [ADR-0003](./adr/0003-server-subpaths-rejustification.md) 超越（2026-08-02）**：grilling 证伪 tree-shaking 半边——barrel 是函数 re-export 可 tree-shake，重依赖（unstorage/db0/crossws）已在子模块内 `import()` 动态加载、未入静态 `dependencies`。重订理由为心智模型 + `tsc`/IDE 类型解析成本；采用语义聚合子路径（`./realtime`=ws+sse 等）。下文为审计时快照。

单包已含：cache、component cache、data cache、db、queue、cron、ws、sse、cors、csrf、sessions、security-headers、draft-mode、observability、feature-flags、email、analytics 等。

**建议**: 按能力拆分子路径或子包（渐进式，避免大爆炸）：

- `@ubean/server/cache` · `@ubean/server/db` · `@ubean/server/realtime`（ws+sse）· `@ubean/server/security`
- 或保留单包但强制 `exports` 子路径 + 文档分层，降低「从 barrel 导入一切」的 tree-shaking / 心智负担

#### E. `@ubean/runtime` 与 `@ubean/app` 边界

runtime 同时持有 Vue 应用工厂、router、page view、i18n、head、islands 桥接、search 等；app 持有 Hono 与 global hooks。边界总体正确，但 runtime 内 `createUbeanApp` 命名加剧混淆（见 A）。

#### F. DevTools 体量

> **⛔ 部分由 [ADR-0004](./adr/0004-devtools-ai-sdk-optional-deps.md) 超越（2026-08-02）**：「评估安装体积影响」已确认为真实传递硬依赖链 `ubean → @ubean/devtools → ai@7.0.40 + @ai-sdk/openai-compatible`（均硬 `dependencies`），每次 `npm install ubean` 传递安装 Vercel AI SDK。决策：改 `optionalDependencies` + AI scaffold 懒加载。依赖方向审计与 client/RPC 边界建议仍适用。

`devtools` 索引文件数最高（~45）。建议：

- 将 `client/` 视为独立应用边界（已接近）
- 保证 Node RPC 层与 UI 的依赖单向
- 大功能（AI / CRUD scaffold）可考虑 lazy 子入口，避免拖慢默认 `ubean` 安装体积感知

#### G. 扩展包接入一致性

扩展包（auth/icon/…）多数零 `@ubean/*` 依赖，集成靠 Vite 插件 + 配置字段，方向正确。建议维护一张 **「扩展包契约表」**（config key → `/vite` 插件 → runtime 入口 → peerDeps），避免各扩展实现漂移。

### 6.3 低优先级（代码质量）

#### H. 包内测试分布不均

`server` / `seo` / `islands` / `api-routes` 测试较充实；`utils` / `auto-imports` / `modules` / `pinia` / `ui` / `electron` 偏弱。优先给 `utils` 与 `modules` 补最小单测——它们扇入高、回归成本高。

#### I. AGENTS 与源码双源真理

AGENTS 已是高质量 API 速查，但存在过时段落（如 actions 描述仍提 `'use server'` 指令转换、包数量、文档路径）。建议：

- 在 CI 或 release checklist 中增加「AGENTS 包树 vs `ls packages`」校验脚本
- 大版本 bump 时同步 AGENTS「截至日期」

#### J. CodeGraph 纳入开发流

建议团队约定：

```bash
codegraph sync
codegraph impact <symbol>    # 改核心 API 前
codegraph explore <area>     # 新人上手某子系统
```

并对 `packages/builder`（`@ubean/build`）改动时，将 `codegraph impact` 结果贴进 PR 描述（尤其是 macros / virtual modules）。

---

## 7. 技术栈组件一览

| 层级 | 选型 | 落点 |
| --- | --- | --- |
| HTTP | Hono 4.x | `@ubean/app`, `@ubean/api-routes` |
| OpenAPI | hono-openapi + Scalar | `/_openapi.json`, `/_scalar` |
| 构建 | Vite-Plus 0.2.6 | catalog + 各包 `vp pack` |
| 前端 | Vue 3 only | `@ubean/runtime`, `@ubean/ssr`, `@ubean/vite` |
| 路由扫描 | 自研 + rou3 | `@ubean/routing` |
| 配置 | c12 + defu | `@ubean/config` |
| 存储 | unstorage | `@ubean/server` |
| 数据库 | db0 / Drizzle 生态 | `@ubean/server` |
| WebSocket | crossws | `@ubean/server` |
| Auth | Better Auth（扩展） | `@ubean/auth` |
| UI | @soybeanjs/ui（扩展） | `@ubean/ui` |
| 状态 | Pinia（扩展） | `@ubean/pinia` |
| 包管理 | pnpm 11.x workspaces + catalog | 根 `package.json` |
| 测试 | Vitest（包内 + examples） | `examples/ubean-test` 为主 |

---

## 8. 与现有文档的映射

| 主题 | 权威文档 |
| --- | --- |
| AI / API 速查 | [AGENTS.md](../AGENTS.md) |
| 对外介绍 | [README.md](../README.md) / [README.zh_CN.md](../README.zh_CN.md) |
| 架构概述 | [apps/docs/.../architecture/overview.md](../apps/docs/src/content/zh/architecture/overview.md) |
| 子包拆分史 | [apps/docs/.../architecture/subpackage-splitting.md](../apps/docs/src/content/zh/architecture/subpackage-splitting.md) |
| 运行时 | [apps/docs/.../architecture/runtime.md](../apps/docs/src/content/zh/architecture/runtime.md) |
| 工程规范 | [apps/docs/.../architecture/engineering.md](../apps/docs/src/content/zh/architecture/engineering.md) |
| 路线图 | [roadmap.md](./roadmap.md) |
| **优化任务（按优先级）** | [optimize.md](./optimize.md) |
| **优化术语表** | [glossary.md](./glossary.md) |
| **架构决策记录（ADR）** | [adr/](./adr/)（0001 createUbeanApp 重命名 / 0002 序列重排+测试边界 / 0003 server 子路径 / 0004 devtools AI SDK / 0005 OPT-09 实现+OPT-11 时序+OPT-01 子项 / 0006 OPT-07 契约表+OPT-08 优先级） |
| **本分析（CodeGraph）** | 本文件（2026-08-02 快照；§6/§9 部分已被 ADR 超越，见各节标注） |

---

## 9. 建议落地顺序（可执行 backlog）

> 已拆解为带 ID / 验收标准的任务清单，见 **[optimize.md](./optimize.md)**（OPT-01 … OPT-11）。
>
> **⛔ 执行顺序已由 [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) 重排（2026-08-02）**：enabler 领头——OPT-09（包树 CI 校验）/ OPT-11（CodeGraph 进 PR 流）由 P2 提前为 P1 并先行，再走 OPT-01 → 04 → 05 → 06 → 07 →（08/10 并行）。下文旧顺序保留作历史记录；当前顺序见 [optimize.md · 建议执行顺序](./optimize.md#建议执行顺序)。

1. **文档纠偏** — 包数量、包树、文档导航（README / AGENTS）✅ OPT-03  
2. **消歧 `createUbeanApp`** — 重命名或子路径隔离 + 文档表格 → OPT-01  
3. ~~**修复 CodeGraph 对构建包的索引**~~ — ✅ OPT-02（目录改为 `packages/builder`）  
4. **补 `config` / `@ubean/build`（`packages/builder`） / `cli` 包内单测** — OPT-04  
5. **规划 `@ubean/server` 子路径拆分** — OPT-06  
6. **扩展包契约表** — OPT-07

---

## 10. 附录：常用 CodeGraph 命令

```bash
# 同步索引
codegraph sync

# 状态
codegraph status

# 目录树
codegraph files --filter packages --format tree --max-depth 2

# 探索子系统
codegraph explore createUbeanApp --max-files 8
codegraph explore scanProject registerRoutes

# 变更影响
codegraph impact defineHandler
codegraph impact ubeanPlugin

# 调用关系
codegraph callers registerRoutes
codegraph callees loadUbeanConfig
```
