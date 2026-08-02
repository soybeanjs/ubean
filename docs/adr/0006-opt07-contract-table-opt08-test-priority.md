# ADR-0006 · OPT-07 扩展契约表设计 + OPT-08 测试优先级

- **状态**: implemented（OPT-07 + OPT-08，2026-08-02）
- **日期**: 2026-08-02
- **关联任务**: OPT-07、OPT-08
- **决策者**: grilling 会话（用户 + 助手）

## 背景

### OPT-07

契约表 schema 此前已部分决定（config key → /vite 插件 → runtime 入口 → peerDeps → 核心依赖形态 → 默认行为）。grilling 跨三包核查（`@ubean/pwa` / `@ubean/auth` / `@ubean/ui`）发现：

- **异构性**：`@ubean/ui` 无 `./runtime` 子路径（须允许「—」）；其核心库 `@soybeanjs/ui` 为**强制 peer**（非 optional），与 pwa/auth 的核心库硬依赖自动安装不同。「核心依赖形态」列正捕此不一致。
- **「扩展包」集合的真理源未定**：硬编码列表会与被护栏保护的文档同病。

### OPT-08

`@ubean/utils` re-export 5 个纯模块（path/port/string/vite-config/glob）。`@ubean/modules` 核心 `resolveModules` 异步复杂（builtin-skip + 用户模块解析 + 去重 + topo 排序，回归易发），另含多个纯辅助函数（`topologicalSort`、`extractPackageName`、`isModuleDefinition`/`isVitePlugin`/`extractPlugins`）。原验收「覆盖公开 API 主路径与边界」未排优先级。

## 决策

### 1. OPT-07 扩展契约表设计

- **「扩展包」集合真理源 = 派生**：CI 从 `packages/*/package.json` 中找出有 `./vite` 子路径导出 **且不在主包 `ubean` 的 `dependencies` 中**（且非主包自身）的包作为扩展集（auth/ui/pwa/icon/image/content/fonts/electron/pinia 等 9 个）。不硬编码列表。
- **派生规则细化（实现期发现）**：原规则「有 `./vite` 子路径导出」过度派生——`@ubean/actions` / `@ubean/build` / `@ubean/islands` 同样有 `./vite` 导出但属核心 hard dep，应排除。细化规则与 AGENTS §2.1「扩展包不进入主包硬依赖」对齐：读 `packages/ubean/package.json` 的 `dependencies` 字段，凡在其中者即核心包，不视为扩展。
- **契约表形式 = 人工策展 prose 表**（落 `engineering.md`）：6 列，允许「—」（如 `@ubean/ui` 的 runtime 入口）。「默认行为」本就是 prose 性质，结构化字段不好装。
- **CI 校验 = 存在性检查**：对每个派生出的扩展包名，断言其出现在 `engineering.md` 契约表段。缺行即失败。
- **与 OPT-09 共用 CI 脚本**：同一脚本读 `packages/*/package.json`，既做 OPT-09 包名校验，也做 OPT-07 扩展覆盖校验（按细化规则派生扩展集）。
- **核心依赖形态列三值**：hard（`dependencies`，自动装）/ peer（`peerDependencies` 非 optional，用户必装）/ optional-peer（`peerDependencies` + optional:true）。示例：pwa 的 `vite-plugin-pwa`=hard、auth 的 `better-auth`=hard、ui 的 `@soybeanjs/ui`=peer。

### 2. OPT-08 测试优先级

- **必做（P）**：纯函数单测——
  - `@ubean/modules`：`topologicalSort`、`extractPackageName`、`isModuleDefinition`/`isVitePlugin`/`extractPlugins`、`getModuleKey`/`getModuleName`。
  - `@ubean/utils`：glob 匹配（`matchGlob`/`matchAnyGlob`，路由/prerender/SSR exclude 高扇入）、path、string 主路径。
- **应做（S）**：`resolveModules` 集成测——用 fixture 模块锁定 builtin-skip、用户模块解析、去重、topo 排序回归。
- 两包各建可运行 vitest 套件；`--passWithNoTests` 不再作掩护。

## 影响面

| 项 | 变更 |
| --- | --- |
| OPT-07 | 设计钉死：派生扩展集 + prose 表 + 存在性 CI；6 列含「核心依赖形态」三值 |
| OPT-08 | 优先级钉死：纯函数必做 + resolveModules 应做 |
| `optimize.md` | OPT-07/08 验收更新；总览表补 ADR 列 |

## 验收（细化）

- OPT-07：`engineering.md` 契约表覆盖全部派生扩展包（有 `./vite` 导出者）；缺行时 CI 失败；三值核心依赖形态列填齐。
- OPT-08：`@ubean/utils` / `@ubean/modules` 各有可运行 vitest 套件；纯函数主路径+边界覆盖；`resolveModules` 至少有 builtin-skip + 去重 + topo 排序回归用例。

## OPT-07 实施记录（2026-08-02）

| 项 | 实施情况 |
| --- | --- |
| 契约表 | `engineering.md` §11 新增四小节：11.1 契约表（6 列 × 9 行，覆盖全部派生扩展包）+ 11.2 核心依赖形态四值说明 + 11.3 已识别的不一致（hard 与 peer 混用）+ 11.4 新增扩展包清单（3 步骤） |
| 派生规则 | `scripts/verify-packages.mjs` 读 `packages/ubean/package.json` 的 `dependencies` 排除核心包，派生出 9 个扩展包：auth/icon/pwa/image/content/fonts/electron/pinia/ui |
| 核心依赖形态四值 | hard（auth: better-auth, pwa: vite-plugin-pwa, electron: vite-plugin-electron）/ peer（pinia: pinia, ui: @soybeanjs/ui）/ optional-peer（各包对 vite/vue）/ none（icon/image/content/fonts 仅工具函数依赖） |
| CI 校验 | `.github/workflows/ci.yml` 含 `Verify package tree & extension contract` 步骤；`scripts/verify-packages.mjs` 与 OPT-09 共用，既校验 AGENTS 包树又校验 engineering.md 扩展覆盖 |
| 验证 | `node scripts/verify-packages.mjs` ✅（37 包，9 扩展，全部覆盖） |

## OPT-08 实施记录（2026-08-02）

| 项 | 实施情况 |
| --- | --- |
| `@ubean/utils` 测试 | 新增 `test/glob.test.ts`（16 例，覆盖字面量/`**`/`*`/正则转换 + `matchAnyGlob`）、`test/path.test.ts`（36 例，覆盖 `stripRouteGroups`/`parseMatchers`/`filePathToRoute`/`normalizePath`/`getDirname`/`getBasename`/`getExtension`/`getStem`/`pathToTitle`）、`test/string.test.ts`（6 例，覆盖 `capitalize` 主路径+边界）。共 58 例，全部通过。`package.json` 新增 `"test": "vp test"` 脚本 |
| `@ubean/modules` 纯函数导出 | `extractPackageName`/`isModuleDefinition`/`isVitePlugin`/`getModuleKey`/`getModuleName`/`extractPlugins` 由模块私有改为 `export`——纯函数，扩展 API 表面可接受，便于单测与外部复用 |
| `@ubean/modules` 纯函数测试 | 新增 `test/pure-functions.test.ts`（45 例，覆盖上述 6 函数 + `topologicalSort`：空数组/无依赖/链式/菱形/循环/不存在依赖） |
| `@ubean/modules` 集成测试 | 新增 `test/resolve-modules.test.ts`（7 例：builtin-skip / 对象形式 ModuleDefinition 含 setup / 去重 / topo 排序回归 / 空 modules / 字符串形式加载失败静默跳过 / 元组 [factory, options] 形式） |
| 验证 | `pnpm -F @ubean/utils test` ✅ 58 例 / `pnpm -F @ubean/modules test` ✅ 52 例 / `pnpm -F @ubean/modules typecheck` ✅ |

### 测试发现的行为细节（已锁定为回归基线）

- `stripRouteGroups('/about/(marketing)')` 返回 `'/about/'`（尾部路由组的前置 `/` 保留）——`ROUTE_GROUP_TRAILING_REGEX` 只剥离 `(name)`，不处理前置斜杠。已加注释锁定。
- `getStem('a/b/c.ts')` 返回 `'a/b/c'`（非 `'c'`）——`getStem` 直接对入参做 `replace`，不先提取 basename。已加注释锁定。
- 元组 `[factory, options]` 中，箭头函数赋值给 `const` 时 `.name` 取变量名（如 `const anon = () => []` → `anon.name === 'anon'`）；要命中「匿名 factory」分支需 `Object.defineProperty(fn, 'name', { value: '' })`。测试已据此处理。
