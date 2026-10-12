# @ubean/shared

**[English](./README.md) | 中文**

ubean 的共享协议类型、错误、环境变量处理与通用工具。

`@ubean/shared` 是 monorepo 的基础 leaf 包：其他所有 `@ubean/*` 包都可以依赖它，而它**不依赖**任何 `@ubean/*` 包。主入口保持浏览器安全 —— Node 专用工具放在 `/node` 子路径，基于 tslog 的 logger 放在 `/logger`。

```ts
import { defineEnv, createError, matchGlob } from '@ubean/shared';
import { logger } from '@ubean/shared/logger';
import { findAvailablePort } from '@ubean/shared/node';
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [错误](#错误)
- [路由规则与共享类型](#路由规则与共享类型)
- [Server Actions 共享类型](#server-actions-共享类型)
- [Glob 匹配](#glob-匹配)
- [路径与字符串工具](#路径与字符串工具)
- [日志](#日志)
- [Node 工具](#node-工具)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                                                                                                                                                                                                                                      | 本包不负责 —— 对应归属                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 跨包共享的协议**类型**：`PageHead`、`RouteMeta` / `BaseRouteMeta` / `RateLimitMeta` / `CacheMeta`、`RouteRule` / `IsrRule`、`Span*`、`UbeanEnv` / `UbeanContext` / `UbeanHandler` / `UbeanMiddleware` / `UbeanVariables` / `UbeanBindings` / `UbeanMiddlewareStep`、`GenericSchema` / `Input` | 页面数据协议的运行时 → `@ubean/pages`；handler 运行时 → `@ubean/routes`；SEO 元数据构造 → `@ubean/seo` |
| 零依赖的通用**工具**：`normalizePath`、`getDirname`、`getBasename`、`getExtension`、`getStem`、`pathToTitle`、`capitalize`、`matchGlob`、`matchAnyGlob`                                                                                                                                       | 路由扫描 → `@ubean/scan`；预渲染链接发现 → `@ubean/builder`                                            |
| **错误原语**：`UbeanError`、`createError`、`isUbeanError`、`errorToResponse`                                                                                                                                                                                                                  | Hono `onError` 接线与 `handleError` hook → `@ubean/app`                                                |
| **环境变量**辅助：`defineEnv`、`setRuntimeEnv`、`useRuntimeEnv`、`isNodeRuntime` 以及 `EnvSchema` / `InferEnvOutput` / `EnvValidationError` 类型                                                                                                                                              | `ubean.config.ts` 加载与模块解析 → `@ubean/config`                                                     |
| **日志**门面（`/logger`、`/logger/hono`）：`createUbeanLogger` / `logger` / `getLogger` / `setMinLevel` / `setDebugLogging` 与 Hono 请求日志中间件，封装 tslog@5                                                                                                                              | 服务端请求生命周期、缓存与 tracing → `@ubean/server`；DevTools 日志 UI → `@ubean/devtools`             |
| **Node 专用**工具（`/node`）：端口探测（`findAvailablePort`、`waitForPort`、`isPortReachable`、`sleep`）、局域网地址探测（`getLanAddresses`、`isLoopbackHost`、`isWildcardHost`）、Vite 配置查找（`findUserViteConfig`）                                                                      | 进程生命周期、dev server 自举与 CLI 输出 → `@ubean/cli` / `@ubean/builder`                             |

**主入口的运行时依赖白名单：`@standard-schema/spec`、`hono`（仅类型）、`pathe`、`scule`** —— 不含 `tslog`，不含 `node:*`。`/logger` 子路径的存在意义就是让 tslog 永不进入浏览器安全的主 barrel；`/node` 出于同样理由隔离 `node:net` / `node:os` / `node:fs`。

`@ubean/shared` **没有任何 peer 依赖** —— 没有 peer，也就不存在「缺少 peer 时能力降级」的情况。

## 安装

```bash
pnpm add @ubean/shared
```

其他每个 `@ubean/*` 包都会传递安装它；只需要共享类型或工具时可以直接安装。

## 快速开始

```ts
import { UbeanError, createError, errorToResponse, defineEnv, isNodeRuntime, matchGlob } from '@ubean/shared';

// 带状态码的类型化错误
throw createError({ statusCode: 404, statusMessage: 'Not Found' });

// 转成 JSON Response（未知错误同样适用）
try {
  await handler();
} catch (err) {
  return errorToResponse(err);
}

// '**' 匹配任意层级，'*' 只匹配单段
matchGlob('/blog/a/b', '/blog/**'); // true
isNodeRuntime(); // Cloudflare Workers 上为 false
```

## 环境变量

`defineEnv(config)` 校验基于构造函数的 schema，返回 `{ env, validate }`。`server` 键永不暴露给客户端；`public` 键通过 `import.meta.env` 暴露。

```ts
import { defineEnv } from '@ubean/shared';

export const { env, validate } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true },
    PORT: { type: Number, default: 9527 }
  },
  public: {
    APP_NAME: { type: String, default: 'ubean-app' }
  },
  mode: 'warn' // 'warn' 记录日志；'throw' 在校验失败时抛出
});

env.PORT; // number
validate(); // { success, errors, data }
```

| API                                              | 说明                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `defineEnv(config)`                              | 校验 schema 并返回 `{ env, validate }`（`DefineEnvResult<S>`）                        |
| `setRuntimeEnv(env)` / `useRuntimeEnv(key, def)` | 合并 / 读取运行态环境变量（worker bindings、注入的密钥）                              |
| `isNodeRuntime()`                                | Node / Bun / Deno 上为 true（用 `process.versions.node` 判定，而非 `typeof process`） |
| `EnvSchema` / `InferEnvOutput<S>`                | schema 映射类型及其推导出的输出类型                                                   |
| `EnvValidationError`                             | 每个失败项的 `{ key, message, value }`                                                |

`isNodeRuntime()` 的用途是把 Node 专用能力挡在**动态** `import()` 之后：打包器会把静态 import 的 `node:*` 留在产物里，workerd 在模块实例化阶段就失败（`No such module "node:fs/promises"`），根本轮不到分支判断。

## 错误

```ts
import { UbeanError, createError, isUbeanError, errorToResponse } from '@ubean/shared';

try {
  throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { field: 'email' } });
} catch (err) {
  if (isUbeanError(err)) {
    err.statusCode; // 400
  }
  return errorToResponse(err); // JSON: { error, statusCode, data }
}
```

- `UbeanError extends Error` 携带 `statusCode` / `statusMessage` / `data`；默认 message 来自状态码表（400/401/403/404/405/408/409/422/429/500/501/502/503），未命中回退到 `'Error'`。
- `isUbeanError(err)` 同时接受真实实例与跨模块边界传来的错误（检查 `err.name === 'UbeanError'` 且 `statusCode` 为数字）。
- `errorToResponse(err)` 用 `UbeanError` 自身的状态码渲染；其他错误一律变成 `500` + `{ error: 'Internal Server Error', message }`。

## 路由规则与共享类型

这些类型是路由、缓存与预渲染层的共享词汇。它们放在这里是为了打破循环依赖 —— `@ubean/routes` 与 `@ubean/config` 都需要它们，而两者不能互相依赖。

| 类型                                                                                                | 形状 / 含义                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BaseRouteMeta`                                                                                     | `{ requiresAuth?: boolean; [key: string]: unknown }`                                                              |
| `RateLimitMeta` / `CacheMeta`                                                                       | `{ maxRequests, windowSeconds }` / `{ ttl, swr? }`                                                                |
| `RouteMeta extends BaseRouteMeta`                                                                   | 增加 `rateLimit` 与 `cache`                                                                                       |
| `IsrRule`                                                                                           | `{ ttl: number; swr?: boolean }` —— `routeRules.isr` 的对象形式                                                   |
| `RouteRule`                                                                                         | 单路由的 `redirect` / `rewrite` / `proxy` / `headers` / `cache` / `ssr` / `prerender` / `isr` / `ppr`             |
| `PageHead`                                                                                          | 被 `@ubean/pages` 与 `@ubean/seo` 消费的 head 元数据                                                              |
| `Span`、`SpanOptions`、`SpanContext`、`SpanAttributes`、`SpanEvent`、`SpanEndOptions`、`SpanStatus` | 被 `@ubean/server` 可观测性消费的 tracing 原语                                                                    |
| `UbeanVariables` / `UbeanBindings` / `UbeanEnv`                                                     | Hono context variables、平台 bindings 与组合出的 `UbeanEnv`                                                       |
| `UbeanContext` / `UbeanHandler` / `UbeanMiddleware` / `ComposedHandler` / `Input` / `GenericSchema` | `@ubean/routes` 的 handler 与 middleware 层类型                                                                   |
| `UbeanMiddlewareStep`                                                                               | 中间件步骤名的联合类型（`handle`、`requestId`、`securityHeaders`、`csrf`、`cacheStore`、`i18n`、`routeRules` 等） |

## Server Actions 共享类型

Server Actions 定义在 `@ubean/routes`，但它们的协议类型放在这里共享，这样客户端运行时无需引入服务端代码即可消费。

```ts
import { ACTION_BRAND, ActionError, fail, isServerAction, isActionFailure } from '@ubean/shared';

fail(400, { email: 'Invalid email' }); // { status: 400, errors: { email: '…' } }
```

| API                                                | 说明                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `ACTION_BRAND`                                     | 标记 `ServerAction` 的 well-known symbol（`Symbol.for('ubean.action')`） |
| `ServerAction<TInput, TOutput>`                    | action 描述符；`ActionHandler` 是其实现签名                              |
| `ActionContext` / `ActionResult<T>`                | handler 上下文与成功信封                                                 |
| `ActionFailure<T>`                                 | `{ status, errors }` 字段级失败信封                                      |
| `fail(status, errors)`                             | 构造 `ActionFailure`                                                     |
| `ActionError`                                      | 可在 handler 中抛出的用户可读错误类，含 `code` / `status`                |
| `isServerAction(value)` / `isActionFailure(value)` | 类型守卫                                                                 |
| `ActionSchema<TOutput>`                            | Standard Schema / `safeParse` 输入契约                                   |

## Glob 匹配

```ts
import { matchGlob, matchAnyGlob } from '@ubean/shared';

matchGlob('/blog', '/blog/**'); // true  （'**' 也匹配裸前缀）
matchGlob('/blog/a', '/blog/*'); // true  （'*' 是单段）
matchGlob('/blog/a/b', '/blog/*'); // false
matchAnyGlob('/admin/x', ['/blog/**', '/admin/**']); // true
```

`matchGlob(route, pattern)` 支持 `**`（递归）、`*`（单段）与字面量；`pattern === '**'` 或 `'/**'` 匹配一切。SSR `exclude`、预渲染 `include`/`exclude` 与路由规则 pattern 都走这个匹配器。

## 路径与字符串工具

```ts
import { normalizePath, getDirname, getBasename, getExtension, getStem, pathToTitle, capitalize } from '@ubean/shared';

normalizePath('//a\\b/c/'); // '/a/b/c'
getExtension('Post.MD'); // 'md'
getStem('Post.md'); // 'Post'
pathToTitle('blog/getting-started.md'); // 'Getting Started'
pathToTitle('blog/index.md'); // 'Blog'  （index 解析为父目录名）
```

`pathToTitle` 委托 `scule` 的 `kebabCase` 加 `capitalize` —— 这就是 `@ubean/content` 在文档没有显式 `title` 时使用的标题化规则。

## 日志

`/logger` 是唯一的公开日志入口。它**刻意做成独立子路径**：从主入口 re-export 会把 tslog 拖进浏览器安全的 barrel。

```ts
import { logger, getLogger, createUbeanLogger, setMinLevel, setDebugLogging } from '@ubean/shared/logger';

logger.info('booted');
const http = getLogger('http'); // 名为 `ubean:http` 的子 logger

setMinLevel('debug'); // 全局级别切换（对已创建与后续创建的实例都生效）
```

| API                                                   | 说明                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `logger`                                              | 名为 `ubean` 的默认全局 tslog 实例                                                                                  |
| `createUbeanLogger(options)`                          | 创建命名实例；`options` 为 tslog v5 settings（`type` / `pretty` / `json` / `mask` / `stack` / `meta` / `minLevel`） |
| `getLogger(scope?, options?)`                         | scope 子 logger；继承父实例的 settings 与 `minLevel`；不传 scope 返回全局 `logger`                                  |
| `setMinLevel(level)`                                  | 全局级别：`silly` / `trace` / `debug` / `info` / `warn` / `error` / `fatal`                                         |
| `setDebugLogging(enabled)`                            | debug 级别的便捷开关                                                                                                |
| `UbeanLogger` / `UbeanLoggerOptions` / `LogLevelName` | logger 实例类型、settings 与级别名联合类型                                                                          |

Hono 请求日志放在 `/logger/hono`，同样是为了让 Hono 中间件不进入 shared barrel：

```ts
import { createRequestLoggerMiddleware } from '@ubean/shared/logger/hono';

app.use('*', createRequestLoggerMiddleware({ slowThreshold: 1000, exclude: ['/_health', '/api/**'] }));
```

`RequestLoggerOptions`：`logger`（默认 `getLogger('http')`）、`exclude`（glob 字符串、`RegExp` 或 `(path) => boolean` 谓词）、`slowThreshold`（毫秒，默认 `1000`）、`logQuery`（记录含 query string 的完整 URL，默认 `false`）。Hono `onError` 捕获的错误通过 `c.error` 识别，并连同状态码一起记录。

## Node 工具

`/node` 汇集所有 import `node:net`、`node:os`、`node:fs` 的实现，永不进入主入口。

```ts
import { findAvailablePort, waitForPort, isPortReachable, sleep } from '@ubean/shared/node';
import { getLanAddresses, isLoopbackHost, isWildcardHost } from '@ubean/shared/node';
import { findUserViteConfig } from '@ubean/shared/node';

const port = await findAvailablePort(3000, { strictPort: false }); // 像 Vite 一样依次探 3001、3002…
await waitForPort(port, { timeout: 5000 });
getLanAddresses(); // ['192.168.1.20', …] —— 仅 IPv4，按网卡名排序
findUserViteConfig(process.cwd()); // '/…/vite.config.ts' | null
```

| 分组      | API                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 端口探测  | `findAvailablePort(port, options)`、`waitForPort(port, options)`、`isPortReachable(port, host)`、`sleep(ms)`；选项类型 `FindPortOptions`、`WaitForPortOptions` |
| 网络地址  | `isLoopbackHost(host)`、`isWildcardHost(host)`、`getLanAddresses()`                                                                                            |
| Vite 配置 | `findUserViteConfig(cwd)` —— 依次查找 `vite.config.ts` / `.mts` / `.js` / `.mjs`，返回首个命中或 `null`                                                        |

## 类型安全

- 本包用严格 TypeScript 编写，每个子路径都产出 `dist/*.d.ts`；`EnvSchema` + `InferEnvOutput<S>` 让 `defineEnv({...}).env` 完全推导 —— `PORT` 是 `number` 而非 `string`。
- `GenericSchema<O = unknown>` 接受 Standard Schema 对象；`validate()` 是同步/异步无关的入口，而只有带同步 `safeParse` 的 schema 能作为直接 schema 条目使用。
- 错误收窄通过 `isUbeanError` 与 `isActionFailure` 保证类型安全，`statusCode` / `errors` 只有过了守卫才能访问。
- 不做任何全局 `declare module` 增强 —— 这些类型都是普通导出。

## 架构说明

- **依赖方向。** `@ubean/shared` 是根 leaf：**不** import 任何 `@ubean/*` 包，其余包都可以 import 它。历史上造成环依赖的类型（来自 `@ubean/routing` 的 `BaseRouteMeta`、来自 `@ubean/server` 的 `Span*`、来自 `@ubean/pages` 的 `PageHead`）都是有意下沉到这里的，而不是各自复制一份。
- **子路径划分是浏览器安全边界，不是便利性分组。** `tslog` 在 `/logger` 之后，`node:net` / `node:os` / `node:fs` 在 `/node` 之后，Hono 中间件在 `/logger/hono` 之后。主 barrel（`src/index.ts`）只 re-export `types` / `error` / `env` / `path` / `glob` / `string`，因此客户端产物永远不会捎上 logger 或 Node 内建模块。
- **刻意不依赖 `globalThis`。** 兄弟包的数据与缓存注册表需要跨实例共享，但 `@ubean/shared` 自身只持有 `_runtimeEnv` —— 一个由 `setRuntimeEnv` 显式写入的模块级合并目标，它同样可以通过 app runtime 访问。
- **import 无副作用。** 每个模块都是纯导出集合；import `@ubean/shared` 不会全局安装任何东西，也不会绑定任何监听器。
