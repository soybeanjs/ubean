# 运行时与开发体验 (defineApp)

与 void 硬编码 `createSSRApp(App)` 不同，ubean 提供 `defineApp` 函数让用户完全控制 Vue 应用实例的创建和配置，支持注册插件、全局组件、指令、provide/inject 等。

#### 设计理念

用户在项目根目录创建 `app.ts`（或 `app.ts`/`app.server.ts`/`app.client.ts` 区分服务端/客户端），通过 `defineApp` 导出一个工厂函数，该函数接收必要参数（如 Vue App 实例、router、运行时配置等）并返回配置后的 app 实例。

```typescript
// app.ts
import { defineApp } from 'ubean/vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createHead } from '@unhead/vue';
import GlobalComponent from './src/components/GlobalComponent.vue';

export default defineApp(({ app, router, ssrContext }) => {
  // 注册插件
  const pinia = createPinia();
  app.use(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': { hello: '你好' },
      'en-US': { hello: 'Hello' }
    }
  });
  app.use(i18n);

  // 全局组件注册
  app.component('GlobalComponent', GlobalComponent);

  // 全局指令
  app.directive('focus', {
    mounted(el) {
      el.focus();
    }
  });

  // provide/inject
  app.provide('appVersion', '1.0.0');

  // 全局错误处理
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Error]', err, info);
  };

  // SSR 特有: 可以访问 ssrContext
  if (ssrContext) {
    ssrContext.teleports = {};
  }

  // 返回 app 实例 (支持链式创建或替换 app)
  return app;
});
```

#### 服务端/客户端分离

```typescript
// app.server.ts — 仅在 SSR 时执行
import { defineApp } from 'ubean/vue';

export default defineApp(({ app, ssrContext }) => {
  // SSR 特有逻辑，如注入 SSR 状态
  return app;
});

// app.client.ts — 仅在客户端水合时执行
import { defineApp } from 'ubean/vue';

export default defineApp(({ app, router }) => {
  // 客户端特有逻辑，如 PWA 注册、客户端分析埋点等
  return app;
});
```

#### defineApp 参数类型

```typescript
// src/types/app.ts
import type { App as VueApp } from 'vue';
import type { Router } from 'vue-router';
import type { UbeanRuntimeConfig } from './runtime';

export interface DefineAppContext {
  /** Vue 应用实例 (createSSRApp 创建) */
  app: VueApp;
  /** 客户端路由器（仅客户端） */
  router?: Router;
  /** SSR 上下文（仅服务端） */
  ssrContext?: {
    teleports?: Record<string, string>;
    [key: string]: unknown;
  };
  /** 运行时配置 */
  runtimeConfig: UbeanRuntimeConfig;
  /** Page 组件（根组件，即 App.vue 或自动生成的 Pages 包装器） */
  rootComponent: unknown;
}

export type DefineApp = (ctx: DefineAppContext) => VueApp | void | Promise<VueApp | void>;
export function defineApp(fn: DefineApp): DefineApp;
```

#### 入口生成流程

1. 构建时扫描项目根目录是否存在 `app.ts` / `app.server.ts` / `app.client.ts`
2. 如果不存在，使用默认入口（createSSRApp + 自动 mount/hydrate）
3. 如果存在，生成虚拟入口模块：
   - 服务端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); await appConfig({ app, ssrContext, runtimeConfig, rootComponent }); renderToString(app)`
   - 客户端: `import appConfig from '<app.ts>'; const app = createSSRApp(RootComponent); appConfig({ app, router, runtimeConfig, rootComponent }); app.mount('#app')`
4. 支持 app.server.ts 和 app.client.ts 的条件合并（服务端执行 app.ts + app.server.ts，客户端执行 app.ts + app.client.ts）

#### 与 void 对比

| 方面              | void (硬编码)                  | ubean (defineApp)                      |
| ----------------- | ------------------------------ | -------------------------------------- |
| App 实例创建      | 内部硬编码 `createSSRApp(App)` | 用户可通过 defineApp 完全控制          |
| 插件注册          | 不支持（需手动改入口）         | 原生支持 `app.use(plugin)`             |
| 全局组件          | 不支持                         | 支持 `app.component()`                 |
| SSR 上下文        | 无法访问                       | 通过 `ssrContext` 参数暴露             |
| 服务端/客户端分离 | 不支持                         | `app.server.ts` / `app.client.ts` 分离 |
| 默认行为          | 固定模板                       | 无 app.ts 时自动降级为默认行为         |

## 4.8 类型安全 Fetch 客户端 (ofetch + XHR upload adapter)

提供以 `ofetch` 为默认传输层、基于标准 Fetch API 语义的强类型 HTTP 客户端，支持两种使用模式：

**模式 A：直接使用 OpenAPI 生成的 paths 类型**（推荐，零额外类型定义）
**模式 B：手动创建 request 实例 + 自定义类型映射**

核心设计：

- 默认通过 `$fetch.create()` 发起请求，兼容浏览器、Node、Deno 与 edge runtime
- 复用 ofetch 的 `onRequest`、`onResponse`、`onRequestError`、`onResponseError`、超时、重试和响应解析能力
- 运行时零依赖 OpenAPI spec，仅在 TypeScript 层面消费由 ubean 自动生成的 `./ubean/routes.d.ts` 中的 `paths` 类型
- 支持标准模式（throw on error）和扁平模式（`{ data, error }` never throws）
- 自动将路径参数（`{id}`/`:id`）从 params 中提取替换
- `internalFetch` 直接调度当前 Hono handler，不经过网络
- 上传请求提供 `onUploadProgress` 时，浏览器客户端自动选择 `XMLHttpRequest.upload` 传输；未提供时始终使用 ofetch
- XHR 适配器仅支持浏览器环境；在 Node、Deno、edge runtime 或 SSR 中传入 `onUploadProgress` 必须抛出 `UbeanTransportUnsupportedError`，不得静默忽略回调
- XHR 适配器与 ofetch 共用 URL、query、headers、body、超时、取消、响应解析和 `UbeanFetchError` 契约；`internalFetch` 不支持上传进度

```typescript
// src/api/client.ts
import { createClient } from 'ubean/client';
import type { paths } from '../../.ubean/routes'; // ubean 自动生成

// 标准客户端（抛异常模式）
export const client = createClient<paths>({
  baseURL: '/api',
  // ofetch 客户端配置
  timeout: 10000,
  // 请求中间件
  onRequest(config) {
    // 自动注入 token
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  onError(error) {
    if (error.status === 401) {
      // 跳转到登录页
    }
  }
});

// 扁平客户端（不抛异常，返回 { data, error }）
export const flatClient = createFlatClient<paths>({ baseURL: '/api' });
```

#### 使用方式

```typescript
// 在 Vue 组件/composable 中使用
import { client } from '@/api/client';

// 路径、参数、请求体、响应类型全部自动推导
const user = await client.get('/users/{id}', {
  params: {
    path: { id: '123' }, // 路径参数
    query: { include: 'posts' } // query 参数
  }
});
// user 的类型自动从 OpenAPI schema 推导：{ id: string; name: string; email: string }

const result = await client.post('/auth/login', {
  body: { email: 'user@example.com', password: '123456' } // body 自动类型检查
});

const upload = await client.post('/assets', {
  body: formData,
  onUploadProgress(event) {
    // total 可能未知；仅在 lengthComputable 为 true 时计算百分比
    const percent = event.total ? Math.round((event.loaded / event.total) * 100) : undefined;
    updateUploadProgress({ loaded: event.loaded, total: event.total, percent });
  }
});

// 扁平模式：不 try-catch，通过返回值判断
const { data, error } = await flatClient.get('/users/{id}', {
  params: { path: { id: '123' } }
});
if (error) {
  console.error('请求失败:', error.message);
} else {
  console.log('用户:', data);
}
```

#### 浏览器文件上传进度

浏览器标准 Fetch API 仍未提供可互操作的上传进度事件，因此上传进度不能由 ofetch 自身实现。`onUploadProgress` 是显式的传输能力开关：仅该字段存在时由 `ubean/client-xhr` 使用 `XMLHttpRequest.upload.onprogress`；普通 JSON、下载和无进度回调的上传继续使用 ofetch。

```typescript
export interface UploadProgressEvent {
  loaded: number;
  total?: number;
  lengthComputable: boolean;
}

export interface UbeanRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  onUploadProgress?: (event: UploadProgressEvent) => void;
}
```

- `FormData` 直接传给 XHR；适配器不得手动设置 `Content-Type`，以保留浏览器生成的 multipart boundary。
- XHR 必须实现 `AbortSignal`、timeout、network error、HTTP error、`responseType` 和响应 headers 的映射，并将结果归一为与 ofetch 相同的 `UbeanFetchError` / flat result。
- XHR 不支持 Fetch 的 `Request`/`Response` 流式 body 语义；传入 `ReadableStream`、Fetch 专属 `dispatcher` 或不可映射选项时必须在调用前诊断。
- 下载进度不是本期 API；如后续加入，使用独立 `onDownloadProgress` 并明确 XHR 与 Fetch 流读取的兼容范围。

#### 服务端使用 (loader/action 中)

```typescript
// routes/users.ts
import { defineHandler } from 'ubean/handler';
import { internalFetch } from 'ubean/internal';

export const GET = defineHandler(async c => {
  // 服务端直接调用内部路由，无需经过 HTTP
  const result = await internalFetch(c).get('/api/health');
  return c.json(result);
});
```

#### 自动类型生成

ubean 在构建/开发时扫描 `routes/` 目录，自动生成 `.ubean/routes.d.ts`：

- 从 `defineMeta({ openAPI: { ... } })` 和文件级 `export const meta` 提取 OpenAPI Operation 定义
- 从 handler 的 TypeScript 类型推导参数和响应类型（辅助）
- 生成符合 OpenAPI 3.1 `paths` 结构的类型文件
- 兼容 `openapi-typescript` 生成的格式，可直接被 `ubean/client` 的 ofetch/XHR typed client 消费
- 开发模式下 HMR 自动更新类型

```typescript
// .ubean/routes.d.ts (自动生成)
export interface paths {
  '/users/{id}': {
    get: {
      parameters: {
        path: { id: string };
        query?: { include?: string };
      };
      responses: {
        200: { content: { 'application/json': { user: User } } };
        404: { content: { 'application/json': { error: string } } };
      };
    };
    patch: {
      parameters: { path: { id: string } };
      requestBody: { content: { 'application/json': Partial<User> } };
      responses: { 200: { content: { 'application/json': { success: boolean } } } };
    };
  };
  '/auth/login': {
    post: {
      requestBody: { content: { 'application/json': { email: string; password: string } } };
      responses: { 200: { content: { 'application/json': { token: string } } } };
    };
  };
}
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
import { defineScheduled } from 'ubean/cron';
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
import { defineEnv, string, number, boolean, url } from 'ubean/env';

export const env = defineEnv({
  // 服务端密钥
  DATABASE_URL: string().secret(),
  API_SECRET: string().secret().optional(),

  // 公共变量 (VITE_ 前缀自动暴露到客户端)
  VITE_APP_NAME: string().default('My App'),
  VITE_API_URL: url(),

  // 类型转换
  PORT: number().default(3000),
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
2. 环境变量 `UBEAN_PRESET`
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
import { definePage } from 'ubean/pages';

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
  withOpenAPI?: boolean; // 是否生成 OpenAPI 文档骨架
  withValidator?: boolean; // 是否生成 defineValidator 骨架
}
```

API 创建时自动生成 handler 文件：

```typescript
// DevTools 创建 routes/users.ts 时生成
import { defineHandler, defineMeta } from 'ubean/handler';

export const GET = defineHandler(
  defineMeta({
    openAPI: {
      tags: ['Users'],
      summary: 'List users',
      responses: { 200: { description: 'OK' } }
    }
  }),
  async c => {
    return c.json({ users: [] });
  }
);

export const POST = defineHandler(
  defineMeta({
    openAPI: {
      tags: ['Users'],
      summary: 'Create user'
    }
  }),
  async c => {
    const body = await c.req.json();
    return c.json({ success: true }, 201);
  }
);
```

API 测试 Playground：在 DevTools 中直接填写参数、发送请求、查看响应（自动携带 cookie/auth header），类似 Postman 但零配置。

#### 钩子系统 (Hooks)

DevTools 所有操作前后触发 hookable 事件，用户可以注册钩子将数据同步到数据库、触发 CI/CD、或做权限校验：

```typescript
// app.ts 或 plugins/devtools-hooks.ts
import { defineApp } from 'ubean/vue';
import { useDevToolsHooks } from 'ubean/devtools';

export default defineApp(({ app }) => {
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

  return app;
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
     * @default '/__ubean_devtools__'
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
import { defineDevToolsTab } from 'ubean/devtools';

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

- `error.vue` — 在 pages/ 根目录创建自定义错误页
- `error.[statusCode].vue` — 特定状态码错误页（如 `error.404.vue`）
- 支持服务端和客户端错误统一展示
- DevTools 中提供错误详情面板（堆栈、请求信息）

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

#### 配置选项

```typescript
// ubean.config.ts
export default defineConfig({
  markdown: {
    enabled: true, // 默认 true，设为 false 禁用
    mdx: false, // 是否启用 MDX 支持
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
      // 自动导入的 Vue 组件可在 md 中使用
      autoImport: true
    }
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

#### 工作原理

1. **编译时扫描**：Vite 插件扫描 `.vue` 和 `.md` 文件，检测 `client:*` 指令
2. **自动 island 标记**：含 `client:*` 指令的组件自动作为孤岛组件，服务端渲染后客户端单独 hydrate
3. **客户端 JS 按需发送**：无孤岛组件的页面不发送客户端 JS（纯静态 HTML）
4. **Layout 链继承**：Layout 中的孤岛组件会传递给所有使用该 Layout 的页面
5. **Props 序列化**：孤岛组件的 props 通过协议序列化传递到客户端（仅支持 JSON 可序列化值）
6. **Markdown 自动孤岛**：含 Vue 组件或 `<script>` 的 `.md` 文件自动标记为需要客户端 bundle

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

void 和 nitro 均未内置 i18n，ubean 提供轻量内置国际化支持。

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
  messages: {
    welcome: '欢迎',
    'nav.home': '首页',
    'user.greeting': '你好，{name}',
    'items.count': '{count} 个项目 | {count} 个项目' // 复数支持
  }
});
```

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
t('items.count', { count: 5 }, 5); // '5 个项目'（复数）

// 切换 locale
setLocale('en');
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

## 4.20 跨平台队列（Queues）

参考 void 的 Proxy 动态绑定模式，ubean 提供跨平台队列抽象。

#### 定义队列

```typescript
// queues/email.ts
import { defineQueue } from 'ubean/queue';

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
export const POST = defineHandler(defineValidator({ json: z.object({ email: z.string().email() }) }), async c => {
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

## 4.21 Better Auth 集成插件

参考 void 的 Better Auth 集成，以官方插件形式提供（非内置核心），遵循 ubean 的 meta.public 中间件鉴权模式。

```typescript
// plugins/auth.ts
import betterAuth from '@ubean/auth/better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export default betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  trustedOrigins: ['http://localhost:3000'],
  socialProviders: {
    github: { clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET }
  }
});
```

- 插件自动注册 `/api/auth/*` 路由
- 自动注入 auth 中间件，处理鉴权状态
- 提供 `useAuth()` composable（服务端/客户端通用）
- `c.get('user')` / `c.get('session')` 在 handler 中获取当前用户
- 与 `meta.public` 配合：`public: false` 的路由自动要求登录
- Vue 客户端导出 `authClient` 实例（参考 void 的 auth-client-vue 模式）

## 4.22 类型安全 `<Link>` 组件

`<Link>` 组件的 `to` 属性类型化为项目中已定义的路由名称联合类型。

```vue
<script setup lang="ts">
import { Link } from 'ubean/pages';
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

#### 配置与本地数据集

图标集按需安装，避免全量 `@iconify/json` 显著增加安装、构建和 server bundle 体积：

```bash
pnpm add -D @iconify-json/lucide @iconify-json/logos
```

```typescript
// ubean.config.ts
export default defineConfig({
  icon: {
    mode: 'svg',
    aliases: {
      search: 'lucide:search',
      github: 'logos:github-icon'
    },
    customCollections: [{ prefix: 'brand', dir: './assets/icons', recursive: true }],
    clientBundle: {
      scan: true,
      icons: ['lucide:search'],
      sizeLimitKb: 256
    },
    serverBundle: 'auto'
  }
});
```

- `customCollections` 将本地 SVG 转换为 Iconify collection；构建期必须清理 SVG 中的 script、事件属性、外部引用和不安全 URL。
- 静态扫描只收集 `<Icon name="...">` 与可静态求值的 name；扫描结果生成虚拟模块和 `.ubean/icons.d.ts`，供 client bundle、SSR 与 DevTools 共享。
- 默认对超出 `clientBundle.sizeLimitKb` 的未压缩 bundle 失败构建，诊断应列出 collection、icon 数量和可改为按需服务的名称。

#### 提供者与平台语义

图标解析的优先级固定为：client bundle -> 本地 collection/server bundle -> 显式配置的远程 provider。生产默认不回退 Iconify 公共 API；开发期远程回退必须显式开启并在终端给出提示。

| 场景                    | 默认策略                                                                          | 不满足条件时的行为                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Node SSR                | 本地安装的 collection 按 collection 动态加载，`/_ubean/icon/:collection` 按需服务 | 缺失 collection 返回开发诊断；生产构建失败或使用已配置远程 provider |
| 静态 SSG / `ssr: false` | 将扫描和显式声明的图标写入 client bundle                                          | 对未声明的动态 icon 进行构建诊断；不得依赖本地 server endpoint      |
| Edge / serverless       | capability matrix 决定内联、远程 collection CDN 或仅 client bundle                | 不支持动态 JSON import 时必须选定可用策略，禁止静默请求公共 API     |
| Vitest / 浏览器组件测试 | `provider: 'none'` + client bundle                                                | 测试不得访问网络；漏列的动态名称应使测试配置或断言失败              |

`@ubean/icon` 应暴露 Vite plugin，以便纯 Vite Vue 项目也可复用静态扫描与预打包逻辑；ubean 框架集成仅负责自动注册组件、虚拟模块、SSR endpoint 及 preset capability 诊断。

---
