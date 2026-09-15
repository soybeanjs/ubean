# env-runner 兼容性 spike 结论（RM-V04）

> 开发任务型文档，对应 [vite-plugin-migration.md](vite-plugin-migration.md) Phase 0 的 RM-V04。
> 可复现脚本：[packages/cli/spike/env-runner-compat/](../packages/cli/spike/env-runner-compat/)（不参与 CI）。
> 环境：`env-runner@0.2.3`（devDependency）+ `@voidzero-dev/vite-plus-core@0.3.1`（`vite` catalog 别名）+ Node 24.21.0 / darwin-arm64。

## 1. 结论摘要

| 问题 | 结论 |
| --- | --- |
| `node-worker` 能否承载服务端入口并处理请求 | **能**。入口导出 `fetch`，宿主经 runner 拿到 `200` 与正确 body，worker 的 `pid` 与宿主不同（进程隔离成立） |
| 宿主/worker 双向消息通道 | **能**。worker 侧 `createViteTransport` 发出的 Vite 协议消息（`vite:invoke`）确实到达宿主；`createViteHotChannel(runner, env)` 形状为 `{ send, on, off }` |
| vite-plus 是否接受自定义 dev 环境 | **能**。`environments.<name>.dev.createEnvironment(name, config, context)` 被调用，dev server 启动后 `server.environments` 为 `client, ssr, ubean` |
| worker 内 `ModuleRunner` 能否向宿主取模块 | **未打通**（见 §2）。worker 的第一个 invoke `getBuiltins` 无人应答，60s 超时 |
| `miniflare` runner 可用性 | **API 可用，需可选依赖**。`MiniflareEnvRunner` 可导入；实际运行需要项目安装 `miniflare` 包（当前未安装，属预期） |

**对 ADR-0012 §3 的影响**：原方案把「宿主侧 hot channel」直接寄托在 env-runner 的
`createViteHotChannel` 上，实测这一步不够 —— 需要补一层符合 Vite `HotChannel` 契约的宿主侧通道
（见 §3 建议）。其余部分（worker 托管、平台 runner、IPC）与 ADR 预期一致。

## 2. 未打通的关键点（精确机制）

worker 内 `new ModuleRunner({ transport })` 在 `import()` 时首先 invoke `getBuiltins`，宿主侧无人应答：

```
transport invoke timed out after 60000ms
  (data: {"type":"custom","event":"vite:invoke","data":{"name":"getBuiltins","id":"send:…","data":[]}})
```

原因在 vite-plus 的 `DevEnvironment` 构造里（`dist/vite/node/chunks/node.js:40838-40840`）：

```js
this.hot = context.transport ? normalizeHotChannel(context.transport, context.hot) : …;
this.hot.setInvokeHandler({ … });   // ← 只有这一步注册了 invoke 应答
```

而 `normalizeHotChannel` 产出的通道是通过 `channel.on?.('vite:invoke', listener)` 注册监听的
（同文件 `:32291-32313`），应答再经 `client.send(...)` 回给 worker。env-runner 的
`createViteHotChannel` 只暴露 `{ send, on, off }`，实测的消息也确认到达了宿主消息流，但
**应答路径没有闭合**（该通道不带 Vite 通道的 `api` / `skipFsCheck` / per-client 语义）。

也就是说：**宿主侧通道必须是符合 Vite `HotChannel` 契约的实现**，仅把 env-runner 的通道塞进
`DevEnvironment` 不够。

## 3. 对 RM-V08 的建议（决策）

按代价从低到高：

1. **（推荐）宿主侧用 Vite 自带的 `createServerHotChannel()`，只把 IPC 桥接到 env-runner。**
   Vite 自己的通道天生带 `setInvokeHandler` / `api` / `skipFsCheck`，`DevEnvironment` 的应答逻辑
   直接成立；env-runner 只负责「把 worker 跑起来 + 一条双向 IPC」。需要写的是一个很薄的适配器：
   把 Vite 通道发出的 payload 经 `runner.sendMessage` 送出，把 worker 来的消息灌回通道的
   `on` 监听。
2. **自建完整通道**：按 Vite 的契约实现 `send/on/off + api + skipFsCheck + setInvokeHandler`，
   底层仍走 env-runner IPC。工作量比方案 1 大，收益是少依赖 Vite 内部语义。
3. **Plan B（自研 worker）**：`node:worker_threads` + `vite/module-runner` + 宿主侧
   `createServerHotChannel()`。spike 的结论让这个方案的成本预估**下调**：最麻烦的宿主侧通道
   Vite 已经提供，我们只需 worker 引导（约 60–120 行）+ 一条 IPC 通道；不再需要 ADR 里
   300–500 行的全套 IPC/worker 样板。
4. **miniflare / 平台保真 dev**：runner API 就绪，但需要目标项目安装 `miniflare`。RM-V30
   接入平台 runner 时应把它作为可选依赖处理，缺失时给出安装提示而不是启动失败。

## 4. Plan B 成本量化（依据 spike 实测）

| 项 | 预估 | 依据 |
| --- | --- | --- |
| worker 引导（入口加载 + fetch 转发 + 生命周期） | 60–120 行 | `simple-worker.mjs` 证明入口形态极简；env-runner 的 worker 引导逻辑可参照其 README 的 srvx 约定 |
| 宿主侧通道 | 0 行（用 `createServerHotChannel()`） | Vite 已实现 invoke 应答（§2 源码位置） |
| IPC 桥接 | 40–80 行 | 一条消息通道 + 请求/响应配对；env-runner 的通道实现可作参考 |
| 热重载 / 失效通知 | 复用现有 `server.watcher` + `sendFullReload` | RM-V13 已规划 |
| **合计** | **约 100–200 行** | 低于 ADR 原估（300–500 行），因为宿主侧通道不必自研 |

因此 RV-V04 的触发条件可以放宽：只有在方案 1/2 都被证伪时才需要 Plan B。

## 5. 复现方式

```bash
node packages/cli/spike/env-runner-compat/simple-host.mjs   # 期望：最小 worker fetch → 200
node packages/cli/spike/env-runner-compat/host.mjs          # 现状：worker 报 invoke 超时（599 回传错误）
```

两个脚本都只依赖已安装的 `env-runner`（devDependency）与 `vite-plus`，不触碰框架源码。

## 6. 遗留

- `env-runner` 目前是 `packages/cli` 的 **devDependency**；RM-V08 按方案 1 打通后再提升为运行时依赖，并把它封装在既有 `EnvRunner` 接口（`packages/cli/src/dev-server/runner.ts`）之后。
- spike 未覆盖：`node-process` 等其他 runner、WebSocket 升级代理（`wsSrvxPlugin`）、`reload()` 热重载语义 —— 都不影响 Phase 1 起步，需要时按 `simple-host.mjs` 的形态补测。

## 7. RM-V08 实施要点（续做时的入口）

spike 之后又读了一轮 vite-plus 的类型定义，宿主侧通道不必自己实现 invoke 分发 —— Vite 已经把它作为**公开方法**暴露：

```ts
interface NormalizedHotChannel<Api = any> {
  send(payload: HotPayload): void;
  on<T extends string>(event: T, listener: (data, client: NormalizedHotChannelClient) => void): void;
  off(event: string, listener: Function): void;
  handleInvoke(payload: HotPayload): Promise<{ result: any } | { error: any }>;  // ← 关键
  listen(): void;
  close(): Promise<unknown> | void;
}
```

`DevEnvironment` 构造时做的 `this.hot = normalizeHotChannel(context.transport, context.hot)` 会把这个规范化通道挂在 **`environment.hot`** 上，并顺带调用 `setInvokeHandler`（§2 的源码位置）。因此推荐实现是：

1. 给 `DevEnvironment` 传一个**极薄的 IPC 适配器**作为 `transport`：`{ send: payload => runner.sendMessage(payload), on/off: 本地 listener 表, skipFsCheck: true, api: {} }`。
2. 宿主侧用 `runner.onMessage` 接 worker 消息；遇到 `vite:invoke` 就 `await environment.hot.handleInvoke(payload)`，把结果按 Vite 的约定回发（`id` 由 `send*` 改成 `response*`，见 §2 引用段）。
3. 其余事件转给适配器上注册的 listener（或直接忽略 —— worker 侧只关心 invoke 与 HMR 推送）。
4. worker 侧沿用已验证的形态：入口 `ipc.onOpen({ sendMessage })` → `createViteTransport(sendMessage, registerListener, envName)` → `new ModuleRunner({ transport }, new ESModulesEvaluator())` → `import('virtual:ubean-server')` 后把请求交给 Hono app。

这样 `env-runner` 只承担「跑起 worker + 一条 IPC」，Vite 的 invoke/模块图语义全部留在 Vite 自己手里 —— 与 §3 的方案 1 一致，且不需要复制 `handleInvoke` 的实现。

验证顺序建议：先用 `simple-host.mjs` 的形态确认「worker 内 Hono app 返回 200」，再把 `experimental.viteBuilder` 打开跑 `packages/cli/test/dev-topology.test.ts`（RM-V05 的 18 个断言）与性能对照 `perf-baseline.json`；两张网都绿了才把开关暴露给用户。

