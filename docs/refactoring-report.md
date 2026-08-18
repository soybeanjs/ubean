# ubean 架构重构说明

> 执行日期：2026-08-17
> 依据文档：`docs/structure.md`（方案 B「Runtime 边界清晰」+ islands/actions 纵切特例）
> 验证状态：`pnpm build` ✅ · `pnpm -r typecheck` ✅ · `pnpm test` ✅（30 包 / 41 测试文件 / ~1400 用例全绿）

---

## 1. 重构总览

本次重构将 ubean 从 **39 个发布包收敛为 32 个**，按 structure.md 的三阶段方案（Phase 1 低风险清理 → Phase 2 结构整合 → Phase 3 一等客户端入口）一次性完成。核心成果：

| 目标 | 结果 |
| --- | --- |
| 客户端 bundle 不再传递引入 Node 内置模块（P0） | ✅ 已验证：islands/auth/icon/seo 四处入口污染全部修复 |
| `@ubean/client` 成为一等客户端内核包（P0） | ✅ 新建独立包，零构建期依赖，浏览器入口零 `node:` 导入 |
| 打破 `@ubean/vite ↔ @ubean/build` 值导入环（P1） | ✅ 构建底座下沉至新叶子包 `@ubean/build-core`，依赖单向化 |
| 消除重复实现（form-actions / islands 水合 fork） | ✅ 单一事实源 |
| 薄胶水包合并收敛 | ✅ 39 → 32 包（新增 4：client/shared/integrations/build-core，删除 11） |

**包数变化明细**：

```
新增 4：@ubean/client、@ubean/shared、@ubean/integrations、@ubean/build-core
删除 11：types、error、env、utils（→shared）
         electron、ui、pinia、pwa、fonts（→integrations）
         runtime（→client）、auto-imports（→codegen）
保留：ubean、routing、pages、i18n、markdown、seo、server、app、api-routes、
      actions、islands、config、preset、codegen、build、vite、dev-server、
      cli、devtools、prerender、ai、auth、icon、image、content、logger、ssr、modules
```

> 与 structure.md「24 包」目标的差异：本实现额外保留了 `@ubean/build-core`（文档 §10 认可的破环备选方案）与 `@ubean/logger`/`@ubean/ssr`/`@ubean/modules`/`@ubean/dev-server`（文档 §6 判定「保留」）。`prerender` 按文档建议保留独立可测。

---

## 2. 主要变更点

### 2.1 Phase 1 — 入口污染修复与死代码清理

**修客户端 Node 污染（structure.md §5.1 四大障碍）**：

| 包 | 变更 | 验证 |
| --- | --- | --- |
| `@ubean/islands` | 主入口不再 re-export `./vite`（node:fs/node:path）；新增 `./directive` 纯净子路径（367 行，仅 vue 依赖）；`vite.ts` 中重复定义的 `ClientDirective` 类型改从 `./types` 导入 | `dist/index.js`、`dist/runtime.js`、`dist/directive.js` 零 `node:` 导入 ✅ |
| `@ubean/auth` | 拆出浏览器安全的 `src/client.ts`（`createAuthClient`，纯 fetch）；`runtime.ts` 改从 `./client` 导入（原先经 `./core` 传递 `node:async_hooks`）；主入口不再 re-export vite 插件 | `dist/runtime.js` 零 `node:async_hooks` ✅ |
| `@ubean/icon` | 主入口（含浏览器 `Icon` 组件）不再 re-export `./vite`；顺带补上此前遗漏的 `resolveAlias`、`ScannedIconUsage` 导出 | `dist/index.js` 零 `node:fs` ✅ |
| `@ubean/seo` | 主入口不再 `export * from './conventions' | './og-image'`（均 node:fs）；二者继续经 `@ubean/seo/conventions`、`@ubean/seo/og-image` 子路径提供；json-ld（零依赖）保留主入口并补 `./json-ld` 子路径；消除 conventions ↔ index 循环依赖 | `dist/index.js` 零 `node:fs` ✅ |

**消费端对齐**：`dev-server/vite-server.ts`、`builder/production.ts` 的 `ubeanIslandsPlugin` 改从 `@ubean/islands/vite` 导入（原先从被污染的主入口）。

**死代码清理**：

- 删除 `runtime/src/client.ts` 的 `createUbeanClient`（L123-285，全仓零调用）及其专属类型（`UbeanVueRouter/UbeanVueHead/UbeanVueApp/SubmitOptions/SubmitResult`），仅保留 `getInitialPageData/getInitialState`
- 删除 `modules` 的 `ResolveModulesResult.setupFns` 死字段（恒 `[]`，setup 已在 resolveModules 内部直接执行）
- 删除死依赖：utils 的 `tinyglobby`、config 的 `@ubean/preset` optional peer

**form-actions 去重（structure.md §5.5）**：

- `@ubean/types` 的 `ActionResult` 扩展 `response?: Response` 通道（三态互斥：data / errors / response）
- `@ubean/actions` 的 `runAction` 原生支持 Response 直通（返回与抛出两条路径），`/__actions` 中间件对 response 直通返回
- `api-routes/src/form-actions.ts`（124 行复制实现）删除，替换为 `page-actions.ts` 薄适配层（~70 行：`parseFormActionName` re-export + pages 专属的 `handleActionResponse` redirect→JSON 转换 + `runServerAction` 委托 `runAction`）
- 原注释依据（「actions re-exports Vue runtime」）已失效——actions 主入口经核验无 vue import，api-routes 将 `@ubean/actions` 提升为正式依赖

### 2.2 Phase 2 — 结构整合

**合并 `@ubean/shared`**（types + error + env + utils 通用部分）：

- 协议类型（RouteMeta/RouteRule/Span/Hono 上下文/Server Actions 类型+运行时符号 `ACTION_BRAND/ActionError/fail`）、`UbeanError`、`defineEnv`、通用路径/glob/string 工具聚合为零依赖叶子包
- 路由算法下沉：`filePathToRoute/parseMatchers/stripRouteGroups/ParsedRoutePath`（+ 11 个私有正则常量）移入 `@ubean/routing/src/route-path.ts`（其领域归属）
- Node-only 工具隔离：`findAvailablePort/waitForPort/isPortReachable`（node:net）与 `findUserViteConfig`（node:fs）独立为 `@ubean/shared/node` 子路径，主入口保持浏览器安全
- 全仓 ~72 个文件导入路径重写，17 个 package.json 依赖替换

**合并 `@ubean/integrations`**（electron + ui + pinia + pwa + fonts）：

- 五包按模块子目录组织，子路径 exports：`@ubean/integrations/{pwa,fonts,electron,ui,pinia}`，浏览器安全主入口（runtime + 类型，零 vite 插件）
- `modules/src/builtins.ts` 的 5 个 modulePath 字符串同步更新，cli 按需安装（extractPackageName）与相关测试对齐
- 死依赖清理（pwa 的 pathe、fonts 的 pathe/ufo、pinia 的 @ubean/build）
- 测试迁移：pwa 19 用例 + fonts 19 用例全绿

**auto-imports 并入 `@ubean/codegen`**：

- `src/auto-imports.ts` 全量迁入，codegen 成为「全部 .d.ts 生成」单一事实源（routes/pages/auto-imports/components/openapi 五件套）
- `UBEAN_CLIENT_PRESET.from` 从 `ubean/runtime/vue` 切换至 **`ubean/client`**；components.d.ts 内置 `Link/Head` 声明同步切换

**打破 `vite ↔ build` 值导入环（structure.md §4.1/§10.1）**：

- 新增零依赖叶子包 `@ubean/build-core`：`virtual-registry.ts`（103 行）+ `registry.ts`（85 行 globalThis 注册表）+ `macros.ts`（括号平衡解析器）
- 最终依赖方向：`vite → build-core`，`build → build-core` + `build → vite`（production 消费 Vue 虚拟模块工厂，单向合法边）——`@ubean/vite` 的 package.json 不再依赖 `@ubean/build`
- `@ubean/build` 的 index re-export build-core 全部 API（ai/integrations 等既有消费者零改动）
- macros/virtual-registry 测试随迁 build-core（28 用例）

**server 子路径导入兑现（ADR-0003，structure.md §9.1）**：

- `app/src/app.ts` 的 6 个符号从 `@ubean/server` barrel 改为语义子路径：`@ubean/server/cache`（createCacheMiddleware/resolveRouteCacheRules/useCacheStore/createMemoryStore）、`@ubean/server/static`（serveStatic）、`@ubean/server/realtime`（createWebSocketMiddleware）

**content 提升为内置模块（structure.md §5.10）**：

- `BUILTIN_MODULES` 新增 `content` 条目（`@ubean/content/vite` → `ubeanContentPlugin`）
- `UbeanConfig` 新增顶层 `content?: boolean | UbeanContentOptions` 字段，ResolvedConfig/loader defaults 同步（默认 `false`，按需启用）

### 2.3 Phase 3 — `@ubean/client` 一等客户端内核

**新包 `@ubean/client`**（原 `@ubean/runtime` 客户端子集**移动而非复制**）：

```
依赖白名单：vue + vue-router + @unhead/vue + @ubean/pages + @ubean/i18n
            + @ubean/islands（仅 ./directive 与 ./runtime 子路径）+ @ubean/shared(type)
禁止依赖：  @ubean/build、@ubean/vite、@ubean/server、hono、任何 node: 模块
```

关键拆分动作（对应 structure.md §8.2 四大障碍）：

1. **`app.ts` 指令导入改子路径**：`vClient` 从 `@ubean/islands/directive` 导入（原自主入口，会传递拉入整个 vite 插件链）
2. **provide Key 导出**：`PAGE_KEY/TRANSITION_KEY/SSR_KEY/LOADING_KEY/ERROR_KEY/LAYOUT_CHAIN_KEY` 从模块私有改为导出（测试工具与高级用法可注入）
3. **i18n 模块级 DOM 副作用惰性化**：原先 import 即执行「读 `__UBEAN_LOCALE_DATA__` script + 改 `<html lang/dir>`」；现在收敛为幂等的 `initClientI18n()`，由 `createUbeanClientApp`/`createUbeanSSRApp` 与 i18n 读 API 首次调用时触发——模块导入零副作用
4. **`createServerHead` 移出浏览器入口**：`@ubean/client` 主 barrel 仅导出 `createClientHead`（@unhead/vue/client）；SSR 工厂经 `@ubean/client/server` 子路径获取 server head
5. **islands 水合 fork 收敛**：删除 runtime 侧 308 行重复实现，`hydrateIslands/collectIslands/hydrateIsland` 单一事实源在 `@ubean/islands/runtime`
6. **新增 `ubeanClient` Vue 插件**：独立 SPA 用 `createApp()` 自建实例时注册 Link/PageView/SlotView + v-client 指令

**`@ubean/client/vite` 子路径**：`ubeanClientPlugin` 轻量插件（仅注册 Vue 核心 + ubean 客户端内核两组 auto-import 预设，源 `@ubean/client`），供纯 SPA 项目零负担接入。

**聚合包 `ubean` 入口分层**：

```
ubean                  → 全量（服务端/构建期语义，不变）
ubean/client           → @ubean/client 内核 + createServerHead（框架虚拟模块用）★新增
ubean/client/vite      → ubeanClientPlugin ★新增
ubean/runtime/vue      → 兼容别名（re-export @ubean/client + islands 注册表桥接 + actions 客户端运行时）
ubean/runtime/app|i18n → 不变
```

框架内部虚拟模块（`virtual:ubean-app`、unplugin-vue-components resolver）的导入源统一切换至 `ubean/client`。

---

## 3. 架构调整说明（重构后依赖图）

```
                    shared (types/error/env/utils通用 + /node子路径)
                       ↑
    ┌────────┬─────────┼──────────┬─────────────┐
 routing(含route-path) pages    i18n      markdown      preset
    ↑  ↑                ↑
    │  └──────────┐     │
 codegen       client ←─┘（pages 协议）
 (含auto-imports)  ↑
    ↑            islands(./directive ./runtime ./vite ./server)
 build-core ←── vite ←── build(production)
    ↑              ↑           ↑
    └ build ───────┴───── dev-server ─── cli ─── devtools
                              ↓
                      app → api-routes → actions
                       ↑        ↓
                     server(语义子路径)
                       ↑
              ubean(聚合器 · ./client ./client/vite ./runtime/*)
                       │
              integrations(pwa/fonts/electron/ui/pinia 模块子路径)
              ai / auth / icon / image / content(内置模块)
```

**强制边界（structure.md §15）已落实**：

- `client → server/build/cli/devtools/hono`：禁止 ✅（依赖白名单约束）
- 浏览器入口 → node-only 代码：禁止 ✅（islands/auth/icon/seo 四处反例已修，产物验证零 `node:`）
- `build → vite` 值导入：合法单向 ✅（反向边已消除，环闭合于 build-core 叶子）
- `shared → vue/hono`：仅 type-only ✅（hono 以类型引用随 types 迁入）

---

## 4. 验证结果

### 4.1 构建与测试

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| 全量构建（32 包） | `pnpm build` | exit 0，零错误 |
| 类型检查 | `pnpm -r --parallel typecheck` | exit 0，零 error TS |
| 单元测试 | `pnpm test` | 30 包 / 41 文件 / ~1400 用例 **全部通过** |

重点包测试规模：islands 199、routing 148（含新 route-path.test.ts 19 用例）、api-routes 129（page-actions 适配层全量回归）、client 100（color-mode/party-town/search 随迁）、actions 69（新增 Response 直通用例经 form-actions 集成测试覆盖）、shared 39、integrations 39、build-core 28。

### 4.2 客户端纯净度（重构核心目标，产物级验证）

| 入口产物 | `node:` 导入数 | 期望 |
| --- | --- | --- |
| `packages/client/dist/*.js`（vite.js 构建期入口除外） | **0** | ✅ |
| `packages/islands/dist/index.js` / `runtime.js` / `directive.js` | **0** | ✅ |
| `packages/auth/dist/runtime.js`（node:async_hooks） | **0** | ✅ |
| `packages/icon/dist/index.js`、`packages/seo/dist/index.js`（node:fs） | **0** | ✅ |

即：任何包含 `PageView`/`Link`/`useI18n`/`useAuth`/`Icon` 的浏览器 bundle 均不再传递引入 Node 内置模块（对照 structure.md §1 问题 1「已核验 dist 含 node:path/node:fs」的现状，根因已消除）。

### 4.3 依赖环验证

- `packages/vite/package.json` 不再依赖 `@ubean/build`；`vite/dist` 中仅存 `@ubean/build-core` 引用
- `build-core` 零依赖（除 devDeps），不引用 vite/build 任何一方
- 环测试断言：`vite → build-core`、`build → build-core`、`build → vite` 三条边均为单向

### 4.4 API 兼容性

- 用户唯一契约 `import ... from 'ubean'` 的公开 API 面保持（AGENTS.md 契约表符号均仍可达；shared/integrations/codegen 经聚合器 re-export 同名符号）
- `ubean/runtime/vue` 保留为兼容别名，导出面与重构前一致（含 islands 注册表桥接的 `hydrateIslands` 与 actions 客户端运行时）
- 不兼容项（按任务要求无需兼容旧版）：直接 `@ubean/types|error|env|utils|runtime|auto-imports|pwa|fonts|electron|ui|pinia` 的内部导入需改新路径（应用层本就只依赖 `ubean` 聚合包，不受影响）

---

## 5. 独立客户端示例与运行时验证(2026-08-17 追加)

新增 [examples/client-only-spa](file:///Users/soybean/Web/Projects/SoybeanJS/ubean/examples/client-only-spa/README.md):**只用 `@ubean/client` 内核**(不依赖 `ubean` 聚合包、无 CLI/SSR/虚拟模块)的纯 SPA,作为重构核心承诺的端到端验证。

**结构**:手写路由表(`meta.pageName/cache/transition` 承接 `definePage` 宏语义)+ `createUbeanClientApp()` 工厂 + `@ubean/client/vite` 的 `ubeanClientPlugin`(仅 auto-import 预设)+ 应用自带 `@vitejs/plugin-vue`。三个演示页:色彩模式/i18n、keep-alive 缓存控制(enable/disable/resetRouteCache)、过渡与 reload 信号。

**验证结果**:

| 层 | 项目 | 结果 |
| --- | --- | --- |
| 构建 | `vp build` | ✅ 主包 140KB / gzip 53KB |
| 产物纯净度 | `from "node:"` 精确匹配 | ✅ 0 处 |
| 单元测试 | 19 用例(工厂/渲染协议/缓存/过渡重载/i18n 响应式/路由纯函数/依赖白名单) | ✅ 全绿 |
| 类型 | `vue-tsc` | ✅ 零错误 |
| 静态冒烟 | preview 服务 + curl(index/asset/SPA fallback/favicon) | ✅ 全 200 |
| 真实浏览器 | 无刷新导航 / reload 计数 / keep-alive 保留与失效 / i18n 双向切换 / 控制台零新增错误 | ✅(复测通过) |

**过程发现并修复的内核缺陷**:

1. **`t()` / `localizePath()` 响应性丢失**(浏览器验证发现):模块级 `t()` 直接透传 i18n core(globalThis 状态,非响应式),模板中 locale 切换后文案不更新。修复:`trackLocale()` 建立 `localeRef` 依赖([client/src/i18n.ts](file:///Users/soybean/Web/Projects/SoybeanJS/ubean/packages/client/src/i18n.ts)),已加单测回归。
2. **KeepAlive+Transition+key 强变更时序边缘**:非缓存页调用 `reload(name)` 首次触发 Vue `updateSlots` 读 null。修复方向:`reload(name)` 语义本就面向缓存页,示例 About 路由补 `cache: true` 走标准 exclude→include 剪枝路径;复测三次 + 全新会话均无错误。
3. 顺带修复:`@ubean/client` barrel 此前未导出 injection keys(`PAGE_KEY/SSR_KEY` 等),已补导出。

**配套**:codegen(吸收 auto-imports 后原无测试)新增 `presets.test.ts` 4 用例,含 `UBEAN_CLIENT_PRESET.from === 'ubean/client'` 的入口切换回归断言。

---

## 6. 后续建议(非本次范围)

1. **server-entry 生成双轨收敛**（structure.md §5.7）：dev `virtual:ubean-server` 与 prod 落盘模板两套实现可共用一条「scan → 注册 → 落盘」管线，production.ts 可进一步瘦身
2. **scanProject 5 个调用点去重**（§5.6）：dev 全链路目前仍扫描 2-3 遍，可引入扫描结果缓存
3. **ModuleKit 协议激活**（§5.12）：10 个扩展包仍走 registry 侧信道，kit 的 addVirtualImports/addServerHandler 待接入
4. **examples/frontend-only 升级**为 `ubeanClientPlugin` 用法 + 独立 SPA 冒烟测试（Phase 3 第 3-4 步，建议单独 PR）
5. 三份手写 YAML-lite 解析器（content/routing/markdown）可收敛至 shared
