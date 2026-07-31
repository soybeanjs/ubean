# 运行时与开发体验 (defineApp)

与 void 硬编码 `createSSRApp(App)` 不同，ubean 提供 `defineApp` 函数让用户完全控制 Vue 应用实例的创建和配置，支持注册插件、全局组件、指令、provide/inject 等。

#### 设计理念

用户在项目根目录（或 `srcDir`）创建 `app.ts`（可选 `app.server.ts` / `app.client.ts` 区分服务端/客户端），通过 `defineApp(options)` 导出一个**配置对象**（不是工厂函数）。ubean 在创建 Vue 实例后通过 `applyAppConfig(app, config, mode)` 将该配置应用到 `app` 上，从而支持注册插件、全局组件、provide/inject、错误组件、View Transitions 等。

> ⚠️ 注意：早期设计曾计划将 `defineApp` 设计为接收 `({ app, router, ssrContext }) => app` 的工厂函数。**当前实现已废弃该模式**，`defineApp` 接受 options 对象并返回 `ResolvedAppConfig`。如果需要命令式访问 app 实例，请使用 `onAppCreated` / `onClientReady` 回调。

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

#### 服务端/客户端分离

`app.server.ts` 和 `app.client.ts` 导出独立的 `defineApp(options)` 配置。ubean 在构建时合并：

- 服务端：`app.ts` + `app.server.ts`（仅 `mode: 'server' | 'all'` 的插件生效）
- 客户端：`app.ts` + `app.client.ts`（仅 `mode: 'client' | 'all'` 的插件生效）

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

#### defineApp 参数类型

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

#### 入口生成流程

1. 构建时扫描 `srcDir` 是否存在 `app.ts` / `app.server.ts` / `app.client.ts`
2. 如果不存在，使用默认入口（`createDefaultAppConfig()` + 自动 mount/hydrate）
3. 如果存在，生成虚拟入口模块：
   - 服务端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); applyAppConfig(app, appConfig, 'server'); renderToString(app)`
   - 客户端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); applyAppConfig(app, appConfig, 'client'); app.mount('#' + appConfig.rootId)`
4. 支持 `app.server.ts` / `app.client.ts` 的条件合并：服务端入口合并 `app.ts + app.server.ts`，客户端入口合并 `app.ts + app.client.ts`（`plugins` 中带 `mode` 的项按上下文过滤）

#### 与 void 对比

| 方面              | void (硬编码)                  | ubean (defineApp)                      |
| ----------------- | ------------------------------ | -------------------------------------- |
| App 实例创建      | 内部硬编码 `createSSRApp(App)` | 用户通过 `defineApp(options)` 配置     |
| 插件注册          | 不支持（需手动改入口）         | 原生支持 `plugins` 数组                |
| 全局组件          | 不支持                         | 支持 `globalComponents`                |
| SSR 上下文        | 无法访问                       | 通过 `onAppCreated` 在 SSR 阶段访问    |
| 服务端/客户端分离 | 不支持                         | `app.server.ts` / `app.client.ts` 分离 |
| 路由守卫          | 不支持                         | `router.setup` 注册 beforeEach 等      |
| 默认行为          | 固定模板                       | 无 app.ts 时自动降级为默认行为          |
| View Transitions  | 不支持                         | `viewTransitions` 选项                  |
| 错误边界          | 不支持                         | `errorComponent` / `loadingComponent`  |

#### 路由钩子（Navigation Guards）

ubean 通过 `defineApp({ router })` 暴露 vue-router 的全局导航守卫注册入口,典型场景包括鉴权重定向、页面访问埋点、NProgress 进度条、根据 `to.meta.requiresAuth` 做登录校验等。

**执行时机**:`router.setup(router)` 在 router 实例创建后、`app.use(router)` 之前调用,因此守卫能拦截**首次导航**(包括 SSR 的 `router.push(initialUrl)`)。

**执行环境**:Client 和 SSR 都会执行。在 `app.ts` + `app.server.ts` / `app.client.ts` 中各自定义的 `setup` 会**累加执行**(顺序:shared 先,client/server 后),因此 shared 可放通用守卫(如埋点),client/server 可放环境专用守卫(如 SSR 鉴权重定向)。

**注册约束**:`setup` 函数本身必须**同步**完成守卫注册(虽然守卫函数体可以返回 Promise)。不要在 `setup` 中执行异步操作(如发起 API 请求),否则会阻塞首次导航。如需异步逻辑,应放在守卫函数体内:

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

**与组件内 `useRouter().beforeEach` 的区别**:`defineApp({ router })` 中的守卫是**全局**的,在应用启动时注册一次,作用于所有路由;而 `useRouter().beforeEach` 通常在组件 setup 中调用,如果组件被多次挂载会重复注册。**生产环境推荐使用 `defineApp({ router })` 注册全局守卫**。

**与后端 middleware 的区别**:前端路由守卫只在客户端导航(以及 SSR 渲染当前 URL)时触发,不经过网络;后端 `src/middleware/` 是 Hono 中间件,在每个 HTTP 请求时触发。鉴权等需要查 cookie/header 的逻辑,通常在后端 middleware 中处理并将结果注入 context;前端守卫则用于根据已注入的状态做路由级决策(如未登录跳转)。

## 4.8 类型安全请求客户端

ubean 提供分层设计的请求客户端：底层 `createClient` 是无类型的 ofetch 封装，`createTypedClient` / `createTypedFlatClient` / `createTypedInternalFetch` 在其上叠加 OpenAPI `paths` 类型,使路径、参数、请求体和返回值全部类型安全。

### 自动类型生成

dev server 启动时自动从 `/_openapi.json` 获取 schema,用 `openapi-typescript` 生成 `.ubean/openapi.d.ts`:

- OpenAPI Operation 定义由 `hono-openapi` 的 `describeRoute` 中间件收集
- 从 `validator(target, schema)` 使用的 Standard Schema 推导请求参数类型
- 从 `describeRoute` 的 `responses` 中通过 `resolver(schema)` 推导响应类型
- 开发模式下 HMR 自动更新类型

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

### 推荐用法:在 `src/request/` 集中创建 typed client

`ubean init` 会在项目 `src/request/` 下生成两个模板文件,将项目 `paths` 类型绑定到 typed 函数,后续无需重复传递泛型:

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

在组件或 API 路由中使用:

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

### API 速查

| API | 说明 | 返回值 |
| --- | --- | --- |
| `createClient(options)` | 底层 HTTP 客户端(ofetch 封装),无类型 | `ApiClient` |
| `createTypedClient<paths>(client, prefix?)` | 类型化客户端,失败抛异常 | `TypedClient<paths>` |
| `createTypedFlatClient<paths>(client, prefix?)` | 类型化扁平客户端,返回 `{ data, error, status }` 不抛异常 | `TypedFlatClient<paths>` |
| `createTypedInternalFetch<paths>(c, options?)` | server 端类型化内部 fetch,自动转发请求头 | `TypedClient<paths>` |
| `callTypedInternal<paths>()` | 全局类型化进程内调度(无网络请求) | `TypedInternalCaller<paths>` |
| `createTypedRequestSender<paths>(c)` | 上下文感知的类型化请求发送器 | `TypedRequestSender<paths>` |
| `parseContentDisposition(header?)` | 从 Content-Disposition 头解析文件名 | `string` |

### 参数结构

参数结构与 `@soybeanjs/request` 一致,`params` 包含 `path`/`query`/`header`:

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

### 响应类型与文件下载

通过 `responseType` 配置不同的返回类型,参考 `@soybeanjs/request` 的 `createRequest` 设计:

```typescript
type ResponseType = 'json' | 'blob' | 'arraybuffer' | 'text' | 'stream';
```

| `responseType` | 返回值 | 说明 |
| --- | --- | --- |
| `'json'` (默认) | `JsonType` | 解析 JSON 响应,类型从 OpenAPI schema 推断 |
| `'blob'` | `FileResponseData<Blob>` | 文件下载,自动解析文件名 |
| `'arraybuffer'` | `FileResponseData<ArrayBuffer>` | 二进制下载 |
| `'stream'` | `FileResponseData<Uint8Array>` | 流式读取为 Uint8Array |
| `'text'` | `string` | 纯文本响应 |

`FileResponseData` 结构:

```typescript
interface FileResponseData<T = Blob | ArrayBuffer | Uint8Array> {
  file: T;            // 文件内容
  filename: string;   // 从 Content-Disposition 头解析的文件名
  contentType: string; // 响应头中的内容类型
}
```

使用示例:

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

文件下载场景下,文件名默认通过内置的 `parseContentDisposition` 从 `Content-Disposition` 头解析(支持 RFC 5987 编码格式 `filename*=UTF-8''xxx` 和常规格式 `filename="xxx"`)。可通过 `getFileName` 回调自定义。

### 扁平模式

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

### 底层客户端

不使用 OpenAPI 类型时,`createClient` 仍可作为通用 HTTP 客户端:

```typescript
import { createClient } from 'ubean';
const client = createClient({ baseURL: '/api', timeout: 10000 });
const data = await client.get<{ id: string; name: string }>('/users/123');
```

## 4.9 定时任务系统 (Cron Jobs)

参考 nitro 的 scheduledTasks 和 void 的 defineScheduled 设计：

- 在 `crons/` 目录下定义定时任务
- 使用 `export const cron = "<cron expression>"` 定义调度表达式
- 使用 `defineScheduled()` 定义任务处理函数
- 在支持 cron trigger 的平台（Cloudflare Workers Cron Triggers、Vercel Cron）自动配置
- 其他平台通过内置的 cron 调度器或外部触发（`/_cron/<name>` 端点）实现

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

#### Cron 配置

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

## 4.10 环境变量系统

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

## 4.11 Preset 系统设计

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

Preset 自动解析逻辑:

1. 用户配置中明确指定 `preset` 选项
2. 环境变量 `UBEAN_SERVER_PRESET`
3. 自动检测 (std-env provider 检测):
   - `process.versions.bun` → bun
   - `Deno` 全局变量 → deno
   - Vercel 环境变量 → vercel
   - Netlify 环境变量 → netlify
   - Cloudflare Pages 环境变量 → cloudflare-pages
   - 等等
4. 回退到 `defaultPreset` (通常为 node-server)

## 4.12 DevTools 开发工具面板

参考 Nuxt DevTools 的 iframe + RPC 架构模式，为 ubean 内置可视化开发工具面板，提供配置/环境变量/页面路由/API 接口的 UI 化管理，并暴露钩子函数支持数据持久化到数据库，同时集成 AI 大模型辅助开发操作。

#### 设计理念

- **In-App 面板**：应用内浮动按钮唤起 DevTools（`Shift+Alt+D` 快捷键），通过 iframe 隔离 UI 与应用
- **仅开发模式可用**：生产构建自动 tree-shake 移除所有 DevTools 代码，零运行时开销
- **双向 RPC 通信**：DevTools iframe 与宿主应用通过 `postMessage` + 类型安全 RPC 通道通信
- **可扩展 Tab 系统**：内置核心 Tab，同时支持自定义 Tab 插件扩展
- **钩子系统**：所有 CRUD 操作前后触发 hooks，用户可监听以将数据同步到数据库/外部系统
- **AI 驱动**：集成 LLM，自然语言驱动路由/接口/配置的增删改

#### DevTools 面板架构

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

#### 内置 Tab 功能

| Tab               | 功能                                                                            | 操作能力        |
| ----------------- | ------------------------------------------------------------------------------- | --------------- |
| **Overview**      | 项目概览：ubean 版本、Vue 版本、路由/API 数量、插件列表、构建状态、启动时间     | 只读            |
| **Pages**         | 页面路由可视化管理：列表/树形展示所有页面路由、布局、meta、reuse 关系           | CRUD + 跳转预览 |
| **API Routes**    | API 接口管理：所有 GET/POST/... 端点列表、OpenAPI 文档、内置接口测试 playground | CRUD + 在线测试 |
| **Config**        | 项目配置编辑：可视化修改 `ubean.config.ts`，实时预览效果                        | 编辑            |
| **Env**           | 环境变量管理：`.env` 文件编辑、schema 校验、服务端/客户端变量分离展示           | CRUD + 校验     |
| **Layouts**       | 布局组件预览：所有 layouts 的组件树、slot 结构、使用情况统计                    | 只读 + 创建     |
| **Middlewares**   | 中间件链可视化：执行顺序、meta 匹配情况、耗时监控                               | 只读 + 创建     |
| **Plugins**       | 插件列表：加载顺序、hook 注册情况、执行耗时                                     | 只读            |
| **Cron Jobs**     | 定时任务管理：cron 表达式可视化编辑、手动触发、执行历史                         | CRUD + 触发     |
| **Storage/KV**    | 存储浏览器：unstorage 数据浏览、编辑、清理                                      | CRUD            |
| **Database**      | 数据库面板：Drizzle 表结构浏览、简单 SQL 查询（可选）                           | 只读 + 查询     |
| **Hooks**         | 钩子监控：所有 hookable 事件监听、耗时、调用链追踪                              | 只读            |
| **Virtual Files** | 虚拟文件查看：`.ubean/routes.d.ts`、`.ubean/pages.d.ts`、虚拟模块源码           | 只读            |
| **Terminal**      | 终端面板：内嵌终端，运行 `ubean page add`、`ubean api add` 等 CLI 命令          | 交互            |
| **AI Assistant**  | AI 聊天面板：自然语言驱动所有 CRUD 操作                                         | 对话            |

#### 配置管理 (Config Tab)

```typescript
// DevTools 中可视化编辑 ubean.config.ts
// 通过 AST 操作（ts-morph）安全修改配置文件，支持：
// - preset 切换
// - 路由/页面目录配置
// - 构建选项
// - 环境变量 schema
// - DevTools 自身配置
```

配置编辑通过 RPC 调用服务端接口：

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

#### 页面路由 CRUD (Pages Tab)

完整的页面路由增删改查能力，底层复用 CLI Shared Layer 的 `page add/delete/update` 逻辑（与 `ubean page *` 命令共用）：

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

页面创建时自动生成模板文件：

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

#### API 接口 CRUD (API Routes Tab)

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

API 创建时自动生成 handler 文件：

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

API 测试 Playground：在 DevTools 中直接填写参数、发送请求、查看响应（自动携带 cookie/auth header），类似 Postman 但零配置。

#### 钩子系统 (Hooks)

DevTools 所有操作前后触发 hookable 事件，用户可以注册钩子将数据同步到数据库、触发 CI/CD、或做权限校验：

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

**完整钩子列表**：

| Hook 名称                                | 参数                         | 说明                          |
| ---------------------------------------- | ---------------------------- | ----------------------------- |
| `page:beforeCreate`                      | `(input, ctx)`               | 页面创建前，可 throw 阻止操作 |
| `page:afterCreate`                       | `(result, ctx)`              | 页面创建后                    |
| `page:beforeUpdate`                      | `(name, patch, ctx)`         | 页面更新前                    |
| `page:afterUpdate`                       | `(name, ctx)`                | 页面更新后                    |
| `page:beforeDelete`                      | `(name, ctx)`                | 页面删除前                    |
| `page:afterDelete`                       | `(name, ctx)`                | 页面删除后                    |
| `api:beforeCreate`                       | `(input, ctx)`               | API 创建前                    |
| `api:afterCreate`                        | `(result, ctx)`              | API 创建后                    |
| `api:beforeUpdate`                       | `(method, path, patch, ctx)` | API 更新前                    |
| `api:afterUpdate`                        | `(method, path, ctx)`        | API 更新后                    |
| `api:beforeDelete`                       | `(method, path, ctx)`        | API 删除前                    |
| `api:afterDelete`                        | `(method, path, ctx)`        | API 删除后                    |
| `config:beforeUpdate`                    | `(patch, ctx)`               | 配置更新前                    |
| `config:afterUpdate`                     | `(config, ctx)`              | 配置更新后                    |
| `env:beforeCreate`                       | `(key, value, opts, ctx)`    | 环境变量创建前                |
| `env:afterCreate`                        | `(key, ctx)`                 | 环境变量创建后                |
| `env:beforeUpdate`                       | `(key, value, ctx)`          | 环境变量更新前                |
| `env:afterUpdate`                        | `(key, ctx)`                 | 环境变量更新后                |
| `env:beforeDelete`                       | `(key, ctx)`                 | 环境变量删除前                |
| `env:afterDelete`                        | `(key, ctx)`                 | 环境变量删除后                |
| `cron:beforeCreate` / `cron:afterCreate` | ...                          | Cron 任务 CRUD                |
| `devtools:ready`                         | `(ctx)`                      | DevTools 面板加载完成         |
| `ai:beforeToolCall`                      | `(toolName, args, ctx)`      | AI 调用工具前，可做权限/审计  |
| `ai:afterToolCall`                       | `(toolName, result, ctx)`    | AI 调用工具后                 |

> **Ctx 对象**包含当前用户信息（若配置了 DevTools 认证）、请求来源、时间戳等。

#### AI 助手 (AI Assistant Tab)

集成 LLM 大模型，通过自然语言对话驱动 DevTools 操作。AI 不直接写文件，而是调用 DevTools 的 RPC 方法（即 CRUD 接口），确保所有操作经过钩子校验：

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

**AI 对话交互示例**：

> **用户**：帮我创建一个产品管理模块，需要产品列表页和产品详情页，还有对应的 CRUD 接口
>
> **AI**：好的，我将为你创建以下内容：
>
> 1. 页面：`/products`（列表页）和 `/products/[id]`（详情页）
> 2. API：`GET/POST /api/products`、`GET/PATCH/DELETE /api/products/:id`
> 3. 都使用 default 布局
>
> 确认执行吗？
>
> **用户**：确认
>
> **AI**：✅ 已创建：
>
> - `pages/products/index.vue` (Products)
> - `pages/products/[id].vue` (ProductId)
> - `routes/products.ts` (GET/POST)
> - `routes/products/[id].ts` (GET/PATCH/DELETE)
>
> 需要为这些接口添加 OpenAPI 文档吗？

**AI 集成配置**：

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

#### RPC 通信层

基于 `postMessage` 实现类型安全的 RPC。DevTools 仅在开发模式与 loopback host 启用；RPC 握手生成一次性 session token，并将 iframe window、允许 origin 与 token 绑定。生产构建不得包含 DevTools RPC handler 或 AI provider 配置。

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

#### 文件操作安全

所有 DevTools 文件写入操作遵循以下安全策略：

1. **AST 操作优先**：修改 `.ts`/`.vue` 文件时使用 ts-morph 进行 AST 操作，而非字符串替换，保证代码格式正确
2. **操作前备份**：所有删除/覆写操作前自动备份到 `.ubean/backup/` 目录
3. **事务性写入**：先写临时文件，成功后 rename，避免写入中断导致文件损坏
4. **路径约束**：只允许读写项目根目录内、经 allowlist 允许的文件；拒绝符号链接逃逸、绝对路径与敏感文件
5. **最小权限**：AI 工具默认只读；每次写入、删除或执行命令前展示 diff 并要求用户明确确认
6. **操作确认**：涉及删除/批量修改时 UI 层二次确认
7. **Git 检测**：检测到 Git 仓库时建议用户先 commit；框架不自动创建 commit

#### DevTools 配置

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

#### UI 技术栈

DevTools 客户端（iframe 内的 Vue 应用）使用 **`@soybeanjs/ui`** **+** **`@soybeanjs/headless`** 构建：

- **`@soybeanjs/ui`**：提供 Button/Input/Select/Modal/Tree/Table/Tabs/Form/CodeEditor 等组件，统一设计语言
- **`@soybeanjs/headless`**：提供无样式的功能基元（组合式函数、状态管理）
- **CodeMirror 6**：代码编辑器（API Playground 编辑、虚拟文件查看），只读模式下也用于代码片段高亮显示
- **fuse.js**：路由/接口/组件模糊搜索
- DevTools 客户端作为独立 Vue 应用预构建为单文件（内联 CSS/JS），通过 Vite 虚拟模块注入，无需额外安装依赖

#### 可扩展自定义 Tab

用户/插件可以注册自定义 DevTools Tab：

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

## 4.13 CLI 命令系统

基于 `citty` 构建类型安全的命令行工具，**所有 DevTools 可视化操作均有对应的 CLI 命令**，实现 GUI 与 CLI 的功能对等。DevTools 服务端 RPC 与 CLI 共享底层 CRUD 逻辑（`cli/shared/fs-ops.ts`），保证两边操作结果一致。

#### 命令总览

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

#### CLI 与 DevTools 共享核心逻辑

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

- DevTools 面板通过 RPC 调用到 Vite 插件端，Vite 插件端调用 CLI Shared Layer 执行操作
- CLI 命令直接调用 CLI Shared Layer 执行操作
- 两边操作都会触发同一套 hooks（page:beforeCreate 等），保证钩子一致性
- CLI `--json` flag 支持机器可读输出，便于 CI/CD 集成

#### CLI 示例：创建页面

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

#### CLI 示例：创建 API 接口

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

用户项目 `package.json` 中可用的脚本（`ubean init` 自动生成）：

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

## 4.15 错误处理

#### 错误类型

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

#### 错误页面

ubean 在 `pages/` 根目录下自动检测三类特殊页面,无需手动配置即可生效:

| 文件 | 角色 | 作用 |
| --- | --- | --- |
| `pages/404.vue` | 未找到页面 | Vue Router catch-all `/:pathMatch(.*)*` + Hono `GET *` 兜底处理器;未匹配的浏览器导航返回 HTTP 404 并渲染该组件 |
| `pages/loading.vue` | 加载占位 | `<Suspense>` fallback 组件,在 SPA 导航懒加载页面组件期间显示 |
| `pages/error.vue` | 渲染错误兜底 | 错误边界(ErrorBoundary)组件,当页面组件渲染/异步解析/setup 抛出错误时显示,接收 `error` prop;路由切换时自动重置 |

- 仅根目录文件被视为特殊页面;`users/404.vue` 仍为常规路由 `/users/404`
- `loading.vue` 和 `error.vue` 仅在客户端生效(SSR 同步解析,无需 fallback;错误在 SSR 阶段由服务端错误处理器处理)
- 三类页面均可通过 `defineApp({ loadingComponent / errorComponent })` 显式覆盖,优先级高于文件自动检测

#### 开发模式错误展示

- 编译错误：Vite 错误覆盖层（默认）
- 运行时错误：DevTools 错误面板 + 控制台结构化输出
- HMR 错误：不刷新页面，保留当前状态显示错误

## 4.16 Markdown/MDX 页面（内置）

参考 void 的 `.md` 页面支持，ubean 原生支持 Markdown 作为页面路由。

#### 文件约定

- `pages/**/*.md` — Markdown 页面文件，与 `.vue` 页面同级混放
- `pages/**/*.mdx` — MDX 页面（支持 Vue 组件嵌入，可选）
- Markdown 文件被扫描时自动标记为 island（需要客户端 JS 来 hydrate Vue 组件）

#### Frontmatter 支持

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

<Counter client:visible />
```

- YAML frontmatter 通过 `front-matter` 解析，提取 `title`/`description`/`layout`/`meta`
- `layout: false` 可指定不使用布局
- Markdown 正文通过 [`markdown-exit`](https://github.com/serkodev/markdown-exit) 渲染（markdown-it 的 TypeScript 重写版，原生支持 async），通过 `@shikijs/markdown-exit` 插件集成 Shiki 提供代码语法高亮，无需额外 async 补丁
- 支持嵌入 Vue 组件，组件通过 client 指令控制 hydration 策略

#### MDX 真实编译（P9-20）

当 `markdown.mdx: true` 时，ubean 使用 `@mdx-js/mdx` 将 `.mdx` 文件编译为 Vue 组件（而非简单的 Markdown 渲染）。`@mdx-js/mdx` 是 optional peer dependency，需手动安装：

```bash
pnpm add @mdx-js/mdx
```

编译产物通过 `@ubean/markdown/jsx-runtime`（Vue 兼容的 JSX runtime，基于 Vue `h()` 函数）渲染，因此在 `.mdx` 文件中可以直接使用 JSX 语法和导入的 Vue 组件：

```mdx
---
title: My Post
---

import Counter from '~/components/Counter.vue'

# Hello MDX

This is **MDX** with real compilation.

<Counter client:visible />
```

若未安装 `@mdx-js/mdx`，ubean 会自动 fallback 为 plain Markdown 渲染（将 HTML 包裹在 Vue 组件中通过 `v-html` 输出），功能上等价于普通 `.md` 文件。

可通过 `markdown.remarkPlugins` 和 `markdown.rehypePlugins` 传递额外的 remark/rehype 插件：

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

#### 配置选项

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

## 4.17 Islands 孤岛架构

参考 void 的 islands 实现（Import Attributes 方式），ubean 采用更符合 Vue 习惯的 **Astro 风格 client 指令**，并在 Vite 插件层实现自动孤岛检测。

#### Client 指令

在 Vue 模板中通过指令标记孤岛组件的 hydration 策略：

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

#### `v-client.*` Vue 指令语法（P9-29，推荐）

`client:load` 等 HTML 属性语法在 Vue 模板中不属于标准 Vue 指令，IDE 和 eslint-plugin-vue 无法提供类型检查与自动补全。P9-29 将其重构为 **Vue 自定义指令** `v-client.*`，提供完整的 TypeScript 类型定义，同时保持与旧语法完全等价的编译时转换行为。

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

#### 语法迁移对照

| 旧语法 (`client:*`)                        | 新语法 (`v-client.*`)                          | 说明                     |
| ------------------------------------------ | --------------------------------------------- | ------------------------ |
| `<Comp client:load />`                     | `<Comp v-client.load />`                     | 立即水合                  |
| `<Comp client:idle />`                     | `<Comp v-client.idle />`                     | 空闲时水合                |
| `<Comp client:visible />`                  | `<Comp v-client.visible />`                  | 可见时水合                |
| `<Comp client:media="(max-width: 768px)"/>`| `<Comp v-client.media="'(max-width: 768px)'" />` | 媒体查询水合（值需引号） |
| `<Comp client:only />`                     | `<Comp v-client.only />`                     | 仅客户端                  |

> **注意**：两种语法完全等价，可在同一项目中混用。新代码推荐使用 `v-client.*` 语法。
>
> `v-client.media` 的值是 Vue 表达式，字符串字面量需要加引号（`"'(max-width: 768px)'"`），
> 也可使用变量（`v-client.media="mediaQuery"`）。旧语法 `client:media="(max-width: 768px)"` 的值是纯字符串。

#### 双层设计

`v-client` 指令采用双层架构：

1. **编译时（Vite 插件）**：`ubean:islands` Vite 插件检测模板中的 `v-client.*` 和 `client:*`，将其转换为 `<ubean-island>` 占位元素。这是 SSR/Islands 模式的主要代码路径。

2. **运行时（Vue 指令）**：当 Vite 插件未启用时（CSR-only 应用、单元测试、组件库），`vClient` 指令作为普通 Vue 指令注册在应用上，为元素标记 `data-client-directive` 等属性，使 `hydrateIslands()` 仍能发现并处理它们。

```typescript
// 框架自动注册（createUbeanApp 内部）：
app.directive('client', vClient);

// 手动注册（独立 Vue 应用）：
import { vClient } from '@ubean/islands';
app.directive('client', vClient);
```

#### TypeScript 类型定义

`v-client` 指令提供完整的类型定义，包括指令参数类型、修饰符类型和钩子函数类型：

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

#### API 速查

| API | 说明 |
| --- | --- |
| `vClient` | Vue 自定义指令对象（`Directive<HTMLElement, string \| undefined>`） |
| `resolveClientStrategy(modifiers)` | 从修饰符解析策略（`{ idle: true }` → `'idle'`） |
| `strategyToLegacyDirective(strategy)` | 策略转旧指令名（`'idle'` → `'client:idle'`） |
| `legacyDirectiveToStrategy(directive)` | 旧指令名转策略（`'client:idle'` → `'idle'`） |
| `applyStrategy(el, strategy, mediaQuery?)` | 直接对 DOM 元素应用策略 |
| `cleanupStrategy(el)` | 清理策略资源（observer/timer） |

#### 工作原理

1. **编译时扫描**：Vite 插件扫描 `.vue` 和 `.md` 文件，检测 `client:*` 和 `v-client.*` 指令
2. **自动 island 标记**：含 `client:*` 指令的组件自动作为孤岛组件，服务端渲染后客户端单独 hydrate
3. **客户端 JS 按需发送**：无孤岛组件的页面不发送客户端 JS（纯静态 HTML）
4. **Layout 链继承**：Layout 中的孤岛组件会传递给所有使用该 Layout 的页面
5. **Props 序列化**：孤岛组件的 props 通过协议序列化传递到客户端（仅支持 JSON 可序列化值）
6. **Markdown 自动孤岛**：含 Vue 组件或 `<script>` 的 `.md` 文件自动标记为需要客户端 bundle

#### 组件自动注册（零配置）+ 自动水合

ubean v1.0 起支持 **Islands 组件自动注册**，无需在 `app.ts` 中手动维护 `components` map。框架还会在客户端**自动水合**所有 islands，无需在 `onClientReady` 中手动调用 `hydrateIslands()`。

**工作流程**：

1. `ubeanIslandsPlugin` 在 transform 阶段扫描 `.vue` 文件，发现 `client:*` 指令时同步解析 `<script setup>` 的 import 语句
2. 将组件名（模板标签名）替换为 `<ubean-island v-once>` 自定义元素（v-once 防止 Vue re-render 覆盖已水合内容）
3. 将组件名与 import 路径建立映射，解析为绝对路径
4. 生成虚拟模块 `virtual:ubean-islands-registry`，导出所有收集到的 island 组件
5. `ubean/runtime/vue` 入口的 `hydrateIslands` 桥接函数自动导入虚拟注册表，与用户手动传入的 `components` 合并（手动优先）
6. 客户端入口在 `app.mount()` 后通过双重 `requestAnimationFrame` 自动调用 `hydrateIslands()`，确保 Vue 渲染循环完成后再水合
7. SPA 导航后通过 `router.afterEach` 自动水合新页面中的 islands

```typescript
// app.ts —— 零配置，无需任何 islands 相关代码
import { defineApp } from 'ubean/runtime/vue';

export default defineApp({
  // islands 自动注册、自动水合
});
```

**支持的 import 形式**：`import Foo from './Foo.vue'`、`import { default as Foo } from './Foo.vue'`、`import Foo, { bar } from './Foo.vue'`

**边缘场景处理**：

| 场景 | 处理方式 |
| --- | --- |
| 全局注册 / `defineAsyncComponent` / 动态 import | 无法静态分析 → 构建期输出警告，用户在 `onClientReady` 中通过 `hydrateIslands({ components })` 手动注册 |
| 同名组件不同文件 import 路径不同 | 警告，以首次发现的路径为准 |
| `node_modules` 中的组件 | 正常工作（bare specifier 原样传递给 Vite 解析） |
| dev 模式新增 island 用法 | transform 重新扫描 → 更新 registry → 失效虚拟模块 → full-reload（仅 HMR 更新时触发，初次加载不触发） |

> 详细设计见 [Islands 自动注册方案](islands-auto-registry.md)。

#### 对比 void 的 Import Attributes

| 方案                                               | 优点                                                    | 缺点                                                              |
| -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| void `import X from "..." with { island: "idle" }` | 标准语法、编译时静态分析                                | Vue `<script setup>` 中写 import 加属性较突兀；需配合模板使用不便 |
| ubean `client:*` 指令                              | Vue 开发者熟悉（类似 Nuxt/Astro）、模板中直观、渐进增强 | 自定义指令需编译转换                                              |

## 4.18 自动导入（内置，可配置）

自动导入分为两类，默认均启用，均可通过配置关闭。

#### Composables 自动导入（unimport）

自动导入项目 `composables/`、`utils/` 目录及 ubean 内置 composables，无需手动 import：

```typescript
// 无需 import，自动可用
const { t, locale, setLocale } = useI18n();
const user = useUser();
const data = await useLoaderData<typeof loader>();
const router = useRouter();
```

**自动扫描目录**：

- `composables/` — 自动导入所有导出（支持嵌套目录扫描，默认只扫描一级）
- `composables/index.ts` — 命名导出
- `utils/` — 工具函数（需开启配置）

#### Vue 组件自动导入（unplugin-vue-components）

自动导入项目 `components/` 目录下的 Vue 组件，无需在 script 中 import：

```vue
<template>
  <!-- 无需 import，自动注册 -->
  <BaseButton>Click</BaseButton>
  <Icon name="home" />
</template>
```

**自动扫描目录**：

- `components/` — 扫描所有 `.vue` 组件（支持嵌套目录，目录名作为命名空间：`Foo/Bar.vue` → `<FooBar />`）
- ubean 内置组件（`<Link>`、`<Head>`、`<ClientOnly>` 等）始终可用

#### 配置

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

#### 类型支持

自动生成 `.ubean/auto-imports.d.ts` 和 `.ubean/components.d.ts`，在 `tsconfig.json` 中自动引入。

## 4.19 i18n 国际化

ubean 提供轻量内置国际化支持（不引入 vue-i18n，保持零额外依赖），包括翻译引擎、路由中间件和文件扫描。

> **当前状态说明**：核心翻译引擎（`t()`/`setLocale()`/`defineLocale()`）和 i18n 路由中间件（三种策略、Accept-Language/cookie检测、自动重定向）已完成。Vue响应式集成、locales文件自动加载、SSR hydration、HTML lang/dir绑定、pluralization和Intl格式化为后续增强任务，详见 roadmap **P6-31~P6-35**。

#### 文件约定

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

> **注意**：pluralization（复数）、日期/数字/货币格式化（Intl）为 P6-34/P6-35 计划功能，当前版本使用参数插值（`{name}`）即可满足大部分场景。

#### Locale 检测与路由策略

支持三种 locale 路由策略：

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

**策略说明**：

- `prefix_except_default`：默认语言无前缀（/about），其他语言前缀（/en/about）— 默认
- `prefix`：所有语言均有前缀（/zh-CN/about、/en/about）
- `no_prefix`：无 URL 前缀，通过 cookie/header 切换

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

#### `<Link>` 组件自动处理 locale 前缀

```vue
<Link to="/about">About</Link>
<!-- 当前 locale=en 时渲染为 <a href="/en/about"> -->
<!-- 当前 locale=zh-CN 时渲染为 <a href="/about"> (default, prefix_except_default) -->
```

```vue
<Link :to="{ name: 'About', locale: 'ja' }">日本語</Link>
<!-- 强制指定 locale 前缀 -->
```

#### Loader 中获取 locale

```typescript
export const loader = defineLoader(c => {
  const locale = getLocale(c);
  // 根据 locale 返回不同数据
});
```

## 4.19b Color Mode 深浅色（P9-21）

ubean 内置深浅色（dark/light）模式支持，对齐 Nuxt `@nuxtjs/color-mode`。通过注入 no-FOUC（防闪烁）内联脚本到 `<head>`，在浏览器绘制前同步设置 `<html>` 的 class 或 `data-*` 属性，避免暗色模式切换时的闪烁。

#### 基本用法

```typescript
// 在任意 Vue 组件中使用（自动导入）
const colorMode = useColorMode();

colorMode.value;       // 'light' | 'dark' — 当前实际模式
colorMode.preference;  // 'system' | 'light' | 'dark' — 用户偏好
colorMode.set('dark'); // 设置偏好并持久化
colorMode.toggle();    // 在 modes 之间循环切换
```

#### 工作原理

1. **SSR / 构建时**：Vite 插件在 `transformIndexHtml` 阶段将 no-FOUC 脚本注入 `<head>` 最前面
2. **浏览器加载时**：脚本同步执行，从 cookie（SSR 友好）或 localStorage 读取偏好，若为 `system` 则检测 `prefers-color-scheme`
3. **Hydration 后**：`useColorMode()` composable 从 DOM 读取当前模式，提供响应式访问

#### 配置

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

设为 `false` 可完全禁用颜色模式：

```typescript
export default defineConfig({
  colorMode: false
});
```

#### 自定义模式

支持超过两种模式（如 sepia）：

```typescript
export default defineConfig({
  colorMode: {
    modes: ['light', 'dark', 'sepia'],
    classSuffix: ''  // → class="light" / "dark" / "sepia"
  }
});
```

#### CSS 配合

```css
/* 使用 class 模式（默认） */
html.light-mode { background: #fff; color: #333; }
html.dark-mode  { background: #1a1a1a; color: #eee; }

/* 使用 data 属性模式 */
html[data-color-mode="light"] { background: #fff; color: #333; }
html[data-color-mode="dark"]  { background: #1a1a1a; color: #eee; }
```

#### 路由级强制模式

通过 `forceColorMode()` / `unforceColorMode()` 可在路由级别强制颜色模式：

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

## 4.19c 第三方脚本优化 / Partytown（P9-22）

ubean 内置第三方脚本优化支持，对齐 Nuxt `@nuxtjs/scripts` 和 Astro Partytown 集成。通过 [Partytown](https://partytown.builder.io/) 将第三方脚本（Google Analytics、Facebook Pixel、GTM 等）移入 Web Worker 执行，不阻塞主线程，提升页面交互性能。

#### 基本用法

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

#### 加载策略

| 策略 | 说明 | 适用场景 |
| --- | --- | --- |
| `'load'` | 页面加载后立即加载（默认） | 关键脚本 |
| `'idle'` | 浏览器空闲时加载（`requestIdleCallback`） | 分析、埋点 |
| `'visible'` | 目标元素进入视口时加载（`IntersectionObserver`） | 视频、地图 |
| `'manual'` | 仅手动调用 `load()` 时加载 | 用户交互触发 |

```typescript
// visible 策略：元素进入视口时加载
const mapRef = ref<HTMLElement | null>(null);
useScript('https://maps.googleapis.com/maps/api/js', {
  trigger: 'visible',
  target: mapRef,
  rootMargin: '200px'  // 提前 200px 加载
});
```

#### Partytown 配置

在 `ubean.config.ts` 中启用 Partytown：

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

设为 `false`（默认）可禁用：

```typescript
export default defineConfig({
  partyTown: false
});
```

#### 工作原理

1. **构建时**：Vite 插件在 `transformIndexHtml` 阶段将 Partytown 配置脚本注入 `<head>`（设置 `window.partytown` 配置 + 加载 `partytown.js` lib）
2. **运行时**：`useScript()` 创建 `<script>` 标签，`partytown: true` 时设置 `type="text/partytown"`，Partytown 拦截并移入 Web Worker 执行
3. **主线程转发**：`forward` 配置的 API（如 `dataLayer.push`）自动从 Worker 转发到主线程

> **注意**：使用 Partytown 需要将 Partytown lib 文件复制到 `public/~partytown/` 目录。安装 `@builder.io/partytown` 后运行 `partytown copylib public/~partytown`。

#### API 速查

| API | 说明 |
| --- | --- |
| `useScript(src, options)` | 加载第三方脚本，返回 `{ script, loaded, error, load, remove, waitForLoad }` |
| `configurePartyTown(config)` | 全局配置 Partytown |
| `isPartyTownEnabled()` | 检查是否启用 |
| `getPartyTownScript(config)` | 生成内联配置脚本 HTML |
| `resolvePartyTownConfig(config)` | 合并默认配置 |

## 4.19d 流式 metadata（P9-24）

ubean 在流式 SSR 基础上支持动态 metadata 流式注入，对齐 Next.js streaming metadata。当页面组件在 `setup()` 内通过 `useHead()` / `useSeoMeta()` 添加 head 标签（如 `og:title`、`canonical`、动态 `title`）时，这些动态标签会被捕获并注入到流式响应中，确保 SEO 爬虫和社交机器人无需等待客户端水合即可看到完整 metadata。

#### 问题背景

流式 SSR 的核心优化是**先发送 `<head>` 再渲染 app**：浏览器在 app 渲染期间可提前加载 CSS/JS，显著改善 TTFB/LCP。但这带来一个 SEO 问题——组件 `setup()` 内的 `useHead()` 调用发生在 app 渲染期间，此时 `<head>` 已经发送完毕，动态添加的 `<meta>` / `<title>` / `<link>` 标签无法进入已发送的 `<head>`。

#### 解决方案

ubean 在流式渲染流程中增加动态 head 标签捕获与注入：

1. **快照静态 head**：流式开始前，调用 `renderSSRHead(head)` 记录静态 head 标签（来自 `defineApp` / `definePage` / locale）
2. **流式渲染 app**：Vue 组件 `setup()` 内的 `useHead()` 调用会向 head 实例追加新条目
3. **收集动态标签**：app 渲染完成后，再次调用 `renderSSRHead(head)` 获取完整 head，与静态快照对比，提取新增标签
4. **注入到 tail**：动态标签在 SSR state script 之后、tail 之前注入。浏览器会自动将 `<meta>` / `<title>` / `<link>` 标签移入 `<head>`

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

#### 工作原理

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

#### 启用条件

流式 metadata 依赖流式 SSR，需在 `ubean.config.ts` 中启用 `ssr.streaming`：

```typescript
export default defineConfig({
  ssr: {
    streaming: true  // 启用流式 SSR（自动启用流式 metadata）
  }
});
```

未启用流式 SSR 时，动态 head 标签通过 `transformHtmlTemplate` 在缓冲渲染中一次性注入（原有行为，不受影响）。

#### 与静态 head 的关系

| 来源 | 注入时机 | 位置 | 覆盖关系 |
| --- | --- | --- | --- |
| `defineApp({ head })` | 流式开始前 | `<head>` 内 | 被页面级 head 覆盖 |
| `definePage({ head })` / `pageObj.head` | 流式开始前 | `<head>` 内 | 覆盖 app 级 head |
| 组件内 `useHead()` | 流式渲染期间 | tail（浏览器移入 `<head>`） | 追加（不重复静态标签） |

> **注意**：动态 head 标签采用**追加**策略，不会覆盖或重复静态标签。`collectDynamicHeadTags` 通过逐行对比静态快照与完整 head，仅注入新增的标签行。

## 4.19e 全文搜索 / Pagefind（P9-26）

ubean 内置全文搜索支持，对齐 Astro Pagefind 集成。通过 [Pagefind](https://pagefind.app/) 在构建时索引生成的 HTML 文件，运行时提供客户端搜索 API，无需服务端数据库或搜索引擎。

#### 基本用法

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

构建时，Vite 插件自动运行 Pagefind CLI 索引 HTML 文件：

```
$ ubean build
  [ubean:pagefind] Search index generated successfully.
```

在 Vue 组件中使用 `useSearch()` composable（自动导入）：

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

#### 工作原理

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

#### 配置选项

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

#### composable 选项

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

#### 过滤与排序

通过 HTML 中的 `data-pagefind-filter` 属性标记过滤字段，然后在搜索时传入 filters：

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

#### API 速查

| API | 说明 |
| --- | --- |
| `useSearch(options?)` | 搜索 composable，返回响应式状态和搜索方法 |
| `initPagefind(options?)` | 手动加载 Pagefind 浏览器库 |
| `executeSearch(query, options)` | 底层搜索 API（无响应式状态） |
| `configureSearch(config)` | 全局配置搜索运行时 |
| `resolveSearchConfig(config)` | 合并默认配置 |
| `isPagefindLoaded()` | 检查 Pagefind 是否已加载 |

> **注意**：使用 Pagefind 需安装 `pagefind` CLI：`pnpm add -D pagefind`。未安装时构建会跳过索引并输出警告，不影响其他功能。

## 4.20 跨平台队列（Queues）

参考 void 的 Proxy 动态绑定模式，ubean 提供跨平台队列抽象。

#### 定义队列

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

#### 发送任务

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

#### 平台适配

| 平台               | 底层实现                          |
| ------------------ | --------------------------------- |
| Node.js            | BullMQ / 内存队列（开发模式）     |
| Cloudflare Workers | Cloudflare Queues（通过 binding） |
| Vercel             | Vercel Queues                     |
| Bun                | Bun 内置 Worker                   |
| Deno               | Deno Queue                        |

各 preset 在构建时根据平台注入对应的队列驱动实现，开发模式默认使用内存队列。

#### 类型生成

自动生成 `.ubean/queues.d.ts`，增强 `queues` 全局对象的类型（参考 void 的 Proxy 模式）：

```typescript
// 自动生成的类型
interface QueueMap {
  email: Queue<EmailJob>;
}
```

## 4.21 Better Auth 认证插件（官方可选）

基于 [Better Auth](https://better-auth.com) 的认证扩展包 `@ubean/auth`，独立包默认不进入生产 bundle。

#### 快速启用

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

#### 设计要点

- **渐进降级**：未安装 `better-auth` 包时自动 fallback 到内置 email/password 实现，保证零配置可用
- **Vite 插件**：自动在 dev server 挂载 `/api/auth/*` 路由（Hono 中间件），无需手动配置
- **虚拟模块**：`@ubean/auth/client` 提供类型安全的 auth client，零网络开销导入
- **`useAuth()` composable**：响应式 `session`/`user`/`isAuthenticated`/`isLoading`，onMounted + focus/visibilitychange 自动刷新
- **服务端 handler**：`createAuthHandler()` 暴露标准 Hono handler，支持任意框架集成
- **meta.public 配合**：`public: false` 的路由自动要求登录（需结合路由中间件）

## 4.22 类型安全 `<Link>` 组件

`<Link>` 组件的 `to` 属性类型化为项目中已定义的路由名称联合类型。

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

类型由自动生成的 `.ubean/pages.d.ts` 中的 `RouteName` 联合类型驱动，CLI/DevTools 添加/删除路由时自动更新。

## 4.23 Icon 图标扩展（官方可选）

参考 Nuxt Icon，ubean 通过独立的 `@ubean/icon` 提供统一、SSR 友好且默认不依赖公网的图标系统。它基于 Iconify 数据格式，但不将任意图标集或 Iconify API 作为核心运行时依赖。

#### 基础 API

安装 `@ubean/icon` 后，Vue 应用可自动使用 `<Icon>` 组件：

```vue
<template>
  <Icon name="lucide:search" size="20" aria-label="搜索" />
  <Icon name="brand:logo" class="brand-logo" />
  <Icon :name="isDark ? 'lucide:moon' : 'lucide:sun'" />
</template>
```

- 默认输出可继承 `currentColor` 的 SVG；`mode: 'css'` 为单色、静态图标提供 CSS mask 输出，`mode: 'svg'` 用于多色或需要 SVG 属性的图标。
- 默认尺寸为 `1em`，完整透传原生 SVG、ARIA 与 class/style 属性；装饰性图标默认 `aria-hidden="true"`，传入 `aria-label` 或 `title` 时自动输出可访问名称。
- `name` 使用 `collection:icon` 形式；支持显式 alias，禁止将任意用户输入直接拼接为远程图标 URL。
- 动态名称不会被静态扫描；必须在 `clientBundle.icons` 显式列出，避免生产环境或测试环境图标缺失。

#### 配置与本地数据集（Custom Local Collections）

图标集按需安装，避免全量 `@iconify/json` 显著增加安装、构建和 server bundle 体积：

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

- `customCollections` 将本地 SVG 目录转换为 Iconify collection；嵌套子目录自动以连字符前缀命名（`auth/login.svg` → `auth-login`）
- 构建期必须清理 SVG 中的 script、事件属性、外部引用和不安全 URL
- 静态扫描只收集 `<Icon name="...">` 与可静态求值的 name；扫描结果生成虚拟模块和 `.ubean/icons.d.ts`，供 client bundle、SSR 与 DevTools 共享
- Dev server `/_iconify` 路由优先查找本地 custom collection（命中则直接返回 SVG），未命中再 fallback 到 Iconify API
- 默认对超出 `clientBundle.sizeLimitKb` 的未压缩 bundle 失败构建，诊断应列出 collection、icon 数量和可改为按需服务的名称
- HMR 支持：新增/修改/删除 SVG 文件自动热更新，无需重启 dev server

#### 提供者与平台语义

图标解析的优先级固定为：client bundle -> 本地 collection/server bundle -> 显式配置的远程 provider。生产默认不回退 Iconify 公共 API；开发期远程回退必须显式开启并在终端给出提示。

| 场景                    | 默认策略                                                                          | 不满足条件时的行为                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Node SSR                | 本地安装的 collection 按 collection 动态加载，`/_ubean/icon/:collection` 按需服务 | 缺失 collection 返回开发诊断；生产构建失败或使用已配置远程 provider |
| 静态 SSG / `ssr: false` | 将扫描和显式声明的图标写入 client bundle                                          | 对未声明的动态 icon 进行构建诊断；不得依赖本地 server endpoint      |
| Edge / serverless       | capability matrix 决定内联、远程 collection CDN 或仅 client bundle                | 不支持动态 JSON import 时必须选定可用策略，禁止静默请求公共 API     |
| Vitest / 浏览器组件测试 | `provider: 'none'` + client bundle                                                | 测试不得访问网络；漏列的动态名称应使测试配置或断言失败              |

`@ubean/icon` 应暴露 Vite plugin，以便纯 Vite Vue 项目也可复用静态扫描与预打包逻辑；ubean 框架集成仅负责自动注册组件、虚拟模块、SSR endpoint 及 preset capability 诊断。

## 4.24 页面切换动画（View Transitions API）

基于浏览器原生 [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) 实现页面导航过渡效果，不依赖第三方动画库。

#### 基本用法

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

#### 配置

```typescript
// ubean.config.ts
export default defineConfig({
  viewTransition: {
    enabled: true // 默认 true，自动检测浏览器支持
    // 不支持 View Transitions 的浏览器自动 fallback（无动画，不阻塞导航）
  }
});
```

#### 元素级过渡

支持通过 `view-transition-name` CSS 属性给共享元素命名，实现跨页面共享元素过渡（如图片放大转场）：

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

#### 实现要点

- 客户端路由（`<Link>` 导航、`router.push()`）使用 `document.startViewTransition()` 包裹 DOM 更新
- 浏览器不支持 View Transitions API 时自动降级为普通导航，无 JS 错误
- SSR 首屏加载不触发过渡动画（仅客户端路由切换触发）
- 保持页面滚动位置，避免过渡期间布局跳动

## 4.25 PWA 渐进式Web应用（官方可选 `@ubean/pwa`）

提供零配置 Service Worker 注册、Web App Manifest 生成和离线缓存策略，参考 vite-plugin-pwa。

#### 快速启用

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

#### usePwa() Composable

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

#### 缓存策略

内置 5 种 runtimeCaching 策略：

| 策略                     | 适用场景                       | 说明                   |
| ------------------------ | ------------------------------ | ---------------------- |
| `cache-first`            | 静态资源（图片、字体、JS/CSS） | 缓存优先，后台更新     |
| `network-first`          | API/HTML                       | 网络优先，离线回退缓存 |
| `stale-while-revalidate` | 字体、非关键API                | 缓存立即返回+后台更新  |
| `network-only`           | 支付/认证等                    | 仅网络，失败报错       |
| `cache-only`             | 预缓存资源                     | 仅缓存，不发请求       |

默认 runtimeCaching 规则自动覆盖：images（`/img/**`, `/assets/**`）、fonts（Google Fonts等）、assets（静态资源）、api（`/api/**` 使用 stale-while-revalidate）、pages（HTML导航使用 network-first）。

#### 设计要点

- 构建时自动生成带 content hash 的 precache manifest，确保版本更新
- HTML 自动注入 `<link rel="manifest">`、theme-color meta、Apple touch icon
- 三种注册模式：`autoUpdate`（自动更新）、`prompt`（提示用户确认）、`manual`（手动调用 register()）
- Service Worker 文件在构建时输出到 `.output/public/sw.js`
- DevTools 可查看 SW 注册状态和缓存列表

---

## 4.26 Pinia 状态管理（官方可选 `@ubean/pinia`）

ubean 通过 `@ubean/pinia` 提供 Pinia 集成的薄封装层。它不重新导出 Pinia API,而是负责两件事:

1. **dev 预构建优化** — 将 `pinia` 加入 Vite 的 `optimizeDeps.include`,避免首次请求扫描延迟
2. **SSR 状态水合辅助** — 提供 `serializePiniaState` / `hydratePiniaState` 函数,配合 `defineApp({ serializeState, hydrateState })` 钩子完成服务端状态序列化与客户端水合

Pinia 本身仍从 `pinia` 包导入(`createPinia`/`defineStore`/`storeToRefs` 等),`@ubean/pinia` 仅提供集成胶水。

### 快速启用

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true
});
```

然后在 `src/app.ts` 中注册 Pinia 插件和 SSR 水合钩子:

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

### 定义与使用 Store

Store 定义与常规 Pinia 完全一致:

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

在页面或组件中使用:

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

### SSR 状态水合流程

ubean 的 SSR 状态协议通过 `defineApp` 的两个钩子实现:

1. **服务端渲染** — `renderToString(app)` 完成后,ubean SSR 渲染器调用 `serializeState(app)`。`serializePiniaState` 从 `app.config.globalProperties.$pinia.state.value` 提取状态,返回 `{ pinia: ... }`。

2. **HTML 注入** — 渲染器将状态对象序列化为 JSON,注入到 HTML 的 `<script id="__UBEAN_STATE__" type="application/json">` 标签中。

3. **客户端水合** — 客户端入口在 `applyAppConfig`(注册 `createPinia()` 插件)之后、`app.mount()` 之前调用 `hydrateState(app, state)`。`hydratePiniaState` 将 `state.pinia` 赋值给 `pinia.state.value`。

> 必须在 `mount` 前执行水合,否则 store 已用默认 state 初始化,水合无效。ubean 的客户端入口已确保此顺序。

### 配置选项

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

显式配置示例:

```ts
// ubean.config.ts
export default defineConfig({
  pinia: { optimizeDeps: false } // 禁用 dev 预构建(如使用 monorepo 内的 pinia 源码)
});
```

### 程序化 API

```ts
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/pinia/vite';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/pinia';
```

- `ubeanPiniaPlugin(options?: UbeanPiniaOptions): Plugin[]` — Vite 插件,通常由模块系统自动调用
- `definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions` — 类型安全的配置辅助函数
- `serializePiniaState(app): PiniaSerializedState` — SSR 序列化,未检测到 `$pinia` 时返回空对象
- `hydratePiniaState(app, state): void` — 客户端水合,`state` 为 null 或不含 `pinia` 字段时 no-op

### 设计要点

- **零侵入**:Pinia 本身仍从 `pinia` 包导入,`@ubean/pinia` 仅提供 Vite 插件和 SSR 水合辅助函数,不重新导出 Pinia API
- **协议复用**:通过 ubean 的 `serializeState`/`hydrateState` 钩子集成,不引入并行的状态模型
- **安全降级**:`serializePiniaState` 在未检测到 `$pinia` 时返回空对象;`hydratePiniaState` 在 `state` 为 null 或不含 `pinia` 字段时 no-op,允许在 CSR 模式或无 SSR state 时安全调用
- **配置错误提示**:若 `hydrateState` 被调用但 app 上未检测到 `$pinia`(未注册 `createPinia()` 插件),会在控制台输出明确警告

---
