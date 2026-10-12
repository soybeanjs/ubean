# @ubean/routes

**[English](./README.md) | 中文**

ubean 的服务端路由运行时：handler 包装器、rou3 服务端路由、路由规则、ISR、Server Actions 与 OpenAPI 注册。

`@ubean/routes` 是「扫描产物」与 Hono 应用之间的那一层。它拥有 `defineHandler` / `defineHandlerMeta` / `defineMiddleware`、路由注册管线（`registerRoutes`、`registerApiRoutes`、`registerPageRoutes`）、声明式路由规则（redirect / rewrite / proxy / headers / cache / ssr / isr / prerender / ppr）、增量静态再生、Server Actions（`POST /__actions`）、internal-fetch 桥接与 OpenAPI/Scalar 路由。`./runtime` 子路径是客户端代码消费的浏览器安全片段。

```ts
import { defineHandler, defineHandlerMeta } from '@ubean/routes';

export const GET = defineHandler(defineHandlerMeta({ cache: { ttl: 60 } }), async c => {
  const { rows } = await db.sql`SELECT id, title FROM posts LIMIT 20`;
  return c.json({ posts: rows });
});
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [路由处理器](#路由处理器)
- [服务端路由](#服务端路由)
- [路由注册](#路由注册)
- [路由规则](#路由规则)
- [ISR（增量静态再生）](#isr增量静态再生)
- [渲染模式选择](#渲染模式选择)
- [Server Actions](#server-actions)
- [OpenAPI](#openapi)
- [内部 fetch](#内部-fetch)
- [爬虫检测](#爬虫检测)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 层                         | 职责                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/routes`（本包）    | 服务端路由运行时：handler 包装器、rou3 路由、注册管线、路由规则、ISR、Server Actions、internal fetch、OpenAPI                          |
| `@ubean/scan`（可选 peer） | 扫描 `src/routes`、`src/middleware`、`src/pages`，产出本包注册所需的 `ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` 结构 |
| `@ubean/app`               | Hono 应用工厂（`createUbeanApp`）—— 拥有请求中间件链，并用扫描结果调用 `registerRoutes`                                                |
| `@ubean/server`            | 服务端运行时原语（cache / db / queue / cron / storage / …）；ISR 只需要一个 `CacheStore` 形状的对象，不依赖该包                        |
| `@ubean/vue`               | 页面路由内核 —— 拥有客户端路由扫描、matcher 与布局链；**不是**本包的依赖                                                               |

**包含：**

- `defineHandler` / `defineHandlerMeta` / `defineMiddleware`，以及 handler 链辅助函数（`isHandlerChain`、`extractRouteMeta`）
- `UbeanRouter`（基于 rou3）与 `createServerRouter` / `useRouter`
- 注册管线：`registerRoutes`、`registerApiRoutes`、`registerPageRoutes`、`createRouteLoader`、`sortPagesForRegistration`、`sortApiRoutesForRegistration`、`apiPathSpecificity`、`convertUbeanRoutePath`
- 路由规则：`compileRouteRules`、`matchRouteRules`、`createRouteRulesMiddleware`、`applyPathTransform`、`normalizeIsrRule`
- ISR：`serveIsr`、`getIsrCache`、`getStaleIsrCache`、`setIsrCache`、`invalidateIsrCache`、`invalidateIsrCachePattern`、`isIsrEntryStale`、`buildIsrCacheKey`、`getIsrRuleFromContext`
- 渲染模式解析：`resolveSelectSsr`、`ssrModeHeader`
- Server Actions：`defineAction` / `defineServerFn`、`fail` / `ActionError`、action 注册表、`createActionsMiddleware`、`POST /__actions`、表单 action 辅助函数
- `./runtime` 子路径中的客户端安全运行时：`createActionStub`、`callAction`、`useAction`、`useFormAction`、`invokeServerFn`
- `createInternalAdapter` / `setInternalFetcher`（进程内调度）、`isBotUserAgent`、`registerOpenAPIRoutes`

**不包含**（由其他包负责）：

- 路由**扫描**（文件系统 → `Scanned*` 结构）—— `@ubean/scan`
- 应用构建、中间件顺序、`/_health`、CSRF/CSP 接线 —— `@ubean/app`
- HTTP 缓存存储、组件级缓存、数据库、队列 —— `@ubean/server`（本包只接受 `CacheStore` 形状的对象）
- Vue 侧路由与 `definePage` 宏 —— `@ubean/vue`

**运行时依赖白名单（主入口）：`@ubean/shared`、`@ubean/i18n`、`hono`、`hono-openapi`、`rou3`、`@soybeanjs/fetch`。** 三个 peer 均为可选，只在对应集成需要时才需要 —— 缺少 `@ubean/scan` 时需自行构造 `Scanned*` 输入；缺少 `@ubean/pages` 时页面渲染器类型退化为 `any`；缺少 `vue` 时仅 `./runtime` 子路径无法导入。

## 安装

```bash
pnpm add @ubean/routes hono

# 可选 peer —— 仅在实际使用的集成中需要：
pnpm add @ubean/scan @ubean/pages   # 扫描产物结构 + 页面渲染器类型
pnpm add vue                        # 客户端 actions 运行时（`./runtime`）
```

## 快速开始

**1. 定义 API 路由**，按 HTTP 方法命名导出（`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` / `HEAD`）：

```ts
// src/routes/api/posts.ts
import { defineHandler } from '@ubean/routes';
import { validator } from 'hono-openapi';
import { z } from 'zod';

export const GET = defineHandler(validator('query', z.object({ limit: z.coerce.number().max(100) })), c =>
  c.json({ limit: c.req.valid('query').limit })
);

export const POST = defineHandler(async c => {
  const body = await c.req.json<{ title: string }>();
  return c.json({ created: true, title: body.title }, 201);
});
```

**2. 把扫描结果挂到 Hono 应用上**：

```ts
// src/server.ts
import { registerRoutes } from '@ubean/routes';
import type { RegisterOptions } from '@ubean/routes';
import { Hono } from 'hono';

const app = new Hono();
const scan: RegisterOptions = { routes, middleware, pages, layouts, routeLoaders, middlewareLoaders };

await registerRoutes(app, scan);
```

在 ubean 项目里这两步都已自动接好：`ubean build` 把扫描结果注入 `createUbeanApp`（来自 `@ubean/app`），后者在 `init()` 期间调用 `registerRoutes`。

## 路由处理器

`defineHandler(...handlers)` 接受 1 到 5 个 Hono handler，返回一个 `MiddlewareChain` 数组 —— 即注册器能识别的携带元数据的链。最后一个之前的所有 handler 都是中间件；handler 也可以返回普通对象或字符串而不是 `Response`，会被转换为 `application/json`（对象）或 `text/plain`（字符串）。

```ts
import { defineHandler } from '@ubean/routes';

export const GET = defineHandler(async c => ({ ok: true })); // → application/json
```

`defineHandlerMeta(meta)` 是一个 pass-through 中间件，在不改变响应的前提下附加 ubean 特有的路由元数据。它只承载 ubean 自己的键以及自定义扩展字段：

```ts
import { defineHandler, defineHandlerMeta } from '@ubean/routes';

export const GET = defineHandler(defineHandlerMeta({ requiresAuth: true, cache: { ttl: 300 } }), c =>
  c.json({ ok: true })
);
```

`defineMiddleware(handler)` 是恒等包装器，把一个 Hono `MiddlewareHandler<UbeanEnv>` 标记为路由级中间件，供扫描与类型推导使用。

## 服务端路由

`UbeanRouter` 是基于 rou3 的路由器，操作对象是编译后的扫描产物。`createServerRouter()` 返回新实例；`useRouter()` 返回共享实例。

```ts
import { createServerRouter } from '@ubean/routes';

const router = createServerRouter();
router.addApiRoute({ method: 'GET', route: '/api/posts', fullPath: 'src/routes/api/posts.ts' });
router.addMiddleware({ fullPath: 'src/middleware/auth.ts', order: 1, global: false });
router.addPage({ name: 'PostsIndex', route: '/posts', fullPath: 'src/pages/posts/index.vue' });
router.addLayout({ name: 'default', fullPath: 'src/layouts/default.vue', isDefault: true });
```

编译后的形状：`CompiledRoute { method, path, id, filePath, meta? }`、`CompiledMiddleware { path, filePath, order, global }`、`CompiledPage { name, path, filePath, layout?, reuseTarget? }`、`CompiledLayout { name, filePath, isDefault }`。

## 路由注册

`registerRoutes(app, options)` 是唯一入口，按顺序注册：中间件 → API 路由 → 页面路由。更窄的 `registerApiRoutes` / `registerPageRoutes` 也对外导出，供只需要其中一半的调用方使用。

注册顺序属于正确性问题，因此它是契约而非实现细节：`sortApiRoutesForRegistration` 与 `apiPathSpecificity` 把字面量路径排在 `:param` 兄弟之前（Hono 的 `TrieRouter` 是 first-match-wins），catch-all 路由排在最后。`convertUbeanRoutePath` 负责把扫描器的路径方言翻译为 Hono 的。

```ts
import { registerApiRoutes, sortApiRoutesForRegistration, apiPathSpecificity } from '@ubean/routes';

await registerApiRoutes(app, scan);
```

`createRouteLoader(importMetaGlob)` 把 `import.meta.glob` 映射转换为注册器可以懒调用的 loader 函数。

## 路由规则

路由规则是按 glob 模式匹配的声明式按路径覆盖（`*` = 单段，`**` = 递归多段）。`compileRouteRules` 预编译规则对象，`matchRouteRules` 匹配请求路径，`createRouteRulesMiddleware` 把两者串起来并把合并结果暴露为 `c.get('routeRule')`。

```ts
import { createRouteRulesMiddleware } from '@ubean/routes';

app.use(
  '*',
  createRouteRulesMiddleware({
    '/legacy/**': { redirect: { to: '/new/**', statusCode: 301 } },
    '/api/proxy/**': { proxy: 'https://upstream.example.com/**' },
    '/blog/**': { isr: { ttl: 60, swr: true } }
  })
);
```

中间件内部的解析顺序：`redirect` > `rewrite`（重新 dispatch）> `proxy` > `headers`（合并）> `cache`。渲染类字段（`ssr` / `isr` / `prerender` / `ppr`）由页面请求路径稍后消费，不在本中间件内处理。`applyPathTransform(requestPath, rulePath, target)` 是 redirect/rewrite/proxy 规则使用的 `*` / `**` 占位符替换。

## ISR（增量静态再生）

ISR 用 TTL 缓存页面路由**渲染后的 HTML**，可选在后台重新生成期间返回旧内容。`serveIsr(c, options)` 命中（或已同步重新渲染）时返回 `Response`，需要调用方自行渲染时返回 `undefined`。

```ts
import { serveIsr, buildIsrCacheKey } from '@ubean/routes';

const response = await serveIsr(c, {
  pathname: c.req.path,
  rule: { ttl: 60, swr: true },
  render: () => renderPage(c),
  store: cacheStore
});
```

流程与响应头：

| 情形                  | 结果                                  |
| --------------------- | ------------------------------------- |
| 存在且未过期          | 缓存 HTML，`X-ISR: HIT`               |
| 已过期且 `swr: true`  | 旧 HTML，`X-ISR: STALE`，后台重新生成 |
| 已过期且 `swr: false` | 同步重新渲染，`X-ISR: MISS`           |
| 无条目                | 渲染、缓存，`X-ISR: MISS`             |

键带 `isr:` 前缀（`buildIsrCacheKey(pathname)` → `` `isr:${pathname}` ``），因此 ISR 条目永不与 `RouteRule.cache` 的响应冲突。后台重新生成按路径去重。`normalizeIsrRule` 接受简写形式（`60`、`{ ttl: 60 }`、`{ ttl: 60, swr: true }`）；`getIsrRuleFromContext(c)` 读取路由规则中间件挂上的规则。存储必须由调用方**注入** —— `IsrCacheStore` 与 `@ubean/server` 的 `CacheStore` 结构兼容，但本包并不依赖它。要实现 SWR 请实现可选的 `peek()`；不实现时 ISR 退化为 `get()`，而 `get()` 会删除过期条目，从而关闭旧内容服务。

## 渲染模式选择

`resolveSelectSsr(input)` 从页面级声明、命中的路由规则与全局设置中解析出生效模式，返回 `ResolvedSelectSsr`；`ssrModeHeader(mode)` 渲染对应的响应头取值。模式为 `'ssr' | 'streaming' | 'data-only' | 'csr'`（`SelectSsrValue` 在配置侧是 `boolean | 'streaming' | 'data-only'`）。

## Server Actions

Server Actions 是可从客户端调用的类型安全服务端函数，并支持渐进增强表单。对齐 Next.js / SvelteKit / SolidStart 的模式。

### 定义 action

```ts
// src/actions/auth.ts
import { defineAction, fail, ActionError } from '@ubean/routes';
import * as v from 'valibot';

const schema = v.object({ email: v.pipe(v.string(), v.email()), password: v.pipe(v.string(), v.minLength(8)) });

export const login = defineAction(schema, async input => {
  if (input.password === 'wrong') return fail(400, { password: 'incorrect' });
  const user = await authenticate(input.email, input.password);
  if (!user) throw new ActionError('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  return { user };
});
```

`defineAction(handlerOrSchema, handler?, options?)` 接受任意 Standard Schema v1 库（valibot / zod / arktype）或带 `safeParse` / `parse` 的对象。`defineServerFn` 是别名 —— 相同 ID、相同端点 —— 用于同时被当作 loader 使用的函数。`fail(status, errors)` 返回字段级错误；`ActionError` 是携带 `code` / `status` 的用户可读错误类。ID 由 `createActionId(filePath, exportName)` 生成（`isValidActionId` 负责校验），`registerAction` / `getAction` / `hasAction` / `listActions` / `clearActions` 暴露注册表。

端点是 `ACTIONS_ENDPOINT`（`/__actions`），由 `createActionsMiddleware()` 服务；action 响应携带 `ACTION_RESPONSE_HEADER`（`x-ubean-action`），`isActionResponse` / `isActionsRequest` 据此判断。`dispatchAction(id, c, preParsedInput?)`、`runAction(action, c, preParsedInput?)` 与 `runPageAction(actions, actionName, c)` 是服务端入口，`parseActionInput` / `validateActionInput` / `normalizeActionResult` / `buildActionContext` 是它们的组成部件。

### 客户端运行时（`./runtime`）

`@ubean/routes/runtime` 是客户端安全片段：它承载 actions RPC 与表单 action 运行时，且**禁止**导入 Node.js API 或服务端专用类型。Vite 插件（`ubeanServerActionsPlugin`，已包含在 `ubeanPlugin()` 中）在客户端构建里把 `defineAction()` 调用替换为 `createActionStub(id)`；`useAction` / `useFormAction` 由 `ubean/client` 再导出。

```ts
import { callAction, useAction, useFormAction } from '@ubean/routes/runtime';

const { submit, pending, data, error, errors, status, result, reset } = useAction(login);

const form = useFormAction('login'); // → { action, pending, onSubmit, data, errors }
```

`callAction(id, args)` 是底层 RPC —— 向 `/__actions` 发 JSON `POST`，带 `x-ubean-action: true` 头。`invokeServerFn(fn, input?)` 是同构调用（服务端：直接走 handler + schema；客户端：走 RPC stub）；`unwrapActionResult` / `unwrapServerFnResult` 负责解包结果或重新抛出。这个拆分的意义在于：客户端产物可以只导入 actions RPC，而不被拖入路由、ISR、action 注册表或 `hono`。

### 表单 action

页面模块可以导出 `actions` 记录；表单向 `?/<actionName>` 提交（SvelteKit 风格），无需 JavaScript 也能工作。`parseFormActionName(url)` 从 URL 中读出名，`buildFormActionUrl(actionName = 'default')` 构造一个，`hasFormAction(url)` 判断是否存在。

## OpenAPI

`registerOpenAPIRoutes(app, options)` 挂载 `/_openapi.json`（默认 `openAPIPath`）与 `/_scalar` 上的 Scalar UI（默认 `scalarPath`）。它用 hono-openapi 从 `describeRoute` 元数据生成 spec，并并入 `describeActionsOpenApi()` 提供的 Server Actions 片段。

```ts
import { registerOpenAPIRoutes } from '@ubean/routes';

registerOpenAPIRoutes(app, { title: 'My API', version: '1.0.0' });
```

`SCALAR_SCRIPT_ORIGIN` 是 Scalar 页面加载脚本所用的 CDN 源 —— 需要把它加进 CSP 的 `script-src`（ubean 运行时只在该页面的响应上追加它）。

## 内部 fetch

`createInternalAdapter(c?, options?)` 返回一个 fetch 适配器，它通过注入的框架 handler 调度请求而不是走网络；`setInternalFetcher` / `getInternalFetcher` / `clearInternalFetcher` 管理该注入。`createInternalFetch`（`@ubean/pages`）与 `@ubean/app` 的 `handleFetch` 接线都构建在其上。

```ts
import { createInternalAdapter, setInternalFetcher } from '@ubean/routes';

setInternalFetcher(request => app.fetch(request));
const adapter = createInternalAdapter();
```

## 爬虫检测

`isBotUserAgent(ua)` 检测爬虫与社交预览 UA（接受 `string | undefined | null`）。框架用它把流式 SSR 降级为缓冲渲染，以保证动态 `<head>` 元数据出现在初始响应中。

## 类型安全

- `UbeanApp` 形状的环境类型（`UbeanEnv`、`UbeanContext`、`UbeanVariables`、`UbeanBindings`、`UbeanHandler`、`UbeanMiddleware`、`ComposedHandler`、`Input`、`GenericSchema`、`RouteMeta`、`Span*`）从 `@ubean/shared` 再导出，handler 无需额外的类型导入。
- `defineHandler` 为 1 到 5 个 handler 做了重载，并在链上累积输入类型（`H<UbeanEnv, any, I & I2, …>`），因此每个 `validator` 之后 `c.req.valid(...)` 都会正确收窄。
- `RegisterOptions`（`routes` / `middleware` / `pages` / `layouts` / `routeLoaders` / `middlewareLoaders` / `pageLoaders` / `i18nConfig` / `ssrExclude` / `streaming` / …）是 `@ubean/scan` 与本包之间的类型化契约。

## 架构说明

- **两个入口是刻意设计。** `.` 是服务端运行时；`./runtime` 是浏览器片段。拆分的意义在于客户端产物能够 `import { useAction }` 而不被拖入 `hono`、rou3 路由、ISR 或 action 注册表。
- **注册顺序是契约。** `sortApiRoutesForRegistration` / `apiPathSpecificity` 对外导出，使排序规则可测试、可复用；catch-all 路由始终最后注册。
- **ISR 与存储解耦。** `IsrCacheStore` 是结构化类型；`serveIsr` 从不导入任何缓存实现。`peek()` 是可选的，其缺失会按文档化行为退化为同步重新生成。
- **Action ID 是内容寻址的。** `createActionId` 从 `filePath` + `exportName` 派生 ID，这正是客户端 stub 与服务端注册无需 manifest 即可保持一致的原因。
- **OpenAPI 按路由 opt-in。** `describeRoute` / `validator` 来自 `hono-openapi`；除非路由声明了元数据且应用注册了 `registerOpenAPIRoutes`，否则不会生成任何东西。
