# ADR-0006 · OPT-07 扩展契约表设计 + OPT-08 测试优先级

- **状态**: implemented（OPT-07 + OPT-08，2026-08-02）
- **日期**: 2026-08-02
- **修订**: 2026-09-27（删除实施记录 / 影响面 / 验收；核心依赖形态统一为四值；修正死包名）
- **关联任务**: OPT-07、OPT-08
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。契约表正文见 `apps/docs/src/content/{zh,en}/contributing/engineering.md` §11。

## 背景

### OPT-07

契约表 schema 此前已部分决定（config key → `/vite` 插件 → runtime 入口 → peerDeps → 核心依赖形态 → 默认行为）。grilling 跨包核查发现：

- **异构性**：`@ubean/integrations/ui` 无 `./runtime` 子路径（须允许「—」）；其核心库 `@vean/ui` 为**强制 peer**（非 optional），与 `@ubean/auth` / `@ubean/integrations/pwa` 的核心库硬依赖自动安装不同。「核心依赖形态」列正捕此不一致。
- **「扩展包」集合的真理源未定**：硬编码列表会与被护栏保护的文档同病。

### OPT-08

`@ubean/shared` 承载原 `@ubean/utils` 的纯模块（path / port / string / vite-config / glob —— 2026-08 包结构重构后的归属）。模块系统的 `resolveModules`（`packages/config/src/modules/`）异步复杂（builtin-skip + 用户模块解析 + 去重 + topo 排序，回归易发），另含多个纯辅助函数（`topologicalSort`、`extractPackageName`、`isModuleDefinition` / `isVitePlugin` / `extractPlugins`）。原验收「覆盖公开 API 主路径与边界」未排优先级。

## 决策

### 1. OPT-07 扩展契约表设计

- **「扩展包」集合真理源 = 派生**（实现于 `scripts/verify-packages.mjs`，与 OPT-09 共用同一脚本）。从 `packages/*/package.json` 取同时满足以下四条者：
  1. 有 `./vite` 子路径导出；
  2. 不是主包 `ubean` 自身；
  3. 不在 `packages/ubean/package.json` 的 `dependencies` 中（排除 `@ubean/build` / `@ubean/islands` 这类同样有 `./vite` 导出但属核心 hard dep 的包）；
  4. 不在内核排除集内（`CORE_VUE_VITE_PKGS = { '@ubean/vue' }` —— 客户端内核虽提供 `./vite`，但经 `@ubean/client` / `@ubean/scan` 传递依赖，属框架必需内核而非按需扩展）。

  不硬编码列表。此规则与 AGENTS.md §2.1「扩展包不进入主包硬依赖」对齐。
- **契约表形式 = 人工策展 prose 表**（落 `contributing/engineering.md` §11）：6 列，允许「—」（如 `@ubean/integrations/ui` 的 runtime 入口）。「默认行为」本就是 prose 性质，结构化字段不好装。
- **CI 校验 = 存在性检查**：对每个派生出的扩展包名，断言其出现在 `contributing/engineering.md` 契约表段。缺行即失败。
- **核心依赖形态四值**（此处为唯一定义处，取代原「三值」措辞）：
  - **hard**：核心库在 `dependencies`，装扩展即自动安装（`@ubean/auth` 的 `better-auth`、`@ubean/integrations/pwa` 的 `vite-plugin-pwa`、`@ubean/integrations/electron` 的 `vite-plugin-electron`）；
  - **peer**：核心库在 `peerDependencies` 且**非** optional，用户必须自装（`@ubean/integrations/pinia` 的 `pinia`、`@ubean/integrations/ui` 的 `@vean/ui`）；
  - **optional-peer**：在 `peerDependencies` 且 `optional: true`（各扩展包对 vite / vue）；
  - **none**：无重核心库，仅工具函数依赖（`@ubean/icon` / `@ubean/image` / `@ubean/content` / `@ubean/integrations/fonts`）。

  > `engineering.md` §11.2 的**标题**仍写「三值」而正文列四项 —— 标题是历史残留，四值口径以本 ADR 为准（站点正文不在本 ADR 的写入范围内）。

### 2. OPT-08 测试优先级

- **必做（P）**：纯函数单测 ——
  - 模块系统（`@ubean/config`）：`topologicalSort`、`extractPackageName`、`isModuleDefinition` / `isVitePlugin` / `extractPlugins`、`getModuleKey` / `getModuleName`；
  - `@ubean/shared`：glob 匹配（`matchGlob` / `matchAnyGlob`，路由 / prerender / SSR exclude 高扇入）、path、string 主路径。
- **应做（S）**：`resolveModules` 集成测 —— 用 fixture 模块锁定 builtin-skip、用户模块解析、去重、topo 排序回归。
- 两处各建可运行 vitest 套件；`--passWithNoTests` 不再作掩护。

## 附记 · 已锁定的行为细节（回归基线，保留）

这些是测试锁定的真实语义（不是实现流水账），迁移后仍成立，仅归属路径变了：

- `stripRouteGroups('/about/(marketing)')` 返回 `'/about/'`（尾部路由组的前置 `/` 保留）—— 只剥离 `(name)`，不处理前置斜杠。该函数随路由路径工具下沉到 `@ubean/vue`（`packages/vue/src/route-path.ts`，经 `@ubean/scan` re-export）。
- `getStem('a/b/c.ts')` 返回 `'a/b/c'`（**非** `'c'`）—— `getStem` 直接对入参做 `replace`，不先提取 basename（`@ubean/shared`）。
- 元组 `[factory, options]` 中，箭头函数赋给 `const` 时 `.name` 取变量名（`const anon = () => []` → `anon.name === 'anon'`）；要命中「匿名 factory」分支需 `Object.defineProperty(fn, 'name', { value: '' })`。测试已据此处理。
