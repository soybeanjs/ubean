# @ubean/devtools

**[English](./README.md) | 中文**

ubean 的 dev 期可视化面板 —— 路由、页面、API、配置、数据库、终端与 AI，托管在 devframe hub 上。

```ts
import { createUbeanDevframe, ubeanDevtoolsPlugin } from '@ubean/devtools';
```

## 目录

- [@ubean/devtools](#ubeandevtools)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [devframe 集成](#devframe-集成)
  - [RPC 层](#rpc-层)
  - [自定义 tab](#自定义-tab)
  - [文件操作](#文件操作)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

| 分层                       | 职责                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `@ubean/devtools`（node）  | ubean 的 devframe 定义、Vite 插件、RPC 函数聚合                 |
| `@ubean/devtools`（rpc）   | 通过 hub 的 RPC 传输暴露的 CRUD / terminal / AI 服务端          |
| `@ubean/devtools`（panel） | 由 hub 作为该 devframe 的 client assets 提供的预构建 iframe SPA |

**包含：**

- `ubeanDevtoolsPlugin` / `createUbeanDevframe` —— 加入 dev 流水线的插件，以及它产出的 `DevframeDefinition`。
- `createAllRpcFunctions` —— 聚合全部 DevTools RPC 方法（info、env、CRUD、playground、terminal、AI）。
- `createCrudServer`、`createAiServer`、`createTerminalServer`、`createDevToolsHooks` —— 各个服务端模块，可单独使用。
- `buildDevToolsInfo` / `emptyDevToolsInfo` / `maskSensitiveEnv` —— 推送给面板的快照。
- `defineDevToolsTab` / `getCustomTabs` / `clearCustomTabs` —— 自定义 tab 注册表。
- 命名空间常量 `UBEAN_RPC_NAMESPACE`、`UBEAN_INFO_STATE_KEY`、`UBEAN_AI_STREAM_STATE_KEY`、`UBEAN_ANCHOR_DOCK`。

**不包含**（刻意为之）：

- 不依赖聚合包 `ubean`。`@ubean/devtools` **不对 `ubean` 声明 peer** —— 那会与 `@ubean/cli` 形成环。它需要的数据（cwd、app fetcher、scan 结果、config meta）全部通过 `UbeanDevtoolsPluginOptions` 注入。
- 不自带 RPC 传输。WebSocket 传输、dock 外壳、frame 导航与鉴权都由 devframe hub（`@devframes/hub`）提供。
- 不含生产代码。DevTools 只在 dev 期存在 —— 生产构建不输出任何 DevTools 代码，零运行时开销。
- 不进聚合包硬依赖。它是 opt-in：需要时显式安装。
- 尚无 hook 注册入口。`createDevToolsHooks()` 构建注册表，目前由插件内部调用；配置级注册尚未对外暴露。

**运行时依赖白名单（主入口）：** `hookable`、`pathe`。

**可选 peer：** `hono`（`^4.0.0`）与 `vue`（`^3.0.0`），两者都标记为 optional。`ai` / `@ai-sdk/openai-compatible` 是可选依赖，仅 AI 视图使用 —— 缺少它们时 AI 视图不可用，其余视图照常工作。

## 安装

```bash
# opt-in：不在聚合包 ubean 的依赖图里
pnpm add -D @ubean/devtools

# peer，用到对应能力时才需要
pnpm add hono       # 在 Hono 应用上托管 RPC 服务端
pnpm add vue        # 面板客户端
```

## 快速开始

**1. 启用 DevTools**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  devtools: {
    enabled: true,
    route: '/_devtools',
    ai: { enabled: false }
  }
});
```

**2. 打开面板**

打开 dev server banner 里打印的 URL —— 默认是 `/_devtools`，会 302 跳转到 devframe hub 外壳。面板以 iframe 形式渲染在 hub 的 dock 侧栏中；不会往你的应用页面注入浮动按钮或客户端脚本。

CLI 会打印同样的信息：

```bash
ubean devtools info                # 如何访问、可用功能、配置
ubean devtools path --port 9527    # 打印 URL 路径
```

内置视图：Overview、Pages、API、Middleware、Crons、Config、Env、API Docs、Database、Terminal 与 AI。

**3. 注册自定义 tab**

```ts
import { defineDevToolsTab } from '@ubean/devtools';

defineDevToolsTab({
  id: 'my-panel',
  label: 'My Panel',
  icon: 'lucide:puzzle',
  src: '/my-panel/index.html',
  sandbox: ['allow-scripts', 'allow-same-origin']
});
```

## devframe 集成

`@ubean/devtools` 是一个 devframe，而不是独立服务器。`createUbeanDevframe(options)` 返回描述该面板的 `DevframeDefinition`；宿主（devframe hub）拥有外壳、dock 侧栏、RPC 传输与鉴权。

| 选项              | 用途                                               |
| ----------------- | -------------------------------------------------- |
| `getCwd`          | 项目根目录 —— 必填。                               |
| `getApp`          | 运行中应用的 `fetch`，让面板可以调用你的路由。     |
| `getScanResult`   | 当前 scan 结果（路由、页面、中间件、布局、cron）。 |
| `getConfigMeta`   | 解析后的配置元信息（preset、目录、OpenAPI 设置）。 |
| `getCustomTabs`   | 要在面板中展示的自定义 tab。                       |
| `scaffoldOps`     | 创建/更新/删除流程使用的文件操作。                 |
| `ai`              | AI 视图的 `{ apiKey, apiBase, model }`。           |
| `triggerRescan`   | 请求 dev runner 重新扫描项目。                     |
| `registerRefresh` | 接收一个面板可调用以刷新数据的回调。               |
| `basePath`        | 面板基础路径，默认 `/_devtools/`。                 |

保留的路由命名空间：

- `/__devframes/**` —— hub 命名空间：外壳、`__connection.json`、`__ws` WebSocket，以及各 devframe 的产物（`/__devframes/ubean/`）。
- `/_devtools` —— 用户可见入口；302 跳转到 hub 外壳。
- `/__devtools*` —— 仅为仍在使用 `@vitejs/devtools` 的项目保留。

框架内置 HTML 页面（`/_devtools`、`/_scalar`、`/__devframes/**` 下的一切）会被应用的 HTML transform 跳过。没有这个跳过，应用客户端入口会被注入到没有 `#app` 的页面上；而自带 `embedded.js` 的 hub 外壳会启动两次。

## RPC 层

传输属于 hub。`createAllRpcFunctions` 聚合 ubean 注册在 `ubean` scope 下的方法；wire 名为 `ubean:<裸名>`。

| RPC                       | 类型     | 说明                                                        |
| ------------------------- | -------- | ----------------------------------------------------------- |
| `ubean:get-info`          | query    | `DevToolsInfo` 快照（路由、页面、配置、计数）。             |
| `ubean:get-env`           | query    | 环境变量，敏感键已打码。                                    |
| `ubean:crud-read`         | query    | 读取 page / api / layout / middleware / reuse / cron 资源。 |
| `ubean:crud-create`       | mutation | 创建脚手架资源。                                            |
| `ubean:crud-update`       | mutation | 更新资源。                                                  |
| `ubean:crud-delete`       | mutation | 删除资源（保留备份）。                                      |
| `ubean:crud-restore`      | mutation | 从备份恢复资源。                                            |
| `ubean:playground-invoke` | mutation | 从面板调用某个 API 路由。                                   |

客户端侧连接 hub 并通过 scope 调用：

```ts
import { connectDevframe } from '@devframes/hub/client';

const client = await connectDevframe();
const result = await client.call('ubean:crud-read', { type: 'page', path: 'src/pages/index.vue' });
```

易变数据（例如 info 快照或 AI 流）通过 shared state 发布，而不是轮询：

```ts
const info = client.sharedState.get(UBEAN_INFO_STATE_KEY);
```

`UBEAN_RPC_NAMESPACE` 为 `'ubean'`，`UBEAN_INFO_STATE_KEY` 为 `'ubean:info'`，`UBEAN_AI_STREAM_STATE_KEY` 为 `'ubean:ai:stream'`。

`CrudResult` 报告 `{ success, created?, deleted?, restored?, updated?, skipped?, errors? }`，让面板能准确展示变更内容。

## 自定义 tab

`DevToolsTabDefinition` 为 `{ id, label, icon?, src, sandbox? }` —— `src` 指向 tab 的 HTML 入口，`sandbox` 映射到 iframe 的 sandbox 属性。

| 导出                     | 说明                                           |
| ------------------------ | ---------------------------------------------- |
| `defineDevToolsTab(tab)` | 注册（或按 `id` 替换）自定义 tab；返回该 tab。 |
| `getCustomTabs()`        | 已注册 tab 的快照。                            |
| `clearCustomTabs()`      | 清空注册表。                                   |

注册表是挂在 `globalThis` 上的进程单例。dev 下同一进程常常存在两份本包（CLI 动态导入一份、你的 `vite.config.ts` 静态导入一份），模块级数组会让 tab 静默表现为「已注册但永不显示」。

## 文件操作

所有写盘操作都走同一套安全策略：

1. **AST 优先** —— 结构化编辑，而非文本拼接。
2. **改前备份** —— 旧文件先复制到 `.ubean/backup/`。
3. **事务写入** —— 先写临时文件，再 rename。
4. **路径约束** —— 仅限项目根目录与允许清单。
5. **AI 最小权限** —— 默认只读；写入需先给出 diff 并显式确认。
6. **操作确认** —— 删除与批量操作需要二次确认。
7. **git 检测** —— DevTools 建议先提交，但绝不自动提交。

`createDevToolsHooks()` 提供六个生命周期 hook —— `beforeCreate`、`afterCreate`、`beforeUpdate`、`afterUpdate`、`beforeDelete`、`afterDelete` —— 每个都收到 `CrudHookContext`，含 `{ type, path?, key?, content?, value? }`。

## 类型安全

- `UbeanDevtoolsPluginOptions` 是一份结构化契约，本包因此可以不静态依赖 `ubean` —— 数据由 dev runner 注入。
- `DevToolsInfo` 为与面板共享的快照提供类型，包含可选的 `routes`、`pagesList`、`middlewaresList`、`layoutsList`、`cronsList`、`customTabs`、`openAPI`、`database`、`ai` 各段。
- `CrudResourceType`（`'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin'`）与 `DevToolsScaffoldType` 让资源名保持为闭合联合。
- `RpcRequest` / `RpcResponse<T>` 与 `RpcHandler` 描述跨 hub 边界的调用形状。
- 本包对 hub client 的类型做了模块增强，因此 `client.call(...)` 与 `client.sharedState.get(...)` 在服务端与客户端都有类型。

## 架构说明

- **是 devframe，不是服务器。** `@ubean/devtools` 贡献一个 `DevframeDefinition`；外壳、dock 与传输归 hub。面板是 iframe，不是注入脚本。
- **不对 `ubean` 声明 peer。** 数据通过注入的 getter 到达，依赖方向保持单向，也避免了与 `@ubean/cli` 成环。
- **构造上就是 opt-in。** 聚合包不依赖 DevTools；生产构建里没有它的任何代码。
- **面板自己声明视图。** 客户端通过 frame 导航把视图清单发给 hub 外壳，外壳据此组装 dock 按钮 —— 服务端不硬编码视图列表。
- **dev 存在两份副本的地方用 `globalThis` 注册表。** 自定义 tab 使用进程单例，原因与 islands 的 server component 注册表相同。
- **备份是契约的一部分。** 每个变更都可回滚：删除会写备份，恢复会读回。
- **AI 驱动 RPC，不直接改文件。** 助手调用的是面板用的同一批 RPC 方法，因此文件安全策略统一生效。
