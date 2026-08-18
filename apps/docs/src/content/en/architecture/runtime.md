---
title: Runtime
description: "The ubean runtime: defineApp, app configuration, dev server, presets, and the CLI command system."
---

# Runtime

Unlike void's hardcoded `createSSRApp(App)`, ubean provides a `defineApp` function that gives users full control over the creation and configuration of the Vue app instance, supporting plugin registration, global components, directives, provide/inject, and more.

#### Design Philosophy

Users create `app.ts` in the project root (or `srcDir`) — optionally `app.server.ts` / `app.client.ts` to split server/client concerns — and export a **configuration object** (not a factory function) via `defineApp(options)`. After ubean creates the Vue instance, it applies this config to `app` through `applyAppConfig(app, config, mode)`, thereby supporting plugin registration, global components, provide/inject, error components, View Transitions, and so on.

> ⚠️ Note: An earlier design planned `defineApp` as a factory function receiving `({ app, router, ssrContext }) => app`. **That pattern is now deprecated.** `defineApp` accepts an options object and returns a `ResolvedAppConfig`. If you need imperative access to the app instance, use the `onAppCreated` / `onClientReady` callbacks.

```typescript
// app.ts
import { defineApp } from 'ubean';
import { createPinia } from 'pinia';
import GlobalComponent from './src/components/GlobalComponent.vue';

export default defineApp({
  // 注册 Vue 插件（可附带 options 数组或 { plugin, mode } 配置）
  plugins: [
    createPinia(),
    [SomePlugin, { option: true }] // 等价于 app.use(SomePlugin, { option: true })
  ],

  // 全局组件注册
  globalComponents: {
    GlobalComponent
  },

  // provide/inject
  provides: {
    appVersion: '1.0.0'
  },

  // <head> 默认内容
  head: {
    title: 'My ubean App',
    meta: [{ name: 'description', content: 'Built with ubean' }]
  },

  // 根元素属性（#app）
  rootId: 'app',
  rootAttrs: { 'data-app': 'true' },

  // 路由钩子 — 注册 vue-router 的导航守卫
  // 在 router 实例创建后、app.use(router) 之前调用,
  // 因此守卫能拦截首次导航(包括 SSR 的初始 URL push)。
  // Client 和 SSR 都会执行;setup 必须同步注册守卫(守卫本身可返回 Promise)。
  router: {
    setup(router) {
      router.beforeEach((to, from) => {
        if (to.meta.requiresAuth && !isAuthenticated()) {
          return '/login';
        }
      });
      router.afterEach((to) => {
        // 埋点、设置文档标题等
        if (typeof document !== 'undefined' && to.meta?.title) {
          document.title = String(to.meta.title);
        }
      });
    }
  },

  // 命令式访问 app 实例（替代旧的工厂函数）
  onAppCreated(app) {
    // 注册全局指令
    app.directive('focus', {
      mounted(el) {
        el.focus();
      }
    });

    // 全局错误处理
    app.config.errorHandler = (err, _instance, info) => {
      console.error('[Vue Error]', err, info);
    };
  },

  // 客户端就绪回调（仅客户端执行）
  onClientReady(app) {
    // PWA 注册、分析埋点等
  },

  // 自定义错误/加载组件(覆盖 pages/error.vue 和 pages/loading.vue 自动检测)
  errorComponent: () => import('./src/components/ErrorBoundary.vue'),
  loadingComponent: () => import('./src/components/LoadingSpinner.vue'),

  // 启用 View Transitions
  viewTransitions: true
});
```

#### Server/Client Separation

`app.server.ts` and `app.client.ts` export independent `defineApp(options)` configurations. ubean merges them at build time:

- Server: `app.ts` + `app.server.ts` (only plugins with `mode: 'server' | 'all'` take effect)
- Client: `app.ts` + `app.client.ts` (only plugins with `mode: 'client' | 'all'` take effect)

```typescript
// app.server.ts — 仅在 SSR 时合并
import { defineApp } from 'ubean';

export default defineApp({
  provides: {
    isSSR: true
  },
  onAppCreated(app) {
    // SSR 特有逻辑，如注入 SSR 状态
  }
});

// app.client.ts — 仅在客户端水合时合并
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [/* 仅客户端需要的插件 */],
  onClientReady(app) {
    // PWA 注册、客户端埋点等
  }
});
```

#### `defineApp` Parameter Types

```typescript
// packages/ubean/src/runtime/vue/define-app.ts
import type { App as VueApp, Component, Plugin } from 'vue';
import type { Router } from 'vue-router';
import type { PageHead } from '../pages/protocol';
import type { ViewTransitionOptions } from './view-transitions';

export interface AppPluginConfig {
  plugin: Plugin | [Plugin, ...any[]];
  mode?: 'all' | 'client' | 'server';
}

/**
 * 路由钩子配置 — 暴露 vue-router 的导航守卫注册入口。
 * `setup(router)` 在 router 创建后、`app.use(router)` 之前调用,
 * 因此守卫能拦截首次导航(包括 SSR 的初始 URL push)。
 * Client 和 SSR 都会执行。
 */
export interface RouterConfig {
  /** 在 router 创建后、初始导航前同步注册守卫(守卫本身可返回 Promise) */
  setup?: (router: Router) => void;
}

export interface DefineAppOptions {
  /** Vue 插件列表（支持 Plugin、[Plugin, ...opts]、或 { plugin, mode }） */
  plugins?: Array<Plugin | [Plugin, ...any[]] | AppPluginConfig>;
  /** 全局组件（key → 组件） */
  globalComponents?: Record<string, Component>;
  /** provide/inject 的键值对 */
  provides?: Record<string | symbol, unknown>;
  /** 默认 <head> 内容 */
  head?: PageHead;
  /** 根元素 id（默认 'app'） */
  rootId?: string;
  /** 根元素额外属性 */
  rootAttrs?: Record<string, string>;
  /** 路由钩子配置 — 注册 beforeEach/beforeResolve/afterEach 等导航守卫 */
  router?: RouterConfig;
  /** App 创建后回调（替代旧工厂函数中直接操作 app） */
  onAppCreated?: (app: VueApp) => void | Promise<void>;
  /** 客户端 mount 完成后回调 */
  onClientReady?: (app: VueApp) => void | Promise<void>;
  /** 自定义错误边界组件(覆盖 pages/error.vue 自动检测) */
  errorComponent?: Component;
  /** 异步路由的加载占位组件(覆盖 pages/loading.vue 自动检测) */
  loadingComponent?: Component;
  /** 启用/配置 View Transitions */
  viewTransitions?: boolean | ViewTransitionOptions;
  /**
   * SSR 状态序列化钩子 — 在 renderToString 完成后调用。
   * 返回的对象会被序列化到 HTML 的 `__UBEAN_STATE__` script 标签中。
   * 配合 @ubean/pinia 等状态管理扩展使用。
   */
  serializeState?: (app: VueApp) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * 客户端状态水合钩子 — 在 applyAppConfig(注册插件)之后、app.mount() 之前调用。
   * 接收从 `__UBEAN_STATE__` 反序列化的状态对象(或 null)。
   * 必须在 mount 前执行,否则 store 已用默认值初始化,水合无效。
   */
  hydrateState?: (app: VueApp, state: Record<string, unknown> | null) => void;
}

export interface ResolvedAppConfig {
  plugins: AppPluginConfig[];
  globalComponents: Record<string, Component>;
  provides: Record<string | symbol, unknown>;
  head?: PageHead;
  rootId: string;
  rootAttrs: Record<string, string>;
  router?: RouterConfig;
  onAppCreated?: (app: VueApp) => void | Promise<void>;
  onClientReady?: (app: VueApp) => void | Promise<void>;
  errorComponent?: Component;
  loadingComponent?: Component;
  viewTransitions?: boolean | ViewTransitionOptions;
  serializeState?: (app: VueApp) => Record<string, unknown> | Promise<Record<string, unknown>>;
  hydrateState?: (app: VueApp, state: Record<string, unknown> | null) => void;
}

export function defineApp(options: DefineAppOptions): ResolvedAppConfig;
```

#### Entry Generation Flow

1. At build time, scan `srcDir` for `app.ts` / `app.server.ts` / `app.client.ts`.
2. If none exists, use the default entry (`createDefaultAppConfig()` + automatic mount/hydrate).
3. If present, generate a virtual entry module:
   - Server: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); applyAppConfig(app, appConfig, 'server'); renderToString(app)`
   - Client: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); applyAppConfig(app, appConfig, 'client'); app.mount('#' + appConfig.rootId)`
4. Supports conditional merging of `app.server.ts` / `app.client.ts`: the server entry merges `app.ts + app.server.ts`, the client entry merges `app.ts + app.client.ts` (items in `plugins` carrying a `mode` are filtered by context).

#### Comparison with void

| Aspect | void (hardcoded) | ubean (defineApp) |
| --- | --- | --- |
| App instance creation | Internally hardcoded `createSSRApp(App)` | Configured by user via `defineApp(options)` |
| Plugin registration | Not supported (requires manual entry edits) | Native support for the `plugins` array |
| Global components | Not supported | Supports `globalComponents` |
| SSR context | Inaccessible | Accessible during SSR via `onAppCreated` |
| Server/client separation | Not supported | Split via `app.server.ts` / `app.client.ts` |
| Route guards | Not supported | Register `beforeEach` etc. via `router.setup` |
| Default behavior | Fixed template | Auto-falls back to default behavior when no `app.ts` is present |
| View Transitions | Not supported | `viewTransitions` option |
| Error boundary | Not supported | `errorComponent` / `loadingComponent` |

#### Router Hooks (Navigation Guards)

ubean exposes vue-router's global navigation guard registration entry via `defineApp({ router })`. Typical use cases include auth redirects, page-view analytics, NProgress progress bars, and login checks based on `to.meta.requiresAuth`.

**Timing**: `router.setup(router)` is called after the router instance is created and before `app.use(router)`, so guards can intercept the **first navigation** (including SSR's `router.push(initialUrl)`).

**Environment**: Runs on both client and SSR. The `setup` functions defined in `app.ts` and in `app.server.ts` / `app.client.ts` are **cumulative** (order: shared first, then client/server), so shared guards (e.g. analytics) can live in `app.ts`, while environment-specific guards (e.g. SSR auth redirects) can live in `app.server.ts` / `app.client.ts`.

**Registration constraint**: The `setup` function itself must complete guard registration **synchronously** (although the guard body may return a Promise). Do not perform async work inside `setup` (such as firing API requests), or it will block the first navigation. Put async logic inside the guard body instead:

```typescript
// app.ts
import { defineApp } from 'ubean';

export default defineApp({
  router: {
    setup(router) {
      // ✅ 同步注册守卫(守卫本身可异步)
      router.beforeEach(async (to, from) => {
        // 异步逻辑放在守卫函数体内,这里可以 await
        if (to.meta.requiresAuth) {
          const user = await fetchCurrentUser();
          if (!user) return '/login';
        }
      });

      router.afterEach((to) => {
        // 埋点、设置文档标题等
        if (typeof document !== 'undefined' && to.meta?.title) {
          document.title = String(to.meta.title);
        }
      });
    }
  }
});
```

**Difference from in-component `useRouter().beforeEach`**: Guards registered via `defineApp({ router })` are **global** — registered once at app startup and applied to all routes — whereas `useRouter().beforeEach` is typically called inside a component's setup and may be registered repeatedly if the component is mounted multiple times. **In production, prefer registering global guards via `defineApp({ router })`.**

**Difference from backend middleware**: Frontend route guards only fire on client-side navigation (and during SSR rendering of the current URL) and don't go over the network. Backend `src/middleware/` consists of Hono middleware that fires on every HTTP request. Auth logic that needs to inspect cookies/headers is usually handled in backend middleware, with the result injected into the context; frontend guards then make route-level decisions based on the injected state (e.g. redirect when not logged in).

## 4.8 Type-Safe Request Client

ubean provides a layered request client: the low-level `createClient` is an untyped ofetch wrapper; `createTypedClient` / `createTypedFlatClient` / `createTypedInternalFetch` layer OpenAPI `paths` types on top, making paths, parameters, request bodies, and return values fully type-safe.

### Automatic Type Generation

When the dev server starts, it automatically fetches the schema from `/_openapi.json` and uses `openapi-typescript` to generate `.ubean/openapi.d.ts`:

- OpenAPI Operation definitions are collected by the `describeRoute` middleware from `hono-openapi`
- Request parameter types are derived from the Standard Schema used by `validator(target, schema)`
- Response types are derived from `responses` in `describeRoute` via `resolver(schema)`
- In dev mode, HMR updates the types automatically

```typescript
// .ubean/openapi.d.ts (自动生成)
export interface paths {
  '/api/users/{id}': {
    get: {
      parameters: { path: { id: string } };
      responses: { 200: { content: { 'application/json': User } } };
    };
  };
}
```

### Recommended Usage: Create a Typed Client in `src/request/`

`ubean init` generates two template files in the project's `src/request/` directory, binding the project's `paths` type to the typed functions so you don't need to pass the generic repeatedly:

```typescript
// src/request/client.ts — 浏览器端
import { createClient, createTypedClient } from 'ubean';
import type { paths } from '../../.ubean/openapi';

/**
 * 浏览器端类型化 HTTP 客户端(抛异常模式)
 * 路径、参数、请求体和返回值类型均从 OpenAPI schema 自动推断。
 */
export const api = createTypedClient<paths>(
  createClient({
    // baseURL: '/api',
    // timeout: 10000,
  })
);
```

```typescript
// src/request/internal.ts — server 端内部 fetch
import { createTypedInternalFetch } from 'ubean';
import type { paths } from '../../.ubean/openapi';

/**
 * server 端类型化内部 fetch
 * 在 API 路由或 useData 的 fetcher 中使用,自动转发 cookie/authorization 等请求头。
 * 与 client.ts 的 api 接口一致,但通过 server 端 fetch 发起请求(自动转发请求头)。
 * baseURL 会自动从当前请求的 URL 中推断,无需手动设置。
 */
export function createServerApi(context: Parameters<typeof createTypedInternalFetch>[0]) {
  // createTypedInternalFetch 会自动从 context.req.url 推断 baseURL
  return createTypedInternalFetch<paths>(context);
}
```

Use it in components or API routes:

```typescript
// 浏览器端
import { api } from '../request/client';
const user = await api.get('/api/users/{id}', {
  params: { path: { id: '123' }, query: { include: 'posts' } }
});
// user 的类型自动从 OpenAPI schema 推导

// server 端
import { defineHandler } from 'ubean';
import { createServerApi } from '../request/internal';
export const GET = defineHandler(async (c) => {
  const api = createServerApi(c);
  const user = await api.get('/api/users/{id}', { params: { path: { id: '1' } } });
  return c.json(user);
});
```

### API Quick Reference

| API | Description | Return Value |
| --- | --- | --- |
| `createClient(options)` | Low-level HTTP client (ofetch wrapper), untyped | `ApiClient` |
| `createTypedClient<paths>(client, prefix?)` | Typed client, throws on failure | `TypedClient<paths>` |
| `createTypedFlatClient<paths>(client, prefix?)` | Typed flat client, returns `{ data, error, status }` without throwing | `TypedFlatClient<paths>` |
| `createTypedInternalFetch<paths>(c, options?)` | Server-side typed internal fetch, auto-forwards request headers | `TypedClient<paths>` |
| `callTypedInternal<paths>()` | Global typed in-process dispatcher (no network request) | `TypedInternalCaller<paths>` |
| `createTypedRequestSender<paths>(c)` | Context-aware typed request sender | `TypedRequestSender<paths>` |
| `parseContentDisposition(header?)` | Parse filename from Content-Disposition header | `string` |

### Parameter Structure

The parameter structure matches `@soybeanjs/request`; `params` contains `path`/`query`/`header`:

```typescript
api.post('/api/users', {
  params: {
    path: { id: 1 },              // 替换 URL 中的 {id}
    query: { page: 1 },            // query string
    header: { Authorization: '' }  // 请求头
  },
  body: { name: 'test' }           // 请求体(POST/PUT/PATCH)
});
```

### Response Types & File Downloads

Configure different return types via `responseType`, mirroring the `createRequest` design from `@soybeanjs/request`:

```typescript
type ResponseType = 'json' | 'blob' | 'arraybuffer' | 'text' | 'stream';
```

| `responseType` | Return Value | Description |
| --- | --- | --- |
| `'json'` (default) | `JsonType` | Parses JSON response; type inferred from OpenAPI schema |
| `'blob'` | `FileResponseData<Blob>` | File download; auto-parses filename |
| `'arraybuffer'` | `FileResponseData<ArrayBuffer>` | Binary download |
| `'stream'` | `FileResponseData<Uint8Array>` | Streamed read as Uint8Array |
| `'text'` | `string` | Plain-text response |

`FileResponseData` structure:

```typescript
interface FileResponseData<T = Blob | ArrayBuffer | Uint8Array> {
  file: T;            // 文件内容
  filename: string;   // 从 Content-Disposition 头解析的文件名
  contentType: string; // 响应头中的内容类型
}
```

Usage examples:

```typescript
// 文件下载(自动从 Content-Disposition 解析文件名)
const file = await api.get('/api/export', { responseType: 'blob' });
// file: { file: Blob; filename: 'report.pdf'; contentType: 'application/pdf' }
console.log(file.filename);

// 自定义文件名提取
const file2 = await api.get('/api/export', {
  responseType: 'blob',
  getFileName: (response) => response.headers.get('x-filename') || 'unknown.bin'
});

// 文本响应
const text = await api.get('/api/readme', { responseType: 'text' });
// text: string

// 流式响应
const stream = await api.get('/api/stream', { responseType: 'stream' });
// stream: { file: Uint8Array; filename: string; contentType: string }

// 二进制响应
const buf = await api.get('/api/binary', { responseType: 'arraybuffer' });
// buf: { file: ArrayBuffer; filename: string; contentType: string }
```

For file downloads, the filename is parsed by default from the `Content-Disposition` header via the built-in `parseContentDisposition` (supporting both RFC 5987 encoded format `filename*=UTF-8''xxx` and the regular format `filename="xxx"`). You can customize it via the `getFileName` callback.

### Flat Mode

```typescript
import { createTypedFlatClient } from 'ubean';
import type { paths } from '../.ubean/openapi';

const flat = createTypedFlatClient<paths>(client);
const { data, error, status } = await flat.get('/api/users/{id}', {
  params: { path: { id: '123' } }
});
if (error) {
  console.error('请求失败:', error.message);
} else {
  console.log('用户:', data);
}

// 扁平模式同样支持 responseType
const { data: file, error: fileError } = await flat.get('/api/export', { responseType: 'blob' });
if (!fileError) {
  console.log('文件名:', file.filename);
}
```

### Low-Level Client

When not using OpenAPI types, `createClient` still works as a general-purpose HTTP client:

```typescript
import { createClient } from 'ubean';
const client = createClient({ baseURL: '/api', timeout: 10000 });
const data = await client.get<{ id: string; name: string }>('/users/123');
```

## 4.9 Cron Jobs System

Modeled after nitro's `scheduledTasks` and void's `defineScheduled`:

- Define cron jobs under the `crons/` directory
- Use `export const cron = "<cron expression>"` to declare the schedule expression
- Use `defineScheduled()` to define the task handler
- Auto-configured on platforms that support cron triggers (Cloudflare Workers Cron Triggers, Vercel Cron)
- Other platforms use the built-in cron scheduler or external triggers (`/_cron/<name>` endpoint)

```typescript
// crons/daily-cleanup.ts
import { defineScheduled } from 'ubean';
import { db } from 'ubean/database';

export const cron = '0 0 * * *'; // 每天凌晨执行

export default defineScheduled(async ({ lastExecutionTime, scheduledTime }) => {
  // 清理过期数据
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  console.log(`[Cron] Cleaned up expired sessions at ${scheduledTime}`);
});
```

#### Cron Configuration

```typescript
// ubean.config.ts
export default defineConfig({
  cron: {
    // 任务运行时的超时时间
    timeout: 30_000,
    // 是否在开发模式下启用 cron
    enabled: process.env.NODE_ENV === 'production'
  },
  // 也可以通过 scheduledTasks 配置映射 cron 到任务名（nitro 风格）
  scheduledTasks: {
    '*/5 * * * *': ['tasks/heartbeat']
  }
});
```

## 4.10 Environment Variables System

```typescript
// env.ts
import { defineEnv, string, number, boolean, url } from 'ubean';

export const env = defineEnv({
  // 服务端密钥
  DATABASE_URL: string().secret(),
  API_SECRET: string().secret().optional(),

  // 公共变量 (VITE_ 前缀自动暴露到客户端)
  VITE_APP_NAME: string().default('My App'),
  VITE_API_URL: url(),

  // 类型转换
  PORT: number().default(9527),
  DEBUG: boolean().default(false),

  // 可选 + 默认值
  NODE_ENV: string().oneOf(['development', 'production', 'test']).default('development')
});
```

## 4.11 Preset System Design

```typescript
// src/preset/_utils/preset.ts
import type { UbeanPreset, UbeanPresetMeta } from 'ubean/types';

export function definePreset<P extends UbeanPreset, M extends UbeanPresetMeta>(
  preset: P,
  meta?: M
): P & { _meta: UbeanPresetMeta } {
  if (typeof preset !== 'function' && preset.entry && preset.entry.startsWith('.')) {
    preset.entry = resolve(presetsDir, preset.entry);
  }
  return { ...preset, _meta: meta } as P & { _meta: M };
}
```

```typescript
// src/preset/node/preset.ts
import { definePreset } from '../_utils/preset';
import { nodeCluster } from './cluster';

const nodeServer = definePreset(
  {
    entry: './node/runtime/node-server',
    serveStatic: true,
    commands: {
      preview: 'node ./server/index.mjs'
    }
  },
  {
    name: 'node-server' as const,
    aliases: ['node'],
    stdName: 'node'
  }
);

export default [nodeServer, nodeCluster] as const;
```

Preset auto-resolution logic:

1. The `preset` option explicitly specified in the user config
2. The `UBEAN_SERVER_PRESET` environment variable
3. Auto-detection (via std-env provider detection):
   - `process.versions.bun` → bun
   - `Deno` global variable → deno
   - Vercel environment variables → vercel
   - Netlify environment variables → netlify
   - Cloudflare Pages environment variables → cloudflare-pages
   - etc.
4. Falls back to `defaultPreset` (typically node-server)

## 4.12 DevTools Panel

Modeled after Nuxt DevTools' iframe + RPC architecture, ubean ships a built-in visual DevTools panel that provides UI-driven management of config, environment variables, page routes, and API endpoints. It also exposes hooks to support persisting data to a database, and integrates an AI LLM to assist development operations.

#### Design Philosophy

- **In-app panel**: A floating button within the app opens DevTools (`Shift+Alt+D` shortcut); UI is isolated from the app via an iframe
- **Dev-only**: Production builds tree-shake away all DevTools code, with zero runtime overhead
- **Bidirectional RPC**: The DevTools iframe and host app communicate via `postMessage` + a type-safe RPC channel
- **Extensible tab system**: Built-in core tabs plus support for custom tab plugins
- **Hooks system**: Hooks fire before/after all CRUD operations; users can listen to sync data to databases/external systems
- **AI-driven**: Integrates an LLM so natural language can drive create/update/delete of routes/endpoints/config

#### DevTools Panel Architecture

```
┌──────────────────────────────────────────────────┐
│               ubean App (Host)                    │
│  ┌────────────────────────────────────────────┐  │
│  │  DevTools Floating Button (small Vue widget)│  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  DevTools Iframe (独立 Vue 应用)            │  │
│  │  ┌────────┬────────┬────────┬────────────┐ │  │
│  │  │Overview│ Pages  │ Routes │ Config ... │ │  │
│  │  ├────────┴────────┴────────┴────────────┤ │  │
│  │  │           Tab Content                  │ │  │
│  │  │  ┌──────────────┐  ┌────────────────┐  │ │  │
│  │  │  │  CRUD UI     │  │  AI Chat Panel │  │ │  │
│  │  │  └──────────────┘  └────────────────┘  │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────┘  │
│         ▲                    ▲                    │
│         │ RPC (postMessage)  │ Hook Events        │
│         ▼                    ▼                    │
│  ┌────────────────────────────────────────────┐  │
│  │  ubean DevTools Server (Vite plugin)       │  │
│  │  - File system operations (read/write)     │  │
│  │  - Route/API meta extraction               │  │
│  │  - Code generation (d.ts updates)          │  │
│  │  - Hook dispatch (before/after CRUD)       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

#### Built-in Tabs

| Tab | Function | Capabilities |
| --- | --- | --- |
| **Overview** | Project overview: ubean version, Vue version, route/API counts, plugin list, build status, startup time | Read-only |
| **Pages** | Visual page-route management: list/tree view of all page routes, layouts, meta, reuse relationships | CRUD + preview navigation |
| **API Routes** | API route management: list of all GET/POST/... endpoints, OpenAPI docs, built-in API testing playground | CRUD + in-browser testing |
| **Config** | Project config editing: visually modify `ubean.config.ts`, live preview | Edit |
| **Env** | Environment variable management: `.env` file editing, schema validation, server/client variable separation display | CRUD + validation |
| **Layouts** | Layout component preview: component tree, slot structure, usage stats for all layouts | Read-only + create |
| **Middlewares** | Middleware chain visualization: execution order, meta matching, timing | Read-only + create |
| **Plugins** | Plugin list: load order, hook registration, execution time | Read-only |
| **Cron Jobs** | Cron job management: visual cron expression editing, manual trigger, execution history | CRUD + trigger |
| **Storage/KV** | Storage browser: browse, edit, clear unstorage data | CRUD |
| **Database** | Database panel: browse Drizzle table structure, simple SQL queries (optional) | Read-only + query |
| **Hooks** | Hook monitoring: all hookable event listeners, timing, call-chain tracing | Read-only |
| **Virtual Files** | Virtual file viewer: `.ubean/routes.d.ts`, `.ubean/pages.d.ts`, virtual module sources | Read-only |
| **Terminal** | Terminal panel: embedded terminal to run `ubean page add`, `ubean api add`, etc. | Interactive |
| **AI Assistant** | AI chat panel: natural-language-driven CRUD operations | Conversational |

#### Config Management (Config Tab)

```typescript
// DevTools 中可视化编辑 ubean.config.ts
// 通过 AST 操作（ts-morph）安全修改配置文件，支持：
// - preset 切换
// - 路由/页面目录配置
// - 构建选项
// - 环境变量 schema
// - DevTools 自身配置
```

Config editing calls server-side interfaces via RPC:

```typescript
// DevTools Server RPC handlers
interface DevToolsRPC {
  // Config
  'config:get': () => Promise<ResolvedConfig>;
  'config:update': (patch: Partial<UbeanConfig>) => Promise<{ success: boolean; diff: string }>;

  // Env
  'env:list': () => Promise<EnvVarInfo[]>;
  'env:create': (key: string, value: string, options: EnvVarOptions) => Promise<void>;
  'env:update': (key: string, value: string) => Promise<void>;
  'env:delete': (key: string) => Promise<void>;
  'env:validate': () => Promise<EnvValidationResult>;
}
```

#### Page Route CRUD (Pages Tab)

Full create/read/update/delete for page routes, reusing the CLI Shared Layer's `page add/delete/update` logic under the hood (shared with the `ubean page *` commands):

```typescript
interface DevToolsRPC {
  // Pages CRUD
  'pages:list': () => Promise<PageRouteInfo[]>;
  'pages:get': (name: string) => Promise<PageRouteDetail>;
  'pages:create': (input: CreatePageInput) => Promise<CreatePageResult>;
  'pages:update': (name: string, patch: UpdatePageInput) => Promise<void>;
  'pages:delete': (name: string, options?: { backup?: boolean }) => Promise<void>;

  // Reuse routes
  'pages:createReuse': (input: CreateReuseInput) => Promise<void>;

  // Layouts
  'layouts:list': () => Promise<LayoutInfo[]>;
  'layouts:create': (name: string) => Promise<void>;
}

interface PageRouteInfo {
  name: string;
  path: string;
  filePath: string;
  layout: string | false;
  meta: PageMeta;
  hasLoader: boolean;
  hasAction: boolean;
  isReuse: boolean;
  reuseTarget?: string;
  children?: PageRouteInfo[];
}

interface CreatePageInput {
  path: string; // 如 '/users/[id]'
  layout?: string; // 布局名
  withLoader?: boolean; // 是否创建 .server.ts
  withServerFile?: boolean;
  template?: 'vue' | 'tsx';
}
```

When a page is created, a template file is auto-generated:

```vue
<!-- DevTools 创建 pages/users/[id].vue 时生成 -->
<script setup lang="ts">
import { definePage } from 'ubean';

definePage({
  layout: 'default',
  meta: {
    title: 'User Detail'
  }
});
</script>

<template>
  <div>User Detail</div>
</template>
```

#### API Route CRUD (API Routes Tab)

```typescript
interface DevToolsRPC {
  // API Routes CRUD
  'api:list': () => Promise<ApiRouteInfo[]>;
  'api:get': (method: string, path: string) => Promise<ApiRouteDetail>;
  'api:create': (input: CreateApiInput) => Promise<void>;
  'api:update': (method: string, path: string, patch: UpdateApiInput) => Promise<void>;
  'api:delete': (method: string, path: string) => Promise<void>;

  // API Testing
  'api:test': (input: ApiTestInput) => Promise<ApiTestResult>;

  // OpenAPI
  'openapi:generate': () => Promise<string>; // 返回 OpenAPI JSON
}

interface ApiRouteInfo {
  methods: string[]; // ['GET', 'PATCH', 'DELETE']
  path: string; // '/users/:id'
  filePath: string;
  meta?: RouteMeta;
  openapi?: OperationObject;
}

interface CreateApiInput {
  path: string; // '/users'
  methods: string[]; // ['GET', 'POST']
  withOpenAPI?: boolean; // 是否生成 describeRoute + resolver OpenAPI 文档骨架
  withValidator?: boolean; // 是否生成 validator 中间件骨架
}
```

When an API is created, a handler file is auto-generated:

```typescript
// DevTools 创建 routes/users.ts 时生成
import { defineHandler, defineHandlerMeta, validator, describeRoute, resolver } from 'ubean';
import { z } from 'zod';

export const GET = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'List users',
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: resolver(z.array(z.object({ id: z.string(), name: z.string() }))) } }
      }
    }
  }),
  async c => {
    return c.json({ users: [] });
  }
);

const createUserSchema = z.object({ name: z.string(), email: z.string().email() });

export const POST = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Create user',
    responses: {
      201: {
        description: 'Created',
        content: { 'application/json': { schema: resolver(z.object({ id: z.string() }).merge(createUserSchema)) } }
      }
    }
  }),
  validator('json', createUserSchema),
  async c => {
    const body = c.req.valid('json');
    return c.json({ id: '1', ...body }, 201);
  }
);
```

API Testing Playground: Fill in parameters, send requests, and view responses directly in DevTools (auto-attaching cookie/auth headers) — like Postman but zero-config.

#### Hooks System

All DevTools operations trigger hookable events before and after. Users can register hooks to sync data to a database, trigger CI/CD, or perform permission checks:

```typescript
// app.ts
import { defineApp } from 'ubean';
import { useDevToolsHooks } from 'ubean/devtools';

export default defineApp({
  onAppCreated(app) {
    const hooks = useDevToolsHooks();

    // 页面路由创建前：可做权限校验、数据预存到 DB
    hooks.hook('page:beforeCreate', async (input, context) => {
      // 例如：记录到数据库
      await db.pages.create({
        data: { name: input.name, path: input.path, createdBy: context.user.id }
      });
    });

    // 页面路由创建后：可触发 Git 提交、通知等
    hooks.hook('page:afterCreate', async (result, context) => {
      console.log(`Page ${result.name} created by ${context.user?.name}`);
    });

    // API 接口创建前
    hooks.hook('api:beforeCreate', async input => {
      // 校验接口路径规范
      if (!input.path.startsWith('/api/')) {
        throw new Error('API path must start with /api/');
      }
    });

    // 环境变量更新前
    hooks.hook('env:beforeUpdate', async (key, value) => {
      // 例如：同步到外部密钥管理服务
      await secretsManager.set(key, value);
    });
  }
});
```

**Complete hook list**:

| Hook name | Parameters | Description |
| --- | --- | --- |
| `page:beforeCreate` | `(input, ctx)` | Before page creation; can throw to abort |
| `page:afterCreate` | `(result, ctx)` | After page creation |
| `page:beforeUpdate` | `(name, patch, ctx)` | Before page update |
| `page:afterUpdate` | `(name, ctx)` | After page update |
| `page:beforeDelete` | `(name, ctx)` | Before page deletion |
| `page:afterDelete` | `(name, ctx)` | After page deletion |
| `api:beforeCreate` | `(input, ctx)` | Before API creation |
| `api:afterCreate` | `(result, ctx)` | After API creation |
| `api:beforeUpdate` | `(method, path, patch, ctx)` | Before API update |
| `api:afterUpdate` | `(method, path, ctx)` | After API update |
| `api:beforeDelete` | `(method, path, ctx)` | Before API deletion |
| `api:afterDelete` | `(method, path, ctx)` | After API deletion |
| `config:beforeUpdate` | `(patch, ctx)` | Before config update |
| `config:afterUpdate` | `(config, ctx)` | After config update |
| `env:beforeCreate` | `(key, value, opts, ctx)` | Before env var creation |
| `env:afterCreate` | `(key, ctx)` | After env var creation |
| `env:beforeUpdate` | `(key, value, ctx)` | Before env var update |
| `env:afterUpdate` | `(key, ctx)` | After env var update |
| `env:beforeDelete` | `(key, ctx)` | Before env var deletion |
| `env:afterDelete` | `(key, ctx)` | After env var deletion |
| `cron:beforeCreate` / `cron:afterCreate` | ... | Cron job CRUD |
| `devtools:ready` | `(ctx)` | DevTools panel loaded |
| `ai:beforeToolCall` | `(toolName, args, ctx)` | Before AI tool call; for permission/audit |
| `ai:afterToolCall` | `(toolName, result, ctx)` | After AI tool call |

> The **Ctx object** includes the current user info (if DevTools auth is configured), request origin, timestamp, etc.

#### AI Assistant (AI Assistant Tab)

Integrates an LLM that drives DevTools operations through natural-language conversation. The AI does not write files directly; instead it calls DevTools RPC methods (i.e. the CRUD interfaces), ensuring all operations pass through hook validation:

```typescript
// AI 可用的 Tool 定义（基于 RPC 方法自动生成）
const devtoolsTools = [
  {
    name: 'create_page',
    description: '创建一个新的页面路由',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '路由路径，如 /users/[id]' },
        layout: { type: 'string', description: '布局名', enum: ['default', 'blank', 'admin'] },
        withLoader: { type: 'boolean', description: '是否创建 server loader' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_api_route',
    description: '创建 API 接口',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        methods: { type: 'array', items: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] } },
        withOpenAPI: { type: 'boolean' }
      },
      required: ['path', 'methods']
    }
  },
  {
    name: 'list_pages',
    description: '列出所有页面路由'
  },
  {
    name: 'list_api_routes',
    description: '列出所有 API 接口'
  },
  {
    name: 'update_env',
    description: '更新环境变量',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' }
      },
      required: ['key', 'value']
    }
  }
  // ... 所有 RPC 方法映射为 AI Tools
];
```

**Example AI conversation**:

> **User**: Help me create a product management module — I need a product list page, a product detail page, and the corresponding CRUD endpoints.
>
> **AI**: Sure, I'll create the following:
>
> 1. Pages: `/products` (list) and `/products/[id]` (detail)
> 2. APIs: `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id`
> 3. All using the default layout
>
> Confirm execution?
>
> **User**: Confirm
>
> **AI**: ✅ Created:
>
> - `pages/products/index.vue` (Products)
> - `pages/products/[id].vue` (ProductId)
> - `routes/products.ts` (GET/POST)
> - `routes/products/[id].ts` (GET/PATCH/DELETE)
>
> Want me to add OpenAPI docs to these endpoints?

**AI integration configuration**:

```typescript
// ubean.config.ts
export default defineConfig({
  devtools: {
    enabled: true, // dev 默认 true，prod 强制 false
    ai: {
      enabled: true,
      // 支持多种 LLM provider
      provider: 'openai', // 'openai' | 'anthropic' | 'custom'
      apiKey: process.env.OPENAI_API_KEY, // 也可在 DevTools UI 中填写
      model: 'gpt-4o'
      // 自定义 provider
      // provider: 'custom',
      // endpoint: 'https://your-llm-proxy.com/v1/chat/completions',
    }
  }
});
```

#### RPC Communication Layer

Implements a type-safe RPC over `postMessage`. DevTools is only enabled in dev mode and on loopback hosts; the RPC handshake generates a one-time session token and binds the iframe window, allowed origin, and token together. Production builds must not include DevTools RPC handlers or AI provider configuration.

```typescript
// src/devtools/rpc.ts
// Host 侧（应用内）
export function createDevToolsServer({ iframeWindow, devtoolsOrigin, sessionToken }) {
  const handlers = createRpcHandlers();

  window.addEventListener('message', async event => {
    const { id, method, params, token } = event.data ?? {};
    if (
      event.origin !== devtoolsOrigin ||
      event.source !== iframeWindow ||
      token !== sessionToken ||
      !isAllowedDevToolsMethod(method)
    ) {
      return;
    }
    try {
      await hooks.callHook(`${methodToHook(method)}:before`, ...params);
      const result = await handlers[method](...params);
      await hooks.callHook(`${methodToHook(method)}:after`, result);
      iframeWindow.postMessage({ __ubean_devtools__: true, id, result }, devtoolsOrigin);
    } catch (error) {
      iframeWindow.postMessage({ __ubean_devtools__: true, id, error: toPublicError(error) }, devtoolsOrigin);
    }
  });
}

// Client 侧（DevTools iframe 内）
export function createDevToolsClient({ parentOrigin, sessionToken }) {
  let nextId = 0;
  const pending = new Map();

  window.addEventListener('message', event => {
    if (
      event.origin === parentOrigin &&
      event.source === window.parent &&
      event.data?.__ubean_devtools__ &&
      pending.has(event.data.id)
    ) {
      const { resolve, reject } = pending.get(event.data.id);
      pending.delete(event.data.id);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    }
  });

  return new Proxy(
    {},
    {
      get(_, method: string) {
        return (...params: unknown[]) =>
          new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            window.parent.postMessage(
              { __ubean_devtools__: true, id, method, params, token: sessionToken },
              parentOrigin
            );
          });
      }
    }
  ) as DevToolsRPC;
}
```

#### File Operation Safety

All DevTools file-write operations follow these safety policies:

1. **AST-first**: When modifying `.ts`/`.vue` files, use ts-morph for AST operations instead of string replacement to guarantee correct code formatting.
2. **Pre-operation backup**: All delete/overwrite operations are automatically backed up to the `.ubean/backup/` directory.
3. **Transactional writes**: Write to a temp file first, then rename on success, avoiding corruption from interrupted writes.
4. **Path constraints**: Only files within the project root and on the allowlist may be read/written; symlinks escapes, absolute paths, and sensitive files are rejected.
5. **Least privilege**: AI tools are read-only by default; before every write, delete, or command execution, a diff is shown and explicit user confirmation is required.
6. **Operation confirmation**: Deletions and bulk modifications require a second confirmation in the UI layer.
7. **Git detection**: When a Git repo is detected, users are advised to commit first; the framework does not auto-create commits.

#### DevTools Configuration

```typescript
// ubean.config.ts
export default defineConfig({
  devtools: {
    /**
     * 是否启用 DevTools
     * @default true in dev, false in prod
     */
    enabled?: boolean;

    /**
     * DevTools 面板访问路径
     * @default '/_devtools'
     */
    route?: string;

    /**
     * 自定义 Tab 插件
     */
    tabs?: DevToolsTab[];

    /**
     * AI 助手配置
     */
    ai?: {
      enabled?: boolean;
      provider?: 'openai' | 'anthropic' | 'custom';
      apiKey?: string;
      model?: string;
      endpoint?: string;
      /** AI 可使用的工具白名单，默认全部 */
      allowedTools?: string[];
    };
  },
});
```

#### UI Tech Stack

The DevTools client (the Vue app inside the iframe) is built with **`@soybeanjs/ui`** **+** **`@soybeanjs/headless`**:

- **`@soybeanjs/ui`**: Provides Button/Input/Select/Modal/Tree/Table/Tabs/Form/CodeEditor and other components for a unified design language
- **`@soybeanjs/headless`**: Provides unstyled functional primitives (composables, state management)
- **CodeMirror 6**: Code editor (API Playground editing, virtual file viewing); also used for code-snippet highlighting in read-only mode
- **fuse.js**: Fuzzy search for routes/endpoints/components
- The DevTools client is pre-built as a single file (inlined CSS/JS) as an independent Vue app and injected via Vite virtual modules, requiring no extra dependency installation

#### Extensible Custom Tabs

Users/plugins can register custom DevTools tabs:

```typescript
// plugins/my-devtools-tab.ts
import { defineDevToolsTab } from 'ubean';

export default defineDevToolsTab({
  name: 'my-feature',
  title: 'My Feature',
  icon: '🔧',
  // Tab 的 Vue 组件
  component: () => import('./devtools/MyFeatureTab.vue'),
  // 自定义 RPC 方法
  rpc: {
    'my-feature:get-data': async () => { return db.query(...); },
    'my-feature:update-data': async (data) => { ... },
  },
});
```

## 4.13 CLI Command System

Built on `citty` for type-safe CLI tooling. **Every DevTools visual operation has a corresponding CLI command**, achieving feature parity between GUI and CLI. The DevTools server RPC and CLI share the underlying CRUD logic (`cli/shared/fs-ops.ts`), ensuring consistent results on both sides.

#### Command Overview

```bash
ubean              # 显示帮助
ubean dev          # 启动开发服务器
ubean build        # 构建生产版本
ubean prepare      # 准备类型生成 (dev 前自动执行)
ubean preview      # 预览生产构建

# ─── 页面路由 ───
ubean page add           # 交互式添加页面 (路径/布局/loader)
ubean page add-reuse     # 交互式添加 reuse 路由
ubean page delete <name> # 删除页面 (自动备份)
ubean page update <name> # 更新页面 (重命名/改布局/改路径)
ubean page list          # 列出所有页面路由
ubean page recovery      # 从备份恢复已删除的页面

# ─── API 接口 ───
ubean api add            # 交互式添加 API 接口 (路径/方法/OpenAPI)
ubean api delete <method> <path>  # 删除接口
ubean api update <method> <path>  # 更新接口
ubean api list           # 列出所有 API 接口
ubean api test <method> <path>    # 命令行接口测试 (发送请求查看响应)

# ─── 布局 ───
ubean layout add <name>  # 创建新布局
ubean layout delete <name>  # 删除布局
ubean layout list        # 列出所有布局

# ─── 环境变量 ───
ubean env add <key> [value] [--server|--public]
ubean env delete <key>
ubean env update <key> <value>
ubean env list           # 列出所有环境变量
ubean env validate       # 校验环境变量 schema

# ─── 配置 ───
ubean config get [key]   # 获取配置值
ubean config set <key> <value>  # 更新配置

# ─── 中间件 ───
ubean middleware add <name> [--order N]  # 创建中间件
ubean middleware list    # 列出所有中间件及执行顺序

# ─── 插件 ───
ubean plugin add <name>  # 创建插件
ubean plugin list        # 列出所有插件

# ─── 定时任务 ───
ubean cron add           # 交互式创建定时任务
ubean cron delete <name> # 删除定时任务
ubean cron update <name> # 更新定时任务
ubean cron list          # 列出所有定时任务
ubean cron run <name>    # 手动触发定时任务

# ─── DevTools ───
ubean devtools           # 在浏览器中打开 DevTools (自动启动 dev server)
ubean devtools enable    # 启用 DevTools
ubean devtools disable   # 禁用 DevTools
ubean devtools ai-setup  # 交互式配置 AI provider / API Key
```

#### CLI & DevTools Shared Core Logic

```
┌─────────────┐     ┌──────────────┐
│  DevTools   │     │  CLI 命令行  │
│  (Vue UI)   │     │  (citty)     │
└──────┬──────┘     └──────┬───────┘
       │  RPC call        │  direct call
       ▼                  ▼
┌─────────────────────────────────┐
│  CLI Shared Layer               │
│  (cli/shared/fs-ops.ts)         │
│  - AST 文件操作 (ts-morph)      │
│  - 模板生成                     │
│  - 备份/恢复                    │
│  - hooks 触发                   │
└─────────────────────────────────┘
```

- The DevTools panel calls into the Vite plugin via RPC, and the Vite plugin calls the CLI Shared Layer to perform operations
- CLI commands call the CLI Shared Layer directly to perform operations
- Both sides trigger the same set of hooks (e.g. `page:beforeCreate`), ensuring hook consistency
- The CLI `--json` flag supports machine-readable output for CI/CD integration

#### CLI Example: Creating a Page

```bash
$ ubean page add
? 路由路径: /products/[id]
? 选择布局: default
? 是否创建 server loader? Yes
? 是否创建 server action? No
? 模板类型: Vue SFC

✅ 已创建:
  - pages/products/[id].vue       (page: ProductId)
  - pages/products/[id].server.ts (loader)
```

#### CLI Example: Creating an API Endpoint

```bash
$ ubean api add
? API 路径: /api/products
? HTTP 方法 (空格多选): GET, POST, DELETE
? 生成 OpenAPI 文档骨架? Yes

✅ 已创建:
  - routes/api/products.ts (GET, POST)
  - routes/api/products/[id].ts (DELETE)? 哦，路径含 [id] 了，是否拆分到子文件? Yes

✅ 已创建:
  - routes/api/products.ts     (GET, POST)
  - routes/api/products/[id].ts (GET, PATCH, DELETE)
```

## 4.14 npm scripts

Scripts available in the user project's `package.json` (auto-generated by `ubean init`):

```json
{
  "scripts": {
    "dev": "ubean dev",
    "build": "ubean build",
    "preview": "ubean preview",
    "prepare": "ubean prepare",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

## 4.15 Error Handling

#### Error Types

```typescript
// src/runtime/error.ts
class UbeanError extends Error {
  statusCode: number;
  statusMessage: string;
  data?: unknown;
}

// 预定义错误
throw createError({ statusCode: 404, statusMessage: 'Not Found' });
throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { field: 'email' } });
```

#### Error Pages

ubean automatically detects three special page types under the `pages/` root directory; they take effect without manual configuration:

| File | Role | Effect |
| --- | --- | --- |
| `pages/404.vue` | Not-found page | Vue Router catch-all `/:pathMatch(.*)*` + Hono `GET *` fallback handler; unmatched browser navigations return HTTP 404 and render this component |
| `pages/loading.vue` | Loading placeholder | `<Suspense>` fallback component, shown during SPA navigation while lazy-loaded page components load |
| `pages/error.vue` | Render-error fallback | ErrorBoundary component shown when a page component's render/async resolution/setup throws; receives the `error` prop; auto-resets on route change |

- Only root-level files are treated as special pages; `users/404.vue` is still a regular route `/users/404`
- `loading.vue` and `error.vue` only take effect on the client (SSR resolves synchronously, so no fallback is needed; errors during SSR are handled by the server-side error handler)
- All three can be explicitly overridden via `defineApp({ loadingComponent / errorComponent })`, which takes precedence over file auto-detection

#### Dev-Mode Error Display

- Compile errors: Vite error overlay (default)
- Runtime errors: DevTools error panel + structured console output
- HMR errors: doesn't refresh the page; shows the error while preserving current state

## 4.16 Markdown/MDX Pages (Built-in)

Modeled after void's `.md` page support, ubean natively supports Markdown as page routes.

#### File Conventions

- `pages/**/*.md` — Markdown page files, placed alongside `.vue` pages
- `pages/**/*.mdx` — MDX pages (support Vue component embedding; optional)
- Markdown files are automatically flagged as islands when scanned (client JS is needed to hydrate Vue components)

#### Frontmatter Support

```markdown
---
title: About Us
description: Company introduction
layout: default
meta:
  requiresAuth: false
  order: 2
---

# About Us

Welcome to our company...

<Counter v-client.visible />
```

- YAML frontmatter is parsed by `front-matter`, extracting `title`/`description`/`layout`/`meta`
- `layout: false` disables the layout
- Markdown body is rendered via [`markdown-exit`](https://github.com/serkodev/markdown-exit) (a TypeScript rewrite of markdown-it with native async support); Shiki provides code syntax highlighting via the `@shikijs/markdown-exit` plugin, with no extra async patch needed
- Supports embedding Vue components, with hydration strategy controlled by client directives

#### Real MDX Compilation (P9-20)

When `markdown.mdx: true`, ubean compiles `.mdx` files into Vue components via `@mdx-js/mdx` (rather than a simple Markdown render). `@mdx-js/mdx` is an optional peer dependency that must be installed manually:

```bash
pnpm add @mdx-js/mdx
```

The compiled output is rendered via `@ubean/markdown/jsx-runtime` (a Vue-compatible JSX runtime built on Vue's `h()` function), so you can use JSX syntax and imported Vue components directly inside `.mdx` files:

```mdx
---
title: My Post
---

import Counter from '~/components/Counter.vue'

# Hello MDX

This is **MDX** with real compilation.

<Counter v-client.visible />
```

If `@mdx-js/mdx` is not installed, ubean automatically falls back to plain Markdown rendering (wrapping the HTML in a Vue component output via `v-html`), functionally equivalent to a regular `.md` file.

You can pass additional remark/rehype plugins via `markdown.remarkPlugins` and `markdown.rehypePlugins`:

```typescript
// ubean.config.ts
export default defineConfig({
  markdown: {
    mdx: true,
    remarkPlugins: [remarkGfm],        // e.g. GitHub Flavored Markdown
    rehypePlugins: [rehypeSlug]        // e.g. slugify headings
  }
});
```

#### Configuration Options

```typescript
// ubean.config.ts
export default defineConfig({
  markdown: {
    enabled: true, // 默认 true，设为 false 禁用
    mdx: false, // 是否启用 MDX 真实编译（需安装 @mdx-js/mdx）
    theme: 'vitesse-dark', // Shiki 代码高亮主题（支持双主题: { light, dark }）
    markdownExit: {
      // markdown-exit 配置（原生 async 渲染）
      html: true,
      linkify: true,
      breaks: false
    },
    headings: {
      // 标题锚点
      anchorLinks: true
    },
    components: {
      // 自动导入的 Vue 组件可在 md/mdx 中使用
      autoImport: true
    },
    // MDX 编译插件（仅 mdx: true 时生效）
    remarkPlugins: [],   // 传递给 @mdx-js/mdx 的 remark 插件
    rehypePlugins: []    // 传递给 @mdx-js/mdx 的 rehype 插件
  }
});
```

## 4.17 Islands Architecture

Modeled after void's islands implementation (Import Attributes approach), ubean adopts **Astro-style client directives** that are more idiomatic for Vue, and implements automatic island detection in the Vite plugin layer.

#### Client Directives

Mark island component hydration strategy via directives in Vue templates. The original `client:*` HTML-attribute syntax (shown below) is still supported for backward compatibility; the recommended `v-client.*` Vue directive syntax is documented in the next section.

```vue
<template>
  <!-- 页面加载后立即 hydrate -->
  <Counter client:load />

  <!-- 空闲时 hydrate (requestIdleCallback) -->
  <HeavyChart client:idle />

  <!-- 进入视口时 hydrate (IntersectionObserver) -->
  <Comments client:visible />

  <!-- 媒体查询匹配时 hydrate -->
  <MobileNav client:media="(max-width: 768px)" />

  <!-- 仅服务端渲染，不发送客户端 JS -->
  <StaticFooter client:only="server" />
</template>
```

#### `v-client.*` Vue Directive Syntax (P9-29, Recommended)

The `client:load` HTML-attribute syntax is not a standard Vue directive in Vue templates, so IDE and eslint-plugin-vue cannot provide type-checking or autocompletion. P9-29 refactors it into a **Vue custom directive** `v-client.*`, providing full TypeScript type definitions while keeping compile-time transformation behavior fully equivalent to the legacy syntax.

```vue
<template>
  <!-- v-client.load：页面加载后立即 hydrate（等价 client:load） -->
  <Counter v-client.load />

  <!-- v-client.idle：空闲时 hydrate（等价 client:idle） -->
  <HeavyChart v-client.idle />

  <!-- v-client.visible：进入视口时 hydrate（等价 client:visible） -->
  <Comments v-client.visible />

  <!-- v-client.media：媒体查询匹配时 hydrate（等价 client:media） -->
  <!-- 注意：值是 Vue 表达式，字符串需加引号 -->
  <MobileNav v-client.media="'(max-width: 768px)'" />

  <!-- v-client.only：仅客户端渲染，跳过 SSR（等价 client:only） -->
  <ClientOnlyWidget v-client.only />
</template>
```

#### Syntax Migration Comparison

| Legacy syntax (`client:*`) | New syntax (`v-client.*`) | Description |
| --- | --- | --- |
| `<Comp client:load />` | `<Comp v-client.load />` | Hydrate immediately |
| `<Comp client:idle />` | `<Comp v-client.idle />` | Hydrate when idle |
| `<Comp client:visible />` | `<Comp v-client.visible />` | Hydrate when visible |
| `<Comp client:media="(max-width: 768px)"/>` | `<Comp v-client.media="'(max-width: 768px)'" />` | Hydrate on media query (value must be quoted) |
| `<Comp client:only />` | `<Comp v-client.only />` | Client only |

> **Note**: The two syntaxes are fully equivalent and can be mixed within the same project. New code is recommended to use the `v-client.*` syntax.
>
> The value of `v-client.media` is a Vue expression, so string literals must be quoted (`"'(max-width: 768px)'"`); you can also use a variable (`v-client.media="mediaQuery"`). The legacy syntax `client:media="(max-width: 768px)"` takes the value as a plain string.

#### Dual-Layer Design

The `v-client` directive uses a dual-layer architecture:

1. **Compile time (Vite plugin)**: The `ubean:islands` Vite plugin detects `v-client.*` and `client:*` in templates and transforms them into `<ubean-island>` placeholder elements. This is the primary code path for SSR/Islands mode.

2. **Runtime (Vue directive)**: When the Vite plugin is not enabled (CSR-only apps, unit tests, component libraries), the `vClient` directive is registered as a normal Vue directive on the app, tagging elements with attributes like `data-client-directive` so that `hydrateIslands()` can still discover and process them.

```typescript
// 框架自动注册（createUbeanClientApp 内部）：
app.directive('client', vClient);

// 手动注册（独立 Vue 应用）：
import { vClient } from '@ubean/islands';
app.directive('client', vClient);
```

#### TypeScript Type Definitions

The `v-client` directive provides full type definitions, including directive argument types, modifier types, and hook function types:

```typescript
import type {
  ClientStrategy,              // 'load' | 'idle' | 'visible' | 'media' | 'only'
  ClientDirectiveModifiers,    // { load?, idle?, visible?, media?, only? }
  ClientDirectiveValue,        // string | undefined (媒体查询)
  ClientDirectiveBinding,      // DirectiveBinding<ClientDirectiveValue>
  VClientDirective             // Directive<HTMLElement, ClientDirectiveValue>
} from '@ubean/islands';

// 策略解析工具函数
import { resolveClientStrategy } from '@ubean/islands';

const strategy = resolveClientStrategy({ idle: true }); // → 'idle'
```

#### API Quick Reference

| API | Description |
| --- | --- |
| `vClient` | Vue custom directive object (`Directive<HTMLElement, string \| undefined>`) |
| `resolveClientStrategy(modifiers)` | Resolve strategy from modifiers (`{ idle: true }` → `'idle'`) |
| `strategyToLegacyDirective(strategy)` | Strategy to legacy directive name (`'idle'` → `'client:idle'`) |
| `legacyDirectiveToStrategy(directive)` | Legacy directive name to strategy (`'client:idle'` → `'idle'`) |
| `applyStrategy(el, strategy, mediaQuery?)` | Apply a strategy directly to a DOM element |
| `cleanupStrategy(el)` | Clean up strategy resources (observer/timer) |

#### How It Works

1. **Compile-time scan**: The Vite plugin scans `.vue` and `.md` files to detect `client:*` and `v-client.*` directives
2. **Automatic island marking**: Components with `client:*` directives are automatically treated as island components; after server-side rendering, the client hydrates them separately
3. **On-demand client JS**: Pages without island components send no client JS (pure static HTML)
4. **Layout chain inheritance**: Island components in a layout are passed down to all pages using that layout
5. **Props serialization**: Island component props are serialized to the client via a protocol (only JSON-serializable values are supported)
6. **Markdown auto-islands**: `.md` files containing Vue components or `<script>` are automatically flagged as needing a client bundle

#### Component Auto-Registration (Zero-Config) + Auto Hydration

Since ubean v1.0, **Islands components are auto-registered** — no need to manually maintain a `components` map in `app.ts`. The framework also **auto-hydrates** all islands on the client, with no need to manually call `hydrateIslands()` in `onClientReady`.

**Workflow**:

1. `ubeanIslandsPlugin` scans `.vue` files during the transform phase; when it finds a `client:*` directive, it synchronously parses the `<script setup>` import statements
2. It replaces the component name (template tag name) with a `<ubean-island v-once>` custom element (`v-once` prevents Vue re-render from overwriting hydrated content)
3. It maps the component name to its import path, resolving to an absolute path
4. It generates the virtual module `virtual:ubean-islands-registry`, exporting all collected island components
5. The `hydrateIslands` bridge function in `ubean/runtime/vue` auto-imports the virtual registry and merges it with any user-passed `components` (user-provided takes precedence)
6. After `app.mount()`, the client entry auto-invokes `hydrateIslands()` via a double `requestAnimationFrame`, ensuring the Vue render cycle completes before hydration
7. After SPA navigation, `router.afterEach` auto-hydrates islands in the new page

```typescript
// app.ts —— 零配置，无需任何 islands 相关代码
import { defineApp } from 'ubean/runtime/vue';

export default defineApp({
  // islands 自动注册、自动水合
});
```

**Supported import forms**: `import Foo from './Foo.vue'`, `import { default as Foo } from './Foo.vue'`, `import Foo, { bar } from './Foo.vue'`

**Edge-case handling**:

| Scenario | Handling |
| --- | --- |
| Global registration / `defineAsyncComponent` / dynamic import | Cannot be statically analyzed → build-time warning; user manually registers via `hydrateIslands({ components })` in `onClientReady` |
| Same component name, different import paths | Warning; first-discovered path wins |
| Components in `node_modules` | Works normally (bare specifiers passed to Vite as-is) |
| Adding a new island usage in dev mode | Transform re-scans → updates registry → invalidates virtual module → full-reload (only triggered on HMR updates, not on initial load) |

> See [Islands](/guide/islands) for the detailed design.

#### Comparison with void's Import Attributes

| Approach | Pros | Cons |
| --- | --- | --- |
| void `import X from "..." with { island: "idle" }` | Standard syntax; compile-time static analysis | Writing import with attributes in Vue `<script setup>` is awkward; needs to be paired with template usage |
| ubean `client:*` directives | Familiar to Vue developers (like Nuxt/Astro); intuitive in templates; progressive enhancement | Custom directives require compile-time transformation |

## 4.18 Auto Import (Built-in, Configurable)

Auto import comes in two categories, both enabled by default and both configurable off.

#### Composables Auto Import (unimport)

Automatically imports the project's `composables/`, `utils/` directories, and ubean's built-in composables — no manual import needed:

```typescript
// 无需 import，自动可用
const { t, locale, setLocale } = useI18n();
const user = useUser();
const data = await useLoaderData<typeof loader>();
const router = useRouter();
```

**Auto-scan directories**:

- `composables/` — auto-imports all exports (supports nested directory scanning; by default only scans one level)
- `composables/index.ts` — named exports
- `utils/` — utility functions (requires enabling the config)

#### Vue Components Auto Import (unplugin-vue-components)

Automatically imports Vue components under the project's `components/` directory — no need to import them in script:

```vue
<template>
  <!-- 无需 import，自动注册 -->
  <BaseButton>Click</BaseButton>
  <Icon name="home" />
</template>
```

**Auto-scan directories**:

- `components/` — scans all `.vue` components (supports nested directories; directory name as namespace: `Foo/Bar.vue` → `<FooBar />`)
- ubean built-in components (`<Link>`, `<Head>`, `<ClientOnly>`, etc.) are always available

#### Configuration

```typescript
// ubean.config.ts
export default defineConfig({
  imports: {
    autoImport: true, // composables 自动导入，默认 true
    dirs: ['composables', 'composables/*/index.{ts,vue}'],
    global: false // 是否注入到全局（false 则仅在类型中可见）
  },
  components: {
    autoImport: true, // 组件自动导入，默认 true
    dirs: ['components'],
    directoryAsNamespace: false // 目录作为命名空间
  }
});
```

#### Type Support

Auto-generates `.ubean/auto-imports.d.ts` and `.ubean/components.d.ts`, which are automatically included in `tsconfig.json`.

## 4.19 i18n Internationalization

ubean provides lightweight built-in internationalization support (without pulling in vue-i18n, keeping zero extra dependencies), including a translation engine, route middleware, and file scanning.

> **Current status note**: The core translation engine (`t()`/`setLocale()`/`defineLocale()`) and i18n route middleware (three strategies, Accept-Language/cookie detection, auto-redirect) are complete. Vue reactivity integration, automatic locales-file loading, SSR hydration, HTML lang/dir binding, pluralization, and Intl formatting are follow-up enhancement tasks.

#### File Conventions

```
locales/
├── en.ts
├── zh-CN.ts
├── ja.ts
└── index.ts          // 配置入口（可选）
```

```typescript
// locales/zh-CN.ts
export default defineLocale({
  name: '简体中文',
  dir: 'ltr', // 文字方向 (ltr|rtl)
  messages: {
    welcome: '欢迎',
    'nav.home': '首页',
    'user.greeting': '你好，{name}'
  }
});
```

> **Note**: Pluralization and date/number/currency formatting (Intl) are planned for P6-34/P6-35; the current version uses parameter interpolation (`{name}`), which covers most scenarios.

#### Locale Detection & Routing Strategy

Supports three locale routing strategies:

```typescript
// ubean.config.ts
export default defineConfig({
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en', 'ja'],
    strategy: 'prefix_except_default', // prefix | prefix_except_default | no_prefix
    detectBrowserLocale: true, // 检测 Accept-Language
    cookieName: 'ubean_locale', // locale cookie 名
    fallbackLocale: 'en'
  }
});
```

**Strategy descriptions**:

- `prefix_except_default`: the default locale has no prefix (`/about`); others are prefixed (`/en/about`) — default
- `prefix`: all locales are prefixed (`/zh-CN/about`, `/en/about`)
- `no_prefix`: no URL prefix; switching via cookie/header

#### Composables

```typescript
// 服务端/客户端通用
const { t, locale, locales, setLocale, getLocale } = useI18n();

t('welcome'); // '欢迎'
t('user.greeting', { name: '张三' }); // '你好，张三'

// 切换 locale（注意：当前版本切换后组件不会自动重渲染，P6-31 将提供响应式版本）
setLocale('en');

// 路由工具
switchLocalePath('en'); // 生成当前路径的 en 版本（如 /about → /en/about）
const paths = localeRoutes(); // { 'zh-CN': '/about', en: '/en/about', ja: '/ja/about' }
```

#### `<Link>` Component Auto-handles Locale Prefix

```vue
<Link to="/about">About</Link>
<!-- 当前 locale=en 时渲染为 <a href="/en/about"> -->
<!-- 当前 locale=zh-CN 时渲染为 <a href="/about"> (default, prefix_except_default) -->
```

```vue
<Link :to="{ name: 'About', locale: 'ja' }">日本語</Link>
<!-- 强制指定 locale 前缀 -->
```

#### Getting Locale in a Loader

```typescript
export const loader = defineLoader(c => {
  const locale = getLocale(c);
  // 根据 locale 返回不同数据
});
```

## 4.19b Color Mode (Dark/Light) (P9-21)

ubean ships built-in dark/light mode support, aligned with Nuxt `@nuxtjs/color-mode`. By injecting a no-FOUC (flash-avoidance) inline script into `<head>`, it synchronously sets the `<html>` class or `data-*` attribute before the browser paints, avoiding the flash on dark-mode toggle.

#### Basic Usage

```typescript
// 在任意 Vue 组件中使用（自动导入）
const colorMode = useColorMode();

colorMode.value;       // 'light' | 'dark' — 当前实际模式
colorMode.preference;  // 'system' | 'light' | 'dark' — 用户偏好
colorMode.set('dark'); // 设置偏好并持久化
colorMode.toggle();    // 在 modes 之间循环切换
```

#### How It Works

1. **SSR / build time**: The Vite plugin injects the no-FOUC script at the very front of `<head>` during the `transformIndexHtml` phase
2. **On browser load**: The script runs synchronously, reads the preference from cookie (SSR-friendly) or localStorage, and detects `prefers-color-scheme` if it is `system`
3. **After hydration**: The `useColorMode()` composable reads the current mode from the DOM for reactive access

#### Configuration

```typescript
// ubean.config.ts
export default defineConfig({
  colorMode: {
    preference: 'system',    // 默认偏好: 'system' | 'light' | 'dark' | 自定义
    fallback: 'light',       // 系统偏好无法检测时的回退值
    classPrefix: '',         // class 前缀
    classSuffix: '-mode',    // class 后缀 → 'light-mode', 'dark-mode'
    storageKey: 'ubean-color-mode',  // localStorage 键名
    cookieName: 'ubean-color-mode',  // cookie 名（SSR）
    dataValue: false,        // 使用 data-color-mode 属性代替 class
    modes: ['light', 'dark'] // 可用模式列表
  }
});
```

Set to `false` to disable color mode entirely:

```typescript
export default defineConfig({
  colorMode: false
});
```

#### Custom Modes

Supports more than two modes (e.g. sepia):

```typescript
export default defineConfig({
  colorMode: {
    modes: ['light', 'dark', 'sepia'],
    classSuffix: ''  // → class="light" / "dark" / "sepia"
  }
});
```

#### CSS Integration

```css
/* 使用 class 模式（默认） */
html.light-mode { background: #fff; color: #333; }
html.dark-mode  { background: #1a1a1a; color: #eee; }

/* 使用 data 属性模式 */
html[data-color-mode="light"] { background: #fff; color: #333; }
html[data-color-mode="dark"]  { background: #1a1a1a; color: #eee; }
```

#### Route-Level Forced Mode

Force the color mode at the route level via `forceColorMode()` / `unforceColorMode()`:

```typescript
// 在路由守卫中
router.beforeEach((to) => {
  if (to.meta.colorMode) {
    forceColorMode(to.meta.colorMode as string);
  } else {
    unforceColorMode();
  }
});
```

## 4.19c Third-Party Script Optimization / Partytown (P9-22)

ubean ships built-in third-party script optimization, aligned with Nuxt `@nuxtjs/scripts` and Astro's Partytown integration. Via [Partytown](https://partytown.builder.io/), third-party scripts (Google Analytics, Facebook Pixel, GTM, etc.) are moved into a Web Worker, so they don't block the main thread — improving page interaction performance.

#### Basic Usage

```typescript
// 在任意 Vue 组件中使用（自动导入）
const { loaded, load, remove } = useScript('https://www.googletagmanager.com/gtag/js?id=GA_ID', {
  partytown: true,       // 通过 Partytown 在 Web Worker 中执行
  trigger: 'idle',       // 浏览器空闲时加载
  attrs: { 'data-ga-id': 'GA_ID' }
});

// 手动加载（trigger: 'manual'）
const script = useScript('/heavy-script.js', { trigger: 'manual' });
script.load();
script.waitForLoad().then(() => console.log('loaded'));
```

#### Loading Strategies

| Strategy | Description | Use cases |
| --- | --- | --- |
| `'load'` | Load immediately after page load (default) | Critical scripts |
| `'idle'` | Load when the browser is idle (`requestIdleCallback`) | Analytics, tracking |
| `'visible'` | Load when the target element enters the viewport (`IntersectionObserver`) | Video, maps |
| `'manual'` | Load only on manual `load()` call | User-interaction triggered |

```typescript
// visible 策略：元素进入视口时加载
const mapRef = ref<HTMLElement | null>(null);
useScript('https://maps.googleapis.com/maps/api/js', {
  trigger: 'visible',
  target: mapRef,
  rootMargin: '200px'  // 提前 200px 加载
});
```

#### Partytown Configuration

Enable Partytown in `ubean.config.ts`:

```typescript
export default defineConfig({
  partyTown: {
    enabled: true,
    forward: ['dataLayer.push'],   // 转发主线程调用
    mainAccess: ['document.cookie'], // 主线程访问器
    debug: false,                   // 调试模式
    libPath: '~partytown'           // lib 文件路径
  }
});

// 或简写
export default defineConfig({
  partyTown: true  // 使用默认配置启用
});
```

Set to `false` (default) to disable:

```typescript
export default defineConfig({
  partyTown: false
});
```

#### How It Works

1. **Build time**: The Vite plugin injects the Partytown config script into `<head>` during the `transformIndexHtml` phase (setting the `window.partytown` config + loading the `partytown.js` lib)
2. **Runtime**: `useScript()` creates a `<script>` tag; when `partytown: true`, it sets `type="text/partytown"`, and Partytown intercepts it and moves execution into a Web Worker
3. **Main-thread forwarding**: APIs configured in `forward` (e.g. `dataLayer.push`) are automatically forwarded from the Worker to the main thread

> **Note**: Using Partytown requires copying the Partytown lib files to `public/~partytown/`. After installing `@builder.io/partytown`, run `partytown copylib public/~partytown`.

#### API Quick Reference

| API | Description |
| --- | --- |
| `useScript(src, options)` | Load a third-party script; returns `{ script, loaded, error, load, remove, waitForLoad }` |
| `configurePartyTown(config)` | Globally configure Partytown |
| `isPartyTownEnabled()` | Check whether Partytown is enabled |
| `getPartyTownScript(config)` | Generate the inline config script HTML |
| `resolvePartyTownConfig(config)` | Merge default config |

## 4.19d Streaming Metadata (P9-24)

Building on streaming SSR, ubean supports dynamic metadata streaming injection, aligned with Next.js streaming metadata. When a page component adds head tags (e.g. `og:title`, `canonical`, dynamic `title`) via `useHead()` / `useSeoMeta()` inside `setup()`, these dynamic tags are captured and injected into the streaming response, ensuring SEO crawlers and social bots see the complete metadata without waiting for client hydration.

#### Problem Background

The core optimization of streaming SSR is to **send `<head>` before rendering the app**: the browser can preload CSS/JS while the app renders, significantly improving TTFB/LCP. But this introduces an SEO problem — `useHead()` calls inside a component's `setup()` happen during app rendering, by which time `<head>` has already been sent, so dynamically added `<meta>` / `<title>` / `<link>` tags cannot enter the already-sent `<head>`.

#### Solution

ubean adds dynamic head-tag capture and injection to the streaming render flow:

1. **Snapshot static head**: Before streaming begins, call `renderSSRHead(head)` to record the static head tags (from `defineApp` / `definePage` / locale)
2. **Stream-render the app**: `useHead()` calls inside Vue component `setup()` append new entries to the head instance
3. **Collect dynamic tags**: After app rendering completes, call `renderSSRHead(head)` again to get the full head; compare with the static snapshot to extract the newly added tags
4. **Inject into the tail**: Dynamic tags are injected after the SSR state script and before the tail. The browser automatically moves `<meta>` / `<title>` / `<link>` tags into `<head>`

```typescript
// 任意 Vue 组件——动态 metadata 会被自动捕获
import { useHead } from '@unhead/vue';

export default defineComponent({
  setup() {
    // 这些标签在流式渲染期间添加，会被捕获并注入到响应中
    useHead({
      title: 'Dynamic Page Title',
      meta: [
        { name: 'og:title', content: 'Dynamic OG Title' },
        { name: 'og:description', content: 'Description from component' }
      ],
      link: [
        { rel: 'canonical', href: 'https://example.com/article/123' }
      ]
    });

    return () => h('div', 'Page content');
  }
});
```

#### How It Works

```
流式响应结构:
┌─────────────────────────────────────────┐
│ <!doctype html>                         │ ← head 部分(立即发送)
│ <html><head>                            │   - 静态 title/meta/link
│   <title>静态标题</title>               │   - CSS/JS 预加载
│   <meta name="description" ...>         │
│ </head><body>                           │
│   <div id="app">                        │
│     <!-- Vue app HTML 边渲染边流式输出 --> │ ← app 部分
│     <div>页面内容</div>                  │
│   </div>                                │
│   <script id="__UBEAN_STATE__">...</script> │ ← tail 部分
│   <meta name="og:title" content="...">  │   - 动态 head 标签(P9-24)
│   <link rel="canonical" href="...">     │   - 浏览器自动移入 <head>
│ </body></html>                          │
└─────────────────────────────────────────┘
```

#### Enabling Conditions

Streaming metadata depends on streaming SSR; you must enable `ssr.streaming` in `ubean.config.ts`:

```typescript
export default defineConfig({
  ssr: {
    streaming: true  // 启用流式 SSR（自动启用流式 metadata）
  }
});
```

When streaming SSR is not enabled, dynamic head tags are injected all at once during buffered rendering via `transformHtmlTemplate` (the existing behavior, unaffected).

#### Relationship with Static Head

| Source | Injection timing | Location | Override relationship |
| --- | --- | --- | --- |
| `defineApp({ head })` | Before streaming starts | Inside `<head>` | Overridden by page-level head |
| `definePage({ head })` / `pageObj.head` | Before streaming starts | Inside `<head>` | Overrides app-level head |
| In-component `useHead()` | During streaming render | Tail (browser moves into `<head>`) | Appended (does not duplicate static tags) |

> **Note**: Dynamic head tags use an **append** strategy; they do not override or duplicate static tags. `collectDynamicHeadTags` compares the static snapshot with the full head line-by-line and injects only the newly added tag lines.

## 4.19e Full-Text Search / Pagefind (P9-26)

ubean ships built-in full-text search support, aligned with Astro's Pagefind integration. Via [Pagefind](https://pagefind.app/), the generated HTML files are indexed at build time, and a client-side search API is provided at runtime — no server-side database or search engine needed.

#### Basic Usage

```typescript
// ubean.config.ts — 启用 Pagefind
export default defineConfig({
  search: true
  // 或自定义配置:
  // search: {
  //   site: 'dist',           // HTML 输出目录
  //   indexPath: 'pagefind',  // 索引输出子目录
  //   verbose: true           // 详细日志
  // }
});
```

At build time, the Vite plugin automatically runs the Pagefind CLI to index HTML files:

```
$ ubean build
  [ubean:pagefind] Search index generated successfully.
```

Use the `useSearch()` composable (auto-imported) in Vue components:

```vue
<script setup lang="ts">
const { search, results, loading, error } = useSearch({ debounce: 200 });
</script>

<template>
  <input
    type="search"
    placeholder="搜索文档..."
    @input="search($event.target.value)"
  />
  <div v-if="loading">搜索中...</div>
  <div v-else-if="error">{{ error }}</div>
  <ul v-else>
    <li v-for="r in results" :key="r.id">
      <a :href="r.url">{{ r.meta.title || r.url }}</a>
      <p v-html="r.excerpt" />
    </li>
  </ul>
</template>
```

#### How It Works

```
构建时:
┌──────────────────────────────────────────┐
│ ubean build                              │
│   ├── Vite 构建 → 生成 HTML 文件到 dist/ │
│   └── closeBundle hook                   │
│       └── npx pagefind --site dist       │
│           → 生成 dist/pagefind/ 索引文件  │
│             (pagefind-modern.js, 索引碎片) │
└──────────────────────────────────────────┘

运行时:
┌──────────────────────────────────────────┐
│ 浏览器                                    │
│   ├── useSearch()                        │
│   │   └── 首次搜索时动态 import           │
│   │       /pagefind/pagefind-modern.js   │
│   └── pagefind.search(query)             │
│       → 返回匹配结果(url/excerpt/meta)    │
└──────────────────────────────────────────┘
```

#### Configuration Options

```typescript
export default defineConfig({
  search: {
    enabled: true,           // 启用（默认 true 当 search 为对象时）
    site: 'dist',            // HTML 输出目录（默认从 Vite outDir 推导）
    indexPath: 'pagefind',   // 索引输出子目录（默认 'pagefind'）
    glob: '**/*.html',       // HTML 文件 glob（默认所有 .html）
    excludeSelectors: ['nav', 'footer', '.sidebar'],  // 排除的 CSS 选择器
    verbose: false           // 详细索引日志
  }
});
```

#### Composable Options

```typescript
const {
  query,    // Ref<string> — 当前查询
  results,  // ShallowRef<SearchResult[]> — 搜索结果
  loading,  // Ref<boolean> — 是否搜索中
  error,    // Ref<string | null> — 错误信息
  ready,    // Ref<boolean> — Pagefind 是否已加载
  search,   // (query: string, filters?) => Promise<void>
  clear,    // () => void — 清除结果
  preload   // () => Promise<void> — 预加载 Pagefind
} = useSearch({
  debounce: 150,   // debounce 延迟(ms)，默认 150
  limit: 10,       // 最大结果数，默认 10
  filters: {       // 默认过滤器
    filters: { tags: 'guide' },
    sort: { date: 'desc' }
  },
  immediate: '初始查询'  // 挂载时自动搜索
});
```

#### Filtering & Sorting

Mark filter fields via the `data-pagefind-filter` attribute in HTML, then pass filters when searching:

```html
<!-- 在页面 HTML 中 -->
<article data-pagefind-filter="tags:guide">
  <h1>Getting Started</h1>
  ...
</article>
```

```typescript
// 搜索时过滤
await search('vue', {
  filters: { tags: 'guide' }
});

// 按日期排序
await search('vue', {
  sort: { date: 'desc' }
});
```

#### API Quick Reference

| API | Description |
| --- | --- |
| `useSearch(options?)` | Search composable; returns reactive state and search methods |
| `initPagefind(options?)` | Manually load the Pagefind browser library |
| `executeSearch(query, options)` | Low-level search API (no reactive state) |
| `configureSearch(config)` | Globally configure the search runtime |
| `resolveSearchConfig(config)` | Merge default config |
| `isPagefindLoaded()` | Check whether Pagefind is loaded |

> **Note**: Using Pagefind requires installing the `pagefind` CLI: `pnpm add -D pagefind`. If not installed, the build skips indexing and emits a warning without affecting other features.

## 4.20 Cross-Platform Queues

Modeled after void's Proxy dynamic-binding pattern, ubean provides a cross-platform queue abstraction.

#### Defining a Queue

```typescript
// queues/email.ts
import { defineQueue } from 'ubean';

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
}

export const emailQueue = defineQueue<EmailJob>(
  {
    name: 'email',
    retry: { maxAttempts: 3, backoff: 'exponential' }
  },
  async job => {
    // 处理队列任务
    await sendEmail(job.to, job.subject, job.body);
  }
);
```

#### Sending Jobs

```typescript
// routes/api/signup.ts
import { defineHandler, validator } from 'ubean';
import { z } from 'zod';

const signupSchema = z.object({ email: z.string().email() });

export const POST = defineHandler(validator('json', signupSchema), async c => {
  const { email } = c.req.valid('json');
  // ... 创建用户
  await emailQueue.send({ to: email, subject: 'Welcome', body: '...' });
  return c.json({ success: true });
});
```

#### Platform Adaptation

| Platform | Underlying implementation |
| --- | --- |
| Node.js | BullMQ / in-memory queue (dev mode) |
| Cloudflare Workers | Cloudflare Queues (via binding) |
| Vercel | Vercel Queues |
| Bun | Bun built-in Worker |
| Deno | Deno Queue |

Each preset injects the platform-specific queue driver implementation at build time; dev mode uses an in-memory queue by default.

#### Type Generation

Auto-generates `.ubean/queues.d.ts` to enhance the `queues` global object's types (modeled after void's Proxy pattern):

```typescript
// 自动生成的类型
interface QueueMap {
  email: Queue<EmailJob>;
}
```

## 4.21 Better Auth Plugin (Official, Optional)

An auth extension package `@ubean/auth` based on [Better Auth](https://better-auth.com); a standalone package that does not enter the production bundle by default.

#### Quick Start

```ts
// vite.config.ts
import { ubeanAuthPlugin } from '@ubean/auth/vite';

export default {
  plugins: [
    ubeanAuthPlugin({
      enabled: true,
      basePath: '/api/auth',
      secret: process.env.AUTH_SECRET,
      session: {
        cookieName: 'ubean_session',
        expiresIn: 60 * 60 * 24 * 7
      },
      // 传入 betterAuth 配置即启用完整 Better Auth
      betterAuth: {
        emailAndPassword: { enabled: true },
        socialProviders: {
          github: { clientId: '...', clientSecret: '...' }
        }
      }
    })
  ]
};
```

```vue
<script setup lang="ts">
import { useAuth } from '@ubean/auth';

const { user, isAuthenticated, isLoading, signIn, signUp, signOut } = useAuth();
</script>
```

#### Design Points

- **Graceful degradation**: When `better-auth` is not installed, automatically falls back to a built-in email/password implementation, ensuring zero-config usability
- **Vite plugin**: Auto-mounts `/api/auth/*` routes (Hono middleware) on the dev server, no manual configuration needed
- **Virtual module**: `@ubean/auth/client` provides a type-safe auth client with zero network overhead on import
- **`useAuth()` composable**: Reactive `session`/`user`/`isAuthenticated`/`isLoading`; auto-refreshes on `onMounted` + focus/visibilitychange
- **Server handler**: `createAuthHandler()` exposes a standard Hono handler, supporting integration with any framework
- **Works with `meta.public`**: Routes with `public: false` automatically require login (combined with route middleware)

## 4.22 Type-Safe `<Link>` Component

The `to` prop of the `<Link>` component is typed as a union of route names defined in the project.

```vue
<script setup lang="ts">
import { Link } from 'ubean/vue-runtime';
</script>

<template>
  <!-- to 只能传已定义的 RouteName，TS 自动补全 -->
  <Link to="UserDetail" :params="{ id: '123' }">用户详情</Link>

  <!-- 字符串路径也支持，但 params 类型推导 -->
  <Link to="/users/123">用户详情</Link>

  <!-- 对象形式 -->
  <Link :to="{ name: 'UserDetail', params: { id: '123' }, query: { tab: 'profile' } }">用户详情</Link>
</template>
```

The types are driven by the `RouteName` union auto-generated in `.ubean/pages.d.ts`, and auto-updated when routes are added/removed via the CLI/DevTools.

## 4.23 Icon Extension (Official, Optional)

Modeled after Nuxt Icon, ubean provides a unified, SSR-friendly icon system via the standalone `@ubean/icon` that does not depend on the public network by default. It is based on the Iconify data format, but does not treat arbitrary icon collections or the Iconify API as a core runtime dependency.

#### Basic API

After installing `@ubean/icon`, the Vue app can use the `<Icon>` component automatically:

```vue
<template>
  <Icon name="lucide:search" size="20" aria-label="搜索" />
  <Icon name="brand:logo" class="brand-logo" />
  <Icon :name="isDark ? 'lucide:moon' : 'lucide:sun'" />
</template>
```

- The default output is an SVG that inherits `currentColor`; `mode: 'css'` provides CSS mask output for monochrome static icons, and `mode: 'svg'` is for multi-color icons or when SVG attributes are needed.
- The default size is `1em`; native SVG, ARIA, and class/style attributes are fully passed through. Decorative icons default to `aria-hidden="true"`; when `aria-label` or `title` is passed, an accessible name is output automatically.
- `name` uses the `collection:icon` form; explicit aliases are supported, and arbitrary user input must not be concatenated directly into a remote icon URL.
- Dynamic names are not statically scanned; they must be explicitly listed in `clientBundle.icons` to avoid missing icons in production or test environments.

#### Configuration & Local Datasets (Custom Local Collections)

Icon collections are installed on demand, avoiding the significant install, build, and server-bundle size bloat from a full `@iconify/json`:

```bash
pnpm add -D @iconify-json/lucide @iconify-json/logos
```

```typescript
// vite.config.ts
import { ubeanIconPlugin } from '@ubean/icon/vite';

export default {
  plugins: [
    ubeanIconPlugin({
      mode: 'svg',
      aliases: {
        search: 'lucide:search',
        github: 'logos:github-icon'
      },
      // Custom Local Collections（对标 @nuxt/icon）
      customCollections: {
        // 简写：key 为 prefix，value 为本地 SVG 目录
        'my-icons': './assets/icons',
        // 完整对象配置
        brand: {
          dir: './assets/brand-svgs',
          prefix: 'brand',
          normalizeIconName: name => name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        }
      },
      clientBundle: {
        scan: true,
        icons: ['lucide:search'],
        sizeLimitKb: 256
      },
      serverBundle: 'auto'
    })
  ]
};
```

- `customCollections` converts local SVG directories into Iconify collections; nested subdirectories are auto-named with a hyphen prefix (`auth/login.svg` → `auth-login`)
- The build must clean scripts, event attributes, external references, and unsafe URLs from SVGs
- Static scanning only collects `<Icon name="...">` and statically-evaluable names; scan results generate virtual modules and `.ubean/icons.d.ts`, shared by the client bundle, SSR, and DevTools
- The dev server `/_iconify` route looks up local custom collections first (returns SVG directly on hit), falling back to the Iconify API on miss
- By default, an uncompressed bundle exceeding `clientBundle.sizeLimitKb` fails the build; diagnostics should list the collection, icon count, and names that can be switched to on-demand serving
- HMR support: adding/modifying/deleting SVG files auto-hot-reloads without restarting the dev server

#### Providers & Platform Semantics

The icon resolution priority is fixed: client bundle -> local collection/server bundle -> explicitly configured remote provider. Production does not fall back to the Iconify public API by default; remote fallback during development must be explicitly enabled and is surfaced in the terminal.

| Scenario | Default strategy | Behavior when conditions aren't met |
| --- | --- | --- |
| Node SSR | Locally installed collections are dynamically loaded per collection; `/_ubean/icon/:collection` serves on demand | Missing collection returns dev diagnostics; production build fails or uses a configured remote provider |
| Static SSG / `ssr: false` | Write scanned and explicitly-declared icons into the client bundle | Build diagnostics for undeclared dynamic icons; must not depend on a local server endpoint |
| Edge / serverless | Capability matrix decides between inlining, remote collection CDN, or client-bundle-only | When dynamic JSON import is unsupported, an available strategy must be chosen; silently requesting the public API is forbidden |
| Vitest / browser component tests | `provider: 'none'` + client bundle | Tests must not access the network; unlisted dynamic names should fail the test config or assertions |

`@ubean/icon` should expose a Vite plugin so that pure Vite Vue projects can also reuse the static-scanning and pre-bundling logic; the ubean framework integration only handles auto-registering the component, virtual modules, the SSR endpoint, and preset-capability diagnostics.

## 4.24 Page Transitions (View Transitions API)

Implements page-navigation transitions based on the browser-native [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API), with no third-party animation library required.

#### Basic Usage

```vue
<script setup lang="ts">
// 页面内启用 view transition（默认通过 ubean config 全局配置）
// app.vue 或 layout 中无需额外代码
</script>

<style>
/* 自定义过渡动画 */
::view-transition-old(root) {
  animation: fade-out 0.2s ease-out;
}
::view-transition-new(root) {
  animation: fade-in 0.3s ease-in;
}

@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
```

#### Configuration

```typescript
// ubean.config.ts
export default defineConfig({
  viewTransition: {
    enabled: true // 默认 true，自动检测浏览器支持
    // 不支持 View Transitions 的浏览器自动 fallback（无动画，不阻塞导航）
  }
});
```

#### Element-Level Transitions

Supports naming shared elements via the `view-transition-name` CSS property to achieve cross-page shared-element transitions (e.g. image zoom transitions):

```vue
<!-- 列表页 -->
<article>
  <img src="/photo.jpg" style="view-transition-name: photo-1" />
</article>

<!-- 详情页 -->
<div class="hero">
  <img src="/photo.jpg" style="view-transition-name: photo-1" />
</div>
```

#### Implementation Points

- Client-side routing (`<Link>` navigation, `router.push()`) wraps DOM updates in `document.startViewTransition()`
- Browsers without the View Transitions API automatically degrade to plain navigation, with no JS errors
- SSR first-screen load does not trigger transitions (only client-side route switches trigger them)
- Preserves page scroll position, avoiding layout jumps during transitions

## 4.25 PWA Progressive Web App (Official, Optional `@ubean/pwa`)

Provides zero-config Service Worker registration, Web App Manifest generation, and offline caching strategies, modeled after vite-plugin-pwa.

#### Quick Start

```ts
// vite.config.ts
import { ubeanPwaPlugin } from '@ubean/pwa/vite';

export default {
  plugins: [
    ubeanPwaPlugin({
      manifest: {
        name: 'My Ubean App',
        short_name: 'Ubean',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone'
      },
      registerType: 'autoUpdate',
      workbox: {
        precacheManifest: true,
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ]
};
```

#### `usePwa()` Composable

```vue
<script setup lang="ts">
import { usePwa } from '@ubean/pwa';

const {
  isInstalled, // 是否已安装为 PWA
  isUpdateAvailable, // 是否有新版本
  isOfflineReady, // 是否已缓存可离线使用
  needRefresh, // 需要用户确认刷新
  registration, // ServiceWorkerRegistration
  register, // 手动注册 SW
  updateServiceWorker // 激活新版本
} = usePwa();
</script>

<template>
  <div v-if="needRefresh" class="update-banner">
    有新版本可用
    <button @click="updateServiceWorker()">立即刷新</button>
  </div>
  <div v-else-if="isOfflineReady" class="offline-badge">可离线使用</div>
</template>
```

#### Caching Strategies

Built-in 5 runtimeCaching strategies:

| Strategy | Use cases | Description |
| --- | --- | --- |
| `cache-first` | Static assets (images, fonts, JS/CSS) | Cache first, update in background |
| `network-first` | API/HTML | Network first, fall back to cache offline |
| `stale-while-revalidate` | Fonts, non-critical APIs | Return cache immediately + update in background |
| `network-only` | Payments/auth etc. | Network only; fail on error |
| `cache-only` | Precached resources | Cache only; no requests |

Default runtimeCaching rules auto-cover: images (`/img/**`, `/assets/**`), fonts (Google Fonts etc.), assets (static resources), api (`/api/**` using stale-while-revalidate), pages (HTML navigation using network-first).

#### Design Points

- A precache manifest with content hash is auto-generated at build time, ensuring version updates
- HTML auto-injects `<link rel="manifest">`, theme-color meta, Apple touch icon
- Three registration modes: `autoUpdate` (auto update), `prompt` (prompt user to confirm), `manual` (manually call `register()`)
- The Service Worker file is output to `.output/public/sw.js` at build time
- DevTools can view SW registration status and cache list

---

## 4.26 Pinia State Management (Official, Optional `@ubean/pinia`)

ubean provides a thin integration wrapper for Pinia via `@ubean/pinia`. It does not re-export the Pinia API; instead, it is responsible for two things:

1. **dev pre-bundle optimization** — adds `pinia` to Vite's `optimizeDeps.include` to avoid the dependency-scan latency on the first request
2. **SSR state hydration helper** — provides `serializePiniaState` / `hydratePiniaState` functions that work with the `defineApp({ serializeState, hydrateState })` hooks to complete server-side state serialization and client-side hydration

Pinia itself is still imported from the `pinia` package (`createPinia`/`defineStore`/`storeToRefs`, etc.); `@ubean/pinia` only provides the integration glue.

### Quick Start

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true
});
```

Then register the Pinia plugin and SSR hydration hooks in `src/app.ts`:

```ts
// src/app.ts
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

### Defining & Using Stores

Store definitions are identical to regular Pinia:

```ts
// src/stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    double: state => state.count * 2
  },
  actions: {
    increment() {
      this.count++;
    }
  }
});
```

Use in pages or components:

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCounterStore } from '~/stores/counter';

const store = useCounterStore();
const { count, double } = storeToRefs(store);
</script>

<template>
  <button @click="store.increment()">Count: {{ count }} (double: {{ double }})</button>
</template>
```

### SSR State Hydration Flow

ubean's SSR state protocol is implemented via two hooks on `defineApp`:

1. **Server-side rendering** — After `renderToString(app)` completes, the ubean SSR renderer calls `serializeState(app)`. `serializePiniaState` extracts the state from `app.config.globalProperties.$pinia.state.value` and returns `{ pinia: ... }`.

2. **HTML injection** — The renderer serializes the state object to JSON and injects it into the HTML's `<script id="__UBEAN_STATE__" type="application/json">` tag.

3. **Client-side hydration** — The client entry calls `hydrateState(app, state)` after `applyAppConfig` (registering the `createPinia()` plugin) and before `app.mount()`. `hydratePiniaState` assigns `state.pinia` to `pinia.state.value`.

> Hydration must run before `mount`; otherwise the store is already initialized with default state, and hydration has no effect. ubean's client entry ensures this order.

### Configuration Options

```ts
export interface UbeanPiniaOptions {
  /** 是否启用,默认 true。设为 false 等价于 `pinia: false` */
  enabled?: boolean;
  /**
   * 是否将 `pinia` 加入 Vite 的 `optimizeDeps.include`,默认 true。
   * dev 模式下预构建 pinia 可避免首次请求的依赖扫描延迟。
   * 若你使用了自定义的 pinia 别名或 monorepo 内的 pinia 源码,可设为 false。
   */
  optimizeDeps?: boolean;
}
```

Explicit configuration example:

```ts
// ubean.config.ts
export default defineConfig({
  pinia: { optimizeDeps: false } // 禁用 dev 预构建(如使用 monorepo 内的 pinia 源码)
});
```

### Programmatic API

```ts
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/pinia/vite';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/pinia';
```

- `ubeanPiniaPlugin(options?: UbeanPiniaOptions): Plugin[]` — Vite plugin, usually auto-invoked by the module system
- `definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions` — type-safe config helper
- `serializePiniaState(app): PiniaSerializedState` — SSR serialization; returns an empty object when `$pinia` is not detected
- `hydratePiniaState(app, state): void` — client-side hydration; no-op when `state` is null or lacks the `pinia` field

### Design Points

- **Non-invasive**: Pinia itself is still imported from the `pinia` package; `@ubean/pinia` only provides the Vite plugin and SSR hydration helpers, and does not re-export the Pinia API
- **Protocol reuse**: Integrates via ubean's `serializeState`/`hydrateState` hooks, introducing no parallel state model
- **Safe degradation**: `serializePiniaState` returns an empty object when `$pinia` is not detected; `hydratePiniaState` is a no-op when `state` is null or lacks the `pinia` field — safe to call in CSR mode or when there's no SSR state
- **Misconfiguration hints**: If `hydrateState` is called but no `$pinia` is detected on the app (the `createPinia()` plugin was not registered), a clear warning is logged to the console

---

## Next Steps

- [Overview](overview.md) — high-level architecture and design principles
- [Routing](routing.md) — file-based routing, layouts, and route rules
- [App Modes](/guide/app-modes) — fullstack / SPA / SSG / backend modes
- [Islands](/guide/islands) — zero-config island hydration details
