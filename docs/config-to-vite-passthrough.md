# ubean 配置到 Vite 的传递与覆盖调查

> **性质**：开发任务型（dev-task，见 [ADR-0007](adr/0007-docs-content-classification.md)）。**这是调查记录，不是决策** —— 是否调整配置面尚未决定，`docs/roadmap.md` 也未开任务 ID。
> **状态**：调查完成，结论已实测验证（2026-10）。**未实施任何改动**，仓库现状 = 下表所列的字段子集与覆盖顺序。
> **关联**：[ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)（Vite 插件化生命周期 —— `ubeanPlugin()` 的 `config()` 钩子与裸 `vite dev` 等价性都在它确立的架构里）、[vite-bundled-dev-compat.md](vite-bundled-dev-compat.md)（同为「ubean 与 Vite 上游边界」类调查）
> **复现环境**：`examples/ubean-test`，`vite-plus` 1.0.0 / `@voidzero-dev/vite-plus-core` 1.0.0（版本由根 `pnpm-workspace.yaml` 精确钉住）。上游内部行号引用该版本的 `dist/vite/node/chunks/node.js`。

---

## 0. 结论

**ubean 配置到 Vite 只有一条通道，而且只在 ubean CLI 下存在。**

- **`dev` / `preview` 的 host/port 是 CLI 的 `InlineConfig`**，不是插件的 `config()` 钩子返回值。全仓 6 个 `config()` 钩子**没有一个**碰 `server.port` / `server.host`。
- **裸 `vite dev` / `vp dev` 拿不到 ubean 配置里的 `dev`** —— 而 `examples/ubean-test` 的 scripts 恰恰是 `dev: "vp dev"`（不是 `ubean dev`）。这是最容易踩的坑：在 `ubean.config.ts` 里写 `dev: { port: 5401 }` 再跑 `vp dev`，实际监听 **5173**（Vite 默认值）。（配置文件本身仍被插件读取，页面/路由等照常生效。）
- **覆盖顺序（实测）**：`Vite 默认值 < vite.config.ts < ubean 配置（经 CLI inlineConfig）< CLI flag`。即 `ubean dev` 下 `ubean.config.ts` 的 `dev.port` **赢过** `vite.config.ts` 的 `server.port`。
- **三处「配了不生效」**：`strictPort` 恒被 citty 默认值 `false` 冲掉（dev 与 preview 都是）、`server.proxy` 在 ubean 下对**无扩展名**应用路径失效（中间件顺序问题）、`server.headers` 只作用于 Vite 自己服务的资源。
- **四个死字段**：`dev.open`（无人读）、`preview.strictPort`（被 citty 默认值冲掉）、`build.minify` / `build.sourcemap`（构建环境配置里硬编码 `minify: true, sourcemap: false`）。
- **命名问题**：ubean **既不接受顶层 `vite` 也不接受 `server` 字段**，写进去会被 c12 静默忽略。所以「ubean 配置里直接使用 Vite 同名的 `server` 字段」目前**不可行**。核心痛点不是命名而是「配了不生效」，两条候选路线的取舍见 §5。

---

## 1. 两条通道，只有一条通到 server 配置

### 1.1 通道 A：CLI `InlineConfig`（`dev` / `preview` 走这条）

`packages/cli/src/dev.ts:130-131`：

```ts
// 优先级：CLI flag > ubean.config.ts dev 字段 > loader 默认值（9527/localhost）。
// CLI args 不能设 citty default，否则默认值会让 || 短路、config.dev 永远读不到。
const port = Number(args.port) || config.dev.port;
const host = args.host || config.dev.host;
```

→ `packages/cli/src/dev-server/dev-vite.ts:159` 变成 `createViteServer({ …, server: { host, port: options.port, strictPort } })` 的 **inlineConfig**。

preview 侧同形，`packages/cli/src/preview.ts:117-119` → `:195` 的 `preview: { port: actualPort, host, strictPort }`。

**这条通道的两个固有性质：**

1. **只在 `ubean dev` / `ubean preview` 下存在。** `vp dev` 不经过 `packages/cli/src/dev.ts`，因此 **`server`/`preview` 这两块配置没有消费者**。（ubean 配置文件本身当然还是被读了 —— `ubeanPlugin()` 内部 `await ensureUbeanConfig()`，页面/路由/routeRules 在裸命令下照常工作；这里说的是 server 配置。）
2. **`dev.port` 永远有值，所以 `vite.config.ts` 的 `server.port` 在 `ubean dev` 下永远没机会生效。** `resolveUbeanConfig` 已经把默认值填进去了（`packages/config/src/loader.ts:229-230`：`dev: { port: 9527, host: 'localhost', open: false }`、`preview: { port: 9725, host: 'localhost', strictPort: false }`），所以 inlineConfig 里必然带着一个具体 port。这是设计上的必然结果，不是 bug —— 但意味着**两套配置在 `ubean dev` 下必然打架，且 ubean 那套赢**。

### 1.2 通道 B：插件 `config()` 钩子（**不承载 server 配置**）

全仓 `packages/*/src` 只有 6 个 `config()` 钩子：

| 位置 | 返回 |
| --- | --- |
| `packages/builder/src/vite.ts:296` | `{ builder: { buildApp }, environments }`（`UBEAN_BUILD_DRIVEN_BY_CLI === '1'` 时 `return undefined`） |
| `packages/builder/src/vue-plugin.ts:225` | `{ appType: 'custom', resolve: {…}, optimizeDeps, ssr }` |
| `packages/builder/src/dev/dev-request-router.ts:541` | `{ appType: 'custom' }` |
| `packages/integrations/src/ui/index.ts:58` | `{ optimizeDeps: { include: ['@vean/ui'] } }` |
| `packages/integrations/src/pinia/index.ts:52` | `{ optimizeDeps: { include: ['pinia'] } }` |
| `packages/ai/src/vite.ts:84` | `{ optimizeDeps: { include: ['@ubean/ai/runtime/vue'] } }` |

**没有一个设置 `server.port` / `server.host`。** 这正是「裸 Vite 拿不到 ubean 的 server 配置」的结构性原因：如果想让 ubean 配置对裸 `vite dev` 也生效，唯一的位置就是这里（`packages/builder/src/vite.ts:296` 的 `config()` 里读 `config.dev` 并返回 `{ server: … }`）—— 那会引入「插件配置压过用户 `vite.config.ts`」的新语义（见 §5b）。

### 1.3 Vite 的覆盖顺序（上游 `chunks/node.js` 已核实）

```
Vite 默认值  <  vite.config.ts  <  插件 config() 返回  <  CLI inlineConfig
```

- `resolveConfig` 先读配置文件，再 `config = mergeConfig(loadResult.config, config)`（`node.js:42467`）—— **inlineConfig（CLI）是 overrides 参数，赢过 `vite.config.ts`**。
- 插件 `config()` 钩子随后跑（`runConfigHook` `node.js:43077-43095`），`conf = mergeConfig(conf, res)`（`:43092`）—— **插件返回值也赢过配置文件**。
- `mergeConfigRecursively` 在 `node.js:5636-5674`、`mergeConfig` `:5675`、`mergeInput` `:5679+`（普通对象递归合并、数组拼接、`input` 走 `mergeInput`）。

---

## 2. 覆盖顺序的实测矩阵

方法：`examples/ubean-test`，每轮实验前备份 `ubean.config.ts` / `vite.config.ts`，用 `node -e` 就地注入字段，跑完 `cp` 还原，并以 `git diff --stat -- examples/ubean-test/{vite,ubean}.config.ts` 为空确认干净。

| # | 场景 | 实际监听 |
| --- | --- | --- |
| 1 | 裸 `vp dev` + ubean `dev: { port: 5401 }` | **5173**（ubean 配置被完全忽略） |
| 2 | `ubean dev` + 同一配置 | 5401 |
| 3 | 裸 `vp dev` + `vite.config server.port: 5402` | 5402 |
| 4 | `ubean dev` + ubean `dev.port=5411` **且** vite `server.port=5402` | **5411**（ubean 配置赢） |
| 5 | 场景 4 再加 `--port 5412` | 5412（flag 赢） |
| 6 | `ubean preview` + ubean `preview.port=5413` **且** vite `preview.port=5414` | **5413** |
| 7 | `ubean dev`，ubean 配置**无** `dev` 字段，vite 写 `server.port: 5482` | **9528**（ubean 默认 9527 被占用 → +1） |

场景 7 是 §1.1 性质 2 的直接后果。

### `configResolved` 原始读数

探针（`enforce: 'pre'`，注册在 `ubeanPlugin()` **之前**）落盘的 `c.server` / `c.preview`：

```jsonc
// vite.config.ts: server { port: 5482, host: '127.0.0.1', strictPort: true, proxy: {...}, headers: {...} }
//                preview { port: 5483, strictPort: true }
// ubean.config.ts: dev { port: 5490, host: '0.0.0.0' }  preview { port: 5491, host: '0.0.0.0' }

{"who":"bare-vp",        "port":5482,"host":"127.0.0.1","strictPort":true, "proxyKeys":["/probe-proxy.json"],"headerKeys":["X-Probe"],"previewPort":5483,"previewStrict":true, "previewHost":"127.0.0.1"}
{"who":"ubean-dev",      "port":5490,"host":"0.0.0.0",  "strictPort":false,"proxyKeys":["/probe-proxy.json"],"headerKeys":["X-Probe"],"previewPort":5483,"previewStrict":true, "previewHost":"0.0.0.0"}
{"who":"ubean-preview",  "port":5482,"host":"127.0.0.1","strictPort":true, "proxyKeys":["/probe-proxy.json"],"headerKeys":["X-Probe"],"previewPort":5491,"previewStrict":false,"previewHost":"0.0.0.0"}
```

读出来的三件事：

1. **`proxy` / `headers` 被完整保留**（`proxyKeys` / `headerKeys` 非空）—— 只有 port/host/strictPort 被 ubean 覆盖。所以「ubean 覆盖了 `server` 配置」这个说法要限定范围。
2. **`ubean-dev` 行 `previewPort` 仍是 vite.config 的 5483** —— dev 命令完全不碰 `preview`。
3. **`ubean-preview` 行的 `port` 是 5482**（vite.config 的 `server.port`）—— preview 命令完全不碰 `server`。

---

## 3. 三处「配了不生效」（实测，非推测）

### 3.1 `strictPort` 恒被冲成 `false`

`packages/cli/src/dev.ts:69-73` 与 `packages/cli/src/preview.ts:83-87` 都给 citty 声明了 `default: false`。实测 citty 在**不给任何 flag** 时产出 `args = {"_":[],"strictPort":false,"strict-port":false}`，于是：

- dev：`packages/cli/src/dev.ts:188` 无条件传 `strictPort: args.strictPort`（永远 `false`）。
- preview：`packages/cli/src/preview.ts:118` 的 `args.strictPort ?? config.preview.strictPort` 恒为 `false` → **`config.preview.strictPort` 是死字段**。

对照实验（占住端口 + `strictPort: true`）：

| 场景 | 裸 Vite | ubean CLI |
| --- | --- | --- |
| dev：占 5420 + `vite.config server.strictPort: true` | **直接抛错退出**（栈尾 `startServer … node.js:30299`） | 照常在 9528 起来，**0 条 in-use 提示** |
| preview：占 5495 + ubean `preview.strictPort: true` | 裸 `vp preview` + vite.config 同条件 **直接崩**（栈尾 `preview … node.js:40649`） | 落到 **5496**，**0 条 in-use 提示** |

**注意 `dev` 甚至没有 `strictPort` 字段**（`packages/config/src/types.ts:810-814` 只有 `port`/`host`/`open`）—— 所以 dev 侧当前**无法**表达 strict 语义，只能靠 `--strictPort` flag。

修法方向：citty 的 `strictPort` 去掉 `default: false`（用 `undefined` 区分「未传」），取值改 `args.strictPort ?? config.<dev|preview>.strictPort ?? false`。注意 `packages/cli/src/dev.ts:130-131` 的注释已经为 port/host 记录了同一类坑（「CLI args 不能设 citty default，否则 `||` 短路」），`strictPort` 是漏网的那个。

### 3.2 `server.proxy` 对无扩展名应用路径失效（中间件顺序）

不是配置丢失（§2 读数显示 `proxyKeys` 非空），是**中间件顺序**：

```ts
// packages/builder/src/dev/dev-request-router.ts:563,565
server.middlewares.use(pre);    // configureServer 钩子体内 → 立即执行
return () => { server.middlewares.use(post); };  // 返回函数 → 进 postHooks，晚得多
```

上游 `chunks/node.js`：

```js
:30236  postHooks.push(await hook.call(configureServerContext, reflexServer));  // configureServer 钩子在这里跑
:30241  middlewares.use(proxyMiddleware(middlewareServer, proxy, config));      // proxy 在这里才挂
:30259  postHooks.forEach((fn) => fn && fn());                                  // 返回函数在这里才挂
```

`pre` 把无扩展名的应用路径全吃掉 → 请求到不了 `proxyMiddleware`。实测（上游 5431 返回 `PROXY-OK <url>`）：

| 路径 | 裸 `vp dev` | `ubean dev` |
| --- | --- | --- |
| `/probe-proxy`（无扩展名） | 404 HTML | **404 ubean JSON**（`{"error":"Not Found","path":"/probe-proxy",…}`） |
| `/probe-proxy.json`（有扩展名） | — | **200 `PROXY-OK /probe-proxy.json`** ✅ |
| `/probe-asset.js` | — | **200 `PROXY-OK /probe-asset.js`** ✅ |

判据在 `dev-request-router.ts:198-225` 的 `isViteResourceRequest()`：第 4 条 `sec-fetch-dest`（`RESOURCE_DESTS`，`:100`）与第 5 条扩展名启发式（`hasAssetExtension()` `:186`，`ASSET_EXTENSIONS` `:123`）让带扩展名的请求回给 Vite。`/api/**` 这类无扩展名路径会被 ubean 的 API 路由接走 —— ubean 自带 `routeRules.proxy` 作为替代方案（`packages/routes/src/route-rules.ts`）。

修法方向（任一）：① 在 `pre` 的放行判据里加入 `server.proxy` 的键前缀（`Object.keys(server.config.server.proxy)`）；② 把 ubean 的请求路由改成 `configureServer` 的**返回函数**（post 位置），让 Vite 内置中间件先跑 —— 但会改变现有 `appType: 'custom'` 的拓扑（见 `dev-request-router.ts:532-535` 的注释），风险更大。

### 3.3 `server.headers` 只作用于 Vite 自己服务的资源

`/@vite/client` → 200 **且带 `X-Probe`**，但 ubean 渲染的 HTML **不带**。原因：`dev-request-router.ts:456-483` 的 `respond()` 只把 webRes 的头 `setHeader` 出去，没有合并 `server.config.server.headers`。上游那边 `servePublicMiddleware` / `transformMiddleware` 等都会读它（`node.js:22758` / `:22859`）。

---

## 4. 能到 Vite 的 ubean 配置（全部）与死字段

### 4.1 真正会到达 Vite 的字段

| ubean 配置 | 到达 Vite 的形式 | 生效条件 |
| --- | --- | --- |
| `rootDir` | `root: cwd` | 始终 |
| `srcDir` | 客户端入口路径（`entry.client.ts`）+ 扫描 glob | 始终 |
| `build.outputDir` | `build.outDir`（`getBuildOutDirsForConfig`） | 始终 |
| `build.preset` | 环境配置（worker 分流、`resolve.noExternal`、`define` 垫片） | 始终（CLI 经 `UBEAN_BUILD_PRESET` 传给插件，因为插件读的是它自己那份配置副本） |
| `dev.{port,host}` | inlineConfig `server.{port,host}` | **仅 `ubean dev`** |
| `preview.{port,host}` | inlineConfig `preview.{port,host}` | **仅 `ubean preview`** |
| `modules[].vitePlugin` | 任意 Vite 插件（`packages/config/src/types.ts:12-18` 的 `ModuleDefinition.vitePlugin`） | 始终 |
| `autoImports` / `components` | codegen（生成 `.ubean/*.d.ts` 与虚拟模块），**不是** Vite 配置 | 始终 |
| `dir.public` | ❌ 只喂 ubean 自己的静态服务（dev：`packages/builder/src/dev/dev-app.ts:125` 的 `publicDir: config.dir.public` 是 `createUbeanApp` 的选项，**不是** Vite 的 `publicDir`） | — |

**两个与 `dir.public` 相关的边界：**

1. **ubean 从不设置 Vite 的 `publicDir`**（全仓 grep 确认；`packages/preset/src/*.ts` 与 `packages/app/src/app.ts:136` 的 `publicDir` 都是平台预设 / ubean 静态服务自己的选项）。Vite 用它的默认推导（`root/public`），恰好与 `dir.public` 默认值同名，所以行为上通常一致 —— 但把 `dir.public` 改成别的名字，Vite 的 `publicDir` 不会跟着变。
2. **`dir.public` 在构建侧根本没有消费者**：`packages/builder/src/vite/build-app.ts:216` 硬编码 `join(cwd, 'public')` 来拷公共资源，不看 `config.dir.public`。全仓 `config.dir.public` 只有两处读取 —— `dev-app.ts:125`（dev 静态服务）与 `loader.ts:295`（favicon 探测）。即改 `dir.public` 只影响 dev 与 favicon，生产构建照旧读 `public/`。

### 4.2 死字段（grep + 实测确认无消费者）

| 字段 | 为什么是死的 |
| --- | --- |
| `dev.open` | 全仓无人读 `config.dev.open`；`packages/cli/src/dev.ts:82-85` 声明的 `args.open` 也从未被读（`dev.ts` 里的 `open` 命中全是 `openAPI` / `OpenAPI`） |
| `preview.strictPort` | 被 citty `default: false` 冲掉（§3.1） |
| `build.minify` | `packages/builder/src/vite.ts:222` 硬编码 `minify: true`；唯一的 `.minify` 读取是 `packages/cli/src/build.ts:210` 传的 **CLI flag** `args.minify`（citty `default: true`） |
| `build.sourcemap` | 同上，`packages/builder/src/vite.ts:223` 硬编码 `sourcemap: false`；`packages/cli/src/build.ts:211` 传 `args.sourcemap`（citty `default: false`） |

即 `ubean.config.ts` 里写 `build: { minify: false, sourcemap: true }` 完全无效；想改只能走 `ubean build --minify=false --sourcemap`。

另有一个**半死**字段：`dir.public` 在构建侧无消费者（见 §4.1 注 2）。

### 4.3 文档/模板漂移（顺带发现）

- `packages/cli/src/config.ts` 的 `CONFIG_EXAMPLE_FULL` 模板已腐坏：写的是顶层 `preset: 'standard'`（AGENTS.md 明确说顶层 `preset` 已死、只认 `build.preset`）、`build: { outDir: 'dist' }`（真实字段是 `build.outputDir`）、`viewTransitions`（不在 `UbeanConfig` 里）；只有 `srcDir` / `dev` 是对的。
- `apps/docs/src/content/{zh,en}/architecture/architecture.md`（`:181` / `:179`）写 `dev: { port: 9527, host: 'localhost' }`，未提 `open`，也未提「裸 `vite dev` 读不到」。

---

## 5. 命名问题：要不要直接用 Vite 的 `server` 字段

**现状：不可行。** `UbeanConfig`（`packages/config/src/types.ts`）里既没有顶层 `vite` 也没有 `server`。唯一的 `vite?: import('vite').InlineConfig` 出现在 `:50` / `:55`，是 Electron 的 `main.vite` / `preload.vite`，只作用于 electron 子进程。在 `ubean.config.ts` 里写 `server: { port: 3000 }` 会被 c12 **静默忽略**（没有 schema 校验）。

两条候选路线：

### (a) 保留 `dev` / `preview`，补齐透传（推荐）

- 与既有生态同形：Nuxt 是 `devServer`，Vite 自己有 `preview` 选项；`dev` / `preview` 的语义已被 `packages/config/src/loader.ts:229-230` 固化。
- 要修的正是 §3 的三处 + §4.2 的四个死字段。
- 最小改法：把 `dev` / `preview` 的字段扩成 `Partial<ServerOptions>` / `Partial<PreviewOptions>` 的**白名单子集**（`port`/`host`/`strictPort`/`open`/`proxy`/`headers`），在 `dev-vite.ts` / `preview.ts` 里 spread 进 inlineConfig；citty args 全部去掉 `default`，取值统一 `args.x ?? config.y ?? fallback`。
- 优点：不破坏现有配置；`ubean dev` 下「ubean 配置赢过 vite.config」的语义保持不变。
- 缺点：**裸 `vite dev` 仍然读不到**（§5b 的代价要单独决定）。

### (b) 新增 `server` / `preview` 直通字段（Vite 同名同义）

- 优点：用户零学习成本，`server: { port, host, strictPort, proxy, headers, open }` 直接照搬 Vite 文档。
- 代价一：与现有 `dev` / `preview` 语义**完全重叠**，必须二选一或做 deprecation。
- 代价二：`preview` 这个名字会和 Vite 的 `preview` 撞上（语义其实一致，但 ubean 的 `preview.strictPort` 当前是死的）。
- 代价三（最大）：**即使加了 `server` 直通，裸 `vite dev` 仍然读不到它** —— 因为这份字段只在 `ubean dev` 里被读。想让它对裸 Vite 生效，必须由 `packages/builder/src/vite.ts:296` 的 `config()` 钩子读 ubean 配置并返回 `{ server: … }`。而按 §1.3 的顺序，**插件 `config()` 赢过 `vite.config.ts`** —— 这会让「用户的 `vite.config.ts` 被 ubean 配置压过」成为默认行为，且是裸命令下的新语义。是否要这样，是独立于命名的决策。

---

## 6. 若要动手：清单

按「独立可交付」排序：

1. **`strictPort` 透传**（§3.1）—— 改 `packages/cli/src/dev.ts:69-73` / `:188`、`packages/cli/src/preview.ts:83-87` / `:118`（citty 去 `default`，取值 `??`）。给 `dev` 补 `strictPort` 字段（`packages/config/src/types.ts:810-814`）。
2. **`open` 接线**（§4.2）—— `dev.open` / `args.open` 目前无消费者，接上 `server.open`。
3. **`build.minify` / `build.sourcemap` 接线**（§4.2）—— 注意有**两条路径**要接：裸 `vite build` 走 `packages/builder/src/vite.ts:222-223`（硬编码），`ubean build` 走 `packages/cli/src/build.ts:210-211`（传 CLI flag）。两条都改成 `args.minify ?? config.build.minify` 之类的三级回退，才能让配置文件字段真正生效；CLI flag 仍应最高优先。
4. **`server.proxy` 放行**（§3.2）—— 在 `dev-request-router.ts` 的 `pre` 判据里加入 proxy 键前缀。改动面小但需要 `packages/builder/test/` 下的 dev 拓扑用例守着。
5. **`server.headers` 合并**（§3.3）—— `respond()` 里并入 `server.config.server.headers`。
6. **配置面命名决策**（§5）—— 需要 ADR，因为它改变的是对外契约而不是 bug。

**回归网**：`packages/cli/test/` 下有 `dev-reload.test.ts`（`vp dev`）、`vite-build.test.ts`（`vp build`）、`preview-vite.test.ts`（`vp preview`）三条端到端用例守着「裸命令 ≡ CLI」这条 ADR-0012 的契约 —— 任何让 ubean 配置对裸命令生效的改动都会碰到它们。

---

## 7. 复现步骤

```bash
cd examples/ubean-test

# 场景 1：ubean 配置写 dev.port，裸 Vite 命令忽略它
node -e 'const fs=require("fs");const p="ubean.config.ts";let s=fs.readFileSync(p,"utf8");fs.writeFileSync(p,s.replace("export default defineConfig({","export default defineConfig({\n  dev: { port: 5401 },")))'
../../node_modules/.bin/vp dev --strictPort        # banner: http://localhost:5173/  ← 不是 5401
git checkout ubean.config.ts

# 场景 4：两边都配，ubean 赢
#   ubean.config.ts: dev { port: 5411 }
#   vite.config.ts:  server { port: 5402 }
../../node_modules/.bin/ubean dev --strictPort     # → 5411

# 场景 3.1：strictPort 被冲掉
node -e 'require("http").createServer((q,r)=>r.end("busy")).listen(5420,"127.0.0.1")' &
#   vite.config.ts: server { port: 5420, strictPort: true }
../../node_modules/.bin/vp dev                     # 直接抛错退出
../../node_modules/.bin/ubean dev                  # 照常起来（9528），0 条 in-use 提示
```

`configResolved` 探针（要读 `c.server` / `c.preview` 的最终值）：

```ts
// vite.config.ts —— 探针必须注册在 ubeanPlugin() **之前**，enforce: 'pre'
const probe = { name: 'probe-resolved', enforce: 'pre', configResolved(c) {
  require('fs').appendFileSync('/tmp/resolved.txt', JSON.stringify({
    who: process.env.PROBE_WHO, port: c.server.port, host: c.server.host,
    strictPort: c.server.strictPort, open: c.server.open,
    proxyKeys: Object.keys(c.server.proxy || {}), headerKeys: Object.keys(c.server.headers || {}),
    previewPort: c.preview.port, previewStrict: c.preview.strictPort, previewHost: c.preview.host
  }) + '\n');
} };
export default defineConfig({ server: {…}, preview: {…}, plugins: [probe, ubeanPlugin()] });
```

**坑**：

- curl 必须打 `http://localhost:<port>`。Vite 默认绑 `[::1]`，`127.0.0.1` 会得到 `000`（连接被拒）。
- `vp dev` 必须在**示例目录**里跑（`cd examples/ubean-test`），在仓库根跑会 root 错 → 全站 404，且探针插件钩子不触发。
- macOS 无 GNU `timeout`；用 `nohup … &` + pid 文件。
- 端口用完清理：`for p in 5401 5402 5411 5420 …; do lsof -ti tcp:$p | xargs -r kill -9; done`。**注意 `9527` 可能被别的东西占着**（本轮调查期间就有一个无关的 dev server 在 `[::1]:9527` 上，会让 `ubean dev` 静默落到 9528）。

---

## 8. 与既有文档的关系

- [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md) 确立了「`vite dev|build|preview` 单独就是完整工具链」。本文的 §1.1 与 §5b 揭示这条契约的一个**边界**：裸命令与 CLI 在**构建**侧产物一致（`build-contracts.test.ts` 守着），但在 **server 配置**侧不一致 —— 裸命令读不到 ubean 配置。这不违反 ADR-0012（它讲的是产物与编排归属），但值得在那份 ADR 或本文里记一句，避免「裸命令 ≡ CLI」被读成「包括配置」。
- [vite-bundled-dev-compat.md](vite-bundled-dev-compat.md) 是同类调查（ubean × Vite 上游边界）。两篇都引用同一批上游行号，都注明版本锁在 `vite-plus` 1.0.0。
- 本文**不构成决策**。§5 的命名选择、以及「是否让 ubean 配置对裸 `vite dev` 生效」，都建议先补 ADR。
