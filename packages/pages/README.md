# @ubean/pages

**English | [中文](./README.zh-CN.md)**

Page data protocol and isomorphic data layer for ubean — `PageObject`, page shells, SSR payloads, `useData`, `defer`, and invalidation.

Owns the contract between whatever renders a page and whatever hydrates it: a `PageObject` goes in, an HTML shell with the `__UBEAN_DATA__` / `__UBEAN_DEFERRED__` / `__UBEAN_PAGE_DATA__` payload scripts comes out, and the same `useData()` call works on the server and in the browser.

```ts
import { renderPage, useData, defer, invalidateData } from '@ubean/pages';

const html = await renderPage(pageObject, assetTags, renderer);
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Page Data Protocol](#page-data-protocol)
- [Page Shells & Rendering](#page-shells--rendering)
- [Data Layer](#data-layer)
- [Deferred Data (Streaming)](#deferred-data-streaming)
- [Fetch Integration](#fetch-integration)
- [Internal Fetch & Stream Helpers](#internal-fetch--stream-helpers)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| What this package is responsible for                                                                                                                                                                                  | What it is not — owner instead                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The **page data protocol**: `PageObject`, `PageAssetTags`, `PageRenderFn` / `PageStreamRenderFn` / `PageRenderer`, `LocaleMetaInfo`, and the payload script ids `PAGE_DATA_ID` / `LOCALE_DATA_ID` / `STATE_DATA_ID`   | Route registration, layout chains and Vue rendering → `@ubean/routes` / `@ubean/client` / `@ubean/vue`             |
| **Shell construction and payload injection**: `buildPageShell`, `buildClientOnlyShell`, `renderPage`, `renderPageToStream`, `insertSsrContent`, `insertStateContent`, `renderFaviconLink`, `safeJsonStringify`        | Deciding _when_ to render (SSR vs CSR), streaming policy and bot downgrade → `@ubean/routes` router / route rules  |
| The **isomorphic data layer**: `useData` / `useAsyncData` / `invalidateData` / `invalidateAll` / `clearPageData` / `hasData`, cache keys (`defineDataKey`), TTL/tag/dedupe behavior, and the `__UBEAN_DATA__` payload | Response-level HTTP caching, ISR and component-level cache → `@ubean/server` cache; `routeRules` → `@ubean/config` |
| **Deferred** data for SSR streaming: `defer`, `useDeferredData`, `isDeferredValue` and the `__UBEAN_DEFERRED__` payload script                                                                                        | The streaming HTTP response itself and `Suspense` boundaries → `@ubean/client` SSR renderer                        |
| **Fetch integration**: `useFetch`, `setDefaultFetch` / `getDefaultFetch` — a Nuxt-style wrapper that never invents an HTTP client                                                                                     | The HTTP client itself → [`@soybeanjs/fetch`](https://www.npmjs.com/package/@soybeanjs/fetch)                      |
| **In-process request helpers**: `createInternalFetch` (dispatch the framework handler without a network hop) and `createStreamResponse` / `createSseStream`                                                           | Hono app assembly and route mounting → `@ubean/app`; Hono response helpers themselves → Hono                       |

**Runtime dependency whitelist (main entry): `@ubean/shared` only** — no Hono, no `node:*`, no build-time or renderer package. `vue` is a **required peer** (`>=3.4.0`): the data layer is built on `ref` / `shallowRef`, so there is no meaningful degraded mode when it is missing.

`@ubean/pages` has a single export (`.`) — unlike `@ubean/shared`, there are no subpaths to separate client-safe from Node-only code, because the whole package is runtime-agnostic.

## Install

```bash
pnpm add @ubean/pages
```

`vue` is a required peer and is already present in any ubean app.

## Quick Start

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

// 1. Build the shell (payload scripts are already inside)
const shell = buildPageShell(pageObject, assetTags);

// 2. Let a renderer fill the SSR slot
const html = insertSsrContent(shell, '<div id="app">…</div>');

// Or do both at once, including state injection and the client-only fallback
const full = await renderPage(pageObject, assetTags, renderer);
```

## Page Data Protocol

`PageObject` is the single payload handed to a renderer and serialized into the document for hydration:

| Field       | Type                                                 | Meaning                                                                                            |
| ----------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `component` | `string`                                             | Component module path resolved by the client router                                                |
| `props`     | `Props` (generic, default `Record<string, unknown>`) | Props passed to the page component                                                                 |
| `params`    | `Record<string, string>`                             | Route params                                                                                       |
| `url`       | `string`                                             | Request URL                                                                                        |
| `layout`    | `string \| false` (optional)                         | Layout override; `false` disables the layout                                                       |
| `errors`    | `Record<string, string> \| null`                     | Field-level errors (Server Action / form failures)                                                 |
| `head`      | `PageHead` (optional)                                | Head metadata — the type is re-exported from `@ubean/shared` as both `PageHead` and `PageHeadMeta` |

`PageAssetTags` carries the HTML fragments injected into the document: `css`, `preloads`, `body`, and `favicon` (a HREF that becomes a `<link rel="icon">` with a MIME type inferred from the extension).

The protocol constants name the payload scripts and markers that both sides agree on:

| Constant              | Value                        |
| --------------------- | ---------------------------- |
| `PAGE_DATA_ID`        | `'__UBEAN_PAGE_DATA__'`      |
| `LOCALE_DATA_ID`      | `'__UBEAN_LOCALE__'`         |
| `STATE_DATA_ID`       | `'__UBEAN_STATE__'`          |
| `PAGE_REQUEST_HEADER` | `'x-ubeanpages'`             |
| `SSR_CONTENT_MARKER`  | `'<!--UBEAN_SSR_CONTENT-->'` |
| `STATE_MARKER`        | `'<!--UBEAN_STATE-->'`       |

`isPagesRequest(c)` checks whether an incoming Hono context carries `x-ubeanpages: true` — the marker that tells a server handler to answer with a JSON `PageObject` instead of HTML.

## Page Shells & Rendering

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

- `buildPageShell()` emits the full document: favicon link, head tags (title / meta / link / html & body attrs), CSS and preload tags, the optional locale script, the page-data script, the state placeholder, and `<div id="{appId}">` containing `SSR_CONTENT_MARKER`.
- `buildClientOnlyShell()` is the same document with an empty app container — used when no renderer is available.
- `renderPage(pageObj, assetTags, renderer, appId?, renderContext?)` returns the final HTML string. With `renderer === null` it degrades to `buildClientOnlyShell()`. A renderer returning a plain string is treated as the full document when it contains `<html>`; otherwise it is inserted into the SSR marker. A renderer returning `{ html, state }` additionally has `state` injected into the state script (an empty state clears the placeholder).
- `renderPageToStream(...)` returns a `ReadableStream<Uint8Array>`; it uses `renderer.renderToStream` when available and otherwise falls back to a single chunk built from `renderPage()`.
- `insertSsrContent(shell, appHtml)` / `insertStateContent(shell, stateJson)` do the two placeholder replacements directly.
- `serializePageData(pageObject)` / `safeJsonStringify(value)` serialize with `<`, `>`, `&`, U+2028 and U+2029 escaped, so the payload can sit inside a `<script>` tag without breaking out of it.
- `pageJsonResponse(pageObject, headers?)` builds a `application/json` response carrying `X-UbeanPages: true` and `Vary: X-UbeanPages`.

`renderContext` (`PageRenderContext`) is where locale and routing information enter the shell: `locale`, `localeDir`, `messages`, `fallbackLocale` / `fallbackMessages`, `routing` (`defaultLocale` / `locales` / `strategy`), `cookieName`, `baseUrl`, and `availableLocales`. When `locale` is set, the shell also writes `lang` and `dir` onto `<html>`.

## Data Layer

`useData(options, context?)` is the primary API. It is isomorphic: on the server the fetched values are collected into the `__UBEAN_DATA__` payload; in the browser the same call reads that payload back instead of re-fetching.

```ts
import { useData } from '@ubean/pages';

const { data, error, loading, pending, status, timestamp, invalidate, refresh } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json()),
  ttl: 60_000, // cache for 60s
  tags: ['posts'], // invalidation groups
  staleWhileRevalidate: true, // serve stale while refreshing
  dedupe: true // share in-flight requests with the same key (default)
});
```

`UseDataOptions<T>`: `key?`, `tags?`, `ttl?`, `staleWhileRevalidate?`, `fetcher` (required), `dedupe?`.
`DataResult<T>`: `data`, `error`, `loading`, `pending` (alias for `!loading`), `status` (`'idle' | 'pending' | 'success' | 'error'`), `timestamp`, `invalidate()`, `refresh()`.

| API                                                      | Behavior                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `useData(options, context?)`                             | Fetch with cache / TTL / tag support; hydrates from the SSR payload on the client |
| `useAsyncData(key, fn, options?, context?)`              | Nuxt-style positional signature; identical return value to `useData`              |
| `defineDataKey(key)`                                     | `Symbol.for('ubean:data:<key>')` — a stable key shared across module instances    |
| `invalidateData(keyOrTag, context?)`                     | Drop entries by key **or** by tag; returns the number of removed entries          |
| `invalidateAll(context?)` / `clearPageData(context?)`    | Clear entries, tag index, and in-flight registry                                  |
| `hasData(key, context?)`                                 | Whether the key is currently cached                                               |
| `declareDependencies({ keys, tags? })`                   | Declare the keys/tags a piece of work reads (returns the declaration unchanged)   |
| `withDependencies(fn, deps)`                             | Return an async wrapper around `fn` for dependency-tracked work                   |
| `getInvalidatedKeysForAction(actionName, map, context?)` | Invalidate the keys mapped to a Server Action name; returns the invalidated count |

The in-flight registry is per-request/instance and supports deduplication: concurrent `useData` calls with the same key share one Promise unless `refresh()` is used, which deliberately bypasses both cache and dedupe.

## Deferred Data (Streaming)

`defer()` marks a Promise as non-critical so that SSR streaming does not wait for it.

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

`DeferredValue<T>` is `{ readonly __isDeferred: true; readonly factory: () => Promise<T> }`; `isDeferredValue()` is the guard. `UseDeferredDataResult<T>` is `{ data: ShallowRef<T | undefined>; pending: Ref<boolean>; error: ShallowRef<Error | null> }`.

The lifecycle differs per runtime, and the difference is load-bearing for hydration:

- **SSR** — the factory is registered but rendering is not blocked; the component renders its fallback, and the resolved value is streamed into `__UBEAN_DEFERRED__` after the main content.
- **Client hydration** — the first frame matches SSR (still the fallback); the value from `__UBEAN_DEFERRED__` is adopted after mount, with no second request. Applying it during `setup()` would make the client's first frame differ from the server HTML and trigger a Vue hydration mismatch.
- **Client navigation** — the factory runs, `pending` is `true`, then it resolves.

## Fetch Integration

`useFetch(key, url, options?, context?)` wraps `useAsyncData`. It does **not** ship an HTTP client: pass a duck-typed `@soybeanjs/fetch` instance via `setDefaultFetch(createRequest())` or per-call `options.request`. Without a client it falls back to global `fetch` + JSON.

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

`UseFetchOptions<T>` extends `UseAsyncDataOptions` with `method` (`'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`), `query`, `body`, `request` (a `FetchClient`), and `transform`. `FetchClient` is `{ get?, request? }`. `getDefaultFetch()` reads back the client installed by `setDefaultFetch()` (stored on `globalThis`, so it survives the dev double-module-instance situation).

## Internal Fetch & Stream Helpers

```ts
import { createInternalFetch, createStreamResponse, createSseStream } from '@ubean/pages';

const iFetch = createInternalFetch({ baseURL: '', forwardHeaders: ['cookie'] });
const res = await iFetch('/api/posts');
```

`createInternalFetch(options)` dispatches the framework's own handler **in process** — no network hop, no port binding. `InternalFetchOptions`: `baseURL`, `headers`, `credentials` (`'include' | 'omit' | 'same-origin'`), and `forwardHeaders` (defaults include `cookie`, `authorization`, `x-request-id`, `x-forwarded-*`, `accept-language`, `user-agent`, `referer`).

`createStreamResponse(init?, onStart?)` and `createSseStream(onStart?)` both return a `Response` whose body is a `ReadableStream<Uint8Array>` driven by a `StreamHelper`:

```ts
interface StreamHelper {
  enqueue: (chunk: unknown) => void;
  close: () => void;
  error: (err: Error) => void;
  response: Response;
}
```

`createStreamResponse` enqueues raw or JSON-stringified chunks; `createSseStream` frames each chunk as a Server-Sent Event.

## Type Safety

- `PageObject<Props>` is generic over its props, so `pageObject.props` stays typed through a renderer pipeline.
- `DataResult<T>` mirrors the fetcher's return type; `UseDataOptions<T>` requires `fetcher: DataFetcher<T>`.
- `PageRenderResult` is `string | { html: string; state?: Record<string, unknown> }`, so renderer authors can opt into state serialization without breaking string consumers.
- `PageRenderer` is `{ render: PageRenderFn; renderToStream?: PageStreamRenderFn; preambleScript?: string }` — passing an object without `render` is a compile error, while `renderToStream` is optional and changes behavior only when present.
- `PageHead` / `PageHeadMeta` are re-exported from `@ubean/shared`, keeping one definition across the packages that read head metadata.

## Architecture Notes

- **Protocol first, renderer second.** This package never imports a Vue renderer; it defines the document skeleton and the payload format, and a renderer (from `@ubean/client/ssr`) fills the slot. That is what lets the same protocol serve buffered SSR, streaming SSR, and a client-only shell.
- **`__`-prefixed exports are internal.** The payload registration and resolution helpers are exported for the framework's own server/client entries; application code should use `useData`, `defer`, and their public counterparts.
- **The payload scripts are the hydration contract.** `__UBEAN_DATA__` (data), `__UBEAN_DEFERRED__` (streamed non-critical data), `__UBEAN_PAGE_DATA__` (the `PageObject`), `__UBEAN_LOCALE__` (i18n context), and `__UBEAN_STATE__` (framework state such as Pinia) are all read back by the client entry before mount.
- **`setDefaultFetch` writes to `globalThis` on purpose.** In dev, the SSR graph inlines the framework package while `@ubean/pages` resolves separately, so a module-level variable would not be shared between the two instances.
- **SSR data is filled in, not re-fetched.** `useData` reads the payload first on the client, so a server-rendered page hydrates without issuing the same request twice.
