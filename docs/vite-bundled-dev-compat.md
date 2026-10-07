# Vite `experimental.bundledDev` 兼容性调查

> **性质**：开发任务型（dev-task，见 [ADR-0007](adr/0007-docs-content-classification.md)）。**这是调查记录，不是决策** —— 是否支持尚未决定，`docs/roadmap.md` 也未开任务 ID。
> **状态**：调查完成，结论已实测验证（2026-10-07）。**未实施任何支持改动**，仓库现状 = 不支持。
> **关联**：[ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)（Vite 插件化生命周期，本文列出的接线点全在它确立的架构里）、[ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)（架构健康 40%）
> **复现环境**：`examples/ubean-test`，`vite-plus` 1.0.0 / `@voidzero-dev/vite-plus-core` 1.0.0（版本由根 `pnpm-workspace.yaml` 精确钉住，见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md) 的契约测试约束）。上游内部行号引用该版本的 `dist/vite/node/chunks/node.js`。

---

## 0. 结论

**ubean 目前不支持 Vite 的 `experimental.bundledDev`。** 框架侧零接线（无配置字段、无透传、环境未设 `isBundled`），且实测开启后 dev 拓扑被破坏到**页面完全无法水合**的程度。

用户的 `vite.config.ts` 是原样加载的（`packages/cli/src/dev-server/dev-vite.ts:152` `configFile: userViteConfig ?? false`），所以写 `experimental: { bundledDev: true }` **语法上会被 Vite 接受并生效** —— 只是结果坏掉。这与 `experimental.viteBuilder` 那种「写顶层会被静默忽略」的旧字段不同，值得在文档里说清。

三处独立故障，**每一处单独就足以让页面无水合**：

| # | 故障 | 症状 |
| --- | --- | --- |
| 1 | 客户端入口 404 | `/@id/virtual:ubean-client-entry` → 404，HTML 里的入口标签指向空 |
| 2 | `virtual:ubean-server` 加载失败 | `The argument 'path' must be a string, Uint8Array, or URL without null bytes. Received '\x00virtual:ubean-server.ts'` → `[ubean] Failed to load server config` |
| 3 | HTML 与打包产物完全脱钩 | bundledDev 打包出的 `assets/app.js` 存在且完整，但 HTML 里**没有任何标签指向它**（`grep -c "assets/"` = 0、`grep -c "bundledDevClient"` = 0） |

故障 2 的根因已定位并**用对照实验证明**（见 §3）；故障 1、3 是架构性错配（见 §4、§5）。

---

## 1. 上游是什么（vite-plus 1.0.0）

`experimental.bundledDev` 让 `serve` 期间对 client 环境做**全量打包**（rolldown dev engine 驱动），取代按需 transform + 依赖预构建。上游标注 `@experimental`、`@default false`。

**入口**：
- CLI flag 是 `--experimentalBundle`（`node_modules/vite-plus/dist/bin.js`）。映射发生在 vite-plus-core 的 `dist/vite/node/cli.js`：dev 命令 action → `createServer({ …, experimental: { bundledDev: options.experimentalBundle } })`。
- 配置字段是 `experimental.bundledDev`（`index.d.ts:3737`）。`vp dev --experimental.bundledDev` 会被当未知字段忽略。
- 逐环境覆盖：`environments[name].isBundled`（`index.d.ts:3450`，声明在 `SharedEnvironmentOptions` 上，**不在 `dev` 下**；`EnvironmentOptions extends SharedEnvironmentOptions` 见 `index.d.ts:3452`）。build 期所有环境默认 `true`；serve 期仅当 `experimental.bundledDev` 开启时 client 默认 `true`；显式设置总是覆盖默认。
- 运行时读取：`DevEnvironment.bundledDev?: BundledDev`（`index.d.ts:1888`）。

**行为差异（上游已文档化）**：HMR 语义与 middleware dev server 有两处不同 —— boundary 在浏览器端按运行时状态计算；dead branch 里的 `import.meta.hot.accept()` 不再抑制更新，回退整页 reload；`hot.invalidate()` 完全客户端处理。

**关键实现点**（`chunks/node.js`）：

| 行 | 内容 |
| --- | --- |
| `41864` | `if (options.isBundled \|\| name === "client" && config.experimental.bundledDev) { context.disableDepsOptimizer = true; this.bundledDev = new BundledDev(this); }` |
| `41169-41171` | `BundledDev` 构造器（`constructor(environment)` 在 `41169`）第一件事：`if (environment.name !== "client") throw new Error("currently full bundle mode is only available for client environment")`（`41171`） |
| `30237` | `if (!config.experimental.bundledDev) middlewares.use(cachedTransformMiddleware(server))` |
| `30250-30257` | bundledDev 时挂 `triggerLazyBundlingMiddleware` + `memoryFilesMiddleware`；**否则**挂 `transformMiddleware` / `serveRawFsMiddleware` / `serveStaticMiddleware` |
| `30258-30263` | `htmlFallbackMiddleware` / `indexHtmlMiddleware` / `notFoundMiddleware` **只在 `appType === 'spa' \|\| 'mpa'` 时挂** |
| `30271` | `initServer`：`if (!config.experimental.bundledDev) await environments.client.pluginContainer.buildStart()` |
| `30006` | `import_chokidar.watch([...config.experimental.bundledDev ? [] : [root], ...])` —— 不 watch 项目根 |
| `30637` | `if (config.experimental.bundledDev) return;` —— 关闭 Vite 的 `onFileChange` HMR 派发 |
| `39679-39682` | 打包入口链：`libOptions` → `options.ssr` → `options.rolldownOptions.input \|\| (environment.config.input ?? resolve("index.html"))`；SSR + `.html` 入口会抛错 |
| `41377` | dev 输出固定 `entryFileNames = "assets/[name].js"`（`minify=false`、`sourcemap=true`） |
| `37110-37121` | `vite:build-html` 在 `command === "serve" && consumer === "client" && isBundled` 时向 HTML `injectToHead` 注入 `<script type="module" src="{base}/bundledDevClient.mjs">` |
| `21731` | `vite:client-inject` 的 `applyToEnvironment(environment) { return !environment.config.isBundled }` —— bundledDev 下 `/@vite/client` **无人产出** |
| `41117` | `MemoryFiles` 类（`files` Map、`size`/`get`/`set`/`has`/`clear`），HTML 不入内；`BundledDev` 上实例化于 `41168`（`memoryFiles = new MemoryFiles()`，字段声明，**不在**构造函数体里） |

**`memoryFiles` 里没有 HTML**：实测 84 个条目（`bundledDevClient.mjs` + `assets/app.js` + 各页/布局/island chunk），`html` 过滤结果为空数组。这决定了 ubean 的 HTML 必须自己产出（它本来就自己产出，见 §5）。

---

## 2. ubean 侧现状：零接线

| 位置 | 现状 |
| --- | --- |
| `packages/config/src/types.ts:810-814` `dev?: { port; host; open }` | 无 `bundledDev` / `isBundled` 字段，也无顶层 `experimental` 透传 |
| `packages/builder/src/vite.ts:303-349` `ubeanPlugin()` 的 `config()`（返回值 `:346`） | 只返回 `{ builder: { buildApp }, environments }`，**不**返回 `experimental` |
| `packages/builder/src/vite/build-configs.ts:111-146` `createBuildEnvironments()` | `client` / `ubean` 两个环境都没有 `dev.isBundled` |
| 全仓 grep `bundledDev` / `isBundled` / `experimentalBundle` | **0 命中**（其余 `experimental` 命中是无关的 `viteBuilder` 历史残留、`@ubean/content` 的 `watch`、`@ubean/integrations/fonts` 的 `inline`） |

**有一个好消息**：打包**入口已经是对的**。`createBuildEnvironments` 把 `client` 环境的 `build.rollupOptions.input.app` 设成 `clientInput`（`build-configs.ts:126`），而 bundledDev 的入口解析链（`39681`）正是读 `options.rolldownOptions.input` —— 所以它打出来的 `assets/app.js` 就是 ubean 的完整客户端产物（37246 行，末尾执行 `createApp();`，内含 `__rolldown_runtime__.registerGraph({...})` 与全部 `?rolldown-lazy=1` 动态 chunk）。**缺的不是产物，是把 HTML 接到产物上的那一步。**

---

## 3. 故障 2 的根因（已用对照实验证明）

### 因果链

1. ubean 的虚拟模块注册表由插件 `buildStart` 填充（`packages/builder/src/vue-plugin.ts:182-194` 的 `buildStart` → `scanAndRegister()`（`:140-144`）→ `applyScan()`（`:153-165`）→ `virtualRegistry.register(...)`）。
2. Vite 默认**只对 `client` 环境跑 `buildStart`**。判据在 `chunks/node.js:11179`：
   ```
   (plugin) => this.environment.name === "client"
            || config.server.perEnvironmentStartEndDuringDev
            || plugin.perEnvironmentStartEndDuringDev
   ```
3. bundledDev 下**连 client 的 `buildStart` 也跳过**（`chunks/node.js:30271`）。
4. → 注册表为空 → `vue-plugin.ts` 的 `load()` 里 `loadVirtualModule()` 返回 `undefined`。
5. → Vite 走 `loadAndTransform` 的 fs 回退（`chunks/node.js:25304-25316`：`if (loadResult == null) { const file = cleanUrl(id); … await fsp.readFile(file, …) }`）。
6. → 读 `\0virtual:ubean-server.ts`，`node:fs` 拒绝含 null 字节的路径 → 报错。

注意 `\0` 的来源：URL 里的 `__x00__` 由 `unwrapId()`（`chunks/node.js:3202-3204`，`NULL_BYTE_PLACEHOLDER = "__x00__"`）还原成真实 `\0`。

### 对照实验

在 `examples/ubean-test/vite.config.ts` 里**只加** `server: { perEnvironmentStartEndDuringDev: true }`（其余不变，`experimental: { bundledDev: true }` 照开）：

| 指标 | bundledDev 单独 | + `perEnvironmentStartEndDuringDev` |
| --- | --- | --- |
| `grep -c "null bytes"` 日志 | **2** | **0** |
| `Failed to load server config` | 2 | **0** |
| `/_health` | 200 | 200 |

即**故障 2 是 ubean 自己的时序依赖问题**（依赖「注册表在 buildStart 里填好」），不是上游 bug。修复路径清楚：要么框架侧自动注入 `perEnvironmentStartEndDuringDev: true`，要么把注册表改成惰性填充（不依赖 Vite 内部时序，更稳）。

> **注意这个实验只修掉了故障 2。** 修完后 `/@vite/client` 与 `/@id/virtual:ubean-client-entry` **仍然都是 404** —— 故障 1 和 3 独立存在。

---

## 4. 故障 1：客户端入口 404

`/@id/virtual:ubean-client-entry` → 404。

ubean 的 pre 中间件判据 `isViteResourceRequest()`（`packages/builder/src/dev/dev-request-router.ts:198-225`）规则 ① 命中 `VITE_URL_PREFIXES = ['/@vite/', '/@id/', '/@fs/', '/node_modules/', '/__vite_ping']`（`dev-request-router.ts:46`）→ 把请求判给 Vite 并 `next()`。而 bundledDev 下 Vite **不挂** `transformMiddleware`（`30250-30257`），没有任何中间件能响应 `/@id/...` → 404。post 中间件也因 pre 已放行而不接管。

同一判据也是 `vue-plugin.ts` 的 `transformIndexHtml` 决定「要不要注入客户端入口」的依据（注释在 `dev-request-router.ts:81-82` 说明这是**单点维护**的共享判据）—— 两处要一起改。

**修法方向**：bundledDev 下 `isViteResourceRequest` 需把 `/@vite/lazy?`、`/assets/*`、`/bundledDevClient.mjs` 归 Vite，同时**不再**把 `/@id/` 无条件归 Vite（因为 transformMiddleware 缺席，`/@id/` 在 bundledDev 下没有任何服务者）。

---

## 5. 故障 3：HTML 与打包产物脱钩（架构性错配）

### 事实

bundledDev 下首页 HTML：`grep -c "assets/"` = **0**、`grep -c "bundledDevClient"` = **0**。HTML 里只有两个**都 404** 的标签：

```html
<script type="module" src="/@vite/client"></script>
<script type="module" src="/@id/virtual:ubean-client-entry"></script>
```

而 `memoryFiles` 里 84 个真实产物（含 `assets/app.js`）**没有任何标签指向**。

### 为什么

ubean 走 `appType: 'custom'`（`dev-request-router.ts:541-543`，注释在 `:529-537` 说明这是**必须**的：默认 `spa`/`mpa` 会在静态中间件之后挂 HTML 中间件，把未知路径改写成 `index.html`）+ **自产 HTML**（自己调 `server.transformIndexHtml`，`dev-request-router.ts:473`）。

这两条恰好绕开了 Vite 的**全部** bundledDev HTML 路径：

| 上游 HTML 路径 | 为何不参与 |
| --- | --- |
| `vite:build-html` 的 `bundledDevClient.mjs` 注入（`37110-37121`） | 挂在 `transform` 且 `applyToEnvironment(isBundled)`；ubean 的 HTML 不经过它 |
| `htmlFallbackMiddleware` / `indexHtmlMiddleware` | 只在 `appType === 'spa' \| 'mpa'` 时挂（`30258-30263`） |

同时 `/@vite/client` 之所以出现在 ubean 的 HTML 里，是因为 ubean 调 `transformIndexHtml` → 走 Vite 的 `devHtmlHook`（`chunks/node.js:22720-22729`），它无条件注入 `<script type="module" src="{base}/@vite/client">`。而该模块在 bundledDev 下由 `vite:client-inject` 的 `applyToEnvironment(!isBundled)`（`21731`）关闭 → 404。

### 隐藏依赖：`bundledDevClient.mjs` 不是可选的

`assets/app.js` 用的是**裸全局** `__rolldown_runtime__`（无 import 声明）。该全局只在 `dist/vite/client/bundledDevClient.mjs:1847` 定义：

```js
const runtime = (_ref = globalThis).__rolldown_runtime__ ?? (_ref.__rolldown_runtime__ = new ViteDevRuntime(clientId));
```

**所以即便把 HTML 指向 `assets/app.js`，也必须先加载 `bundledDevClient.mjs`，否则 `ReferenceError`。** 任何修复方案都必须同时注入这两个。

---

## 6. 若要支持：三件事

按依赖顺序，且第 3 件是另两件的前提：

1. **修 `buildStart` 时序（故障 2，前提）**。二选一：框架侧自动注入 `server.perEnvironmentStartEndDuringDev: true`；或把虚拟模块注册表改为惰性 / `resolveId` 时填充（**推荐** —— 不依赖 Vite 内部时序，也更贴合「注册表是框架自己的状态」这一事实）。注意这个改动会影响所有环境，需要回归 `packages/builder/test/` 下与虚拟模块相关的用例。
2. **HTML 注入（故障 3）**。在 `vue-plugin.ts:306-307` 的 `transformIndexHtml` 里分支：bundledDev 时注入 `/bundledDevClient.mjs`（**先**）+ 打包入口 `assets/app.js`（**后**），而不是 `/@id/virtual:ubean-client-entry`。入口名由 `build-configs.ts:126` 的 `input: { app: clientInput }` 决定（→ `assets/app.js`，dev 输出命名固定，见 `41377`）。
3. **请求判据对齐（故障 1）**。`isViteResourceRequest()`（`dev-request-router.ts:198-225`）+ 其共享判据消费者（`vue-plugin.ts` 的 `transformIndexHtml`）在 bundledDev 下改判：`/@vite/lazy?`、`/assets/*`、`/bundledDevClient.mjs` → Vite；`/@id/` → 不再无条件归 Vite。`RESERVED_APP_PREFIXES = ['/_', '/__', '/api/']`（`dev-request-router.ts:54`）与 `/assets/` 不冲突（前者以 `_` 开头）。

**另外要注意的副作用**（上游按 `isBundled` 关掉/改写的插件，共 26 处 `environment.config.isBundled` 判据）：

- `vite:optimized-deps`（`31018`）、`vite:pre-alias`（`31088`）、`vite:resolve-dev`（`34349`）、`vite:css-analysis`（`35369`）、`vite:import-glob`（`32751`）、`vite:modulepreload-polyfill`（`36658`）等在 bundledDev 下**关闭**。
- `vite:define`（`21594`/`21649`）在 `isBundled` 时把 `import.meta.env.*` **全部静态化**、`import.meta.env.SSR` → `undefined`。
- 资源 URL 走 `toOutputFilePathInJSForBundledDev`（`37578`/`37658`/`37773`）。
- CSS 更新导入改为 `import.meta.hot._internal` 而非 `import /@vite/client`（`35085`）。
- 文件监听不再 watch 项目根（`30006`），HMR 派发由 rolldown dev engine 接管（`30637`）。**这会与 ubean 自己的 watcher 体系交互** —— `createDevScanCoordinator`（`packages/builder/src/dev/dev-scan.ts`）用 `server.watcher` 做单一监听 + 去抖 150ms + 单飞，bundledDev 下 `server.watcher` 是否还覆盖项目文件需要单独验证。
- `DevEnvironment.warmupRequest`（`chunks/node.js:41955-41956`）与 `DevEnvironment.invalidateModule`（`chunks/node.js:41967-41968`）在 bundledDev 下都是 `if (this.bundledDev) return;` —— **ubean 依赖的 `moduleGraph` / `invalidateModule` 是死代码**，`dev-request-router.ts:472` 的 `collectDevCssLinks(server.environments.client.moduleGraph)` 拿到的将是空图。

**最后一条是最大的未知数**：故障 1/2/3 修完之后，ubean 的 dev 重载/失效链路（dev-scan 协调器 → 模块失效 → HMR）在 bundledDev 下能否工作，尚未验证。建议真要实施时把它作为**独立的验收项**，而不是假定「入口接上了就完事」。

---

## 7. 复现步骤

```bash
cd examples/ubean-test

# 故障基线（bundledDev 开）
#   vite.config.ts 里加：experimental: { bundledDev: true }
node ../../node_modules/vite-plus/dist/bin.js dev --port 5199 --strictPort
# 等价：node ../../node_modules/vite-plus/dist/bin.js dev --experimentalBundle --port 5199 --strictPort

# 探测
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/                          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/bundledDevClient.mjs     # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/assets/app.js             # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/@vite/client              # 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/@id/virtual:ubean-client-entry  # 404
curl -s http://localhost:5199/ | grep -c 'assets/'          # 0  ← 故障 3
curl -s http://localhost:5199/ | grep -c 'bundledDevClient' # 0  ← 故障 3
```

**对照基线**（去掉 `experimental`，端口换 5198）：`/` 200、`/@vite/client` 200、`/@id/virtual:ubean-client-entry` 200、无 null-bytes 报错。

**坑**：
- `vp dev` 必须在**示例目录**里跑（`cd examples/ubean-test`），在仓库根跑会 root 错 → 全站 404，且探针插件钩子不触发。
- macOS 无 GNU `timeout`；用 `nohup … &` + pid 文件。
- 探测 `memoryFiles` 的探针插件必须注册在 `ubeanPlugin()` **之前**，落盘用 `appendFileSync`/`writeFileSync`（`console.log` 会被 `vp` 吞掉）。`memoryFiles` 是自定义类不是 Map —— 键在 `.files` 里。
- 端口用完清理：`lsof -ti :5196 -ti :5197 -ti :5198 -ti :5199 | xargs -r kill -9`。

---

## 8. 与既有文档的关系

- [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md) 第 152 行已记录「`vite-plus` 的 Builder / Environment API 仍标注 `@experimental`」，缓解方式是**契约测试 + 版本锁**（`packages/builder/test/vite-plus-contract.test.ts`）。本文列的接线点全部落在 ADR-0012 确立的架构里（插件承担框架职责、`appType: 'custom'`、环境划分 `client` + `ubean`）。
- 本文**不构成决策**。若决定支持 bundledDev，建议先补一份 ADR 说明「为什么值得为一套 `@experimental` 的 dev 模式增加分支」，并同步 `vite-plus-contract.test.ts`。
- `AGENTS.md:182` 提到的 `experimental.viteBuilder` 是 **ubean 自己的旧字段**（已随 RM-V36 删除，写它会被当未知字段忽略），与 Vite 的 `experimental.bundledDev` **无关** —— 两者都叫 `experimental`，别混。
