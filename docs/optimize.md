# ubean 架构优化任务

> 来源：[architecture-analysis.md](./architecture-analysis.md)（CodeGraph 全库审计，2026-08-02）
> 范围：可维护性 / 可扩展性 / 代码质量（**不含**功能路线图，功能见 [roadmap.md](./roadmap.md)）
> 状态：`todo` · `decided`（grilling 锁定，待实施） · `doing` · `done` · `wontfix`

---

## 优先级说明

| 级别 | 含义 | 建议节奏 |
| --- | --- | --- |
| **P0** | 易造成 API/文档误用或核心链路不可观测 | 尽快落地 |
| **P1** | 明显拖累维护成本或测试信心 | 下一迭代 |
| **P2** | 工程卫生与长期扩展 | 有空 / 随 release |

---

## 总览

| ID | 优先级 | 状态 | 任务 | ADR |
| --- | --- | --- | --- | --- |
| OPT-01 | P0 | done | 消歧同名 `createUbeanApp`（Hono vs Vue）→ 重命名 Vue 工厂为 `createUbeanVueApp` | [ADR-0001](./adr/0001-rename-vue-create-ubean-app.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |
| OPT-02 | P0 | done | 构建包目录避开 CodeGraph `build/` 忽略（→ `packages/builder`） | — |
| OPT-03 | P0 | done | 文档纠偏（包数量 / 包树 / 文档导航） | — |
| OPT-04 | P1 | done | 核心包包内单测：`config` / `build`（`packages/builder`） / `cli`（快照单测 + 可度量门禁） | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) |
| OPT-05 | P1 | done | 补强 `app` init 与 `routing` 扫描边角用例（5a 纯注册断言） | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) |
| OPT-06 | P1 | done | `@ubean/server` 子路径 exports 拆分（重订理由 + 语义聚合） | [ADR-0003](./adr/0003-server-subpaths-rejustification.md) |
| OPT-07 | P1 | done | 扩展包接入契约表（派生扩展集 + prose 表 + 存在性 CI） | [ADR-0006](./adr/0006-opt07-contract-table-opt08-test-priority.md) |
| OPT-08 | P2 | done | 高扇入弱测包补测：`utils` / `modules`（纯函数必做 + resolveModules 应做） | [ADR-0006](./adr/0006-opt07-contract-table-opt08-test-priority.md) |
| OPT-09 | P1 | done | AGENTS 包树 CI 校验（package.json name 真理源 + 存在性+计数 + 仅 AGENTS） | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |
| OPT-10 | P2 | done | DevTools AI SDK 传递硬依赖治理（确认并修复，改 optionalDeps + 懒加载） | [ADR-0004](./adr/0004-devtools-ai-sdk-optional-deps.md) |
| OPT-11 | P1 | done | CodeGraph 纳入核心 PR 工作流约定（约定先行，OPT-01 首用） | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |

> **状态新增 `decided`**：决策已通过 grilling 锁定并记录为 ADR，待实施。状态流转：`todo` → `decided` → `doing` → `done`（或 `wontfix`）。

---

## P0

### OPT-01 · 消歧同名 `createUbeanApp`（已 done，见 ADR-0001）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.1-A；grilling 核查：聚合器主入口已不导出 Vue 版（选择性 export 刻意省略），AGENTS 已记录双义 |
| 真实危害 | 团队/上手心智：直接 `import { createUbeanApp } from '@ubean/runtime'` 拿到 Vue 工厂而非 Hono，与命名直觉相悖 |
| 决策 | Vue 工厂 `createUbeanApp` → **`createUbeanVueApp`**（`@ubean/runtime`）；`createUbeanApp` 专指 Hono 工厂；**硬重命名，无弃用别名，随下个 major**；`production.ts:319` 的 re-export 保持原样（Hono 版，无歧义）并显式记录 |
| 待决子项（已关闭） | **不将 `createUbeanVueApp` 纳入主 `ubean` 入口**——现状 Vue 工厂不在主入口导出，唯一消费者是内部虚拟模块；纳入会扩大对外表面，与降漂移初衷冲突（见 ADR-0005） |
| 影响面 | 真实消费者仅 `packages/vite/src/virtual-modules.ts:496` 一处；其余为 JSDoc 注释；examples/apps 零外部 import |
| CodeGraph impact 证据 | `codegraph impact createUbeanApp` 输出 8 个受影响符号（OPT-11 约定首用）：`packages/app/src/app.ts:422`（Hono 定义）、`packages/cli/src/dev.ts`（3 处 Hono 消费）、`packages/app/src/index.ts`、`packages/runtime/src/app.ts:551`（Vue 定义，本次重命名）、`packages/runtime/src/index.ts`。CodeGraph 未捕获 `packages/vite/src/virtual-modules.ts` 中的字符串引用（虚拟模块模板），由 grep 补齐 |
| 落地 | `packages/runtime/src/app.ts` 函数定义 + 错误消息重命名；`packages/runtime/src/index.ts` 导出名更新；`packages/vite/src/virtual-modules.ts` import/re-export/调用更新；`packages/runtime/src/cache-views.ts` JSDoc 更新；`packages/runtime/package.json` description 更新；`packages/ubean/src/index.ts` + `packages/ubean/src/runtime/app.ts` 注释更新；AGENTS.md 双义表更新（含 `production.ts:319` Hono 版 re-export 注明）；skills/ubean + apps/docs 中英文文档同步 |
| 验收 | `@ubean/runtime` 不再导出 Vue 版 `createUbeanApp`；主 `ubean` 入口选择性 export 仍不含 Vue 应用工厂；`pnpm -F @ubean/runtime -F @ubean/vite typecheck` 通过；AGENTS 双义表更新；AGENTS 注明 `production.ts:319` 为 Hono 版 re-export |
| ADR | [ADR-0001](./adr/0001-rename-vue-create-ubean-app.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |

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

### OPT-04 · 核心包包内单测：`config` / `@ubean/build` / `cli`（已 done）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.1-B；三包包内测试为 0 或严重依赖 examples |
| 目标 | 把配置解析、宏/虚拟模块、CLI smoke 从 e2e 中拆出，缩短反馈环 |
| 子任务 | |
| | **4a** `@ubean/config`：`test/resolvers.test.ts`（13 例）—— `resolveSsrConfig`（true/false/undefined/对象/streaming）、`resolvePrerenderConfig`（默认排除合并/enabled 派生/all+include 互斥）、`resolveRoutingConfig`（默认值/flattened 字段）、`resolveDevToolsConfig`（true/false/undefined/对象/ai 字段） |
| | **4b** `@ubean/build`（目录 `packages/builder`）：`test/macros.test.ts`（15 例）+ `test/virtual-registry.test.ts`（13 例）+ `test/virtual-modules.test.ts`（13 例）。覆盖 `stripMacros`/`transformMacros`（含 `export default definePage` reuse 场景）、`VirtualModuleRegistry`（register/load/resolveId/invalidate/clear + `defineVirtualModulePrefix` 前缀匹配+完整 id 透传）、codegen 模块（routing/pages/meta/app/locales 虚拟模块生成字符串断言 + portable 路径 + 空 fixtures + `defaultLocale=undefined → null`）。临时目录真实 Vite build 归 e2e，不进 4b |
| | **4c** `@ubean/cli`：`test/templates.test.ts`（32 例）+ `test/prepare-helpers.test.ts`（26 例）+ `test/scaffold.test.ts`（19 例）。覆盖 `renderTemplate`（嵌套/自定义定界符/null 保留/数字布尔转换）、`toKebabCase`/`toPascalCase`/`toCamelCase`、各 `render*Template`、`detectPackageManager`（锁文件优先级 pnpm>yarn>bun>npm）、`buildInstallCommand`（4 种 PM）、`extractPackageName`（scoped/非 scoped）、`getUbeanVersion`（deps/devDeps/损坏 JSON/workspace 协议）、`scaffold`/`deleteScaffold`/`recoverScaffold`（临时目录 + afterEach 清理，dry/force/已存在跳过/备份恢复/自定义 baseDir）。`prepare.ts` 4 个纯函数由模块私有改为 `export`（OPT-08 先例）。不启动 Vite/HTTP |
| 落地 | 三包均新增 `"test": "vp test"` 脚本；`@ubean/config`/`@ubean/build`/`@ubean/cli` typecheck 全通过；修复 `VirtualModuleRegistry.load` 走前缀匹配并传 id 给 `mod.load(id)`；修复 `createLocalesVirtualModule` 的 `defaultCode` 在 `defaultLocale=undefined` 时生成 `null` 而非 `undefined` |
| 验收 | `pnpm -F @ubean/config test` ✅ 13 例 / `pnpm -F @ubean/build test` ✅ 41 例 / `pnpm -F @ubean/cli test` ✅ 77 例；三包合计 131 例，单测时长 < 1s（远低于 10s 门禁）；`--passWithNoTests` 不再作掩护；CI `test` 步骤增量可由 parallelism 吸收 |
| ADR | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) |

### OPT-05 · 补强 `app` init 与 `routing` 边角（已 done）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.1-B；`createUbeanApp` / `scanProject` 标注无充分单测 |
| 目标 | 锁定请求入口与扫描约定的回归 |
| 子任务 | |
| | **5a** `@ubean/app`：`test/app-registration.test.ts`（35 例）+ `test/hooks.test.ts`（30 例）。**测试形态：纯注册断言**——对 `app.hono` 路由栈断言已挂载，**不发 HTTP 请求**。覆盖构造器同步挂载 `/_health` + routeRules/cache/isr 中间件；`init()` 异步挂载 `POST /__actions` + `POST /__server-component` + OpenAPI 路由（`/_openapi.json` / `/_scalar`，含自定义路径/`false`/`undefined`）；`lazyInit`/`resetInit` 幂等性；plugins setup/ready 生命周期（顺序/异步/无钩子）；hooks 触发顺序（created → before:register → after:register）；路由方法链式调用（`use`/`get`/`post`/`on`）；`createUbeanApp` 工厂 |
| | **5b** `@ubean/routing`：5 个测试文件共 129 例。`test/matchers.test.ts`（64 例）—— `defineMatcher` 注册表 API + `validateParams` 校验逻辑（pass/reject/unregistered/throws/array/falsy）+ `createMatcherGuard` 导航守卫 + `parseMatchers` `[id=matcher]` 语法 + `filePathToRoute` 集成 + 真实场景（numeric/uuid/slug/base64）。`test/parallel-intercept.test.ts`（14 例）—— `extractSlotAndIntercept` parallel `@slot` + intercept `(..)`/`(.)`/`(...)` + 组合 + passthrough。`test/special-pages-and-reuse.test.ts`（17 例）—— 特殊页检测（404/loading/error，含 `.vue`/`.ts`/`.md` + 嵌套非特殊页 + 无特殊页）+ reuse 路由扫描（isReuse/reuseTarget/target 校验/cache 继承/显式覆盖/多 reuse 复用同一 target）+ 特殊页与 reuse 混合。`test/route-name.test.ts`（23 例）—— `generateRouteName`（根路径/静态/kebab/动态参数 `[id]`/catch-all `[...slug]`/optional `[[page]]`/route groups/多段 group/尾部斜杠/复杂组合）+ `generateLayoutName`（default 特殊保留/普通/多段/kebab/下划线）+ `generateApiRouteId`（method 小写/动态参数/根路径/catch-all/大小写不敏感）。`test/nested-layouts.test.ts`（11 例）—— `extractDefinePageFromCode` 嵌套布局（数组/单字符串/`false`/`default` 处理/无效条目过滤/空数组/单元素） |
| 落地 | `@ubean/app` 新增 `"test": "vp test"` 脚本；`@ubean/routing` 已有测试脚本。修复 `scanProject` 中 404 特殊页命名不一致：`routeToName('/404')` 返回 `'404'`（数字段不 capitalize），但运行时约定为 `'NotFound'`（`virtual-modules.ts` 硬编码 `name: 'NotFound'`、`router.ts` 硬编码 `component: 'NotFound'`），scan 侧特判 `pageBase === '404' → 'NotFound'` 对齐 |
| 验收 | `pnpm -F @ubean/app test` ✅ 65 例 / `pnpm -F @ubean/routing test` ✅ 129 例；两包合计 194 例；`pnpm -F @ubean/routing typecheck` ✅ / `pnpm -F @ubean/build typecheck` ✅（确认 notFoundPage.name 变更不破坏 production.ts 序列化）；5a 不引入 supertest/HTTP 集成测；改 `registerRoutes` / `scanProject` 时 CI 能在 examples 外先红 |
| ADR | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) |

### OPT-06 · `@ubean/server` 子路径 exports（重订理由 + 语义聚合，已 done，见 ADR-0003）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.2-D；grilling 证伪 tree-shaking 半边（barrel 是函数 re-export 可 tree-shake；重依赖 unstorage/db0/crossws 已在子模块内 `import()` 动态加载，未入静态 `dependencies`） |
| 目标 | **重订为唯一理由**：心智模型 + `tsc`/IDE 类型解析成本。**删除 tree-shaking / bundle 体积论述**。暂不拆 npm 包名 |
| 方案 | `package.json` `exports` 新增**语义聚合子路径**（与内部文件非 1:1）：`./cache`（cache+cache-directive）、`./db`（database）、`./realtime`（websocket+sse）、`./security`（security-headers+csrf+sessions）、`./queue`、`./cron`（cron+cron-scheduler）、`./storage`、`./observability`、`./email`、`./analytics`（analytics+feature-flags）、`./static`、`./middleware`（cors+rate-limit+after+fetch-memo+draft-mode+single-flight）；新增聚合入口文件；主入口 barrel 保持 re-export 兼容，但标注为便利入口 |
| 落地 | 新增聚合入口：`realtime.ts`/`security.ts`/`middleware.ts`（新文件名无冲突）+ `cache-entry.ts`/`cron-entry.ts`/`analytics-entry.ts`（与现有文件名冲突，用 `-entry` 后缀）；1:1 子路径（`./db`/`./queue`/`./storage`/`./observability`/`./email`/`./static`）直接映射现有文件；`vite.config.ts` `pack.entry` 新增全部入口；`package.json` `exports` 新增 13 个子路径；AGENTS §2.3 补子路径索引表 |
| 验收 | 子路径可独立导入且类型正确；`pnpm -F @ubean/server build` + `typecheck` 通过；主入口行为不变（barrel re-export 未改动）；AGENTS 补子路径索引表，barrel 标注为便利入口 |
| ADR | [ADR-0003](./adr/0003-server-subpaths-rejustification.md) |

### OPT-07 · 扩展包接入契约表（已 decided，见 ADR-0006）

| 字段 | 内容 |
| --- | --- |
| 状态 | decided（待实施） |
| 依据 | 分析 §6.2-G；grilling 跨 pwa/auth/ui 核查：异构性（ui 无 ./runtime、核心依赖形态 hard/peer 不一） |
| 目标 | 统一 `auth` / `icon` / `pwa` / `image` / `content` / `fonts` / `electron` / `pinia` / `ui` 的接入形态 |
| 交付物 | `engineering.md` 中的人工策展 prose 表，6 列：`config key` → `/vite` 插件 → runtime 入口（允许「—」）→ peerDeps → **核心依赖形态（hard / peer / optional-peer）** → 默认行为。核心依赖形态三值：hard（`dependencies` 自动装，如 pwa 的 vite-plugin-pwa、auth 的 better-auth）/ peer（`peerDependencies` 非 optional，用户必装，如 ui 的 @soybeanjs/ui）/ optional-peer（optional:true） |
| 扩展集真理源 | **派生**：CI 从 `packages/*/package.json` 中找出有 `./vite` 导出 **且不在主包 `ubean` 的 `dependencies` 中** 的包作为扩展集，不硬编码列表（实现期细化：原规则过度派生核心包，详见 ADR-0006） |
| 验收 | 契约表覆盖全部派生扩展包（有 `./vite` 导出者）；缺行时 CI 失败；三值核心依赖形态列填齐；与 OPT-09 共用 CI 脚本 |
| ADR | [ADR-0006](./adr/0006-opt07-contract-table-opt08-test-priority.md) |

---

## P2

### OPT-08 · 高扇入弱测包：`utils` / `modules`（已 done，见 ADR-0006）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.3-H；`@ubean/utils` 扇入 9、`modules` 被 build/cli/dev-server 依赖 |
| 目标 | 为纯函数与模块解析补最小单测，降低隐式回归 |
| 优先级 | **必做（P）**：纯函数——`modules` 的 `topologicalSort`/`extractPackageName`/`isModuleDefinition`/`isVitePlugin`/`extractPlugins`/`getModuleKey`/`getModuleName`；`utils` 的 glob 匹配（`matchGlob`/`matchAnyGlob`，高扇入）、path、string 主路径。**应做（S）**：`resolveModules` 集成测（fixture 模块，锁 builtin-skip + 用户模块解析 + 去重 + topo 排序回归） |
| 落地 | `@ubean/utils`：新增 `test/glob.test.ts`（16 例）、`test/path.test.ts`（36 例）、`test/string.test.ts`（6 例），共 58 例；`package.json` 新增 `"test": "vp test"` 脚本。`@ubean/modules`：将 `extractPackageName`/`isModuleDefinition`/`isVitePlugin`/`getModuleKey`/`getModuleName`/`extractPlugins` 由模块私有改为 `export`（纯函数，扩展 API 表面可接受，便于单测与外部复用）；新增 `test/pure-functions.test.ts`（45 例）、`test/resolve-modules.test.ts`（7 例：builtin-skip / 对象形式 ModuleDefinition / 去重 / topo 排序回归 / 空 modules / 字符串形式加载失败 / 元组 factory），共 52 例 |
| 验收 | 两包各有可运行 vitest 套件（`pnpm -F @ubean/utils test` ✅ 58 例 / `pnpm -F @ubean/modules test` ✅ 52 例）；纯函数主路径+边界覆盖；`resolveModules` 含 builtin-skip + 去重 + topo 排序回归用例；`--passWithNoTests` 不再作掩护；`pnpm -F @ubean/modules typecheck` ✅ |
| ADR | [ADR-0006](./adr/0006-opt07-contract-table-opt08-test-priority.md) |

### OPT-09 · AGENTS 包树 CI 校验（enabler，P2→P1，领头序列，已 done）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.3-I；曾出现 40 / 38 / 37 文档不一致；OPT-03 刚手工修复漂移，缺护栏则重演 |
| 目标 | 防止 AGENTS 包树再次漂移 |
| 方案 | **真理源 = `packages/*/package.json` 的 `name` 字段**（非目录名——`builder`≠`@ubean/build`、`ubean` 无 scope）。**存在性 + 计数**：读全部包名，断言每个出现在 `AGENTS.md` 且计数（37）一致。不解析树结构、不生成清单文件。**校验范围仅 `AGENTS.md`**（README 不纳入，避免三处同步漂移）。挂 `.github/workflows/ci.yml` test 步骤后 |
| 落地 | `scripts/verify-packages.mjs`（与 OPT-07 共用，扩展集派生规则细化见 ADR-0006）；`.github/workflows/ci.yml` 新增 `Verify package tree & extension contract` 步骤；负向用例（删 `@ubean/pinia` + 改包数 37→36）确认 CI 红灯 |
| 验收 | 故意删改 AGENTS 包名/包数时 CI 失败；`builder`→`@ubean/build` 类 dir≠name 不误报；release checklist 含「同步 AGENTS 截至日期」；与 OPT-07 契约表校验共用脚本 |
| ADR | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |

### OPT-10 · DevTools AI SDK 传递硬依赖治理（确认并修复，已 done，见 ADR-0004）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02） |
| 依据 | 分析 §6.2-F；grilling **确认**（非评估）：`ubean → @ubean/devtools → ai@7.0.40 + @ai-sdk/openai-compatible@3.0.16` 全为硬 `dependencies`，故每次 `npm install ubean` 传递安装 Vercel AI SDK |
| 目标 | 明确 `client/` 与 Node RPC 边界，大功能 lazy 化；**移除 AI SDK 传递硬依赖** |
| 子任务 | 依赖方向审计（UI → Node 禁止）；**`@ubean/devtools` 将 `ai` / `@ai-sdk/openai-compatible` 从 `dependencies` 移至 `optionalDependencies`，AI scaffold 代码改动态 `import()` + 缺失依赖优雅降级**；保留 `ubean` → devtools re-export 不变（膨胀源是 devtools 自身硬依赖，非 re-export）；同步核查 CRUD scaffold 是否有同类非必要硬依赖 |
| 落地 | `packages/devtools/package.json`：`ai` 与 `@ai-sdk/openai-compatible` 从 `dependencies` 移至 `optionalDependencies`（版本锁定 `7.0.40` / `3.0.16` 保留）；`packages/devtools/src/server/ai.ts`：`callLlmApi` 改为运行时 `await Promise.all([import('ai'), import('@ai-sdk/openai-compatible')])`，捕获失败并抛出含安装指引的错误（"需手动安装 `ai` 与 `@ai-sdk/openai-compatible`"）；`buildAiSdkTools` 已用 `await import('ai')`；顶部仅保留 `import type { ModelMessage, ToolSet } from 'ai'`（类型擦除，无运行时依赖）；CRUD scaffold 经核查无同类硬依赖问题；`pnpm install` lockfile 已更新；`pnpm -F @ubean/devtools typecheck` + `build:server` 通过 |
| 验收 | `@ubean/devtools` 的 `dependencies` 不再含 AI SDK（仅 `hookable`/`pathe`）；`optionalDependencies` 含 `ai`/`@ai-sdk/openai-compatible`；不装 AI SDK 时框架启动与普通 DevTools 正常，仅触发 AI scaffold 时报清晰错误；装齐后行为与改动前一致；typecheck + build 通过 |
| ADR | [ADR-0004](./adr/0004-devtools-ai-sdk-optional-deps.md) |

### OPT-11 · CodeGraph 纳入核心 PR 工作流（enabler，P2→P1，领头序列，已 done）

| 字段 | 内容 |
| --- | --- |
| 状态 | done（2026-08-02，约定文本落地） |
| 依据 | 分析 §6.3-J；OPT-02 已使 `packages/builder` 可 impact；codegraph CLI 已确认可用（v1.5.0）；OPT-01 的 blast radius 本次靠人工 grep，应由 graph 供给 |
| 目标 | 改核心符号时有统一影响面检查习惯 |
| 交付物 | `engineering.md` §10 中的约定文本（无 CONTRIBUTING.md，落 `apps/docs/.../architecture/engineering.md`）。**约定先行**——独立于代码 PR 先落地 |
| 约定 | 改 `defineHandler` / `scanProject` / `registerRoutes` / `ubeanPlugin` / macros / `createUbeanApp` / `createUbeanVueApp` / `resolveModules` 时：`codegraph sync && codegraph impact <symbol>`，PR 描述附简要 blast radius |
| 时序 | **定规（OPT-11）先行，首用（OPT-01）随后**：OPT-01 重命名 PR 作为首个「遵循」该约定的样板（`codegraph impact createUbeanApp` 结果附入 PR）。勿混淆「定规」与「首用」 |
| 落地 | `engineering.md` §10 已含三小节：10.1 何时执行（核心符号清单）/ 10.2 执行步骤 / 10.3 与 PR 的关系（定规与首用分离） |
| 验收 | `engineering.md` 含 codegraph 工作流约定段落；OPT-01 PR 描述附 `codegraph impact createUbeanApp` 结果 |
| ADR | [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md) · [ADR-0005](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) |

---

## 建议执行顺序

> 经 grilling 重排：enabler 领头，证据/护栏先行。详见 [ADR-0002](./adr/0002-sequencing-enablers-and-test-boundaries.md)。

```
OPT-09 (包树 CI 校验)          ← enabler 护栏，P2→P1，先行
OPT-11 (CodeGraph 进 PR 流)     ← enabler 证据层，P2→P1，先行
  → OPT-01 (createUbeanApp 消歧，已 decided，ADR-0001)
  → OPT-04 (config / @ubean/build / cli 单测，ADR-0002)
  → OPT-05 (app + routing 补测，ADR-0002)
  → OPT-06 (server 子路径，ADR-0003)
  → OPT-07 (扩展契约表，含核心依赖形态列；与 OPT-09 共用 CI 脚本)
  → OPT-08 / OPT-10（可并行；OPT-10 见 ADR-0004）
```

要点：
- **OPT-09 / OPT-11 由 P2 提前为 P1 并领头**：OPT-09 防止 OPT-03 类漂移重演，OPT-11 为后续改动提供 `codegraph impact` 证据（OPT-01 的 blast radius 本次靠人工 grep，后续应改由 graph 供给）。
- **OPT-07 与 OPT-09 共用 CI 脚本**：同一脚本既校验包树，也校验扩展契约表覆盖全部扩展包。
- 已完成的 OPT-02 / OPT-03 为后续任务提供文档与索引基线，无需回滚。

---

## 关联文档

| 文档 | 用途 |
| --- | --- |
| [architecture-analysis.md](./architecture-analysis.md) | 审计原文与证据 |
| [roadmap.md](./roadmap.md) | 功能实现规划（与本文件正交） |
| [AGENTS.md](../AGENTS.md) | API 速查（随 OPT-01 / OPT-06 / OPT-07 更新） |
| [engineering.md](../apps/docs/src/content/zh/architecture/engineering.md) | 工程规范（OPT-07 / OPT-11 落点） |
| [glossary.md](./glossary.md) | grilling 沉淀的术语表（应用工厂 / barrel / enabler / 注册断言 / 核心依赖形态 等） |
| [adr/0001-rename-vue-create-ubean-app.md](./adr/0001-rename-vue-create-ubean-app.md) | OPT-01 决策：Vue 工厂重命名 `createUbeanVueApp` |
| [adr/0002-sequencing-enablers-and-test-boundaries.md](./adr/0002-sequencing-enablers-and-test-boundaries.md) | OPT-04/05/09/11 决策：enabler 领头 + 测试边界 + 可度量门禁 |
| [adr/0003-server-subpaths-rejustification.md](./adr/0003-server-subpaths-rejustification.md) | OPT-06 决策：重订理由 + 语义聚合子路径 |
| [adr/0004-devtools-ai-sdk-optional-deps.md](./adr/0004-devtools-ai-sdk-optional-deps.md) | OPT-10 决策：AI SDK 改 optionalDeps + 懒加载 |
| [adr/0005-opt09-impl-opt11-timing-opt01-subitem.md](./adr/0005-opt09-impl-opt11-timing-opt01-subitem.md) | OPT-09 实现 + OPT-11 时序 + OPT-01 待决子项收尾 |
| [adr/0006-opt07-contract-table-opt08-test-priority.md](./adr/0006-opt07-contract-table-opt08-test-priority.md) | OPT-07 契约表设计 + OPT-08 测试优先级 |
