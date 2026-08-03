# ubean 架构词汇表

> 术语在相关 ADR（`docs/adr/`）中按此定义使用。

## 应用工厂

- **`createUbeanApp`**（Hono 工厂）：`@ubean/app` / `ubean/runtime/app` 导出，返回 `UbeanApp`（Hono 应用）。ADR-0001 后此名**专指** Hono 工厂。
- **`createUbeanVueApp`**（Vue 工厂）：ADR-0001 将原 `@ubean/runtime` 的同名 Vue 工厂重命名而来，返回 `UbeanAppInstance`（`{ app, router, head, page }`）。唯一真实消费者是 `@ubean/vite` 的虚拟模块生成器。
- **聚合器（aggregator）**：`ubean` 主包，纯 re-export 全部 `@ubean/*` 子包，对外维持单一包名 API 表面。其选择性 `export { ... } from '@ubean/runtime'` 块用于消歧（见 ADR-0001）。

## 导入入口

- **barrel（聚合入口）**：包主入口 `.`，静态 re-export 全部子模块符号。`@ubean/server` 的 barrel 是函数 re-export，本身可 tree-shake（见 ADR-0003）。
- **子路径（subpath）**：`package.json` `exports` 中的 `./xxx` 入口。
- **语义聚合子路径**：聚合多个内部文件的子路径，与文件非 1:1。例：`./realtime` = `./websocket` + `./sse`（见 ADR-0003）。
- **1:1 子路径**：与内部文件一一对应的子路径。

## 任务性质

- **enabler（使能任务）**：本身不交付用户可见功能，但为后续任务提供护栏或证据层。如 OPT-09（防漂移护栏）、OPT-11（impact 证据层）。enabler 应领头序列（见 ADR-0002）。
- **feature task**：直接交付用户可见改进的任务。

## 测试

- **注册断言（registration assertion）**：对 `app.hono` 的路由栈/中间件栈做断言，验证某中间件/路由已挂载，**不发起 HTTP 请求**。适用于 `UbeanApp` init 这类以同步注册为主的场景（见 ADR-0002、OPT-05 5a）。
- **快照单测（snapshot unit test）**：对 codegen 模块产出的字符串做 snapshot/断言，作为快速单元门禁。`packages/builder/src/production.ts` 等 codegen 模块用此法（见 ADR-0002）。
- **临时目录集成测**：在临时目录跑真实 Vite build 验证产出可执行。属慢集成测，归 e2e，不进包内单测（见 ADR-0002）。
- **codegen 模块**：产出模板字符串（如生成的 server entry）的模块。`production.ts` 即此类，其测试边界为快照单测而非临时目录构建。

## 依赖形态

- **核心依赖形态**：扩展包对其核心库的依赖类型，三值：
  - **hard**：列入 `dependencies`，安装扩展即自动安装（如 `@ubean/pwa` 对 `vite-plugin-pwa`）。
  - **peer**：列入 `peerDependencies`，用户须自行安装。
  - **optional-peer**：列入 `peerDependencies` 且 `optional: true`。
  - OPT-07 契约表的专列，用于抓扩展包间依赖形态不一致（见 OPT-07）。
- **传递硬依赖（transitive hard dependency）**：经 `dependencies` 链传递的硬依赖。ADR-0004 处理的 `ubean → @ubean/devtools → ai` 即此类。

## 过程

- **blast radius（影响面）**：一次改动的真实波及范围。grilling 强调用 grep/`codegraph impact` 核查，而非凭文档措辞估计（见 ADR-0001 对 OPT-01 影响面的核查）。
- **包树漂移**：文档中包数量/包列表与 `packages/*` 实际不一致。OPT-09 的 CI 校验即防此漂移。

## 文档内容分类（ADR-0007 沉淀）

- **开发任务型内容（dev-task content）**：面向贡献者/开发者自身、以推进开发为目的的文档——设计提案、实施计划、任务跟踪、差距分析、产品规划。生命周期强耦合（含状态表格、任务 ID、时间预估），随迭代频繁变更。归属根 `docs/`（仓库内部，中文）。判据：① 含任务清单/状态表格/里程碑；② 含"实施计划/时间预估/分阶段"章节；③ 以"差距分析/缺失功能"为主体；④ 面向贡献流程（测试门槛、工程规范）。
- **架构说明性内容（architecture-explanation content）**：面向用户/评估者、以帮助理解与选型为目的的文档——解释框架机制、设计理念。生命周期弱耦合（稳定知识，仅在机制变化时更新）。归属 `apps/docs`（公开站点，中英双语）。
- **status badge（状态徽章）**：站点 Architecture 区曾用于区分历史/提案/已实现文档的展示机制（✅/⬜）。ADR-0007 逆转 DESIGN.md D13 后移除——历史/提案文档迁出站点，无内容可标。

## 真理源与校验（第二轮 grilling 沉淀）

- **真理源（source of truth）**：CI 校验时比对的标准。OPT-09 的真理源是 `packages/*/package.json` 的 `name` 字段（非目录名——`builder`≠`@ubean/build`、`ubean` 无 scope，目录名会误报）。OPT-07 的扩展集真理源是**派生**的：从 package.json 中找有 `./vite` 导出者，不硬编码列表（见 ADR-0005/0006）。
- **派生真理源（derived source）**：不从硬编码列表读，而从包的客观属性（如 `./vite` 导出有无）推导集合。避免「护栏列表」自身与被保护对象同病漂移。
- **存在性 + 计数检查**：OPT-09 的校验形态——读全部包名，断言每个出现在 AGENTS.md 且计数一致。不解析树结构（`├──`/`└──` 正则太脆），不生成清单文件。
- **强制 peer（mandatory peer）**：核心依赖形态之一——在 `peerDependencies` 但非 `optional:true`，用户必须自行安装（如 `@ubean/ui` 的 `@soybeanjs/ui`）。区别于 optional-peer（optional:true）与 hard（`dependencies` 自动装）。
- **定规与首用**：OPT-11（约定文本）与 OPT-01（首个遵循该约定的样板 PR）的关系。**定规先行**——约定独立于代码 PR 先落地；首用随后。勿将 `codegraph impact` 输出塞入定规自身的非代码 PR（见 ADR-0005）。
- **dir≠name 不匹配**：包目录名与 `package.json` `name` 不一致的情况。当前两处：`packages/builder`→`@ubean/build`、`packages/ubean`→`ubean`（无 scope）。CI 校验须用 name 字段否则误报。
