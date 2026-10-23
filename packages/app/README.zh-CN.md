# @ubean/app

**[English](./README.md) | 中文**

ubean 的 Hono 应用工厂与服务端配置：`createUbeanApp`、`defineServer` 以及全局 hooks 层。

`@ubean/app` 拥有**服务端应用**本身。`createUbeanApp(options)` 构建 Hono 应用、装载请求中间件链，并在 `init()` 期间注册扫描到的路由、中间件、页面与 Server Actions。`defineServer({...})` 是写在 `src/server.ts` 里的配置入口；全局 hooks 层（`handle` / `handleFetch` / `handleError`）包裹每一个请求。

```ts
// src/server.ts
import { defineServer } from '@ubean/app';

export default defineServer({
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const start = Date.now();
      const response = await resolve(event);
      response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
      return response;
    }
  },
  onServerReady: async app => {
    console.log('routes registered');
  }
});
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [`createUbeanApp`](#createubeanapp)
- [`UbeanApp`](#ubeanapp)
- [`defineServer`](#defineserver)
- [全局 Hooks](#全局-hooks)
- [页面与渲染](#页面与渲染)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 层                   | 职责                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `@ubean/app`（本包） | Hono 应用工厂（`createUbeanApp`）、请求中间件链、服务端配置（`defineServer`）与全局 hooks       |
| `@ubean/routes`      | 路由运行时：`defineHandler`、路由规则、ISR、Server Actions、OpenAPI —— 本包只负责挂载它们的产物 |
| `@ubean/scan`        | 产出 `ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` / `ScannedLayout` 输入        |
| `@ubean/server`      | 运行时原语（cache / db / queue / cron / realtime / security / …），经语义子路径消费             |
| `@ubean/client`      | **Vue** 应用工厂 —— `createUbeanClientApp` / `createUbeanSSRApp`。不属于本包，见下方说明        |

**包含：**

- `createUbeanApp` / `UbeanApp`（Hono），带文档化的 13 步中间件链
- `defineServer` / `createDefaultServerConfig` / `mergeServerConfigs` / `applyServerConfig`
- 全局 hooks：`setGlobalHooks` / `getGlobalHooks` / `clearGlobalHooks`，以及 `applyHandleHook` / `applyHandleFetchHook` / `applyHandleErrorHook` 与 `HandleEvent` / `HandleInput` / `HandleFetchInput` / `HandleErrorInput` 类型
- 辅助函数：`createHandleEvent`、`extractErrorMessage`、`wrapResolve`
- i18n、CSRF、安全头、data cache、route cache、WebSocket、`serveStatic`（仅 Node）、Scalar/OpenAPI、`/_health` 的应用层接线

**不包含**（由其他包负责）：

- 应用的 Vue 侧 —— `createUbeanClientApp` 来自 `@ubean/client`。**`createUbeanApp` 始终是 Hono 工厂。** 两者刻意用不同名字区分；把它们弄混是本生态最常见的坑
- 路由扫描 —— `@ubean/scan`；路由注册内部实现 —— `@ubean/routes`
- cache/db/queue/storage 的具体实现 —— `@ubean/server`

**运行时依赖白名单：`@ubean/i18n`、`@ubean/islands`、`@ubean/routes`、`@ubean/scan`、`@ubean/server`（仅语义子路径）、`@ubean/shared`、`hono`、`hookable`、`pathe`。** 两个 peer 均为可选：缺少 `@ubean/pages` 时 `pageRenderer` 选项退化为 `any`（不做 SSR 页面渲染）；缺少 `@ubean/seo` 时文件约定 SEO 注册不可用 —— 其余功能均正常工作。

## 安装

```bash
pnpm add @ubean/app hono

# peer —— 应用本身只需要类型，且只在用到对应功能时才需要：
pnpm add @ubean/pages   # PageRenderer / SSR 接线
pnpm add @ubean/seo     # 文件约定 SEO（sitemap.ts / robots.ts / …）
```

## 快速开始

```ts
// src/server.ts
import { createUbeanApp, defineServer, applyServerConfig } from '@ubean/app';

const app = createUbeanApp({
  rootDir: process.cwd(),
  routes,
  middleware,
  pages,
  layouts,
  routeRules: { '/api/feed': { cache: { ttl: 300, swr: true } } }
});

await applyServerConfig(app, defineServer({/* … */}));
await app.init();

export default app;
```

`applyServerConfig` 必须**在** `app.init()` **之前**执行，这样插件、运行时 hooks、全局 hooks 与 `onAppCreate` 才都会在路由注册之前就位。

## `createUbeanApp`

```ts
function createUbeanApp(options?: UbeanAppOptions): UbeanApp;
```

`UbeanAppOptions` 主要字段：

| 选项                                                    | 含义                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `rootDir`                                               | 项目根目录，用于解析 `publicDir` 与 SEO 约定                                                    |
| `routes` / `middleware` / `pages` / `layouts` / `crons` | 传给 `registerRoutes` 的扫描输入                                                                |
| `routeRules`                                            | 声明式按路径规则（cache / redirect / rewrite / proxy / headers / ssr / isr / prerender / ppr）  |
| `plugins`                                               | `UbeanAppPlugin[]` —— 注册前的 `setup(app)`、注册后的 `ready(app)`                              |
| `routeLoaders` / `middlewareLoaders` / `pageLoaders`    | 注册期间使用的懒加载器                                                                          |
| `pageRenderer`                                          | 来自 `@ubean/client/ssr` 的 SSR 渲染器；`null` 关闭页面渲染                                     |
| `ssrExclude` / `streaming` / `botFallback`              | 渲染策略；流式启用时爬虫自动降级为缓冲渲染（`botFallback` 默认 `true`）                         |
| `publicDir`                                             | 静态文件根 —— 在路由处理器之前服务，**仅 Node 运行时**                                          |
| `healthEndpoint`                                        | 注册 `/_health`（链上第 ⑬ 步）                                                                  |
| `openAPI`                                               | `boolean                                                                                        | { title, version, description, scalarPath, openAPIPath }` |
| `i18nConfig`                                            | `{ enabled, strategy, defaultLocale, locales, detectBrowserLanguage, fallbackLocale, baseUrl }` |
| `notFoundPage`                                          | 扫描到的 `pages/404` 页面，注册为 Hono 兜底处理器                                               |
| `csrf` / `securityHeaders` / `dataCache`                | 默认开启；`false` 可分别关闭                                                                    |
| `cacheStore` / `cache`                                  | 缓存后端 —— 默认进程内存，`{ store: 'fs', dir }` 走 Node fs 后端                                |
| `seoConventions` / `seoConventionModules`               | 文件约定 SEO 发现（磁盘扫描，或 serverless 用的预加载模块）                                     |
| `colorModeScript` / `ipxHandler`                        | 预渲染的无闪烁脚本；生产 `/_ipx` 图片处理器                                                     |

## `UbeanApp`

```ts
class UbeanApp {
  readonly hono: Hono<UbeanEnv>;
  readonly hooks: Hookable<UbeanRuntimeHooks>;
  readonly plugins: UbeanAppPlugin[];
  readonly options: UbeanAppOptions;
  init(): Promise<this>;
}
```

`init()` 是幂等的。它依次触发 `app:created`、执行各插件的 `setup`、触发 `app:before:register`，在有需要时**先于**路由处理器注册 `serveStatic`（仅当设置了 `publicDir` 且运行时是 Node —— `node:fs` 的导入发生在该分支内部，因此 workerd 永远不会看到它），随后注册路由/中间件/页面，最后注册兜底处理器。

中间件链是一份 **13 步契约**，顺序固定：① `handle` ② requestId ③ actionContext ④ securityHeaders ⑤ csrf ⑥ dataCache ⑦ cacheStore ⑧ i18n ⑨ routeRules ⑩ routeCache ⑪ websocket ⑫ lifecycle ⑬ healthEndpoint。被配置关闭的步骤会从序列中整段缺席（而不是变成空操作），且每个中间件都会把步骤名写入请求级记录，使顺序可被测试断言。

`app.hooks` 上可用的运行时 hooks：`app:created`、`app:before:register`、`app:after:register`、`request:start`、`request:end`、`request:error`、`route:register`、`middleware:register`、`error`。

## `defineServer`

```ts
interface DefineServerOptions {
  plugins?: UbeanAppPlugin[];
  hooks?: ServerHooks; // Partial<UbeanRuntimeHooks>
  globalHooks?: GlobalHooks; // handle / handleFetch / handleError
  onAppCreate?: (app: UbeanApp) => void | Promise<void>;
  onServerReady?: (app: UbeanApp) => void | Promise<void>;
}
```

`defineServer(options)` 归一化为 `ResolvedServerConfig`。`mergeServerConfigs(base, ...configs)` 可合并多份配置 —— shared 配置加上模式专用配置（`server.dev.ts` / `server.prod.ts`），模式专用值逐字段覆盖。`createDefaultServerConfig()` 是 `src/server.ts` 不存在时使用的兜底。`applyServerConfig(app, config)` 会推送插件、注册 hooks、调用 `setGlobalHooks` 并 await `onAppCreate`；它**刻意不调用 `onServerReady`** —— 由调用方在 `init()` 之后自行执行。

## 全局 Hooks

SvelteKit 风格的全局 hooks，通过 `defineServer({ globalHooks })` 注册：

```ts
import { defineServer } from '@ubean/app';

export default defineServer({
  globalHooks: {
    handle: async ({ event, resolve }) => {
      const response = await resolve(event);
      response.headers.set('X-Frame-Options', 'DENY');
      return response;
    },
    handleFetch: async ({ request, fetch }) => {
      request.headers.set('X-Internal-Auth', process.env.INTERNAL_TOKEN!);
      return fetch(request);
    },
    handleError: async ({ event, error, status, message }) => {
      console.error(`[${status}] ${message}`, event.request.url);
    }
  }
});
```

| Hook          | 作用域                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`      | 包裹**每一个**请求 —— 全部中间件、路由、静态资源、404 与错误响应。必须调用 `resolve(event)`（或返回自己的 `Response` 短路）。注册在链首，因此没有请求能绕过它。 |
| `handleFetch` | 拦截服务端 `fetch()` 调用，包括 `internalFetch` / `createInternalAdapter`。可修改请求（头、URL、鉴权）再调用 `fetch(request)`。                                 |
| `handleError` | 未捕获错误的纯副作用入口（日志、上报）。它无法改变响应。                                                                                                        |

`HandleEvent` 为 `{ request: Request; context: Context<UbeanEnv>; clientAddress: string; requestId: string }`。辅助函数：`createHandleEvent(c)` 构造一个，`wrapResolve(c, next)` 把 Hono 的 `next()` 适配为 `resolve(event)` 签名，`extractErrorMessage(error, status)` 生成脱敏消息（404 → `"Not Found"`，5xx → `"Internal Server Error"`，4xx → `error.message`）。

三个 `apply*` 函数是内部调用点（`applyHandleHook` 作为最外层中间件，`applyHandleFetchHook` 位于 internal fetcher 内部，`applyHandleErrorHook` 由 `onError` 调用）。未注册 `handle` hook 时，`applyHandleHook` 返回 `false`，请求照常继续 —— 零开销。

## 页面与渲染

- `pageRenderer` 是 `@ubean/pages` 的 `PageRenderer`；这里只做类型别名而不是按值导入，使没有装该可选 peer 的项目仍能通过类型检查。
- `PageAssetTags`（`head` / `bodyAttrs` / `htmlAttrs` / `favicon`）让构建期把按页面的资源标签注入渲染出的 HTML。
- `streaming: true` 会流式输出 shell 与应用 HTML；`botFallback`（默认 `true`）检测爬虫并把它们切回缓冲渲染，确保动态 `<head>` 元数据出现在初始响应中。
- `ssrExclude` 接受 glob 模式；命中的页面跳过 SSR，返回 CSR shell。
- `notFoundPage` 是 `pages/404` 的扫描结果，注册为 Hono catch-all，使未匹配的浏览器导航渲染应用的 404 组件；状态码跟 SSR 能力走 —— 渲染了它返回 404，只发 CSR shell 返回 200。

## 类型安全

- `UbeanAppOptions` 是应用构建的唯一类型化表面；`PageRenderer` / `PageAssetTags` / `UbeanAppPlugin` / `UbeanRuntimeHooks` 与它一同导出。
- 本包再导出它所操作的共享类型 —— `RouteRule`、`RouteMeta`、`UbeanEnv`、`UbeanMiddleware`、`UbeanMiddlewareStep`、`ComposedHandler`（`@ubean/shared`），`ScannedApiRoute` / `ScannedMiddleware` / `ScannedPageRoute` / `ScannedLayout`（`@ubean/scan`），`RouteRegistrar` / `RegisterOptions`（`@ubean/routes`）—— 因此一个 `src/server.ts` 通常不需要其他类型导入。
- `ResolvedServerConfig` 是 `applyServerConfig` 消费的归一化形态，让应用可以编程式构造配置而不经过 `defineServer`。

## 架构说明

- **`createUbeanApp` 是 Hono 工厂；Vue 工厂是 `@ubean/client` 的 `createUbeanClientApp`。** 两者命名不同是刻意的 —— 不要期待一个返回 Vue app 的 `createUbeanApp`。
- **配置先于 `init()`。** `applyServerConfig` 被拆成独立步骤，正是为了让插件、hooks 与 `onAppCreate` 都落在路由注册之前；在 `init()` 之后调用会静默丢失全部这些内容。
- **语义子路径的习惯在这里同样强制。** `@ubean/app` 自身导入的是 `@ubean/server/cache`、`/middleware`、`/realtime`、`/security` 而非 barrel，代码注释指出 barrel 会把约 30 个模块拖进本包的类型解析。应用服务端代码也应遵循同一规则。
- **按运行时门控的 Node 导入。** `serveStatic` 与 fs 缓存存储都在 `isNodeRuntime()` 分支内通过动态 `import()` 加载。静态导入会把 `node:fs` 留在 workerd 产物里，在模块实例化阶段就失败，轮不到任何运行时判断。
- **中间件顺序是可测试的契约**，而不是副产物 —— 步骤名按请求记录，因此 13 步链的回归会立刻失败。
