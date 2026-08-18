---
title: ubean-studio
---

# ubean-studio 产品方案与实施计划

> 本文档规划基于 Electron 的桌面应用 **ubean-studio**（包名 `@ubean/studio`）：ubean 官方桌面工作台。
> 功能覆盖 `@ubean/devtools` 全部能力、项目命令可视化、UI 物料市场（基于 `@soybeanjs/ui`）、商业系统（博客/商城等解决方案），并以 **AI 驱动为核心**。
>
> 状态图例：⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⏸️ 暂缓
>
> 当前整体状态：**规划阶段（所有任务 ⬜）**。文档版本：v0.3（2026-07-26，引入 `@ubean/integrations/electron` 集成：studio 通过 `ubean.config.ts` 的 `electron: true` 启用 Electron 构建，默认 main/preload 入口，自动关闭 SSR）。

---

## 0. 仓库策略与 AI 底座（v0.2 重大调整）

本节记录 v0.2 的两项基础决策，影响后续所有架构与任务规划。

### 0.1 仓库策略：独立私有仓库

**决策：ubean-studio 不放入主 monorepo，单独新建私有仓库 `ubeanjs/ubean-studio`。**

**背景**：主仓库 `ubeanjs/ubean` 后续将整体开源（MIT）。studio 涉及商业系统、物料市场、AI provider 集成等不开源内容，不能与开源代码混放。

| 方案 | 取舍 | 结论 |
| --- | --- | --- |
| **A. 独立私有仓库（采用）** | 主仓库保持纯开源、无泄露风险；studio 以 npm 依赖消费 `ubean` 与 `@ubean/devtools`；本地联调通过 `pnpm link` 或本地 tarball | ✅ 采用 |
| B. 主 monorepo + gitignore | 开发时可 `workspace:*`；但 gitignore + overlay 极易泄露闭源代码到开源仓库 | ❌ 风险过高 |
| C. 主 monorepo + git submodule | submodule 体验差（clone/CI/PR 流程复杂）；仍需双重仓库 | ❌ 维护成本高 |
| D. 主 monorepo + git filter 分支排除 | 发布前过滤 studio 目录；流程脆弱、易误操作 | ❌ 不可靠 |

**studio 仓库结构**（自身为独立 monorepo）：

```
ubeanjs/ubean-studio (private)
├── packages/
│   ├── studio/              # @ubean/studio — Electron 应用本体
│   ├── studio-materials/    # @ubean/studio-materials — 内置物料库
│   └── studio-solutions/    # 商业系统模板（blog-pro / commerce / ...）
├── extensions/              # pi-agent 扩展（见 §0.2）
├── pnpm-workspace.yaml
└── package.json
```

**与主仓库的依赖关系**：

| studio 需要 | 来源 | 联调方式 |
| --- | --- | --- |
| `ubean` 框架运行时与类型 | npm `ubean` | `pnpm link --global` 或本地 `npm pack` |
| `@ubean/integrations/electron` Electron 构建 | npm `@ubean/integrations/electron`（ubean 内置模块，基于 vite-plugin-electron） | 同上；studio `ubean.config.ts` 中 `electron: true` 启用，默认入口 `electron/main.ts`、`electron/preload.ts` |
| `@ubean/devtools` client | npm `@ubean/devtools`（已包含在 `ubean` 依赖中） | 同上；dev server 运行时经 `/<devtools-path>/client` 加载 |
| CLI Shared Layer（scaffold fs-ops） | **需主包新增 `ubean/scaffold` 子路径导出**（见 ADR-03 + ST0-08） | 同上 |
| `skills/ubean` 知识包 | 主仓库 `skills/ubean` 目录 | studio 构建时拉取（git subtree 或 npm package） |
| `@soybeanjs/ui` / UnoCSS preset | npm | 直接安装 |

**主仓库所需的小改（开源侧）**：

1. 新增 `ubean/scaffold` 子路径导出，re-export `@ubean/cli/shared` 的 `fs-ops` 与 `templates`（供 studio 与第三方工具复用脚手架能力）。
2. `@ubean/devtools` client 支持路由深链（URL hash/query 定位视图，见 ST2-02）——此项本就是 devtools 增强，与 studio 无耦合。

> 这两项改动在主仓库独立 PR 推进，studio 不阻塞主仓库开源。

### 0.2 AI 底座：采用 pi-agent（earendil-works/pi）

**决策：studio 的 AI 能力不再自建 agent loop，改用 [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi) SDK 模式作为底座。**

**背景**：原方案 §3.5 计划基于 Vercel AI SDK 自建 `AiGateway`（provider 层 + tool registry + agent loop + 上下文装配 + 确认审计）。这部分工作量大、维护负担重，且 ubean 的核心价值在 DevTools 集成与 ubean 专属工具，而非通用 agent 基础设施。

**pi-agent 简介**（by Armin Ronacher / mitsuhiko）：

| 包 | 能力 | studio 用途 |
| --- | --- | --- |
| `@earendil-works/pi-ai` | 统一多 provider LLM API（OpenAI/Anthropic/Google/…） | 替代自建 provider 层 |
| `@earendil-works/pi-agent-core` | agent 运行时：tool calling、状态管理、事件流 | 替代自建 `AiGateway` + agent loop |
| `@earendil-works/pi-coding-agent` | 完整 coding agent，支持 **SDK 模式**嵌入自有应用 | 嵌入 Electron 主进程，获得开箱即用的 coding 能力 |
| `@earendil-works/pi-tui` | 终端 UI（studio 不直接用，renderer 自有 Vue UI） | — |

**pi 的扩展机制恰好匹配 studio 需求**：

- **Extensions**（TypeScript）：studio 的全部内部能力注册为 pi extension —— `ubean-project` / `ubean-scaffold` / `ubean-command` / `ubean-fs` / `ubean-devtools`（RPC 透传）/ `ubean-materials` / `ubean-solutions`。
- **Skills**：`skills/ubean` 作为 pi skill 包注入上下文知识（pi 原生支持 skill 检索注入，替代原方案的"上下文装配"自建逻辑）。
- **事件流**：`agent.subscribe(event => ...)` 原生流式事件（`agent_start`/`turn_start`/`message_update`/`tool_call`/...），经 IPC 直接喂给 renderer AI 面板。
- **SDK 模式**：pi-coding-agent 明确支持"embedding in your own apps"，已有 [openclaw/openclaw](https://github.com/openclaw/openclaw) 等真实 SDK 集成先例。

**pi 不提供、studio 自建的部分**：

| 能力 | pi 现状 | studio 方案 |
| --- | --- | --- |
| 权限系统 | pi 无内置权限限制，默认以启动用户权限运行 | studio 自建 `PermissionLayer`：写操作确认 + 命令白名单 + 路径 allowlist（继承 DevTools §4.12 安全策略） |
| 密钥存储 | pi 用环境变量 / 配置文件 | studio 用 Electron `safeStorage` 加密，注入 pi provider 配置 |
| 审计日志 | pi 无 | studio 在 `PermissionLayer` 拦截层统一落盘 `audit.log` |
| UI 渲染 | pi 有 TUI，但 studio 用 Vue | studio renderer 消费 pi 事件流，自绘对话 UI |

**采用 pi 后的收益**：

1. 省去自建 provider 抽象、tool calling 协议、agent loop、上下文裁剪、流式分发——这些是 pi 的核心维护领域。
2. pi 由 mitsuhiko 维护、5100+ commits、活跃迭代，studio 跟随升级即可获得能力增强。
3. studio 聚焦 ubean 专属价值：DevTools 集成、物料/解决方案市场、ubean 脚手架工具化。
4. Extensions/Skills 可独立打包为 npm 包，未来社区可复用于 pi 生态。

**风险与缓解**：

| 风险 | 缓解 |
| --- | --- |
| pi 版本迭代 breaking change | 锁定 pi 版本到 catalog；extension 接口变更走 studio CI 门槛 |
| pi 无权限系统 → 误操作风险 | `PermissionLayer` 在 pi tool 执行前拦截，所有写操作强制确认（§3.9 安全模型不变） |
| pi 依赖体积 | pi 为纯 JS/TS 无原生模块，对 Electron 包体积影响可控；按需 tree-shake |
| pi 与 Vercel AI SDK 共存 | DevTools 内 AI Assistant 仍用 Vercel AI SDK（已有实现）；studio 全局 AI 用 pi，两者独立、provider 配置可下发同步（ST3-11） |



---

## 1. 产品定位

### 1.1 一句话定位

**ubean-studio 是 ubean 生态的 AI 驱动桌面工作台**：管理项目全生命周期（创建 → 开发 → 调试 → 构建 → 部署前检查），内嵌完整 DevTools，提供物料与商业系统市场，所有能力均可由 AI 对话驱动。

### 1.2 与现有能力的关系

| 现有能力 | ubean-studio 中的形态 |
| --- | --- |
| `ubean` CLI（dev/build/init/page/api/env/config/cron...） | **命令中心**：全部命令表单化、可视化，复用 CLI Shared Layer 保证结果一致 |
| `@ubean/devtools`（13 个视图：Overview/Pages/ApiRoutes/ApiDocs/ApiPlayground/Config/EnvVars/Layouts/Middlewares/Crons/DrizzleStudio/Terminal/AiAssistant） | **DevTools 模块**：作为侧边菜单的一级入口完整内嵌，零重写 |
| `skills/ubean`（AI Skill） | **AI 知识源**：打包为 pi skill 包，作为内置 AI 助手的上下文知识（pi 原生检索注入） |
| `@soybeanjs/ui` | **物料市场基座** + studio 自身 UI 组件库 |
| `ubean init` 模板（starter/minimal/blog） | **商业系统/解决方案**的协议基础，扩展为 solution registry |

### 1.3 设计原则

1. **AI 驱动为核心**：AI 不是附加 Tab，而是全局能力——每个模块都有 AI 入口，全局 AI Agent 可跨模块执行多步任务。
2. **复用优于重写**：DevTools 客户端完整复用；脚手架操作复用 `packages/cli/src/shared/fs-ops.ts`；AI 栈复用 pi-agent（agent loop / tool calling / 多 provider 全部由 pi 承担）。
3. **GUI 与 CLI 功能对等**：遵循 runtime.md §4.13 的既定原则，studio 是第三个对等入口（DevTools、CLI、Studio）。
4. **安全默认**：AI 写操作必须 diff + 确认；终端命令白名单；文件访问 allowlist（继承 DevTools 安全策略 §4.12）。
5. **Vue 生态一致性**：渲染进程使用 Vue 3 + `@soybeanjs/ui` + UnoCSS，与 devtools client 技术栈完全一致。

---

## 2. 功能架构

### 2.1 信息架构（侧边菜单）

```
┌────────────────────────────────────────────────────────────────┐
│  ubean-studio                                                  │
│ ┌──────────┬───────────────────────────────────────────────────┤
│ │ 侧边菜单  │  主工作区                                          │
│ │          │                                                   │
│ │ 仪表盘    │  ┌─────────────────────────────────────────────┐  │
│ │ 项目管理  │  │              当前模块内容                     │  │
│ │ 命令中心  │  │                                             │  │
│ │ DevTools │  │  （DevTools 内嵌时为项目 dev server 中的      │  │
│ │ 物料市场  │  │   devtools client，其余为 studio 原生页面）    │  │
│ │ 商业系统  │  │                                             │  │
│ │ 设置     │  └─────────────────────────────────────────────┘  │
│ │          │                                                   │
│ │ ──────── │  ┌─────────────────────────────────────────────┐  │
│ │ AI 助手  │  │  全局 AI 面板（可展开/收起，右侧抽屉或底部）    │  │
│ └──────────┴──┴─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 模块功能清单

| 模块 | 菜单级别 | 功能 |
| --- | --- | --- |
| **仪表盘** | 一级 | 当前项目健康状态（dev server 状态/端口/uptime）、路由与 API 计数、最近任务、AI 建议（如依赖过期、类型错误、env 缺失） |
| **项目管理** | 一级 | 工作区项目列表、新建（starter/minimal/blog + preset + pm）、导入、移除、收藏、批量操作 |
| **命令中心** | 一级 | dev/build/preview/prepare 可视化（参数表单、实时日志、自动端口探测、内嵌预览）；脚手架命令（page/api/layout/middleware/cron/plugin/env/config）表单化；npm scripts 面板；多任务并行与历史 |
| **DevTools** | 一级（含 13 个二级 Tab） | 完整内嵌 `@ubean/devtools`：Overview、Pages、API Routes、API Docs、API Playground、Config、Env Vars、Layouts、Middlewares、Crons、Drizzle Studio、Terminal、AI Assistant |
| **物料市场** | 一级 | 基于 `@soybeanjs/ui` 的组件/区块/页面物料：分类浏览、模糊搜索、实时预览（iframe sandbox + props 调试）、代码查看、一键插入当前项目、收藏；本地内置库 + 远程 registry |
| **商业系统** | 一级 | 解决方案市场：博客系统、商城系统、CMS、SaaS 骨架等完整 starter；详情页（功能清单/技术栈/截图/所需 env）；一键安装流水线（生成 → 依赖 → env 向导 → 数据库迁移 → 启动）；商业化占位（license/付费模板） |
| **AI 助手** | 全局（非独立页面，常驻面板） | 对话驱动一切：CRUD、命令执行、物料插入、商业系统安装、错误诊断；Agent 模式（计划→执行→确认）；上下文感知（当前项目/当前模块/选中文件） |
| **设置** | 一级 | AI Provider（openai-compatible/anthropic/custom + key 加密存储）、主题（亮/暗）、工作区默认目录、遥测开关、快捷键、更新渠道 |

---

## 3. 技术架构

### 3.1 技术选型决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 桌面框架 | **Electron + `@ubean/integrations/electron`**（基于 vite-plugin-electron） | 重度依赖 Node 能力（child_process、node-pty、ts-morph AST、c12 配置加载、直接复用 ubean/devtools 的 Node API）；Tauri 的 Rust 侧无法低成本承载这些依赖。ubean 内置 `@ubean/integrations/electron` 模块：`electron: true` 即可启用，默认 main/preload 入口（`electron/main.ts`、`electron/preload.ts`），自动关闭 SSR，省去独立 `electron-vite` 工具链 |
| 渲染进程 UI | Vue 3 + `@soybeanjs/ui` + UnoCSS（`@soybeanjs/unocss-shadcn` preset） | 与 devtools client 一致，符合工程规范 §9.1 |
| 路由 | vue-router（渲染进程 SPA，studio 不使用 ubean 运行时） | studio 是工具应用，不需要 SSR/API 路由；ubean 是 studio 的"管理对象"。studio 复用 ubean 的构建工具链（`@ubean/integrations/electron`、Vite 插件），但不使用其运行时（SSR/页面路由/API 路由） |
| 终端 | `node-pty` + `xterm.js`（devtools 已使用 xterm 6） | 复用既有依赖与经验 |
| 进程内 API | `contextBridge` + 类型化 RPC（自定义轻量封装，参考 devframe 的 RPC 形态） | contextIsolation 安全模型下的标准方案 |
| AI 底座 | **[`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi) SDK 模式** + `pi-ai`（多 provider）+ `pi-agent-core`（agent runtime） | 见 §0.2：pi 提供 agent loop / tool calling / 事件流 / 多 provider 抽象，studio 以 Extension 注册 ubean 专属工具；省去自建 agent 基础设施 |
| 密钥存储 | Electron `safeStorage`（系统钥匙串加密） | API key 不落明文 |
| 本地数据 | JSON 文件存储（`app.getPath('userData')`）+ 必要时 `better-sqlite3`（AI 会话历史/物料缓存索引） | 避免过度设计；首版 JSON 足够 |
| 打包分发 | `electron-builder` + `electron-updater` | 成熟方案，支持 mac/win/linux 与自动更新 |

### 3.2 进程架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ubean-studio (Electron)                       │
│                                                                     │
│  ┌──────────────────────────── Main Process ─────────────────────┐  │
│  │  WindowManager      │ 窗口生命周期/单实例/深链                 │  │
│  │  WorkspaceStore     │ 工作区/项目元信息持久化 (JSON)           │  │
│  │  ProcessManager     │ spawn/node-pty 管理，多项目多任务        │  │
│  │  ProjectService     │ 项目检测/扫描（读取 ubean.config.ts）    │  │
│  │  ScaffoldService    │ 复用 ubean CLI Shared Layer (fs-ops)     │  │
│  │  PiAgentHost        │ pi-coding-agent SDK + ubean extensions  │  │
│  │  PermissionLayer    │ 写操作确认 + 命令白名单 + 审计落盘       │  │
│  │  MaterialRegistry   │ 内置物料 + 远程 registry 缓存            │  │
│  │  SolutionService    │ 商业系统获取/安装流水线                  │  │
│  │  SecureStore        │ safeStorage 密钥管理                     │  │
│  │  UpdateService      │ electron-updater                         │  │
│  └──────────────┬──────────────────────────────────────────────────┘  │
│                 │ contextBridge（类型化 StudioRPC API）              │
│  ┌──────────────▼────────── Preload ──────────────────────────────┐  │
│  │  window.studio: projects/processes/scaffold/ai/materials/...   │  │
│  └──────────────┬──────────────────────────────────────────────────┘  │
│                 │                                                    │
│  ┌──────────────▼────────── Renderer (Vue 3 SPA) ─────────────────┐  │
│  │  Shell（侧边菜单 + 全局 AI 面板 + 通知中心）                     │  │
│  │  Views: Dashboard/Projects/Commands/DevToolsHost/Market/       │  │
│  │         Solutions/Settings                                     │  │
│  │  DevToolsHost: <webview> 加载项目 dev server 的 devtools SPA   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                 │                                                    │
│  ┌──────────────▼────────── 被管理的 ubean 项目 ──────────────────┐  │
│  │  ubean dev (子进程) ── DevTools RPC + /__ubean_devtools__/client│  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 DevTools 集成方案（核心复用策略）

**决策：内嵌模式优先，直连模式为后续增强。**

| 方案 | 说明 | 取舍 |
| --- | --- | --- |
| **A. 内嵌模式（首选）** | studio 通过 `ProcessManager` 启动/接入项目 `ubean dev`，渲染进程用 `<webview>` 加载 `http://localhost:<port>/__ubean_devtools__/client` | ✅ 100% 复用现有 13 个视图与 RPC，零重写；✅ devtools 后续升级 studio 自动获益；⚠️ 依赖 dev server 运行（studio 负责一键拉起，这本来就是命令中心能力） |
| B. 直连模式 | studio 作为 RPC client 直连 devtools server，UI 用 studio 原生重写 | ❌ 重写 13 个视图，双份维护；列为 P3 远期评估 |

实施细节：

- `<webview>` 相比 iframe 具备独立进程与 `partition` 隔离，适合加载本地 dev server 内容；启用 `contextIsolation`，禁用 `nodeIntegration`。
- DevTools 作为一级菜单时承载完整 SPA；侧边二级菜单（13 个 Tab）通过 URL hash/query 深链到对应视图（需 devtools client 支持路由定位，见任务 ST3-02）。
- dev server 未运行时显示引导页（“启动 dev server”按钮 → 调用命令中心）。
- 安全：复用 devtools 的 session token / origin 校验机制（§4.12 RPC 通信层）；studio 不加挂额外特权。

### 3.4 命令执行与进程管理

- **ProcessManager**：每个任务 = `{ id, projectId, command, args, status, pid, startedAt, logBuffer }`；支持并发上限（默认 4）、日志环形缓冲（每任务 ≤ 2MB）、崩溃检测与重启策略。
- **CLI 可视化映射**：所有表单操作生成与 CLI 完全一致的调用，两条路径：
  1. **进程命令**（dev/build/preview/prepare/typecheck/lint/test/db:*）→ spawn 包管理器脚本（自动检测 pnpm/npm/yarn/bun）。
  2. **脚手架操作**（page/api/layout/middleware/cron/plugin/env/config 增删改）→ 主进程直接调用 ubean **CLI Shared Layer**（`packages/cli/src/shared/fs-ops.ts`，经 `ubean/scaffold` 子路径导出）Node API，避免 spawn 开销并获得结构化结果；与 DevTools RPC 路径共享同一实现，天然保证三方一致（§4.13）。
- **内嵌预览**：dev server 就绪（端口探测 + `/​_health` 轮询）后，主工作区可切换「预览 / DevTools / 日志」视图，预览用 `<webview>`。
- **终端**：复用 devtools 的 Terminal 能力；studio 额外提供项目级独立终端 Tab（node-pty，cwd = 项目根）。

### 3.5 AI 架构（基于 pi-agent，v0.2 修订）

studio 不再自建 agent loop，改用 pi-coding-agent SDK 模式嵌入主进程，ubean 专属能力以 pi Extension 注册。

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer: 全局 AI 面板（对话 UI / 计划确认 / diff 预览）      │
└──────────────┬───────────────────────────────────────────────┘
               │ IPC：pi 事件流（agent_start/turn/message_update/tool_call/...）
┌──────────────▼───────────────────────────────────────────────┐
│  Main: PiAgentHost                                            │
│  ├─ pi-ai: 多 provider LLM API（OpenAI/Anthropic/Google/...） │
│  │   └─ provider 配置由 SecureStore 注入（safeStorage 解密）  │
│  ├─ pi-agent-core: agent runtime（tool calling + 状态 + 流式）│
│  ├─ pi-coding-agent SDK: coding 能力（读写文件、运行命令等）  │
│  ├─ ubean Extensions（TypeScript，注册为 pi tools）:          │
│  │   ubean-project    project.info / project.listRoutes       │
│  │   ubean-scaffold   scaffold.createPage / createApi / ...   │
│  │   ubean-command    command.run (经 PermissionLayer 白名单) │
│  │   ubean-fs         fs.read / fs.glob（写操作经确认层）      │
│  │   ubean-devtools   devtools.rpc.* (透传 DevTools RPC)      │
│  │   ubean-materials  market.search / market.insert           │
│  │   ubean-solutions  solutions.list / solutions.install      │
│  ├─ pi Skill: skills/ubean 知识包（pi 原生检索注入）          │
│  └─ PermissionLayer: 写操作拦截 → 确认 → 审计落盘 audit.log   │
└──────────────────────────────────────────────────────────────┘
```

关键设计：

- **pi 即底座，extension 即能力**：studio 的全部内部能力（含 DevTools RPC）注册为 pi extension/tool，AI 与 GUI 共享同一服务层——这是"AI 驱动为核心"的落地方式，且无需自建 agent loop。
- **上下文注入由 pi Skill 承担**：`skills/ubean` 作为 pi skill 包，pi 原生负责检索式注入；当前项目摘要（config/路由/env keys/错误日志尾部）由 `ubean-project` extension 动态提供。
- **权限层独立于 pi**：pi 无内置权限系统，studio 在 tool 执行前插入 `PermissionLayer`——文件写入/删除、命令执行、物料插入、商业系统安装一律挂起，渲染进程展示结构化 diff/摘要，用户确认后放行（复用 §4.12「最小权限」原则）。
- **密钥**：仅存主进程 `safeStorage`；解密后注入 pi provider 配置，渲染进程永不接触 key；provider 请求只在主进程的 pi-ai 层发出。
- **事件流直连 UI**：`agent.subscribe(event => ...)` 的流式事件经 contextBridge 转发到 renderer，renderer 据此自绘消息列表 / 工具调用展开 / diff 预览。
- **与 DevTools AI Assistant 的关系**：DevTools 内的 AI Assistant 保持原样（Vercel AI SDK，面向 dev server 内的 CRUD）；studio 全局 AI 用 pi（超集，可调用 DevTools RPC）。两者 provider 配置可下发同步（ST3-11），但运行时独立。

### 3.6 物料市场协议

物料（Material）= 基于 `@soybeanjs/ui` 的可复用单元，协议参考 shadcn registry 思路：

```jsonc
// material.json
{
  "$schema": "https://ubean.dev/schemas/material.json",
  "name": "pricing-section",
  "type": "block",            // component | block | page
  "title": "定价区块",
  "description": "三栏定价表，含切换年/月付",
  "tags": ["marketing", "pricing"],
  "dependencies": ["@soybeanjs/ui"],        // 运行时依赖（自动检测安装）
  "files": [
    { "path": "components/PricingSection.vue", "target": "src/components/PricingSection.vue" }
  ],
  "propsSchema": { /* JSON Schema，用于预览面板 props 调试 */ },
  "preview": { "width": 1280, "height": 720 },
  "screenshot": "pricing-section.png",
  "version": "1.0.0",
  "author": "ubean"
}
```

- **内置物料库**：随 studio 分发的 `packages/studio-materials`，首批覆盖：导航栏、页脚、Hero、特性网格、定价表、FAQ、登录/注册表单、仪表盘壳、数据表格页、设置页等（全部用 `S*` 组件 + UnoCSS 实现，遵守 shortcuts/safelist 规范）。
- **预览**：独立隐藏 BrowserWindow/`<webview>` 运行一个最小 Vite 预览宿主（studio 内置，预装 `@soybeanjs/ui` + UnoCSS），按物料 propsSchema 生成调试面板。
- **插入项目**：复制文件 → 检测目标项目依赖与 UnoCSS preset（缺失则提示并一键安装/修改 `uno.config.ts`）→ 如目标为 ubean 项目且开启组件自动导入，无需额外注册。
- **远程 registry**：HTTP 静态 registry（index.json + 物料包），主进程缓存 + 版本校验；首版只读，发布流程后续定义。

### 3.7 商业系统（解决方案）

解决方案（Solution）= 完整可运行的 ubean 应用模板：

```jsonc
// solution.json
{
  "name": "ubean-blog-pro",
  "title": "博客系统 Pro",
  "category": "blog",          // blog | commerce | cms | saas | admin
  "description": "@ubean/content + @ubean/auth + SEO/sitemap 的完整博客",
  "template": { "type": "git", "url": "https://github.com/ubeanjs/solution-blog-pro", "ref": "v1.2.0" },
  "modules": ["@ubean/content", "@ubean/auth", "@ubean/icon"],
  "envSchema": { "DATABASE_URL": { "type": "string", "required": true } },
  "postInstall": ["db:migrate", "db:seed"],
  "pricing": { "type": "free" },   // free | paid（付费为商业化占位）
  "version": "1.2.0"
}
```

- **安装流水线**：degit 拉取 → 依赖安装（检测 pm）→ **env 向导**（按 envSchema 生成表单，写入 `.env`）→ postInstall 命令（迁移/种子）→ 注册到工作区 → 一键启动 dev。
- **首批商业系统**：
  1. **博客系统**：`@ubean/content` collections + Markdown 页面 + `@ubean/auth` + SEO（useSeoMeta/sitemap/robots）+ i18n 可选。
  2. **商城系统**：商品/分类/购物车/订单/库存（ubean database + db0 connector），`@ubean/auth` 账号体系，支付以 adapter 占位（Stripe/微信支付接口抽象，不内置真实密钥流程）。
  3. 后续：CMS、SaaS 多租户骨架、Admin 中后台（物料市场消费方）。
- **商业化**：`pricing.type: 'paid'` 的 license 校验与支付流程为占位设计，协议预留，实现排在 ST6-05。

### 3.8 数据持久化

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 工作区/项目列表 | `userData/workspace.json` | 项目路径、别名、收藏、最近打开、端口偏好 |
| AI 配置 | `userData/ai.json` + `safeStorage` | provider/model 明文，apiKey 加密 |
| AI 会话 | `userData/sessions/*.json`（量大时迁 SQLite） | 按项目分组，可清空 |
| 物料缓存 | `userData/materials-cache/` | 远程 registry 拉取缓存 + 索引 |
| 操作审计日志 | `userData/audit.log` | AI 写操作与命令执行记录 |
| 任务历史 | `userData/tasks.json` | 命令执行历史（保留最近 N 条） |

### 3.9 安全模型

1. 渲染进程：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；仅经 preload 暴露的类型化 API 访问主进程能力。
2. `<webview>`：独立 `session partition`，禁用 nodeIntegration，仅允许 `http://localhost:*` 与 `http://127.0.0.1:*` 导航。
3. CSP：studio 自身页面 `default-src 'self'`；devtools webview 由 dev server 自行控制。
4. 文件访问：主进程服务层统一校验路径必须位于已注册项目目录内（继承 §4.12 路径约束与备份策略）。
5. AI 安全：tool 白名单、写操作确认、命令白名单、全部写操作记录审计日志；遵循 roadmap 风险项 #17（DevTools 安全边界）同等标准。
6. 商业系统/物料远程内容：registry 走 HTTPS + 内容 hash 校验；模板 postInstall 命令执行前展示并确认。

---

## 4. 包结构与目录设计（v0.2 修订：独立仓库）

studio 在独立私有仓库 `ubeanjs/ubean-studio` 内，自身为 monorepo（pnpm workspace）。不放入主仓库，避免闭源代码混入开源主仓库（见 §0.1）。

```
ubeanjs/ubean-studio (private)
├── packages/
│   ├── studio/                        # @ubean/studio（Electron 应用，private: true）
│   │   ├── ubean.config.ts            # electron: true 启用 @ubean/integrations/electron（默认 main/preload 入口）
│   │   ├── electron-builder.yml
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main/                  # 主进程
│   │   │   │   ├── index.ts
│   │   │   │   ├── window.ts
│   │   │   │   ├── rpc/               # contextBridge 服务注册（类型化）
│   │   │   │   ├── services/
│   │   │   │   │   ├── workspace.ts   # 工作区/项目
│   │   │   │   │   ├── process.ts     # ProcessManager
│   │   │   │   │   ├── scaffold.ts    # 桥接 ubean/scaffold（CLI Shared Layer）
│   │   │   │   │   ├── pi-host.ts     # PiAgentHost：pi-coding-agent SDK 宿主
│   │   │   │   │   ├── permission.ts  # PermissionLayer：确认 + 审计
│   │   │   │   │   ├── materials.ts   # 物料 registry/缓存/插入
│   │   │   │   │   ├── solutions.ts   # 商业系统安装流水线
│   │   │   │   │   ├── secure-store.ts# safeStorage
│   │   │   │   │   └── updater.ts
│   │   │   │   └── utils/
│   │   │   ├── preload/
│   │   │   │   ├── index.ts           # contextBridge 暴露 window.studio + pi 事件流
│   │   │   │   └── index.d.ts         # 渲染进程类型
│   │   │   └── renderer/              # Vue 3 SPA
│   │   │       ├── index.html
│   │   │       └── src/
│   │   │           ├── App.vue
│   │   │           ├── main.ts
│   │   │           ├── router/
│   │   │           ├── layouts/       # Shell（侧边菜单 + AI 面板）
│   │   │           ├── views/
│   │   │           │   ├── dashboard/
│   │   │           │   ├── projects/
│   │   │           │   ├── commands/  # 命令中心（含任务日志/终端）
│   │   │           │   ├── devtools/  # DevToolsHost（webview 容器）
│   │   │           │   ├── market/    # 物料市场
│   │   │           │   ├── solutions/ # 商业系统
│   │   │           │   └── settings/
│   │   │           ├── components/
│   │   │           ├── composables/   # useStudio（preload API 封装）
│   │   │           └── styles/
│   │   └── resources/                 # 图标等
│   │
│   └── studio-materials/              # @ubean/studio-materials（内置物料库）
│       ├── package.json
│       ├── materials/
│       │   ├── blocks/                # 区块物料（pricing/hero/footer/...）
│       │   ├── components/            # 组件物料
│       │   └── pages/                 # 页面物料
│       └── registry.json              # 内置 registry 索引
│
├── extensions/                        # pi-agent 扩展（每个为独立 npm 包）
│   ├── ubean-project/                 # project.info / listRoutes / ...
│   ├── ubean-scaffold/                # createPage / createApi / ...
│   ├── ubean-command/                 # command.run（白名单）
│   ├── ubean-fs/                      # fs.read / glob / write(确认)
│   ├── ubean-devtools/                # devtools.rpc.* 透传
│   ├── ubean-materials/               # market.search / insert
│   └── ubean-solutions/               # solutions.list / install
│
├── solutions/                         # 商业系统模板源码
│   ├── blog-pro/
│   └── commerce/
│
├── pnpm-workspace.yaml
└── package.json
```

依赖边界：

- `@ubean/studio` 为 `private`，不发布 npm；产物经 electron-builder 分发。
- studio 以 npm 依赖消费 `ubean`（含 `@ubean/devtools`）与 `@ubean/integrations/electron`；本地联调用 `pnpm link --global` 或本地 `npm pack`（见 §0.1 联调方式）。
- Electron 构建由 `@ubean/integrations/electron`（ubean 内置模块，底层 vite-plugin-electron）承担：`ubean.config.ts` 中 `electron: true` 启用，默认入口 `electron/main.ts`、`electron/preload.ts`，自动关闭 SSR；如需自定义入口可覆盖 `electron.main.entry` / `electron.preload.input`。
- 脚手架逻辑依赖主包新增的 `ubean/scaffold` 子路径导出（需主包小改，见 ADR-03 + ST0-08）。
- 主进程依赖 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`node-pty`、（可选）`better-sqlite3`。
- 渲染进程依赖 `@soybeanjs/ui`、`@soybeanjs/unocss-shadcn`、`xterm.js`。
- `node-pty` 为原生模块：electron-builder `asarUnpack` + `electron-rebuild` 纳入构建流水线。
- pi extensions 纯 TS，无原生依赖，可独立打包发布（未来社区可复用）。

---

## 5. 里程碑

| 里程碑 | 可交付能力 | 验收标准 |
| --- | --- | --- |
| **MS0 骨架** | 独立仓库初始化、`@ubean/integrations/electron` 三进程骨架（`ubean.config.ts` 启用）、Shell 布局、pi-agent SDK 集成验证、打包出 mac 可运行 app | `pnpm dev` 启动；`pnpm build` 产出安装包；pi SDK 可对话；lint/typecheck 通过 |
| **MS1 项目管理 + 命令中心** | 项目 CRUD、新建向导、dev/build 可视化、日志、内嵌预览、脚手架表单 | 对 examples/ubean-test 全流程可操作；结果与 CLI 一致 |
| **MS2 DevTools 集成** | 13 个 Tab 完整内嵌、二级菜单深链、未运行引导 | DevTools 全部功能可用（对照 docs/test.md 第十三节清单） |
| **MS3 AI 核心（pi-agent）** | pi provider 配置、ubean extensions、全局 AI 面板、PermissionLayer、会话管理 | AI 可完成「创建页面+API+启动 dev」全链路；写操作均有确认与日志 |
| **MS4 物料市场** | 物料协议、内置库 ≥15 个、预览、插入 ubean 项目 | 物料插入后项目 `typecheck` 通过、页面正常渲染 |
| **MS5 商业系统** | 解决方案协议、博客系统、商城系统、安装流水线 | 从市场一键安装到 dev 运行成功；env 向导与迁移执行正确 |
| **MS6 发布** | 自动更新、错误上报（可关）、CI 打包（mac 公证/win 签名）、文档 | 三平台安装包 CI 产出；升级链路验证 |

---

## 6. 详细任务清单

> 编号规则：`ST<阶段>-<序号>`。优先级：P0 最高。所有任务当前状态均为 ⬜。

### MS0：项目骨架

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST0-01 | 初始化独立私有仓库 `ubeanjs/ubean-studio`（pnpm workspace + catalog + TS strict + `ubean.config.ts` 启用 `@ubean/integrations/electron`） | ⬜ | P0 | 仓库就绪；pnpm install 通过；`electron: true` 生效（默认 main/preload 入口、SSR 自动关闭）；CI 骨架就位 |
| ST0-02 | 主进程：窗口管理、单实例锁、深链（`ubean-studio://`）、 macOS 菜单/托盘占位 | ⬜ | P0 | 双开拦截；深链唤起并路由 |
| ST0-03 | preload：contextBridge 类型化 API（`window.studio`）+ 事件订阅机制 | ⬜ | P0 | 渲染进程零 `ipcRenderer` 直用；类型端到端推导 |
| ST0-04 | 渲染进程 Shell：侧边菜单、主题（亮/暗）、vue-router、全局通知 | ⬜ | P0 | 菜单折叠/展开；路由懒加载；`SConfigProvider` 主题 |
| ST0-05 | 全局 AI 面板容器（右侧抽屉，可拖拽宽度，快捷键唤起） | ⬜ | P0 | 任意模块可唤起；UI 就绪（逻辑在 MS3） |
| ST0-06 | 构建打包：electron-builder（mac dmg/zip），asarUnpack node-pty 预留 | ⬜ | P0 | mac 本地产出可运行安装包 |
| ST0-07 | 工程化：eslint、vitest 基础、CI 打包 workflow 骨架 | ⬜ | P1 | lint/typecheck/test 纳入命令 |
| ST0-08 | **主仓库小改**：新增 `ubean/scaffold` 子路径导出（re-export `@ubean/cli/shared`） | ⬜ | P0 | studio 可 `import { ... } from 'ubean/scaffold'`；主仓库单测全绿 |
| ST0-09 | **pi-agent SDK 集成验证（spike）**：嵌入 `pi-coding-agent` SDK，最小可对话 + 事件流经 IPC 到 renderer | ⬜ | P0 | renderer 显示流式回复；pi extension 注册机制跑通 |
| ST0-10 | **ubean-scaffold extension 原型**：注册 1 个 pi tool（`scaffold.createPage`）桥接 `ubean/scaffold` | ⬜ | P1 | AI 对话可创建一个页面文件；与 CLI 产物一致 |

### MS1：项目管理 + 命令中心

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST1-01 | WorkspaceStore：项目模型（path/name/pm/收藏/端口偏好）+ JSON 持久化 + 迁移容错 | ⬜ | P0 | 重启后状态还原；损坏文件自动备份重建 |
| ST1-02 | 项目检测器：识别 ubean 项目（`ubean.config.ts` / 依赖含 `ubean`）、读取版本与 preset | ⬜ | P0 | 非 ubean 项目给出引导提示；examples/ubean-test 正确识别 |
| ST1-03 | 新建项目向导：模板（starter/minimal/blog）× preset（standard/node/cloudflare）× pm，调用 `ubean init` 等价逻辑 | ⬜ | P0 | 生成项目 `pnpm dev` 可运行；与 CLI 产物 diff 一致 |
| ST1-04 | 导入项目：目录选择、批量导入、有效性校验 | ⬜ | P0 | 导入后出现在列表且状态正确 |
| ST1-05 | ProcessManager：spawn/node-pty 封装、并发上限、日志环形缓冲、退出码捕获 | ⬜ | P0 | 4 任务并发稳定；日志完整；kill 级联清理子进程 |
| ST1-06 | 命令中心 UI：dev/build/preview/prepare 卡片式操作（参数表单：port/host/preset/sourcemap/clean） | ⬜ | P0 | 参数映射正确；运行/停止/重启；状态机正确（idle→running→ready/error） |
| ST1-07 | 实时日志视图：xterm 渲染、ANSI 颜色、搜索、导出 | ⬜ | P0 | 高吞吐不丢帧；颜色正确 |
| ST1-08 | dev server 就绪探测：端口监听 + `/​_health` 轮询 + 自动唤起内嵌预览（webview） | ⬜ | P0 | ready 状态准确；预览可交互 |
| ST1-09 | 脚手架表单化（page/api/layout/middleware/cron/plugin/env/config 增删改查）桥接 CLI Shared Layer | ⬜ | P0 | 与 `ubean page add` 等 CLI 产物一致；触发相同 hooks；删除自动备份可恢复 |
| ST1-10 | npm scripts 面板：解析 package.json scripts，一键运行 + 常用脚本固定 | ⬜ | P1 | scripts 变更热更新列表 |
| ST1-11 | 项目级终端 Tab（node-pty，cwd=项目根） | ⬜ | P1 | 交互完整（vim/top 可用）；随项目切换 |
| ST1-12 | 任务历史与通知中心（成功/失败 toast + 历史列表） | ⬜ | P1 | 失败任务展示退出码与日志尾部 |

### MS2：DevTools 集成

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST2-01 | DevToolsHost 视图：`<webview>` 容器（独立 partition、仅 localhost 导航、加载态/错误态） | ⬜ | P0 | 加载 devtools SPA 成功；禁止外站导航 |
| ST2-02 | 二级菜单深链：13 个 Tab 与 devtools client 视图一一对应（需 devtools client 支持 URL 定位视图，提交配套小改） | ⬜ | P0 | 菜单切换精确落到对应 Tab |
| ST2-03 | 未运行引导页：检测 dev server 未启动时提供「一键启动」并自动衔接 | ⬜ | P0 | 启动完成后自动进入 DevTools |
| ST2-04 | 功能回归：对照 docs/test.md 第十三节逐项验证（Overview/Pages/ApiRoutes/ApiDocs/ApiPlayground/Config/EnvVars/Layouts/Middlewares/Crons/DrizzleStudio/Terminal/AiAssistant） | ⬜ | P0 | 清单全部通过 |
| ST2-05 | 多项目 DevTools 上下文隔离（partition 按项目隔离，端口冲突处理） | ⬜ | P1 | 双项目并行互不串扰 |

### MS3：AI 核心（基于 pi-agent）

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST3-01 | pi Provider 配置：经 `pi-ai` 配置 openai-compatible/anthropic/custom；model 列表；连通性测试 | ⬜ | P0 | 三 provider 配置可用；失败给出诊断 |
| ST3-02 | 密钥管理：safeStorage 加解密 provider apiKey、设置页录入/清除；解密后注入 pi 配置 | ⬜ | P0 | key 不明文落盘；渲染进程不可见 |
| ST3-03 | PiAgentHost：初始化 `pi-coding-agent` SDK、agent 状态管理、事件流经 contextBridge 转发 renderer | ⬜ | P0 | 流式渲染稳定；断流可重试 |
| ST3-04 | ubean Extensions 注册（7 个）：ubean-project/scaffold/command/fs/devtools/materials/solutions（pi tool 协议 + 执行器） | ⬜ | P0 | ≥12 个 tool；schema 校验失败有清晰错误 |
| ST3-05 | 对话面板：消费 pi 事件流渲染消息列表、流式文本、Markdown/代码高亮、工具调用过程展开 | ⬜ | P0 | 工具调用可展开查看参数/结果 |
| ST3-06 | pi Skill 集成：`skills/ubean` 打包为 pi skill 包；当前项目摘要由 `ubean-project` extension 动态提供 | ⬜ | P0 | token 预算可控；注入内容可预览 |
| ST3-07 | Agent 多步任务：pi 原生 agent loop（plan → tool → 汇总）；渲染进程展示逐步执行；可中断 | ⬜ | P0 | 「创建产品管理模块」类任务端到端完成 |
| ST3-08 | PermissionLayer：在 pi tool 执行前拦截写操作；渲染进程展示 unified diff / 命令摘要 / 物料清单；确认后放行 | ⬜ | P0 | 未确认不执行；diff 准确 |
| ST3-09 | 审计日志：PermissionLayer 拦截的全部写操作与命令执行落盘 `audit.log`，设置页可查看/清空 | ⬜ | P0 | 日志含时间/工具/参数/结果 |
| ST3-10 | 会话管理：按项目分组的会话历史（pi `AgentMessage` 序列化）、新建/重命名/删除 | ⬜ | P1 | 重启后会话还原 |
| ST3-11 | DevTools AI 配置联动：studio pi provider 配置可下发到项目 devtools ai 设置（Vercel AI SDK 侧） | ⬜ | P2 | DevTools AI Assistant 复用同一 key |
| ST3-12 | AI 错误诊断入口：命令失败/类型错误时「用 AI 分析」一键附带日志上下文 | ⬜ | P1 | 日志尾部自动附带；建议可操作 |

### MS4：物料市场

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST4-01 | 物料协议定稿：`material.json` JSON Schema + 类型定义 + 校验器 | ⬜ | P0 | 非法物料给出定位错误 |
| ST4-02 | `packages/studio-materials` 初始化 + 内置 registry 索引生成脚本 | ⬜ | P0 | 构建时校验全部物料合法性 |
| ST4-03 | 首批内置物料 ≥15 个（导航/页脚/Hero/特性/定价/FAQ/登录/注册/仪表盘壳/表格页/设置页等，全部 `S*` 组件 + UnoCSS） | ⬜ | P0 | 每个物料含 preview + propsSchema + 截图 |
| ST4-04 | 市场 UI：分类/标签/搜索（fuse.js）、卡片网格、收藏 | ⬜ | P0 | 搜索响应 <100ms；暗色主题适配 |
| ST4-05 | 预览宿主：内置最小 Vite 环境 + iframe/webview 实时预览 + props 调试面板（按 propsSchema 生成表单） | ⬜ | P0 | props 修改即时生效；尺寸切换（桌面/移动） |
| ST4-06 | 代码查看：SFC 源码只读展示（CodeMirror，复用 devtools 经验）+ 复制 | ⬜ | P1 | 高亮正确 |
| ST4-07 | 一键插入：复制文件到目标项目 + 依赖检测（`@soybeanjs/ui`/UnoCSS preset）+ 缺失时引导安装/配置 | ⬜ | P0 | 插入后项目 typecheck 通过；ubean 组件自动导入直接可用 |
| ST4-08 | 远程 registry：HTTP 拉取 + 本地缓存 + 版本/hash 校验 | ⬜ | P1 | 离线时回退内置库 + 已缓存 |
| ST4-09 | AI 物料工具：`market.search` / `market.insert` 接入 AI（对话查找并插入物料） | ⬜ | P1 | 「帮我加一个定价区块」端到端完成 |

### MS5：商业系统

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST5-01 | 解决方案协议：`solution.json` JSON Schema + 校验器 + 模板获取（git/degit + 内置） | ⬜ | P0 | 协议文档化；非法 solution 拒绝 |
| ST5-02 | 市场 UI：分类列表、详情页（功能清单/技术栈/截图/env 需求/版本） | ⬜ | P0 | 信息完整；暗色适配 |
| ST5-03 | 安装流水线：拉取 → pm 安装 → env 向导（按 envSchema 生成表单写入 .env）→ postInstall（迁移/种子）→ 注册工作区 | ⬜ | P0 | 每步可重试；失败回滚目录 |
| ST5-04 | 博客系统 solution（@ubean/content + auth + SEO/sitemap + 示例文章） | ⬜ | P0 | 安装后 dev 运行：首页/文章页/后台登录可用 |
| ST5-05 | 商城系统 solution（商品/分类/购物车/订单 + database + auth + 支付 adapter 占位） | ⬜ | P0 | 核心流程可演示：浏览→加购→下单 |
| ST5-06 | 商业系统升级通道：检测模板新版本 → 变更摘要 → 更新向导 | ⬜ | P2 | 版本对比正确 |
| ST5-07 | 商业化占位：license 字段协议、付费 solution 展示态（购买引导外链） | ⬜ | P3 | 协议预留，UI 有态 |
| ST5-08 | AI 商业系统工具：`solutions.list` / `solutions.install`（对话式安装，env 逐项询问） | ⬜ | P1 | 「帮我搭一个博客」端到端完成 |

### MS6：打磨与发布

| ID | 任务 | 状态 | 优先级 | 验收标准 |
| --- | --- | --- | --- | --- |
| ST6-01 | electron-updater 自动更新（release 渠道、更新提示、差量） | ⬜ | P0 | 旧版可平滑升级 |
| ST6-02 | 错误上报与基础遥测（默认关闭，设置页开启；匿名化） | ⬜ | P1 | 隐私合规说明完备 |
| ST6-03 | CI 发布流水线：mac（签名+公证）/win（签名）/linux（AppImage/deb） | ⬜ | P0 | tag 触发三平台产物 |
| ST6-04 | 性能预算：启动 <3s、内存基线 <300MB、多 dev server 场景压测 | ⬜ | P1 | 达标或有明确优化记录 |
| ST6-05 | 文档：用户指南（skills 目录同级 docs）、快捷键表、物料/solution 协议文档 | ⬜ | P1 | 与实现同步 |
| ST6-06 | 官网/落地页（可用 ubean 自举，dogfooding） | ⬜ | P2 | 上线 |

---

## 7. 关键决策记录（ADR 草案）

| ID | 事项 | 决策 | 说明 |
| --- | --- | --- | --- |
| ADR-01 | Electron vs Tauri | ✅ Electron | 主进程需直接运行 node-pty、ts-morph、c12、CLI Shared Layer 与 pi-agent SDK 的 Node 生态；Tauri 需 Rust 重写或 sidecar，成本高且丧失复用 |
| ADR-02 | DevTools 集成方式 | ✅ webview 内嵌 | 完整复用 `@ubean/devtools` 13 个视图；原生重写列为远期 P3 |
| ADR-03 | 脚手架操作通道 | ✅ 主进程直调 CLI Shared Layer | 与 DevTools RPC、CLI 三方共用同一实现，结果一致（§4.13）；需要主包新增 `ubean/scaffold` 子路径导出（ST0-08 前置小改） |
| ADR-04 | studio 自身技术栈 | ✅ Vue 3 SPA（复用 ubean 构建链，非 ubean 运行时） | studio 是 Electron 工具，无 SSR/部署需求；ubean 是被管理对象。studio 通过 `@ubean/integrations/electron`（ubean 内置模块）处理 Electron 构建（main/preload/renderer 三进程构建、HMR、自动启动），但渲染进程不使用 ubean 的 SSR/页面路由/API 路由运行时。官网落地页才用 ubean 自举（ST6-06） |
| ADR-05 | AI 工具协议 | ✅ pi-agent Extension（TypeScript） | v0.2 改用 pi-coding-agent SDK；ubean 专属能力注册为 pi extension，省去自建 tool registry；pi 原生支持 tool calling 协议 |
| ADR-06 | 物料协议 | ✅ 自有 material.json（参考 shadcn registry） | 与 `@soybeanjs/ui` 生态对齐；保留向 shadcn registry 格式导出可能 |
| ADR-07 | 密钥存储 | ✅ safeStorage | 系统级加密；不引入第三方 keyring；解密后注入 pi provider 配置 |
| ADR-08 | 商业系统模板分发 | ✅ git 模板（degit）+ solution.json | 与社区生态一致；内置模板可离线使用 |
| ADR-09 | 仓库策略 | ✅ 独立私有仓库 `ubeanjs/ubean-studio` | 主仓库整体开源（MIT），studio 含闭源商业内容不能混放；独立仓库以 npm 依赖消费 ubean，本地联调用 pnpm link（见 §0.1） |
| ADR-10 | AI 底座 | ✅ pi-coding-agent SDK（替代自建 AiGateway） | pi 提供 agent loop / tool calling / 多 provider / 事件流 / skill 注入，由 mitsuhiko 维护；studio 聚焦 ubean 专属 extension 与 PermissionLayer；pi 无权限系统由 studio 自建拦截层补齐（见 §0.2） |
| ADR-11 | DevTools AI 去留 | ✅ 分层保留（不砍） | devtools AI 作为开源 gateway 留在框架内（dev server 上下文助手），studio AI 承载完整 agent；砍掉会自断采纳漏斗、触发社区信任危机（Continue.dev 被收购停维教训）；见 §10.5 |
| ADR-12 | 产品命名 | ✅ 保留 ubean-studio | 名字传递"官方综合工作台"定位（对标 Android Studio / Xcode），AI 是属性而非全部；tagline 强化 AI-Native 定位；改名为 agent 会自我窄化，掩盖 DevTools/市场/解决方案的独占价值 |
| ADR-13 | 商业化模型 | ✅ BYOK + 功能门控 + 解决方案市场 | AI 推理 BYOK 免费（消除摩擦），高级 AI 生成器（建表/插件/主题/模板）Pro 会员解锁；解决方案市场为高利润一次性付费产品；用户为"能力"付费而非"用量"，对标 Cline/OpenCode 的 BYOK + Cursor 的能力分层；见 §10 |
| ADR-14 | 商业化起点 | ✅ 解决方案市场优先 | 完整应用模板（博客/商城/CMS）付费意愿最强、边际成本最低；studio 免费 + BYOK 驱动采纳，解决方案启动营收；Pro 订阅与企业层后续跟进；见 §10.4 |
| ADR-15 | Electron 构建工具链 | ✅ `@ubean/integrations/electron`（替代 electron-vite） | v0.3：ubean 内置 `@ubean/integrations/electron` 模块（薄封装 vite-plugin-electron），`ubean.config.ts` 中 `electron: true` 即可启用；默认 main/preload 入口（`electron/main.ts`、`electron/preload.ts`），自动关闭 SSR（桌面应用无需 SSR）。收益：(1) studio 无需引入独立 `electron-vite` 工具链，构建配置统一在 `ubean.config.ts`；(2) 任何 ubean 项目均可通过 `electron: true` 升级为桌面应用，扩大 ubean 生态覆盖；(3) 主仓库原生维护 electron 集成，studio 跟随升级零成本 |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Electron 包体积大（node-pty 原生模块、物料预览宿主） | 下载体验差 | asarUnpack 仅必要模块；物料预览宿主按需懒构建；差量更新 |
| 多项目多 dev server 资源占用 | 内存/端口压力 | ProcessManager 并发上限；闲置 dev server 自动挂起提示；端口冲突自动分配 |
| AI 写操作安全事故 | 用户代码损坏 | 全部写操作 diff 确认 + 自动备份（复用 .ubean/backup 机制）+ 审计日志；命令白名单 |
| 物料/商业系统质量与维护成本 | 市场口碑 | 协议校验 + CI 安装测试（对每个 solution 跑安装流水线 e2e）；官方首批物料求精不求多 |
| DevTools 深链改造影响主包 | 回归风险 | ST2-02 的 devtools client 改动独立 PR + 现有 32 个 devtools 单测全绿 |
| 跨平台签名公证成本（mac/win 证书） | 发布阻塞 | CI 先行跑通未签名包；证书申请列入 MS6 前置 |
| node-pty 跨平台编译 | Windows 构建失败 | electron-rebuild 纳入 CI 矩阵（mac/win/linux）提前验证（ST0-06/ST6-03） |
| AI provider API 变动 | 功能失效 | `pi-ai` Provider 抽象 + 契约测试；pi 版本锁定 catalog |
| BYOK 用户流失到免费替代（Cline/OpenCode 也是 BYOK） | 营收不及预期 | 差异化在 ubean 专属 extension（DevTools/脚手架/物料/解决方案），通用 agent 无法复刻；高级 AI 生成器（建表/插件/主题）是框架独占工作流 |
| 解决方案市场冷启动 | 首批无第三方创作者 | 官方先出博客 Pro + 商城系统 2 个精品 solution，验证付费意愿后再开放第三方；material/solution 协议预留商业化字段 |
| Pro 功能门控被绕过（闭源 extension 被逆向） | 收入流失 | 核心生成器逻辑在主进程（不进 renderer）；license 校验服务端化（阶段三）；接受少量破解换生态采纳 |
| devtools AI 与 studio AI 双栈维护成本 | 维护负担 | devtools AI 保持轻量（Vercel AI SDK + 单文件 CRUD），不扩展；复杂能力一律导向 studio |

---

## 9. 验收基线与测试策略

1. **单元测试**：主进程服务层（workspace/process/scaffold/materials/solutions/permission）与 pi extensions（ubean-project/scaffold/command/fs/devtools/materials/solutions）纯函数覆盖；协议校验器正反用例。
2. **集成测试**：以 `examples/ubean-test` 为固定 fixture，验证命令中心、脚手架表单与 CLI 产物一致性（文件 diff）。
3. **e2e 测试**：Playwright Electron 驱动（`@playwright/test` 的 `_electron`），覆盖 MS1→MS5 核心用户旅程。
4. **市场 e2e**：CI 对博客/商城 solution 执行「安装 → build → preview → 冒烟断言」流水线。
5. **安全测试**：webview 导航拦截、路径逃逸、AI 未确认写操作拦截、密钥落盘检查（对照 roadmap 风险 #17 同级标准）。
6. **持续验收**：遵循 engineering.md §6.3 门槛——每个里程碑合并前 fixture、类型测试、e2e 同步更新，覆盖率用于发现盲区。

---

## 10. 商业化策略（v0.2 新增）

### 10.1 定位：框架官方工作台，非通用 agent

ubean-studio 不与 Cursor / Claude Code（通用 coding agent）竞争。它对标的是 **Android Studio 之于 Android**、**Xcode 之于 Apple 生态**——框架专属工作台。差异化不靠"AI 更强"，而靠**框架深度集成带来的独占价值**（DevTools 内嵌、脚手架桥接、物料/解决方案市场、ubean 专属 AI extension）。

### 10.2 核心原则

> **框架开源（采纳引擎）→ studio 是商业载体 → 解决方案是高利润产品 → 高级 AI 工作流是订阅锚点**

### 10.3 BYOK + 功能门控模型（关键设计）

**AI 推理成本与 AI 价值解耦**：

- **AI 推理成本由用户承担**：studio 采用 BYOK（Bring Your Own Key），用户自带 OpenAI/Anthropic API key。基础 AI 对话免费，消除采纳摩擦（对标 Cline / OpenCode）。
- **高级 AI 驱动的工作流付费**：AI 推理本身免费，但 ubean 基于 pi extension 封装的高价值"AI 生成器"需 Pro 会员解锁。用户为**能力**付费，不为**用量**付费。

| 能力分层 | 免费（BYOK） | Pro 会员解锁 |
| --- | --- | --- |
| **AI 对话** | 通用 Q&A、代码解释、错误诊断、单文件编辑 | — |
| **AI 脚手架** | 基础 CRUD（单页/单 API 创建） | AI 应用页面模板（完整页面布局生成） |
| **AI 生成器** | — | AI 驱动建数据库表（描述实体 → 生成 migration + model + API + 页面） |
| **AI 生成器** | — | AI 插件生成（描述需求 → 生成完整 ubean module/plugin） |
| **AI 生成器** | — | AI 主题生成（描述风格 → 生成 UnoCSS 主题 + 组件样式） |
| **AI 多步 agent** | — | 跨文件重构、解决方案定制化、物料智能组合 |
| **DevTools AI** | dev server 上下文助手（保持开源，作为 gateway） | — |

**门控实现**：pi extension 注册时标记 `requiresPro: true`；PermissionLayer 拦截执行前校验会员状态，未开通则引导升级。免费/Pro 的 provider 配置相同（同一 BYOK key），区别仅在解锁的 extension 集合。

### 10.4 三阶段商业化路径

**阶段一：采纳期——免费 studio + 付费解决方案**（启动营收）

- studio 桌面应用：**免费下载**（驱动采纳，建生态）
- AI：**BYOK 免费**（基础对话 + 基础脚手架）
- **解决方案市场**：博客 Pro / 商城系统 / CMS 等完整模板，一次性付费（$49-299）
- 物料市场：freemium（基础免费，premium 物料包付费）
- Pro 会员：**早鸟开放**（AI 高级生成器解锁，$19/mo）

> 解决方案是最高优先级营收——用户为"完整产品"付费意愿远高于工具订阅，且边际成本极低。

**阶段二：经常性收入——Studio Pro 订阅**（建立 ARR）

- Free：本地-only、BYOK AI、基础脚手架、免费解决方案
- **Pro $19/mo**：全部 AI 生成器（建表/插件/主题/模板）、premium 物料库、云同步
- **Teams $15/user/mo**：共享工作区、团队 AI 配置、审计日志、席位管理

**阶段三：企业 + 平台**（规模化）

- Enterprise：SSO、on-prem 部署、合规审计、专属支持
- 云构建/预览：从 studio 一键触发云端 build/preview（基础设施收入）
- 解决方案市场开放第三方创作者（收入分成，像 App Store / ThemeForest）

### 10.5 DevTools AI 的定位（分层保留，作为转化 gateway）

studio 实现后，**不砍掉** devtools 内的 AI Assistant，而是分层定位：

| | devtools AI（开源，随框架分发） | studio AI（闭源，pi-agent 驱动） |
| --- | --- | --- |
| **定位** | "dev server 上下文助手" | "项目全生命周期 agent" |
| **能力** | 路由解释、单文件 CRUD、错误诊断、env 检查（只读+轻写） | 多步 agent、AI 生成器、跨项目、物料/解决方案市场 |
| **AI 栈** | Vercel AI SDK（保持现状） | pi-agent（闭源 extension） |
| **触发** | 仅 `ubean dev` 运行时 | 桌面常驻 |
| **价值** | 让用户尝到 AI，建立 ubean=AI-friendly 心智 → 转化 studio | 想要更强 AI 与独占工作流时付费 |

**理由**：
1. 2026 年 AI 已是框架选型的 table-stakes，OSS 完全无 AI 会在选型阶段被淘汰。
2. Continue.dev 被收购停维的教训：把 AI 从开源侧抽走向闭源侧会触发社区信任危机。
3. devtools AI 是采纳漏斗的入口（尝鲜→想要更多→转化 studio），砍掉等于自断入口。
4. 两者天然职责不同（dev server 上下文 vs 项目生命周期），非简单的 basic/advanced 关系。
