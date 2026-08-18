# ubean 项目结构评估与优化建议

> 本文档是「ubean packages 体系」的深度工程结构评估报告。
>
> - 分析基准：当前 `main` 分支工作区源码（2026-08-17），所有行号指向 `packages/*` 与 `apps|examples` 的真实代码。
> - 分析方法：CodeGraph（590 文件 / 6157 节点 / 23560 边索引）辅助定位符号，辅以全量源码阅读与 `grep` 消费者统计；39 个子包逐一核对 `package.json`（exports/依赖声明）与 `src/` 实际导出。
> - 分析输入：`docs/optimize.md`（ubean/client 客户端内核计划）、`docs/soybean-admin-next.md`（下一代 SoybeanAdmin 技术选型）。
> - 本报告**只分析与输出建议，不修改业务源码**。重构执行需另行立项。

---

## 1. Executive Summary

ubean 当前是 **39 个发布包的 pnpm monorepo**，主包 `ubean` 聚合 28 个 `@ubean/*` 子包，应用层（examples、apps/docs）从不直接依赖子包，只依赖 `ubean`。

整体结论：**包边界基本合理、但存在三类系统性问题**——

1. **客户端独立性被物理破坏（最严重）**。`optimize.md` 的核心目标（独立 SPA 通过 `ubean/client` 复用路由/缓存内核、不拉入构建依赖）在代码层面面临 4 个障碍：`@ubean/runtime` 的 `app.ts` 静态依赖 `@ubean/islands` 主入口（`runtime/src/app.ts:22`），而 islands 主入口 re-export 整个 Vite 插件（`islands/src/index.ts:59-75`），其构建产物 chunk 顶部即 `node:path`/`node:fs`（已核验 `islands/dist/vite-*.js`）——**任何包含 `PageView` 的客户端 bundle 都会传递性引入 Node 内置模块**。另有两处同类污染：`@ubean/auth/runtime` 传递 `node:async_hooks`（`auth/src/core.ts:1`）、`@ubean/icon` 主入口 re-export `./vite` 带 `node:fs`（`icon/src/index.ts:17`）。
2. **主包 `ubean` 无 client/server 分层**。`import { defineHandler } from 'ubean'` 会静态执行整张构建图（已核验 `ubean/dist/index.js` 顶层 import `@ubean/build/vite`、`@ubean/vite`、`@ubean/islands/vite`、`@ubean/cli`、`@ubean/devtools`、`hono-openapi` 等）。唯一干净边界是手工维护的 `ubean/runtime/vue` 子路径 + `UBEAN_CLIENT_PRESET` 自动导入预设。
3. **边界错位与重复实现**：`@ubean/server` 是 8693 行的巨型包但内部无依赖问题（hono 全 type-only）；`@ubean/cli` 4279 行（26% 是内嵌模板字符串）；`@ubean/runtime` 的 `app.ts` 707 行混杂 SSR/CSR 工厂；`vite ↔ build` 存在双向值导入环；`api-routes/form-actions.ts` 复制 `@ubean/actions` 124 行；`runtime/islands.ts` 与 `islands/runtime.ts` 前 300 行近乎逐行重复；3 份手写 YAML-lite 解析器；`@ubean/error`（75 LOC）与 `@ubean/env`（166 LOC）只有 0-1 个真实消费者；`@ubean/electron`/`ui`/`pinia` 合计 534 行纯胶水。

**推荐方案**：以「Runtime 边界清晰」为主体（方案 B），融合「按能力纵切」的两个特例（islands、actions），并将客户端内核提升为一等公民的 `@ubean/client` 包。从 39 个包收敛到 **24 个**（新增 2：`@ubean/client`、`@ubean/integrations`；合并/吸收 17 个；保留 21 个）。迁移分三阶段，全部不破坏现有 `import ... from 'ubean'` API 面。

---

## 2. Current Architecture

### 2.1 仓库形态

- pnpm monorepo：`packages/*`（39 包）+ `apps/*`（docs）+ `examples/*`（3 个）；`packageManager: pnpm@11.22.0`，catalog 固定 `vite`（vite-plus-core 0.2.9）与 `typescript 6.0.3`。
- 构建：每包独立 `vite.config.ts`（`vp pack`，vite-plus），`neverBundle: /^@ubean\//` 保持子包间真实外部依赖；测试 vitest；类型检查 vue-tsc；lint 走 `vp lint`。
- 版本：全部 `workspace:*` 内锁，无独立版本线（CHANGELOG 单仓维护）。

### 2.2 包全景（src LOC / 角色）

| 分层 | 包 | LOC | 角色 |
| --- | --- | --- | --- |
| 聚合 | `ubean` | 415 | 主入口 + 6 个子路径（vite / vue-ssr / runtime/vue / runtime/app / runtime/i18n） |
| 基础 | `types` | 398 | 共享类型 + **Server Actions 运行时**（L344-398） |
| | `utils` | 340 | 路由正则 + 端口探测(node:net) + glob + vite-config(node:fs) |
| | `error` | 75 | UbeanError / errorToResponse，唯一真实消费者 `app` |
| | `env` | 166 | defineEnv，框架内部零消费 |
| | `logger` | 221 | tslog 封装 + `./hono` 请求日志中间件 |
| | `markdown` | 510 | markdown-exit 解析 + mdx + vue jsx-runtime + vite 插件 |
| | `seo` | 1647 | useSeoMeta/merge/robots/sitemap + og-image(625) + json-ld(226)，主入口传递 node:fs |
| | `pages` | 1434 | PageObject 传输协议 + 同构数据层（useData/defer/createInternalFetch） |
| | `i18n` | 860 | 零依赖 i18n 引擎 + `./routing` Hono 中间件 |
| | `routing` | 2684 | 文件系统扫描（scan.ts 894）+ rou3 router + matchers + generator |
| | `auto-imports` | 489 | UBEAN_CLIENT/SERVER_PRESET 两层预设 + unimport 编排 |
| | `codegen` | 309 | 生成 routes.d.ts / pages.d.ts / openapi.d.ts |
| | `preset` | 2463 | 9+2 平台预设（纯数据 + serialize 模板 + detect）+ registry/capabilities |
| | `config` | 1260 | UbeanConfig 类型(835) + c12 加载器 |
| 服务端 | `server` | 8693 | 25 个子模块（cache/cache-directive/db/realtime/security/queue/cron/storage/observability/email/analytics/static/middleware…），hono 全 type-only |
| | `app` | 977 | createUbeanApp（Hono 工厂）+ defineServer + 全局 hooks（SvelteKit 三件套） |
| | `api-routes` | 1840 | registerRoutes（API + 页面）+ ISR + route-rules + form-actions |
| | `actions` | 1803 | defineAction + `./runtime` 浏览器端 + `./vite` 插件（555 行正则扫描） |
| | `modules` | 713 | 模块系统（resolveModules + ModuleKit，kit 能力大部分闲置） |
| | `ssr` | 455 | createVueRenderer（缓冲 + 流式 + 动态 head 补救） |
| 构建 | `vite` | 1093 | ubeanVite（Vue 虚拟模块 ×4 + 自动导入 + HMR 重扫） |
| | `builder`(@ubean/build) | 1820 | ubeanPlugin（框架无关虚拟模块 ×5）+ production 构建编排(839) + virtual-registry + registry |
| | `dev-server` | 1093 | Vite middlewareMode 编排 + watcher + runner，唯一消费者 cli |
| | `cli` | 4279 | 14 个命令 + 脚手架（unify-template.ts 1102 行模板字符串） |
| | `prerender` | 488 | SSG 爬取/写盘，唯一消费者 cli/build |
| | `devtools` | 2837(+client ~5373) | DTK 插件 + 预构建 Vue SPA 面板 |
| | `islands` | 2794 | **唯一纵切包**：vite 指令转换(1278) + 浏览器运行时(810) + server 中间件(117) |
| 扩展 | `ai` | 1180 | Vercel AI SDK 薄编排 + 自研 SSE useChat（SSR-safe） |
| | `auth` | 1191 | better-auth 集成 + 217 行内存 fallback + 自研 fetch 客户端 |
| | `icon` | 1482 | 自研 mini-Iconify（集合/别名/SVG 生成 + 扫描 + `/_iconify` 代理） |
| | `pwa` | 571 | vite-plugin-pwa 薄封装 + 自研 usePwa |
| | `image` | 1326 | IPX 风格 URL 层 + NuxtImg 组件，**无转换引擎** |
| | `content` | 1464 | 自研 frontmatter/markdown/查询构造器 + live collection，**不在内置模块表** |
| | `fonts` | 861 | Google/Bunny/Fontshare URL 构造 + font-face CSS 生成 |
| | `electron` | 149 | 95% 胶水（默认入口常量 + 透传 vite-plugin-electron） |
| | `pinia` | 254 | 40 行核心（serialize/hydratePiniaState）+ optimizeDeps 胶水 |
| | `ui` | 131 | 100% 胶水（UiResolver 注册 + css 注入 + optimizeDeps） |

### 2.3 消费模型（关键事实）

- **应用层永远只依赖 `ubean` 聚合包**：examples 三个项目与 apps/docs 的 package.json 只声明 `ubean: workspace:*`，从不直接依赖 `@ubean/*`（唯一例外：`apps/docs/src/pages/[...slug].vue:11` 直连 `@ubean/markdown`）。
- 因此拆包收益**不在**「让用户少装包」，而在**内部维护边界**（tree-shaking、浏览器产物纯净度、循环依赖、测试边界）与**生态分发**（SoybeanAdmin Next 直接消费 `ubean/client`）。

---

## 3. Current packages Analysis

逐包分析详见附录 A（39 包的职责 / 核心 API / 依赖 / 被依赖 / Runtime / Client / Server / Build / 独立性 / 问题 / 建议表）。关键结论摘要：

- **被大量依赖**（源码 import 文件数）：types(55) > routing(25) > logger(20) > config(15) > utils/pages(10) > preset(7)。
- **零/单消费者**：error（1 个真实消费者）、env（0 个内部消费者）、electron（无 test、95% 胶水）、ui（100% 胶水）、pinia（核心 40 行）。
- **零消费者实现**（只被聚合包 `export *` 转发）：seo 的 og-image(625)/json-ld(226)/conventions 系列、preset 的全部 7 个 `serialize*Config` 生成器、markdown 的 `defineMarkdownPage`。
- **死代码**：`runtime/client.ts` 的 `createUbeanClient`（123-285 行，全仓零调用）、`modules` 的 `setupFns` 恒空数组（`modules/src/index.ts:437`）、resolveModules 返回的 `serverHandlers/devServerHooks/devToolsTabs` 两个调用点均未消费、`utils` 的 tinyglobby 死依赖、`config` 的 `@ubean/preset` optional peer 死配置。

---

## 4. Dependency Graph Analysis

### 4.1 真实运行时依赖环

- **`@ubean/vite ↔ @ubean/build` 双向值导入环（已核验）**：
  - `vite/src/plugin.ts:6` `import { useVirtualRegistry, getComponentResolvers } from '@ubean/build'`；`vite/src/virtual-modules.ts:1` `import { defineVirtualModule, getCssImports } from '@ubean/build'`。
  - `builder/src/production.ts:14-21` `import { ubeanVite, ... } from '@ubean/vite'`。
  - 模块级加载路径：`production.ts → vite/index → vite/plugin → builder/index →（virtual-registry/registry 叶子）`，**production.ts 被加载时形成真正运行时环**。`builder/vite` 子路径自身不回导 `@ubean/vite`，未入环。
  - 成因：注册表基础设施在 build，Vue 虚拟模块工厂在 vite，production（build 下游）又需要 Vue 工厂。
- **`@ubean/modules → @ubean/app` 是 type-only**（`modules/src/kit.ts:3` `import type { UbeanApp }`；`grep @ubean/modules packages/app/src/` 零命中），不构成环。

### 4.2 合理但值得标注的依赖

- `api-routes → routing`（`api-routes/src/router.ts:2` 静态值导入 `validateParams`），但 package.json 将 routing 标为 **optional peer**——optional 标注是名义的，实际不可选。
- `ssr → runtime/define-app`（静态）+ `ssr → runtime/app`（动态），方向单向，合理（Vue 渲染器从纯 Hono 的 app 剥离，避免 API-only 项目拖入 vue）。
- `app → server`（6 个中间件符号，走 barrel，见 4.3）。
- `islands → server 代码被 app 挂载`：`app/src/app.ts:295` 挂 `POST /__server-component`，islands 服务端代码不经构建链，由运行时 app 消费——这是纵切包能同时服务构建期与服务端的直接证据。

### 4.3 一个未兑现的拆包收益

ADR-0003 以「心智模型 + IDE 类型解析成本」为 `@ubean/server` 增设 13 个语义子路径，但框架内部消费仍走 barrel：`app/src/app.ts:21-28`（6 个符号）、`ubean/src/index.ts:33`（`export * from '@ubean/server'`）。任何安装 `@ubean/app`（或元包）的项目，类型解析仍会展开全部 30 个文件。子路径收益目前只对终端用户直接 `import '@ubean/server/cache'` 生效。

---

## 5. Problems Found

按严重度排序（均附代码证据）：

1. **客户端 bundle 传递性引入 Node 内置模块（P0，破坏客户端独立性）**
   - `runtime/src/app.ts:22` `import { vClient } from '@ubean/islands'` → islands 主入口 re-export `./vite`（`islands/src/index.ts:59-75`）→ 产物 `islands/dist/vite-*.js` 首行 `import { dirname, resolve } from "node:path"; import { existsSync } from "node:fs";`（已核验）。`runtime/dist/app-BgS-EYin.js` 保留该 import。
   - `auth/src/core.ts:1` `import { AsyncLocalStorage } from 'node:async_hooks'`，`auth/src/runtime.ts:2` re-export core——`@ubean/auth/runtime` 浏览器入口被污染（已核验 dist）。
   - `icon/src/index.ts:17` re-export `./vite`（`vite.ts:1` `node:fs`），主入口同时承载浏览器 `Icon` 组件——污染。
   - `seo/src/index.ts:513,518` re-export conventions/og-image（均 `node:fs`）——主入口整包 Node-only。
2. **主包 `ubean` 无分层（P0，用户体验与产物根因）**
   - `ubean/dist/index.js` 顶层静态 import `@ubean/build/vite`、`@ubean/vite`、`@ubean/islands/vite`、`@ubean/actions/vite`、`@ubean/cli`、`@ubean/devtools`、`hono-openapi`、`consola` + 19 个 `export *`（已核验）。这是 AGENTS.md 陷阱 #8（客户端导入主入口触发 vite/oxc-parser 预构建）的**包结构层面根源**。
3. **`vite ↔ build` 值导入环（P1）**：见 §4.1。环使两包无法独立演进，任何一方的模块加载都可能拉起另一方全量。
4. **`@ubean/runtime/src/app.ts` 707 行混杂 SSR/CSR（P1，ubean/client 的最大障碍）**：`createUbeanSSRApp`（:609）、`createUbeanClientApp`（:551）、PageView 的 `if (ssr)` 分支（:308-309）、SSR 跳过 Suspense/ErrorBoundary（:377-379, :402）同文件交织；provide Key（PAGE_KEY 等，:34-38）模块私有未导出。
5. **重复实现四处（P1）**：
   - `api-routes/src/form-actions.ts`（124 行）复制 `actions` 的 `parseFormActionName/runServerAction/handleActionResponse`——注释依据（「actions re-exports Vue runtime」）已过时，actions 主入口无 vue import。
   - `runtime/src/islands.ts`（308 行）与 `islands/src/runtime.ts` 前 ~300 行近乎逐行相同（水合逻辑 fork）。
   - 3 份手写 YAML-lite 解析器：`content/src/core.ts:25`、`routing/src/scan.ts:617`、`markdown/src/index.ts:57`。
   - 两套手写括号平衡解析器：`builder/src/macros.ts:3-80` vs `islands/src/vite.ts:190-376`（actions 可能还有第三份）。
6. **构建期扫描/注册三处平行实现（P1）**：`scanProject` 调用点 5 处（cli/dev、cli/build、builder/vite、vite/plugin、builder/production），dev 启动至少扫 3 遍；虚拟模块注册 3 处（`builder/vite.ts:184-226`、`vite/plugin.ts:103-114`、`builder/production.ts:91-155`，后者是唯一落盘版）。
7. **server-entry 生成双轨（P2）**：dev 走 `virtual:ubean-server` + dev-server 运行时 loader；prod 走 `production.ts:308-429` 模板字符串（import.meta.glob loader）——同一编排两种实现，是 production.ts 膨胀到 839 行的主因。
8. **`@ubean/types` 名不副实（P2）**：398 行中 ~150 行是 Server Actions 运行时（`ACTION_BRAND/ActionError/fail`，L344-398），为打破 actions↔types 环而塞入；package.json 把 hono 放 dependencies 但仅 type import。
9. **`@ubean/utils` 杂物抽屉（P2）**：`filePathToRoute`/`parseMatchers`（routing 的核心算法，`routing/src/index.ts:3` re-export）与 `node:net` 端口探测、`node:fs` vite-config 探测混在一个包。
10. **扩展层错位（P2）**：`@ubean/content`（1464 LOC 全自研，能力面是元框架级的）不在 `BUILTIN_MODULES`（`modules/src/builtins.ts:2` 无 content），config 也无 `content?:` 顶层字段——配置面与重要性倒挂；`@ubean/image` 无转换引擎（dev 中间件 302 回原图 `image/vite.ts:87-89`），「已优化」名不副实。
11. **两套 hook 体系并存（P3）**：app 的 `UbeanRuntimeHooks`（9 个）与 modules 的 `ModuleHooks`（10 个）字段部分重叠、实例独立。
12. **kit 协议闲置（P3）**：`ModuleKitContext`（addVirtualImports/addServerHandler/addDevToolsTab…）10 个扩展包无一使用，全部退化为返回 `Plugin[]`；扩展注册实际走 `builder/src/registry.ts` 的 globalThis 侧信道。

---

## 6. Package Redundancy Analysis

「是否真该独立」判定基于四维：职责边界、生命周期、Runtime 边界、独立 API 面。逐项结论：

| 包 | 代码量 | 独立价值评估 | 结论 |
| --- | --- | --- | --- |
| `@ubean/error` | 75 | 零依赖、1 个真实消费者（`app/src/app.ts`）；独立 npm 包无演进压力 | **合并** → `@ubean/types`（同为协议层叶子，防环逻辑一致）或 `@ubean/shared` |
| `@ubean/env` | 166 | 框架内部零消费，纯公共 API；`defineEnv().env` 同步路径不支持 Standard Schema（`env/src/index.ts:62-63` 明确报错）——功能本身待修 | **合并** → `@ubean/shared` |
| `@ubean/electron` | 149 | 95% 胶水（默认入口常量 + 透传 vite-plugin-electron）；无 test；唯一价值是 electron 依赖树隔离 | **合并** → `@ubean/integrations`（依赖树隔离由「按需安装」机制保障，见 §16） |
| `@ubean/ui` | 131 | 100% 胶水（两个 registry 调用 + optimizeDeps）；`@soybeanjs/ui` 为 required peer 不产生依赖负担 | **合并** → `@ubean/integrations` |
| `@ubean/pinia` | 254 | 核心 40 行（serialize/hydratePiniaState）；零 pinia import、零 @ubean/build 使用（dependencies 死声明） | **合并** → `@ubean/integrations`（SSR 水合这对函数属框架核心能力，放在集成层但聚合进一个包） |
| `@ubean/pwa` | 571 | vite-plugin-pwa 硬依赖是唯一独立理由；strategies→runtimeCaching 转换 + usePwa 约 300 行实质 | 可选：独立或合并 integrations（保持 `@ubean/pwa/vite` re-export shim 兼容 modules 字符串加载） |
| `@ubean/fonts` | 861 | 65% 实质（URL/CSS 字符串生成）但自托管承诺未兑现（无下载逻辑、metrics 仅 2 条）；同类集成形态 | **合并** → `@ubean/integrations` |
| `@ubean/codegen` | 309 | 与 auto-imports（489）同为「生成 .d.ts 的构建期工具」；codegen 编排 auto-imports | **合并** codegen + auto-imports → `@ubean/codegen`（preset 是 client/server 入口分层的事实来源，保留其独立性） |
| `@ubean/prerender` | 488 | 唯一消费者 cli/build；SSG 引擎本身可独立测试 | 可选：并入 `@ubean/cli` 或保留；推荐保留（独立可测） |
| `@ubean/ssr` | 455 | 消费者仅 dev-server 与聚合包；但它是「Vue 渲染器」与「纯 Hono app」的接口/实现分离点（`PageRenderer` 接口在 pages 定义） | **保留**（接口分离价值 > 规模） |

---

## 7. Package Splitting Opportunities

「拆分不足」的判断——单个包承担明显无关的多个生命周期/Runtime：

1. **`@ubean/server`（8693 LOC / 30 文件）——建议拆分，但按「物理子包」而非「再开 13 个包」**
   - 事实：hono 全 type-only、重依赖（nodemailer/db0）全动态 import/注册表注入、零 vue、node: 仅 5 处——**依赖层面无可拆收益**（这也是 ADR-0003 只做子路径的原因）。
   - 拆分依据是**运行时边界与安全域**：`cache-directive.ts`（node:async_hooks 静态）、`draft-mode.ts`（node:crypto）、`static.ts`（node:fs）、`single-flight.ts`/`after.ts`（async_hooks 动态）——这 5 个模块是 **Node-only**，其余（cors/rate-limit/csrf/security-headers/sse/queue/cron/analytics/feature-flags/fetch-memo/websocket/cdn-cache/storage/sessions/observability）可运行于任何 Web 标准环境（Workers/Deno/Bun）。
   - 建议：保持单包 + 语义子路径，但**框架内部消费改子路径导入**（兑现 ADR-0003 的类型收益），并把 Node-only 模块在子路径文档中标注。不物理拆包的理由：唯一「需要独立版本化」的候选是 database/email 域（534+534 行），规模尚不足以支撑独立包维护成本。
2. **`@ubean/cli`（4279 LOC）——骨架化拆出模板**
   - `cli/src/shared/unify-template.ts` 1102 行内嵌项目模板字符串占全包 26%，与命令逻辑无关。建议拆为 `cli/templates/*` 静态资源（打包时嵌入），或独立 `@ubean/create` 脚手架包（对齐 create-nuxt/create-next-app）。
3. **`@ubean/runtime`（4253 LOC）——客户端内核物理拆出（见 §8 Client Architecture）**
   - 数据面（cache-views/page-runtime/router-location/define-app/composables）与 SSR 工厂（createUbeanSSRApp）、浏览器专属（client.ts/party-town/search）混在一个 barrel；`createServerHead` 从 `.` 入口导出（`runtime/src/index.ts:31`）。
4. **`@ubean/preset`（2463 LOC）——数据/逻辑已分层，无需拆**
   - 但 `index.ts:39` 的加载即注册副作用与 `resolvePresetByName` 的硬编码兜底（:50-59）建议收敛。
5. **`@ubean/modules`（713 LOC）——能力已具备但未兑现**
   - kit 的 `addVirtualImports/addServerHandler` 等接口是 Astro integration API 形态的雏形，当前 10 个扩展包全走 registry 侧信道。拆分建议：把 `builder/src/registry.ts`（85 行 globalThis registry）下沉到 modules 或独立叶子，让扩展注册走统一 kit 协议。

---

## 8. Client Architecture

### 8.1 当前 client 功能在哪里

- **运行时**：`@ubean/runtime`（页面缓存、PageView/Link/Head/SlotView、过渡/重载、colorMode、i18n Vue 包装、水合）；`@ubean/pages` 的 `useData/defer`（同构数据层）；`@ubean/actions/runtime`（useAction/useFormAction）。
- **入口分发**：浏览器入口是 `ubean/runtime/vue`（`ubean/src/runtime/vue.ts`，65 行）——re-export `@ubean/runtime` + `@ubean/actions/runtime` + 合并 `virtual:ubean-islands-registry`；`UBEAN_CLIENT_PRESET`（`auto-imports/src/index.ts:102-138`，37 个符号）从该入口取自动导入。
- **构建侧**：客户端虚拟模块由 `@ubean/vite`（vue-pages/vue-app/client-entry/server-entry）与 `@ubean/build`（routes/pages/meta/app-config/locales）两处生成。

### 8.2 与 server/runtime/build 的耦合（含障碍清单）

`optimize.md` 设想的 `ubean/client` 当前**零实现**（全仓 grep 无引用）。复用可行性评估（基于源码）：

**可直接复用的干净符号**：`useCacheViews/enablePageCache/.../initCachedViewsFromRoutes/getNamedPageWrapper`（纯 vue + globalThis）、`usePageTransition/useReloadSignal/reloadPage`、`resolveRoute/isActiveRoute`（纯函数）、`definePage/defineMeta`（no-op 宏）、`createUbeanRouter`、`applyAppConfig/defineApp`（`@ubean/ssr` 已依赖其 `./define-app` 子入口，证明子入口切分可行）、`@ubean/pages` 的 PageObject/数据层（deps 仅 @ubean/types）。

**四大障碍（按严重度）**：

| # | 障碍 | 证据 | 解法 |
| --- | --- | --- | --- |
| 1 | `vClient` 指令静态依赖 islands 主入口 → node 模块进客户端图 | `runtime/src/app.ts:22,603,647`；`islands/src/index.ts:59-75` re-export vite | islands 拆 `./directive` 子入口（`directive.ts` 367 行仅 vue 依赖，本可独立）；或 runtime 将指令注册改为可选注入 |
| 2 | app.ts 单文件混杂 SSR/CSR，provide Key 私有 | `runtime/src/app.ts:34-38,308-309,377-379,402,609-651` | 拆出客户端专用 `client-app.ts`；导出 Key；`createUbeanSSRApp` 留在服务端子路径 |
| 3 | Link 硬依赖 i18n，且 i18n.ts 顶层即执行 DOM 水合副作用 | `runtime/src/app.ts:470` 调 `localizePath`；`runtime/src/i18n.ts:92-126` | 副作用移入 `install()`/`onMounted`；Link 的本地化改为可选（provide 探测） |
| 4 | runtime `.` 入口导出 `createServerHead` | `runtime/src/index.ts:30-31` | client 入口显式排除 server head |

另有结构性隐患：`image/pwa/content/fonts/pinia` 的 `.` 主入口普遍 re-export `./vite`（靠 vite.ts 恰好不含 node import 才安全——icon 正是踩坑反例）。

### 8.3 推荐：客户端边界落点

- **短期（对齐 optimize.md UB-01~UB-05）**：在 `ubean` 主包新增 `ubean/client` 与 `ubean/client/vite` 子路径，聚合「干净符号集 + 一个轻量 Vue 插件 `ubeanClient`」；修复障碍 1-4 的最小改动是 islands 拆 `./directive` 子入口。
- **中期（本报告推荐）**：把客户端内核提升为**独立包 `@ubean/client`**（见 §14），`ubean/client` 子路径改为 re-export 它——使 SoybeanAdmin Next 可直接 `pnpm add @ubean/client`，且 ubean 主包与独立 SPA 共用同一实现，兑现「单一实现、零双份维护」。
- **约束**：`@ubean/client` 依赖仅 `vue + vue-router + @unhead/vue + @ubean/pages + @ubean/routing(type)`（可选 `@ubean/i18n`）；**禁止**依赖 `@ubean/islands` 主入口（只允许 `./directive`）、`@ubean/build`、`@ubean/vite`、`@ubean/server`。

---

## 9. Server Architecture

- **运行时边界现状**：`@ubean/server` 零 vue、零 window/document；hono 全 type-only（结构兼容而非运行时耦合）；`node:` 仅 5 处（§7.1）。`@ubean/app` 是纯 Hono 工厂（977 LOC），`@ubean/ssr` 以 `PageRenderer` 接口（定义于 `@ubean/pages`）注入 Vue 渲染器——**接口/实现分离已达成**。
- **推荐**：
  1. 内部消费改子路径导入（`app`、`ubean` 元包），兑现 ADR-0003 的类型收益。
  2. Node-only 模块（cache-directive/draft-mode/static/single-flight/after）在导出文档标注 runtime 约束；若未来出现 Deno/Workers 版本差异需求，再物理拆为 `@ubean/server-node`。
  3. `api-routes/src/form-actions.ts` 删除重复实现，改为直接依赖 `@ubean/actions`（actions 主入口已确认无 vue import，原注释依据失效）。
  4. 两套 hook 体系（app 的 UbeanRuntimeHooks / modules 的 ModuleHooks）合并为一个。

---

## 10. Build Architecture

- **完整时序**（`ubean dev` / `ubean build`）见附录 B。要点：CLI 是编排层（app 在 CLI 构造），dev-server 是 Vite middlewareMode 宿主，vite/build 两个插件在无用户 vite.config 时兜底拼装，modules 解析扩展包，production.ts 做 client+ssr 双构建 + 虚拟模块落盘 + preset 差异化入口。
- **推荐**：
  1. **打破 `vite ↔ build` 环**：把 `VirtualModuleRegistry`（`builder/src/virtual-registry.ts`，103 行）+ 组件/CSS 注册表（`builder/src/registry.ts`，85 行）下沉为构建底座；Vue 虚拟模块工厂（`vite/src/virtual-modules.ts` 664 行）归 `@ubean/vite`，`production.ts` 改为经聚合入口 `ubean/vite` 消费，让依赖方向单向 `build → vite` 或抽独立 `@ubean/build-core`。
  2. **收敛三处 scan/注册实现**：dev 与 prod 共用同一「scan → 注册 → 落盘」管线（当前 production.ts:72-155 是唯一落盘版，dev 两处只注册不落盘——差异正是 server-entry 双轨的根源）。
  3. **统一括号平衡解析器**：actions/vite、islands/vite、builder/macros 三处手写解析收敛为一个内部工具。
  4. **devtools 保持独立**：DTK 插件 + 预构建 SPA 形态与框架运行时零静态依赖，optional peer 模型已工作，独立合理。

---

## 11. Comparison with Modern Meta Frameworks

调研结论（2026-08-17 实测各框架仓库，来源见附录 C）：行业**不存在**「按 feature 把一切拆成几十个包」的主流方案；拆包轴收敛为三类——**部署/构建器差异**、**可选内容/渲染格式**、**模块作者 API**；框架本体普遍单薄收敛。

| 框架 | 包数量级 | 拆分哲学 | client 入口 | 插件宿主 |
| --- | --- | --- | --- | --- |
| Nuxt 4.x/5a | 仓内 ~8 + 仓外 CLI/devtools + 全外部 unjs 基建 | schema/kit/nuxt/builder(×3)/nitro-server 分层；基建零自持（unimport/unhead/h3 全外部） | `nuxt/app` 子路径 + `#app` 虚拟别名 | kit 型（`@nuxt/kit` 独立包） |
| Next.js | 1 主包 + ~14 附件（4 private） | 单包收敛，swc/turbopack rust crates 物理内置 | `next/client`、`next/server` 目录式子路径（无 exports map） | 无公开 API，config 约定 |
| SvelteKit | 1 框架包 + 6 adapter | 框架 = 单个 vite 插件；部署 target 拆包 | `$app/*` 虚拟模块 | adapter 型（同仓） |
| Astro | 主包 + 17 integrations 全在主仓 | 框架单包，一切扩展统一 integration 接口；`@astrojs/internal-helpers` 公开内部工具 | `astro:content`、`astro:transitions/client` 虚拟模块 | integration API 型（钩子 + inject 函数族） |
| React Router v7/8 | 1 主包 + ~10 部署/构建包 | **反向收敛案例**：Remix 多包（react/dev/node/serve/cloudflare…）合并进 react-router | `react-router` + `./dom` 子路径 | vite 插件型（`@react-router/dev`） |
| TanStack Start | monorepo 42 包，用户装 1-2 壳包 | core 哑铃（start-{client,server,plugin}-core）+ UI 框架薄壳 + 校验 adapter | 子路径 exports：`./client`、`./client-rpc`、`./server-rpc` 显式 RPC 边界 | 构建器插件型（start-plugin-core 抽象 vite/rsbuild） |
| VitePress | 1 | 极简单包，运行时功能直接用外部库（@vueuse/shiki） | `vitepress/client`、`vitepress/theme` | vite 插件 + 主题约定 |
| Analog | ~14 个 @analogjs/* | Angular 无基建逐块自建；`@analogjs/platform` 聚合元包 = 2 个 vite 插件 + nitropack | `@analogjs/router` 独立客户端路由包 | vite 插件组合型 |

**对 ubean 的启示**：

1. **客户端入口是一等公民**：Nuxt 用 `nuxt/app`、TanStack 用 `./client` 系子路径、Vitepress 用 `vitepress/client`——「独立、纯净、不拉构建依赖的客户端入口」是行业共识，ubean 已有雏形（`ubean/runtime/vue`）但未升级为一等入口，`optimize.md` 方向正确。
2. **单薄核心 + 分层边界是主流**（Nuxt/Astro/SvelteKit/React Router v7）：ubean 的主包聚合 + 子包边界符合此趋势，**不是** TanStack 式细拆（42 包靠 workspace 内锁消化成本，ubean 无此必要）。
3. **扩展面要统一宿主**：Astro 的 integration API（钩子 + inject 函数族）与 ubean 的 ModuleKit 形态几乎一致——ubean 应激活 kit 协议而非让 10 个扩展包各自为政（§7.5/§5.12）。
4. **Remix v7 的教训**：按「运行环境」垂直切包在框架层趋同后会变成 re-export 对齐负担。ubean 的 actions/islands 按能力纵切（vite 插件 + runtime + server 同包）是合理的——只要用**子路径 exports** 严格分隔构建期/客户端/服务端，避免主入口污染（当前 islands/auth/icon/seo 正是踩了主入口 re-export 的坑）。

---

## 12. Candidate Architecture Options

### 方案 A：最小化（现状微调）

只合并最薄包（error/env/electron/ui/pinia/pwa/fonts），保留全部现有边界与命名。

- 包数：~32；改动：小；风险：最低。
- 局限：不解决客户端污染、vite↔build 环、runtime 混杂——`ubean/client` 仍需在现结构内打补丁。

### 方案 B：Runtime 边界清晰（推荐主体）

横切分层：`shared（协议层）` ← `core（routing/pages/i18n/markdown）` → `server` / `client` 两组，`build`（vite/build/islands/cli/dev-server/preset/config/codegen/devtools）独立，扩展包按「薄集成合并 / 实质独立」分流。

- 包数：~24；改动：中；收益：客户端独立性、无环、入口纯净全部落地。

### 方案 C：面向能力（深度纵切）

按 router/data/runtime/plugin/client/server 能力组织，含把 server 按域拆成多个物理包、把 build 拆为 plugin-core/builder/dev-server 三包等。

- 包数：~16；改动：大；收益：每包内聚度最高。
- 风险：偏离行业主流的单薄核心趋势；多包通信成本高；且按 §4 事实，server/build 的依赖面并无物理拆包收益。

### 对比

| 维度 | A | B | C |
| --- | ---: | ---: | ---: |
| package 数量 | ~32 | ~24 | ~16 |
| API 简洁性 | 中 | 高 | 高 |
| 内部耦合 | 高（保留环） | 低 | 最低 |
| Tree-shaking / 客户端纯净度 | 低 | 高 | 高 |
| Client 独立性 | 需打补丁 | **一等公民** | 一等公民 |
| Server 独立性 | 现状 | 子路径兑现 | 过度 |
| 扩展性 | 中 | 高 | 中（细包协调成本） |
| 使用体验 | 现状 | 好（ubean 入口不变） | 好 |
| 维护成本 | 低 | 中 | 高 |
| 对齐行业 | 落后 | 对齐 Nuxt/Astro 分层 | 对齐 TanStack（过度） |

**推荐：方案 B**，并吸收方案 C 的两个纵切特例（islands、actions 保持按能力纵切，但子路径严格分环境）——这是「横切边界 + 纵切 feature」的组合，与 Astro（integration 按能力、core 单薄）同构。

---

## 13. Recommended Architecture

### 13.1 核心原则

1. **聚合器单包向用户提供全部 API**（现状正确，保持）：用户只 `import ... from 'ubean'`；拆包收益归内部。
2. **客户端是一等边界**：`@ubean/client` 独立发布，仅依赖 vue/vue-router/@unhead/vue/pages/routing(type)，零构建依赖，供独立 SPA 与 ubean 内部共用。
3. **主包入口分层**：`ubean` 主入口保持全量（服务端/构建期语义），客户端入口（`ubean/client` 与 `ubean/runtime/vue`）物理隔离构建依赖。
4. **子路径严格分环境**：任何含构建期代码（vite 插件、node:fs）的包，其浏览器入口必须走纯净子路径；主入口**不得** re-export 构建期文件（修 islands/auth/icon/seo 的入口污染）。
5. **构建底座单一**：打破 vite↔build 环；scan→注册→落盘管线 dev/prod 共用。
6. **扩展宿主统一**：激活 ModuleKit 协议，registry 侧信道并入 kit。

### 13.2 目标包清单（24 个）

```
packages/
├── ubean/                  # 聚合器（保留，含 ./client ./client/vite 子路径）
├── shared/                 # [新] 合并 types + error + env + utils(通用部分)
├── routing/                # [保留] 扫描内核 + rou3 + matchers + generator
├── pages/                  # [保留] PageObject 协议 + 同构数据层
├── i18n/                   # [保留] 零依赖 i18n 引擎
├── markdown/               # [保留] markdown/mdx 解析
├── seo/                    # [保留] 修入口污染（og-image/json-ld 移至 server 或独立按需）
├── client/                 # [新] 纯客户端内核（取自 runtime 客户端子集）
├── server/                 # [保留] 内部消费改子路径
├── app/                    # [保留] Hono 工厂
├── api-routes/             # [保留] 删 form-actions 重复
├── actions/                # [保留] 纵切特例
├── islands/                # [保留] 纵切特例，拆 ./directive 子入口
├── config/                 # [保留]
├── preset/                 # [保留]
├── codegen/                # [保留] 吸收 auto-imports
├── build/                  # [保留] 生产构建编排 + 构建底座（virtual-registry/registry/macros 下沉）
├── vite/                   # [保留] Vue 插件，依赖方向单向 build → vite
├── dev-server/             # [保留] Vite middlewareMode 宿主
├── cli/                    # [保留] 模板骨架化拆出
├── devtools/               # [保留] 独立
├── prerender/              # [保留] SSG 引擎
├── integrations/           # [新] 合并 electron + ui + pinia + pwa + fonts
├── ai/                     # [保留] 独立（实质逻辑 + optional-peer 懒加载范本）
├── auth/                   # [保留] 独立（修 runtime 污染）
├── icon/                   # [保留] 独立（修入口污染）
├── image/                  # [保留] 补转换引擎或明确为 URL 层
└── content/                # [保留] 提升为核心（加顶层开关，重构于 markdown 之上）
```

### 13.3 变更分类

| 操作 | 包 |
| --- | --- |
| 新增 | `@ubean/client`（含 vite 子路径）、`@ubean/integrations` |
| 合并 | `types+error+env+utils(通用)` → `@ubean/shared`；`electron+ui+pinia+pwa+fonts` → `@ubean/integrations`；`auto-imports` → `@ubean/codegen` |
| 拆分 | `runtime` → 客户端子集进 `@ubean/client`、SSR 工厂进服务端侧；`cli` 模板骨架化；`islands` 拆 `./directive`；`seo` 的 og-image/json-ld 移出主入口 |
| 重命名 | （无必要；`@ubean/build` 目录名 builder 建议保持包名以免破坏文档与既有 import） |
| 删除 | `runtime/client.ts` 的 `createUbeanClient`（死代码）；`modules` 的 `setupFns` 死字段；死依赖（utils 的 tinyglobby、config 的 preset peer、types 的 hono dependency） |
| 吸收 | `prerender` 可选并入 cli；`dev-server` 保持独立 |

> 说明：`@ubean/shared` 合并 types/error/env/utils 的依据是四者皆为「零依赖或近零依赖的协议/工具叶子」，且 env/error 无独立演进压力；**不合并** `@ubean/utils` 的 port/vite-config（Node-only）与路径工具——前者随 shared 下沉到 Node 侧子路径或随 cli/dev-server，后者归 `@ubean/routing`（其领域逻辑）。

---

## 14. Recommended packages Structure

见 §13.2 树。逐包「职责 / 为什么独立 / 包含 / 不包含 / 依赖」明细见附录 D。此处给出与现状的映射表（39 → 24）：

| 现状 | 去向 |
| --- | --- |
| ubean | 保留（新增 `./client`、`./client/vite` 子路径） |
| types, error, env, utils | → `@ubean/shared`（utils 的 filePathToRoute/parseMatchers 归 routing；port/vite-config 归 Node 侧） |
| routing | 保留 |
| pages | 保留 |
| i18n | 保留 |
| markdown | 保留 |
| seo | 保留（主入口不再 re-export og-image/conventions；og-image → `@ubean/seo/og-image` 独立按需 或并入 server 侧） |
| **runtime** | 客户端子集 → `@ubean/client`；SSR 工厂（createUbeanSSRApp）→ 服务端（app 或 ssr）；`createServerHead` 移出客户端入口 |
| server | 保留（内部子路径导入） |
| app | 保留 |
| api-routes | 保留（删 form-actions 重复） |
| actions | 保留 |
| modules | 保留（kit 激活） |
| ssr | 保留 |
| vite | 保留（打破对 build 的反向依赖） |
| builder | 保留（构建底座下沉 + 经聚合入口消费 vite） |
| dev-server | 保留 |
| cli | 保留（模板骨架化） |
| prerender | 保留（可选并入 cli） |
| devtools | 保留 |
| islands | 保留（拆 `./directive`；主入口不再 re-export vite） |
| ai | 保留 |
| auth | 保留（runtime 改纯净子入口） |
| icon | 保留（主入口不再 re-export vite） |
| pwa | → `@ubean/integrations`（保留 `@ubean/pwa/vite` shim） |
| image | 保留（补转换引擎或降级为 URL 层） |
| content | 保留（提升核心 + 顶层开关） |
| fonts | → `@ubean/integrations` |
| electron | → `@ubean/integrations` |
| pinia | → `@ubean/integrations` |
| ui | → `@ubean/integrations` |
| auto-imports | → `@ubean/codegen` |
| codegen | 保留（吸收 auto-imports） |
| env/error | → `@ubean/shared`（同 types） |

---

## 15. Dependency Boundaries

### Allowed Dependency Graph

```
                       shared (types/error/env/utils-通用)
                          ↑
      ┌─────────┬─────────┼──────────┬────────────┐
      │         │         │          │            │
   routing    pages     i18n      markdown      preset (独立)
      ↑  ↑     │         │
      │  │     ↓         ↓
   codegen  seo ─── i18n/routing (server 子路径)
   (含 auto-imports)
      ↑
   build (构建底座: virtual-registry/registry/macros)
      ↑          ↑
   vite  ────  islands (./vite, ./directive, ./runtime, ./server 子路径)
      ↑          ↑
   build/production ─── dev-server ─── cli ─── devtools
      │                (宿主)         │
      ↓                ↓              ↓
   client ←── runtime 客户端子集      prerender
      ↑
   app (Hono 工厂)
      ↑          ↑
   api-routes ── server (子路径导入) ── actions
      ↑
   ubean (聚合器, 对用户唯一入口)
      │
      ├─ ubean/client        → @ubean/client
      ├─ ubean/client/vite   → @ubean/client/vite
      ├─ ubean/runtime/vue   → @ubean/client (兼容保留)
      └─ ubean 主入口        → 全量
```

### Forbidden / 谨慎处理的依赖

| 方向 | 判定 | 依据 |
| --- | --- | --- |
| client → server / build / cli / devtools / hono | **禁止** | 破坏客户端独立性（§5.1、§8.3） |
| browser 入口 → node-only 代码 | **禁止** | islands/auth/icon/seo 现况即反例（§5.1） |
| runtime(客户端) → vite / oxc / unocss | **禁止** | AGENTS.md 陷阱 #8 的根源 |
| build → vite 的值导入 | **解除** | 现环（§4.1）改为单向或经 build-core 底座 |
| shared → framework-specific（vue/hono） | 禁止 | shared 是协议层，只允许 type-only |
| modules → app | 允许（type-only） | 已验证无环 |
| server 包内 Node-only 模块 → Worker 环境消费 | 谨慎 | 子路径文档标注（§7.1） |

---

## 16. Migration Strategy

目标：不破坏现有 `import ... from 'ubean'` API 面；每阶段可独立合入、单测全绿。

**Phase 1（低风险清理，1-2 周）**：
1. 修入口污染：islands 拆 `./directive` 子入口；auth runtime 改为从纯净子模块导入；icon/seo 主入口不再 re-export 构建期文件（改为 `@ubean/icon/vite` 等子路径持有）。
2. 死代码清理：删 `createUbeanClient`、`setupFns`、死依赖（utils tinyglobby、config preset peer、types hono dep）。
3. `api-routes/form-actions.ts` 删除，改依赖 `@ubean/actions`。
4. 现有路由/缓存/actions 单测回归。

**Phase 2（结构整合，2-3 周）**：
1. 合并 `@ubean/shared`（types+error+env+utils-通用）与 `@ubean/integrations`（electron+ui+pinia+pwa+fonts）；`auto-imports` 并入 `@ubean/codegen`；子包 package.json 更新 + 聚合包 re-export 不变。
2. 打破 vite↔build 环：virtual-registry/registry/macros 下沉构建底座；production 经聚合入口消费 vite。
3. server 内部（app、ubean 元包）改子路径导入。
4. runtime 拆分：客户端子集（cache-views/page-runtime/router-location/define-app/composables/view-transitions/i18n 包装）+ PageView/Link/Head/SlotView + useRouter 提为 `@ubean/client`；createUbeanSSRApp 留在服务端侧；provide Key 导出。
5. 收敛三处 scan/注册管线为 dev/prod 共用一套。

**Phase 3（一等客户端入口，对齐 optimize.md UB-01~05，2 周）**：
1. `@ubean/client` 包发布（Vue 插件 `ubeanClient` + `@ubean/client/vite` 的 `ubeanClientPlugin`，仅注册 UBEAN_CLIENT_PRESET）。
2. `ubean` 主包新增 `ubean/client`、`ubean/client/vite` 子路径 re-export；`UBEAN_CLIENT_PRESET` 的 `from` 从 `ubean/runtime/vue` 切到 `ubean/client`（`ubean/runtime/vue` 保留兼容）。
3. `examples/frontend-only` 升级为 `ubeanClientPlugin` 用法 + 新增纯 SPA 构建路径（无 server entry）。
4. 独立 SPA 冒烟测试 + 文档。

> 每一阶段完成后 `pnpm typecheck && pnpm test` 必须全绿；聚合包 `ubean` 的 public API 面（AGENTS.md 契约表）逐项比对不变。

---

## 17. Risks and Trade-offs

| 风险 | 评估 | 缓解 |
| --- | --- | --- |
| 包合并破坏既有 `@ubean/*` 直接 import（生态/文档/CI 引用） | 中 | 保留 re-export shim 包（如 `@ubean/pwa` 保留 `/vite` 子路径）；聚合包入口是唯一用户契约，先保证 `ubean` 不变 |
| `@ubean/client` 与 `@ubean/runtime` 拆分造成行为漂移 | 中 | 复用同一份测试（路由/缓存单测从 runtime 迁移到 client）；客户端子集**移动而非复制** |
| islands 拆 `./directive` 后水合协议（data-* 属性）跨包协商 | 低 | 协议已有唯一事实源（`virtual:ubean-islands-registry` + 两处 escape 实现），拆包时顺带收敛重复实现 |
| `@ubean/shared` 合并 types 引入循环风险 | 低 | types 本就是防环断点包；合并对象均为零依赖叶子，无新增环 |
| server 子路径导入改造触发行为差异 | 低 | 纯 import 路径变化，导出面不变；回归由既有单测覆盖 |
| 工作量与优先级：优化目标是 SoybeanAdmin Next 的 Phase 0 依赖 | — | Phase 1 的入口污染修复与 Phase 3 的 `ubean/client` 是阻塞项，应优先；Phase 2 的结构整合可并行推进 |

---

## 18. Final Recommendations

1. **立即执行（阻塞项）**：Phase 1 入口污染修复 + Phase 3 的 `ubean/client` 落地——它们是 `optimize.md` UB-01~UB-05 与 SoybeanAdmin Next Phase 0 的直接依赖。
2. **核心结构决策**：采纳方案 B（Runtime 边界清晰），新增 `@ubean/client` 与 `@ubean/integrations` 两个包，把 39 包收敛到 24 包；islands/actions 保留按能力纵切但子路径严格分环境。
3. **必须消除的三件事**：客户端 bundle 中的 node 模块（§5.1）、`vite ↔ build` 值导入环（§4.1）、`api-routes/form-actions` 重复实现（§5.5）。
4. **激活已建好的机制**：ModuleKit 协议（§7.5）、auto-imports 两层 preset、`@ubean/server` 语义子路径——它们都已存在但未兑现设计收益。
5. **控制未来拆包**：除部署/构建器差异与可选内容格式外，不为「看起来模块化」新增包；主包 `ubean` 的聚合面是用户契约，任何重构以它不变为前提。

---

## 附录

### 附录 A：39 包逐包分析表（职责 / 核心 API / 依赖 / 被依赖 / Runtime / 独立性 / 建议）

> 完整字段见仓库内 `packages/*/package.json` 与各包 `src/`；本表摘要关键判定。核心 API 与消费者证据已在正文 §3-§7 引述（file:line）。

| package | 核心 API（要点） | 依赖 | 被依赖(文件数) | Runtime | 独立性 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| ubean | 主入口 + 6 子路径 | 28 子包 | 应用层唯一入口 | Universal(分层入口) | 聚合器 | 保留(+./client) |
| types | 共享类型 + ServerActions 运行时 | hono(type) | 55 | Universal | 协议层 | →shared |
| utils | filePathToRoute/port/glob | scule/ufo | 10 | 分裂(Universal+node) | 杂物抽屉 | →shared/routing |
| error | UbeanError/createError | 无 | 2 | Universal | 弱 | →shared |
| env | defineEnv | standard-schema(type) | 1 | Universal | 弱 | →shared |
| logger | createUbeanLogger/请求日志 | tslog | 20 | Universal | 成立 | 保留 |
| markdown | parseMarkdown/mdx/jsx-runtime | markdown-exit | 5 | Universal+Build | 成立 | 保留 |
| seo | useSeoMeta/og-image/json-ld | @unhead/vue | 3 | 主入口 Node-only | 半成立(850 行零消费) | 保留(修入口) |
| pages | PageObject/useData/defer | types | 10 | Universal | 成立(协议核心) | 保留 |
| i18n | useI18n/格式化/i18n 路由 | types | 3 | Universal+Server | 成立 | 保留 |
| routing | scanProject/rou3/matchers/generator | logger/types/utils | 25 | Node+Universal 混合 | 成立(枢纽) | 保留 |
| auto-imports | 两层 PRESET/unimport 编排 | unimport | 3 | Build | 成立(入口事实源) | →codegen |
| codegen | 生成 routes/pages/openapi d.ts | routing/auto-imports | 4 | Build | 薄 | 保留(吸收 auto-imports) |
| preset | 9+2 平台预设/registry/detect | 无 | 7 | 数据+逻辑(除 detect) | 成立(零依赖) | 保留 |
| config | UbeanConfig/c12 加载 | types/c12 | 15 | Build | 成立 | 保留 |
| server | 25 子模块中间件/引擎 | logger/types/hono(type) | 2 直接 | Server(Node+Web 混合) | 成立(过大) | 保留(子路径+标注) |
| app | createUbeanApp/defineServer/hooks | actions/api-routes/error/islands/server | 4 | Server | 成立 | 保留 |
| api-routes | registerRoutes/ISR/route-rules | routing(type+1 值)/types | 2 直接 | Server | 成立 | 保留(删重复) |
| actions | defineAction/useAction/vite 插件 | types/utils | 4 | Server+Client+Build(纵切) | 成立 | 保留 |
| modules | resolveModules/ModuleKit | app(type)/config/logger/types | 4 | Build+Server(type) | 成立(kit 闲置) | 保留(激活 kit) |
| ssr | createVueRenderer | islands/pages/runtime | 2 直接 | Server(Vue SSR) | 成立(接口分离) | 保留 |
| vite | ubeanVite/虚拟模块×4 | auto-imports/build/config/... | 3 直接 | Build | 成立 | 保留(破环) |
| builder | ubeanPlugin/production/virtual-registry | config/islands/logger/.../vite | 4 直接 | Build | 成立(环源头) | 保留(底座下沉) |
| dev-server | Vite middlewareMode 编排 | app/build/config/... | 1(cli) | Build/Dev | 成立 | 保留 |
| cli | 14 命令/脚手架 | app/build/codegen/.../prerender | 2 直接 | Build | 成立(模板过重) | 保留(骨架化) |
| prerender | SSG 爬取/写盘 | config/pages/routing/utils | 1(cli) | Build | 成立 | 保留(可选并入 cli) |
| devtools | DTK 插件+SPA 面板 | ubean(peer) | 动态导入 | Dev | 成立 | 保留 |
| islands | v-client 转换/水合/server-component | types/hono/vue | 6 | Build+Client+Server(纵切) | 成立(主入口污染) | 保留(拆 ./directive) |
| ai | defineAgent/useChat/SSE | build(registry)/valibot | 1 直接 | Universal+Client+Build | 成立(范本) | 保留 |
| auth | better-auth/fallback/useAuth | logger/better-auth | 1 直接 | Server+Client(runtime 污染) | 成立(问题多) | 保留(修 runtime) |
| icon | mini-Iconify/Icon/`/_iconify` | defu/pathe | 1 直接 | Universal+Build(主入口污染) | 成立 | 保留(修入口) |
| pwa | vite-plugin-pwa 封装/usePwa | vite-plugin-pwa | 1 直接 | Client+Build | 半成立 | →integrations |
| image | IPX URL/NuxtImg/无引擎 | defu/pathe/ufo | 1 直接 | Universal+Build | 成立(缺转换) | 保留(补引擎/降级) |
| content | 内容集合/查询/live | utils | 1 直接 | Universal+Build | 成立(错位) | 保留(升核心) |
| fonts | 字体 URL/CSS 生成 | 无 | 1 直接 | Universal+Build | 半成立(承诺未兑现) | →integrations |
| electron | 默认入口/透传插件 | vite-plugin-electron | 1 直接 | Build | 弱(95% 胶水) | →integrations |
| pinia | serialize/hydratePiniaState | build(死) | 1 直接 | Universal | 弱(40 行核心) | →integrations |
| ui | UiResolver/css 注入 | build | 1 直接 | Build | 极弱(100% 胶水) | →integrations |

### 附录 B：构建时序（包级）

```
ubean dev:   cli/dev.ts → config → preset(诊断) → routing(scanProject) → codegen(generateTypes)
             → app(createUbeanApp) → dev-server(createViteDevServer)
             → [无用户 vite.config] build/vite(ubeanPlugin) + vite(ubeanVite) + islands(ubeanIslandsPlugin)
             → vite(middlewareMode) → ssr(createVueRenderer) → dev-server(watcher 150ms 防抖) → rescan 循环

ubean build: cli/build.ts → config → routing(scanProject) → codegen → preset(build:before)
             → build/production(buildProduction: 注册 9 虚拟模块→落盘 .ubean/virtual → viteBuild(client)
             → viteBuild(ssr) → preset 入口 server.mjs/worker.mjs/handler.mjs)
             → cli(createSsrFetcher) → prerender(SSG) → build:after
```

### 附录 C：主流元框架调研来源

- Nuxt: github.com/nuxt/nuxt/tree/main/packages（schema/kit/vite-builder/nitro-server…），`nuxt/app` 子路径，`#app` 虚拟别名；CLI/devtools/test-utils 独立仓；Nitro 独立为 nitrojs/nitro。
- Next.js: github.com/vercel/next.js/tree/main/packages（单 `next` 主包，无 exports map，`next/client` 目录式入口）+ crates/（turbopack rust）；`@next/font` npm 冻结 14.2.15（收包证据）。
- SvelteKit: github.com/sveltejs/kit（`@sveltejs/kit` 单框架包 + 6 adapter 同仓；`$app/*` 虚拟模块；vite-plugin-svelte 独立仓）。
- Astro: github.com/withastro/astro（主包 + 17 integrations 全在主仓；integration API 钩子 + inject 函数族；`astro:content` 等虚拟模块 + `astro/virtual-modules/*` 物理后备；`@astrojs/internal-helpers` 公开内部工具）。
- React Router v7/8: github.com/remix-run/react-router（Remix 收敛公告 remix.run/blog/merging-remix-and-react-router；react-router 主包 + @react-router/dev/node/serve/cloudflare/express/architect/fs-routes）。
- TanStack Start: github.com/TanStack/router（42 包；start-{client,server,plugin}-core 哑铃 + react/solid/vue-start 薄壳；`./client`、`./server-rpc` 等 RPC 边界子路径）。
- VitePress: github.com/vuejs/vitepress（单包；`vitepress/client`、`vitepress/theme` 子路径）。
- Analog: github.com/analogjs/analog（`@analogjs/platform` 聚合元包 = vite-plugin-angular + vite-plugin-nitro + nitropack；`@analogjs/router` 独立客户端路由包）。

### 附录 D：推荐包职责明细（节选）

| 包 | 职责 | 为什么独立 | 包含 | 不包含 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| @ubean/client | 文件式路由 + 页面缓存 + 过渡/重载的纯客户端内核，Vue 插件 `ubeanClient` + vite 插件 `ubeanClientPlugin` | optimize.md 验收目标；SoybeanAdmin Next Phase 0 依赖；与 runtime 共用实现 | cache-views/page-runtime/router-location/define-app/client-app(PageView/Link/Head/SlotView/usePage/useRouter)/view-transitions/i18n 包装/client 虚拟模块 | createUbeanSSRApp、createServerHead、party-town/search(可选)、任何 vite/oxc 依赖 | vue, vue-router, @unhead/vue, @ubean/pages, @ubean/routing(type), 可选 @ubean/i18n |
| @ubean/shared | 协议类型 + 错误 + env + 通用工具 | 零依赖叶子聚合，防环断点 | types/error/env/utils 的 path/glob/string | utils 的 port/vite-config(Node 侧)、路由算法(归 routing) | 无（或 type-only hono 移 devDeps） |
| @ubean/integrations | 薄扩展聚合：electron/ui/pinia/pwa/fonts | 5 包合计 ~1966 行、多数纯胶水，无独立发布节奏 | 各包 `/vite` 插件工厂 + runtime 子路径（保持原子路径 exports 兼容） | ai/auth/icon/image/content（实质逻辑包） | 按需可选 peer |
| @ubean/build | 生产构建编排 + 构建底座 | 构建链枢纽 | production/virtual-registry/registry/macros/框架无关虚拟模块 | Vue 虚拟模块工厂（归 vite） | 经 `ubean/vite` 聚合入口消费 vite，无直接反向依赖 |
