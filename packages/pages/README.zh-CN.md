# @ubean/pages

**[English](./README.md) | 中文**

ubean 的页面数据协议与同构数据层 —— `PageObject`、页面 shell、SSR 载荷、`useData`、`defer` 与失效。

它拥有「渲染页面的一方」与「水合页面的一方」之间的契约：传入 `PageObject`，产出带 `__UBEAN_DATA__` / `__UBEAN_DEFERRED__` / `__UBEAN_PAGE_DATA__` 载荷脚本的 HTML shell，而同一个 `useData()` 调用在服务端与浏览器都能工作。

```ts
import { renderPage, useData, defer, invalidateData } from '@ubean/pages';

const html = await renderPage(pageObject, assetTags, renderer);
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [页面数据协议](#页面数据协议)
- [页面 Shell 与渲染](#页面-shell-与渲染)
- [数据层](#数据层)
- [延迟数据（流式）](#延迟数据流式)
- [Fetch 集成](#fetch-集成)
- [内部 Fetch 与流辅助](#内部-fetch-与流辅助)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                                                                                                                                       | 本包不负责 —— 对应归属                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **页面数据协议**：`PageObject`、`PageAssetTags`、`PageRenderFn` / `PageStreamRenderFn` / `PageRenderer`、`LocaleMetaInfo`，以及载荷脚本 id `PAGE_DATA_ID` / `LOCALE_DATA_ID` / `STATE_DATA_ID` | 路由注册、布局链与 Vue 渲染 → `@ubean/routes` / `@ubean/client` / `@ubean/vue`                |
| **Shell 构造与载荷注入**：`buildPageShell`、`buildClientOnlyShell`、`renderPage`、`renderPageToStream`、`insertSsrContent`、`insertStateContent`、`renderFaviconLink`、`safeJsonStringify`     | 决定*何时*渲染（SSR 还是 CSR）、流式策略与爬虫降级 → `@ubean/routes` 的 router / route rules  |
| **同构数据层**：`useData` / `useAsyncData` / `invalidateData` / `invalidateAll` / `clearPageData` / `hasData`、缓存键（`defineDataKey`）、TTL/tag/dedupe 行为与 `__UBEAN_DATA__` 载荷          | 响应级 HTTP 缓存、ISR 与组件级缓存 → `@ubean/server` 的 cache；`routeRules` → `@ubean/config` |
| 面向 SSR 流式的**延迟**数据：`defer`、`useDeferredData`、`isDeferredValue` 与 `__UBEAN_DEFERRED__` 载荷脚本                                                                                    | 流式 HTTP 响应本身与 `Suspense` 边界 → `@ubean/client` 的 SSR renderer                        |
| **Fetch 集成**：`useFetch`、`setDefaultFetch` / `getDefaultFetch` —— Nuxt 风格包装，从不自研 HTTP 客户端                                                                                       | HTTP 客户端本身 → [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)        |
| **进程内请求辅助**：`createInternalFetch`（不经过网络直接调度框架 handler）与 `createStreamResponse` / `createSseStream`                                                                       | Hono 应用装配与路由挂载 → `@ubean/app`；Hono 响应辅助本身 → Hono                              |

**主入口的运行时依赖白名单：仅 `@ubean/shared`** —— 不含 Hono，不含 `node:*`，不含构建期或 renderer 包。`vue` 是**必需 peer**（`>=3.4.0`）：数据层基于 `ref` / `shallowRef` 构建，缺少它没有有意义的降级模式。

`@ubean/pages` 只有一个导出（`.`）—— 与 `@ubean/shared` 不同，它没有拆分「客户端安全」与「Node 专用」的子路径，因为整个包都是运行时无关的。

## 安装

```bash
pnpm add @ubean/pages
```

`vue` 是必需 peer，任何 ubean 应用里都已经有它。

## 快速开始

```ts
import { buildPageShell, insertSsrContent, renderPage, serializePageData } from '@ubean/pages';
import type { PageObject, PageAssetTags } from '@ubean/pages';

const pageObject: PageObject = {
  component: '/src/pages/index.vue',
  props: { title: 'Home' },
  params: {},
  url: '/'
};

const assetTags: PageAssetTags = { css: '<link rel="stylesheet" href="/assets/app.css">' };

// 1. 构建 shell（载荷脚本已在其中）
const shell = buildPageShell(pageObject, assetTags);

// 2. 让 renderer 填充 SSR 插槽
const html = insertSsrContent(shell, '<div id="app">…</div>');

// 或者一步完成，包括 state 注入与 client-only 回退
const full = await renderPage(pageObject, assetTags, renderer);
```

## 页面数据协议

`PageObject` 是交给 renderer 并被序列化进文档以供水合的唯一载荷：

| 字段        | 类型                                            | 含义                                                                                       |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `component` | `string`                                        | 由客户端路由解析的组件模块路径                                                             |
| `props`     | `Props`（泛型，默认 `Record<string, unknown>`） | 传给页面组件的 props                                                                       |
| `params`    | `Record<string, string>`                        | 路由参数                                                                                   |
| `url`       | `string`                                        | 请求 URL                                                                                   |
| `layout`    | `string \| false`（可选）                       | 布局覆盖；`false` 表示禁用布局                                                             |
| `errors`    | `Record<string, string> \| null`                | 字段级错误（Server Action / 表单失败）                                                     |
| `head`      | `PageHead`（可选）                              | head 元数据 —— 该类型从 `@ubean/shared` 以 `PageHead` 与 `PageHeadMeta` 两个名字 re-export |

`PageAssetTags` 携带注入文档的 HTML 片段：`css`、`preloads`、`body`，以及 `favicon`（一个 HREF，会变成 `<link rel="icon">`，MIME 类型由扩展名推断）。

协议常量规定了双方约定的载荷脚本与标记：

| 常量                  | 值                           |
| --------------------- | ---------------------------- |
| `PAGE_DATA_ID`        | `'__UBEAN_PAGE_DATA__'`      |
| `LOCALE_DATA_ID`      | `'__UBEAN_LOCALE__'`         |
| `STATE_DATA_ID`       | `'__UBEAN_STATE__'`          |
| `PAGE_REQUEST_HEADER` | `'x-ubeanpages'`             |
| `SSR_CONTENT_MARKER`  | `'<!--UBEAN_SSR_CONTENT-->'` |
| `STATE_MARKER`        | `'<!--UBEAN_STATE-->'`       |

`isPagesRequest(c)` 检查传入的 Hono context 是否带 `x-ubeanpages: true` —— 这个标记告诉服务端 handler 返回 JSON 格式的 `PageObject` 而不是 HTML。

## 页面 Shell 与渲染

```ts
import {
  buildPageShell,
  buildClientOnlyShell,
  insertSsrContent,
  insertStateContent,
  renderPage,
  renderPageToStream,
  renderFaviconLink,
  pageJsonResponse,
  serializePageData
} from '@ubean/pages';

buildPageShell(pageObject, assetTags, preambleScript?, appId = 'app', renderContext?);
buildClientOnlyShell(pageObject, assetTags, preambleScript?, appId = 'app', renderContext?);
```

- `buildPageShell()` 产出完整文档：favicon link、head 标签（title / meta / link / html & body attrs）、CSS 与 preload 标签、可选的 locale 脚本、page-data 脚本、state 占位符，以及包含 `SSR_CONTENT_MARKER` 的 `<div id="{appId}">`。
- `buildClientOnlyShell()` 是同一个文档，但 app 容器为空 —— 在没有 renderer 时使用。
- `renderPage(pageObj, assetTags, renderer, appId?, renderContext?)` 返回最终 HTML 字符串。`renderer === null` 时降级为 `buildClientOnlyShell()`。renderer 返回纯字符串且其中包含 `<html>` 时被视为完整文档；否则插入到 SSR 标记处。renderer 返回 `{ html, state }` 时还会把 `state` 注入 state 脚本（空 state 会清空占位符）。
- `renderPageToStream(...)` 返回 `ReadableStream<Uint8Array>`；可用时走 `renderer.renderToStream`，否则回退为用 `renderPage()` 构建的单块流。
- `insertSsrContent(shell, appHtml)` / `insertStateContent(shell, stateJson)` 直接做那两处占位符替换。
- `serializePageData(pageObject)` / `safeJsonStringify(value)` 在序列化时转义 `<`、`>`、`&`、U+2028 与 U+2029，因此载荷可以安全地待在 `<script>` 标签里而不会逃逸。
- `pageJsonResponse(pageObject, headers?)` 构造带 `X-UbeanPages: true` 与 `Vary: X-UbeanPages` 的 `application/json` 响应。

`renderContext`（`PageRenderContext`）是语言与路由信息进入 shell 的地方：`locale`、`localeDir`、`messages`、`fallbackLocale` / `fallbackMessages`、`routing`（`defaultLocale` / `locales` / `strategy`）、`cookieName`、`baseUrl` 与 `availableLocales`。设置 `locale` 时，shell 还会把 `lang` 与 `dir` 写到 `<html>` 上。

## 数据层

`useData(options, context?)` 是主 API。它是同构的：服务端把取到的值收集进 `__UBEAN_DATA__` 载荷；浏览器里同一个调用会读回该载荷而不是重新请求。

```ts
import { useData } from '@ubean/pages';

const { data, error, loading, pending, status, timestamp, invalidate, refresh } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json()),
  ttl: 60_000, // 缓存 60 秒
  tags: ['posts'], // 失效分组
  staleWhileRevalidate: true, // 刷新期间先返回旧数据
  dedupe: true // 相同 key 的在途请求共享（默认）
});
```

`UseDataOptions<T>`：`key?`、`tags?`、`ttl?`、`staleWhileRevalidate?`、`fetcher`（必填）、`dedupe?`。
`DataResult<T>`：`data`、`error`、`loading`、`pending`（`!loading` 的别名）、`status`（`'idle' | 'pending' | 'success' | 'error'`）、`timestamp`、`invalidate()`、`refresh()`。

| API                                                      | 行为                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `useData(options, context?)`                             | 带缓存 / TTL / tag 的获取；客户端从 SSR 载荷水合           |
| `useAsyncData(key, fn, options?, context?)`              | Nuxt 风格位置参数签名；返回值与 `useData` 完全一致         |
| `defineDataKey(key)`                                     | `Symbol.for('ubean:data:<key>')` —— 跨模块实例共享的稳定键 |
| `invalidateData(keyOrTag, context?)`                     | 按 key **或** tag 删除条目；返回被删除的数量               |
| `invalidateAll(context?)` / `clearPageData(context?)`    | 清空条目、tag 索引与在途注册表                             |
| `hasData(key, context?)`                                 | 该 key 当前是否已缓存                                      |
| `declareDependencies({ keys, tags? })`                   | 声明某段工作读取的 key/tag（原样返回该声明）               |
| `withDependencies(fn, deps)`                             | 返回 `fn` 的异步包装，用于依赖跟踪的工作                   |
| `getInvalidatedKeysForAction(actionName, map, context?)` | 失效映射到某个 Server Action 名称的 key；返回失效数量      |

在途注册表是按请求/实例的，并支持去重：相同 key 的并发 `useData` 调用共享同一个 Promise，除非使用 `refresh()` —— 它刻意同时绕过缓存与去重。

## 延迟数据（流式）

`defer()` 把一个 Promise 标记为非关键，使 SSR 流式渲染不必等它。

```ts
import { defer, useDeferredData, isDeferredValue } from '@ubean/pages';

const {
  data: comments,
  pending,
  error
} = useDeferredData(
  'comments',
  defer(() => fetch('/api/comments').then(r => r.json()))
);
```

`DeferredValue<T>` 是 `{ readonly __isDeferred: true; readonly factory: () => Promise<T> }`；`isDeferredValue()` 是类型守卫。`UseDeferredDataResult<T>` 是 `{ data: ShallowRef<T | undefined>; pending: Ref<boolean>; error: ShallowRef<Error | null> }`。

不同运行时的生命周期不同，而这个差异对水合至关重要：

- **SSR** —— 注册 factory 但不阻塞渲染；组件渲染 fallback，解析后的值在主内容之后流式写入 `__UBEAN_DEFERRED__`。
- **客户端水合** —— 首帧与 SSR 一致（仍是 fallback）；挂载后采用 `__UBEAN_DEFERRED__` 里的值，不发第二次请求。在 `setup()` 里就应用会让客户端首帧与服务端 HTML 不同，触发 Vue hydration mismatch。
- **客户端导航** —— 调用 factory，`pending` 为 `true`，随后解析。

## Fetch 集成

`useFetch(key, url, options?, context?)` 包装 `useAsyncData`。它**不**自带 HTTP 客户端：通过 `setDefaultFetch(createRequest())` 或单次调用的 `options.request` 传入一个鸭子类型的 `@soybeanjs/fetch` 实例。没有客户端时回退到全局 `fetch` + JSON。

```ts
import { useFetch, setDefaultFetch } from '@ubean/pages';
import { createRequest } from '@soybeanjs/fetch';

setDefaultFetch(createRequest());

const { data, pending, refresh } = await useFetch('posts', '/api/posts', {
  method: 'GET',
  query: { page: 1 },
  transform: res => res.items
});
```

`UseFetchOptions<T>` 在 `UseAsyncDataOptions` 之上增加 `method`（`'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`）、`query`、`body`、`request`（一个 `FetchClient`）与 `transform`。`FetchClient` 是 `{ get?, request? }`。`getDefaultFetch()` 读回由 `setDefaultFetch()` 安装的客户端（存在 `globalThis` 上，因此在 dev 的双模块实例情形下依然共享）。

## 内部 Fetch 与流辅助

```ts
import { createInternalFetch, createStreamResponse, createSseStream } from '@ubean/pages';

const iFetch = createInternalFetch({ baseURL: '', forwardHeaders: ['cookie'] });
const res = await iFetch('/api/posts');
```

`createInternalFetch(options)` **在进程内**调度框架自身的 handler —— 不经过网络，不绑定端口。`InternalFetchOptions`：`baseURL`、`headers`、`credentials`（`'include' | 'omit' | 'same-origin'`）与 `forwardHeaders`（默认包含 `cookie`、`authorization`、`x-request-id`、`x-forwarded-*`、`accept-language`、`user-agent`、`referer`）。

`createStreamResponse(init?, onStart?)` 与 `createSseStream(onStart?)` 都返回一个 body 为 `ReadableStream<Uint8Array>` 的 `Response`，由 `StreamHelper` 驱动：

```ts
interface StreamHelper {
  enqueue: (chunk: unknown) => void;
  close: () => void;
  error: (err: Error) => void;
  response: Response;
}
```

`createStreamResponse` 入队原始块或 JSON 字符串块；`createSseStream` 把每个块封装为 Server-Sent Event。

## 类型安全

- `PageObject<Props>` 对其 props 泛型化，因此 `pageObject.props` 在整条 renderer 管线中保持类型。
- `DataResult<T>` 与 fetcher 的返回类型一致；`UseDataOptions<T>` 要求 `fetcher: DataFetcher<T>`。
- `PageRenderResult` 是 `string | { html: string; state?: Record<string, unknown> }`，renderer 作者可以选择启用 state 序列化而不破坏字符串消费方。
- `PageRenderer` 是 `{ render: PageRenderFn; renderToStream?: PageStreamRenderFn; preambleScript?: string }` —— 传入不带 `render` 的对象是编译错误，而 `renderToStream` 可选，只有存在时才改变行为。
- `PageHead` / `PageHeadMeta` 从 `@ubean/shared` re-export，确保读取 head 元数据的各包共用同一定义。

## 架构说明

- **协议在前，renderer 在后。** 本包从不 import Vue renderer；它定义文档骨架与载荷格式，由 renderer（来自 `@ubean/client/ssr`）填充插槽。正因如此，同一份协议可以服务缓冲 SSR、流式 SSR 与 client-only shell 三种形态。
- **`__` 前缀的导出是内部实现。** 载荷注册与解析辅助是为了框架自己的 server/client 入口而导出；应用代码应使用 `useData`、`defer` 及其对应的公开 API。
- **载荷脚本就是水合契约。** `__UBEAN_DATA__`（数据）、`__UBEAN_DEFERRED__`（流式非关键数据）、`__UBEAN_PAGE_DATA__`（`PageObject`）、`__UBEAN_LOCALE__`（i18n 上下文）与 `__UBEAN_STATE__`（Pinia 等框架状态）都由客户端入口在 mount 之前读回。
- **`setDefaultFetch` 刻意写入 `globalThis`。** dev 下 SSR 图会把框架包内联，而 `@ubean/pages` 走另一份解析，模块级变量在两个实例之间不会共享。
- **SSR 数据是填入的，不是重新获取的。** `useData` 在客户端优先读取载荷，因此服务端渲染过的页面水合时不会把同一个请求再发一次。
