---
title: Routing
---

# Routing

ubean adopts void's **named export convention**: a single file defines multiple HTTP method handlers via named exports such as `export const GET` and `export const POST`. At build time, exported methods are detected through static AST scanning.

#### Route File Conventions

- File names do not include method suffixes (unlike nitro's `.get.ts`/`.post.ts`)
- The method is determined by top-level named exports: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`
- `export default` is supported as a fallback handler (matches all methods not explicitly defined)
- Files prefixed with `_` are private and are not registered as routes
- Environment suffixes are supported: `.dev.ts` (development only), `.prod.ts` (production only)

#### defineHandler API Design

Drawing on hono-ssr's `createDefineRoute` type inference pattern, `defineHandler` accepts a **middleware chain composed of multiple handlers** by default (a single handler is the special case where the chain length is 1). `defineHandlerMeta` is exported as a standalone handler function and is passed directly into the `defineHandler` chain. Request validation and OpenAPI document definitions use the `validator` and `describeRoute` middleware provided by hono-openapi (re-exported directly from ubean); the custom `defineValidator` is no longer used, and `defineHandlerMeta` no longer accepts the `{ openAPI: {...} }` form of configuration.

**Core Design Principles**:

- All handlers (including meta, validator, and business logic) are unified in calling form as `defineHandler(h1, h2, ..., finalHandler)`
- Types are inferred automatically by hono-openapi's `validator` middleware: the param/query/json/form/header/cookie types defined by `validator(target, schema)` flow to all subsequent handlers and are accessed via `c.req.valid(target)`
- The `describeRoute` middleware is used to define OpenAPI document metadata (tags, summary, description, operationId, deprecated, responses) and is automatically collected by hono-openapi
- `defineHandlerMeta` is a pass-through middleware at runtime (`(c, next) => next()`), only extracted by AST at build time; it carries ubean-specific metadata (`public`, `cache`, `rateLimit`, and custom extension fields)
- Responses use Hono Context methods directly: `c.json()`, `c.html()`, `c.text()`, `c.redirect()`, `c.header()`

```typescript
// routes/users/[id].ts
import { defineHandler, defineHandlerMeta, defineMiddleware, validator, describeRoute, resolver } from 'ubean';
import { z } from 'zod';

// 权限中间件示例
const requireAdmin = defineMiddleware(async (c, next) => {
  if (c.get('user')?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});

const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string().email() });
const userUpdateSchema = z.object({ name: z.string().optional(), email: z.string().email().optional() });
const idParamSchema = z.object({ id: z.string() });
const includeQuerySchema = z.object({ include: z.string().optional() });

// GET /users/:id — 获取用户详情
// describeRoute、validator、defineHandlerMeta 作为 handler 链的一部分传入
export const GET = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Get user by ID',
    description: 'Retrieve a single user by their unique ID',
    responses: {
      200: {
        description: 'User found',
        content: { 'application/json': { schema: resolver(z.object({ user: userSchema })) } }
      },
      404: { description: 'User not found' }
    }
  }),
  defineHandlerMeta({
    public: false,
    cache: { ttl: 60 },
    rateLimit: { max: 100, window: 60 }
  }),
  validator('param', idParamSchema),
  validator('query', includeQuerySchema),
  async c => {
    // ✅ 类型推导: c.req.valid('param') → { id: string }
    // ✅ 类型推导: c.req.valid('query') → { include?: string }
    const { id } = c.req.valid('param');
    const { include } = c.req.valid('query');
    const user = await db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ user });
  }
);

// PATCH /users/:id — 更新用户（需要管理员权限）
export const PATCH = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Update user',
    responses: {
      200: {
        description: 'Updated',
        content: { 'application/json': { schema: resolver(z.object({ success: z.boolean() })) } }
      }
    }
  }),
  defineHandlerMeta({ public: false }),
  validator('param', idParamSchema),
  validator('json', userUpdateSchema),
  async c => {
    // ✅ c.req.valid('param') → { id: string }
    // ✅ c.req.valid('json') → { name?: string; email?: string }
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    await db.update(users).set(body).where(eq(users.id, id));
    return c.json({ success: true });
  }
);

// DELETE /users/:id — 删除用户（管理员 + 中间件链 + 类型推导）
export const DELETE = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Delete user',
    responses: {
      200: {
        description: 'Deleted',
        content: { 'application/json': { schema: resolver(z.object({ success: z.boolean() })) } }
      }
    }
  }),
  defineHandlerMeta({}),
  validator('param', idParamSchema),
  requireAdmin, // 自定义中间件在 validator 之后，可以访问 c.req.valid('param')
  async c => {
    // ✅ requireAdmin 中也可以使用 c.req.valid('param') 获取 id
    const { id } = c.req.valid('param');
    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true });
  }
);
```

> **Design Note**: `describeRoute`, `validator`, and `defineHandlerMeta` are flexible in placement — they are typically placed at the front of the chain (`describeRoute` for OpenAPI collection, `validator` to fail fast on validation errors, `defineHandlerMeta` for AST extraction), but they can also be placed after specific middleware. At runtime, execution follows chain order, and types accumulate automatically from left to right via hono-openapi's validator middleware.

#### File-Level Shared meta (optional `export const meta`)

When multiple methods in the same file share the same ubean-specific meta (such as `public`, `cache`, `rateLimit`, and custom extension fields), you can define file-level defaults via a top-level `export const meta`. Fields with the same name in `defineHandlerMeta` deeply override the file-level values:

```typescript
// routes/users/[id].ts
import { defineHandler, defineHandlerMeta } from 'ubean';

export const meta = {
  cache: { ttl: 60 }
};

// GET 继承文件级 cache，defineHandlerMeta 补充 per-method 字段
export const GET = defineHandler(
  describeRoute({ tags: ['Users'], summary: 'Get user', responses: { 200: { description: 'OK' } } }),
  defineHandlerMeta({ public: true }),
  async c => {
    /* ... */
  }
);
```

> **Note**: The file-level `meta` only includes ubean-specific metadata fields, not OpenAPI document definitions. OpenAPI metadata is defined per handler chain via the `describeRoute` middleware.

#### Public Route Example (no auth required)

```typescript
// routes/auth/login.ts
import { defineHandler, defineHandlerMeta, validator, describeRoute, resolver } from 'ubean';
import { z } from 'zod';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const tokenResponseSchema = z.object({ token: z.string() });

export const POST = defineHandler(
  describeRoute({
    tags: ['Auth'],
    summary: 'User login',
    responses: {
      200: { description: 'Success', content: { 'application/json': { schema: resolver(tokenResponseSchema) } } }
    }
  }),
  defineHandlerMeta({ public: true }), // auth middleware 跳过此路由
  validator('json', loginSchema),
  async c => {
    const { email, password } = c.req.valid('json');
    return c.json({ token: '...' });
  }
);
```

#### defineHandler and hono-openapi Integration

ubean reuses the hono-openapi ecosystem. `validator`, `describeRoute`, and `resolver` are re-exported from hono-openapi, and type inference is performed automatically by hono-openapi through Hono's middleware chain mechanism:

```typescript
// 从 ubean 导入（实际重导出自 hono-openapi）
import { validator, describeRoute, resolver } from 'ubean';

// validator: 验证指定 target 的数据，验证后通过 c.req.valid(target) 获取
// target: 'json' | 'form' | 'query' | 'param' | 'header' | 'cookie'
function validator<T extends Target, S extends StandardSchemaV1>(target: T, schema: S): MiddlewareHandler;

// describeRoute: 定义 OpenAPI Operation 元数据
function describeRoute(route: {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  responses?: Record<
    string,
    { description: string; content?: Record<string, { schema: ReturnType<typeof resolver> }> }
  >;
}): MiddlewareHandler;

// resolver: 包装 Standard Schema 用于 OpenAPI responses 定义
function resolver<S extends StandardSchemaV1>(schema: S): { schema: S };
```

**Key Type Inference Points**:

1. After the middleware returned by `validator('json', userSchema)` is processed by hono-openapi, the `c` parameter of subsequent handlers automatically receives the complete type of `c.req.valid('json')`
2. Types from multiple `validator` calls are merged via Hono's middleware chain Input type intersection, achieving type accumulation
3. Custom middleware that needs to access validated data should be wrapped with `defineMiddleware` to keep the type chain unbroken
4. `describeRoute` does not affect runtime types; it is only collected during OpenAPI document generation
5. ubean-specific metadata in `defineHandlerMeta` is accessed at runtime via `c.route.meta` and extracted at build time via AST

**Meta Merge Priority**: meta defined in `defineHandlerMeta` > file-level `export const meta` > global defaults. The merge strategy is deep merge (arrays are replaced, not concatenated). At build time, AST scanning extracts meta from the first `defineHandlerMeta()` call in the chain.

#### RouteMeta Type Design

`defineHandlerMeta` is only for ubean-specific metadata and no longer includes OpenAPI fields:

```typescript
// src/types/handler.ts
export interface RouteMeta {
  /**
   * 是否为公开路由（auth middleware 跳过鉴权）
   * @default false
   */
  public?: boolean;

  /**
   * 缓存配置
   */
  cache?: {
    ttl?: number;
    swr?: boolean;
  };

  /**
   * 限流配置
   */
  rateLimit?: {
    max: number;
    window: number;
  };

  /**
   * 是否禁用此路由（构建时跳过注册）
   */
  disabled?: boolean;

  /**
   * 允许用户通过 TypeScript 模块扩展自定义 meta
   */
  [key: string]: unknown;
}
```

#### Accessing Route Meta in Middleware

In global middleware, you can access the meta of the currently matched route method (with file-level defaults already merged) via `c.route.meta`:

```typescript
// middleware/02.auth.ts
import { defineMiddleware } from 'ubean';

export default defineMiddleware(async (c, next) => {
  const meta = c.route.meta;

  // 公开路由跳过鉴权
  if (meta?.public) {
    await next();
    return;
  }

  // 验证 token
  const token = c.req.header('Authorization');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 验证并注入用户信息
  const user = await verifyToken(token);
  c.set('user', user);

  await next();
});
```

#### OpenAPI Auto-Generation

- At build time, OpenAPI Operation definitions are automatically collected from `describeRoute` middleware via hono-openapi's mechanism
- The Standard Schema used by `validator` is the only inferable source for request parameters; response bodies declare schemas using `resolver(schema)` within `describeRoute`'s `responses`
- AST scanning only needs to extract ubean-specific metadata from `defineHandlerMeta` (`public`/`cache`/`rateLimit`/custom fields); OpenAPI documents are handled automatically by hono-openapi at runtime
- Automatically generates an OpenAPI 3.1 spec JSON, with the endpoint defaulting to `/_openapi.json`
- Automatically infers route parameters (`:param` → `{param}`, `**` → catch-all)
- Automatically maps method names to OpenAPI operations (GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD)
- Automatically categorizes tags by path prefix: `/api/**` → "API Routes", `/_*` → "Internal"
- Built-in Scalar UI (default `/_scalar`) and Swagger UI support
- Production mode supports both `runtime` (generated at runtime) and `prerender` (pre-rendered at build time) strategies

#### Request Dispatching and HTTP Contract

API routes and Pages routes are driven by the same normalized route manifest. At build time, duplicate registrations of the same method and path must be rejected, and conflict sources must be reported; the framework does not implicitly decide override relationships via file scan order.

| Scenario | Specified Behavior |
| --- | --- |
| API route hit | Dispatched by method to named exports in `routes/`; API routes take precedence over Pages routes at the same path |
| Pages route hit | `GET`/`HEAD` execute SSR or the client page protocol; page actions only accept their explicitly declared methods |
| Path exists but method not supported | Returns `405` with `Allow`; `OPTIONS` is handled the same way, also returning `Allow` |
| Path does not exist | Returns `404`; in Pages mode, can be rendered by `error.404.vue` |
| URL normalization | Unified decoding rules, trailing slash policy, and catch-all parameter encoding; redirects only occur when explicitly configured |

Page actions, form enhancements, and client navigation share a single protocol: requests carry the framework version and a page navigation identifier; the server returns page data, redirects, or field errors in the negotiated format; plain form requests that do not satisfy the protocol still return standard HTML/HTTP responses. All Pages actions that change server-side state must have configurable CSRF protection.

## 4.6 Pages Routing Design

Adopts file-convention routing, combining elegant-router's typed routing, reuse routing, and CLI route management capabilities, while retaining void's Inertia-style loader/action pattern.

#### Core Concepts

- **File is route**: `.vue` files in the `pages/` directory are automatically mapped to routes
- **definePage macro**: Used in a page's `<script setup>` or `.reuse.ts` to configure meta, layout, name, path overrides, and more
- **Layouts system**: The `layouts/` directory sits alongside `pages/`, supporting both `xx.vue` and `xx/index.vue` layout file forms
- **Reuse routes**: Reuse an already-defined page's component via a `.reuse.ts` file, avoiding the creation of duplicate shell pages
- **Virtual route module**: Full route data is generated at build time and exposed via the `ubean:pages` virtual module
- **CLI route management**: `ubean page add/delete/update` and other commands to add/remove/modify page routes; `ubean api add/delete/update` to manage API endpoints

#### Page File Conventions

| File Pattern | Description |
| --- | --- |
| `pages/index.vue` | Home page `/` |
| `pages/about.vue` | `/about` |
| `pages/users/index.vue` | `/users` |
| `pages/users/[id].vue` | Dynamic parameter `/users/:id` |
| `pages/users/[...all].vue` | Catch-all `/users/:all(.*)*` |
| `pages/(group)/page.vue` | Route group; the parenthesized part does not generate a path segment |
| `pages/page.vue` + `page.server.ts` | Page + same-name loader/action file |
| `pages/page.reuse.ts` | Reuse route configuration file |

#### definePage Macro

Call `definePage` in a page's `<script setup>` or `.reuse.ts` to configure page metadata, replacing void's `export const layout = 'landing'`:

```vue
<!-- pages/users/[id].vue -->
<script setup lang="ts">
import { definePage } from 'ubean';
import type { loader } from './[id].server';

definePage({
  // 路由名称（默认自动推导为 UsersId，可覆盖）
  name: 'UserDetail',
  // 路由路径（默认自动推导，可覆盖）
  path: '/users/:id',
  // 指定布局（类型化，自动从 layouts/ 目录推导可用布局名）
  layout: 'default',
  // 路由 meta（完全类型化）
  meta: {
    title: '用户详情',
    requiresAuth: true,
    roles: ['admin', 'user']
  },
  // 启用页面 KeepAlive 缓存（框架自动用路由名作为组件 name，
  // <script setup> SFC 无需手动 defineOptions({ name })）
  cache: true
});

const props = defineProps<{
  user: Awaited<ReturnType<typeof loader>>['user'];
}>();
</script>

<template>
  <div class="user-detail">
    <h1>{{ props.user.name }}</h1>
  </div>
</template>
```

#### definePage Type Definition

```typescript
// src/pages/define-page.ts
export interface PageMeta {
  /** 页面标题 */
  title?: string;
  /** 是否需要鉴权 */
  requiresAuth?: boolean;
  /** 需要的角色 */
  roles?: string[];
  /** 允许用户扩展 */
  [key: string]: unknown;
}

export interface DefinePageOptions<TName extends string = string, TLayout extends string = string> {
  /**
   * 路由名称，默认从文件路径自动推导
   * 例如 pages/users/[id].vue → 'UsersId'
   */
  name?: TName;

  /**
   * 路由路径，默认从文件路径自动推导
   * 例如 pages/users/[id].vue → '/users/:id'
   */
  path?: string;

  /**
   * 指定布局组件名，类型从 layouts/ 目录自动推导
   * 不指定时使用 'default' 布局
   * 设为 false 表示不使用任何布局（空白页）
   * @default 'default'
   */
  layout?: TLayout | false;

  /**
   * 启用页面 KeepAlive 缓存。
   * 设为 true 时，页面组件实例在导航离开后被保留（不卸载），
   * 返回时从缓存恢复。框架自动用路由名作为组件 name（通过
   * getNamedPageWrapper 包装），<script setup> SFC 无需手动
   * defineOptions({ name })。
   * 缓存后页面使用 onActivated/onDeactivated 替代 onMounted/onUnmounted。
   * 运行时控制：useCacheViews()/enablePageCache(name)/disablePageCache(name)/
   * excludePageCache(name)/includePageCache(name)/invalidatePageCache(name?)/
   * isPageCached(name)/resetRouteCache(name?)。
   */
  cache?: boolean;

  /**
   * 复用路由目标 — 指定要复用其组件的已定义路由 name。
   * 仅在 .reuse.ts 文件中使用；reuse 路由不会创建独立的 Vue 组件，
   * 而是加载 target 页面的 SFC。
   * cache 未显式声明时自动继承 target 的 cache 值。
   */
  reuse?: string;

  /** 路由元信息 */
  meta?: PageMeta;

  /** 页面级中间件名 */
  middleware?: string | string[];

  /** 是否需要鉴权（meta shortcut，等价于 meta.requiresAuth） */
  requiresAuth?: boolean;

  /**
   * 页面级静态 head 配置（SEO）。
   * 构建时由 extractDefinePageFromCode 提取，SSR 时通过 pageObj.head →
   * pushPageHead 应用（与 Markdown frontmatter 走相同路径）。
   * 支持 title / meta / link / script / htmlAttrs / bodyAttrs。
   * 动态/响应式 head 请使用 useHead()，两者可共存
   * （useHead() 覆盖 definePage.head 中的同名字段）。
   */
  head?: PageHead;
}

export function definePage(options?: DefinePageOptions): void;
```

> **Compile-time macro**: `definePage` is a compile-time macro (similar to `defineProps`); it is only scanned and extracted during the build phase and is not executed at runtime. AST static analysis extracts its arguments to generate route data.

#### Loader / Action (Server Data)

```typescript
// pages/users/[id].server.ts
import { defineLoader, defineAction, fail } from 'ubean';
import { db } from 'ubean';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Server-side loader (GET 请求自动调用)
export const loader = defineLoader(async ({ params }) => {
  const user = await db.select().from(users).where(eq(users.id, params.id)).get();
  return { user };
});

// Server-side actions (POST 请求按 ?/<name> 分发,SvelteKit 风格)
export const actions = {
  default: defineAction(async (input, ctx) => {
    return { success: true };
  }),
  update: defineAction(async (input: { name: string }, ctx) => {
    if (!input.name) return fail(400, { name: 'required' });
    await db.update(users).set({ name: input.name }).where(eq(users.id, ctx.params.id));
    return { success: true };
  })
};

// 可选: 禁用 SSR
export const ssr = true;

// 可选: 预渲染
export const prerender = false;
```

#### Layouts System

Layout files live in the `layouts/` directory alongside `pages/`, supporting two file forms:

- `layouts/xx.vue` — a Vue file directly under `layouts/`
- `layouts/xx/index.vue` — a directory-based layout organizing the layout component and its sub-components

```
layouts/
├── default.vue          # 默认布局（pages 不指定 layout 时使用）
├── blank.vue            # 空白布局（登录页等）
├── landing.vue          # 落地页布局
└── admin/
    ├── index.vue        # admin 布局（自动推导名称为 'admin'）
    ├── Sidebar.vue      # admin 布局的子组件
    └── Header.vue
```

Layout components use `<slot />` to render page content and support nested layouts:

```vue
<!-- layouts/default.vue -->
<script setup lang="ts">
import { usePage } from 'ubean/vue-runtime';

const page = usePage();
</script>

<template>
  <div class="layout-default">
    <header>
      <nav>...</nav>
    </header>
    <main>
      <slot />
    </main>
    <footer>...</footer>
  </div>
</template>
```

**Layout Inference Rules**:

1. Scan the `layouts/` directory; `xx` in `xx.vue` or `xx/index.vue` is the layout name
2. `default.vue` or `default/index.vue` must exist, serving as the default layout when no layout is specified
3. `definePage({ layout: false })` means no layout is used; the page renders directly
4. Layout name types are inferred automatically; `definePage({ layout: '...' })` has full type completion

#### Reuse Routes

Drawing on elegant-router's `reuseRoutes` capability, reuse routes are defined via `xxx.reuse.ts` files — the route exists but no standalone Vue page file is created; instead, an existing page component is reused (suitable for scenarios like tab pages reusing the same route component):

```typescript
// pages/users/detail.reuse.ts
// 此文件创建后，ubean 会自动注册路由 /users/detail，复用 UserDetail 页面组件
import { definePage } from 'ubean';

export default definePage({
  // reuse: 指定复用的已定义路由 name（类型化，自动从所有页面路由名推导）
  reuse: 'UserDetail',
  // 覆盖路径（可选，默认从文件名推导）
  path: '/users/detail',
  // 覆盖布局
  layout: 'default',
  // 独立 meta
  meta: {
    title: '用户详情（复用）'
  },
  // cache 未显式声明时自动继承 target（UserDetail）的 cache 值。
  // 如需独立控制可显式声明：cache: true 启用，cache: false 关闭。
  cache: true
});
```

**Reuse Route Rules**:

1. `xxx.reuse.ts` and a same-named `.vue` file are mutually exclusive; `.reuse.ts` takes precedence (if it exists, the same-named `.vue` route is not registered)
2. The route name pointed to by the `reuse` field must be another already-defined page route (type-checked)
3. A reuse route uses the reused page's component as its `component` by default, but meta, layout, path, and cache can be configured independently
4. **Cache inheritance**: When a reuse route does not explicitly declare `cache` (`undefined`), it automatically inherits the target page's `cache` value. Explicit `cache: true`/`cache: false` takes higher precedence and can independently enable or disable caching
5. Each cached reuse route is an independent KeepAlive instance, keyed by its own route name; state is not shared between them
6. Reuse routes can be created interactively via the CLI command `ubean page add-reuse`

**Cache Inheritance Truth Table**:

| target `cache` | reuse `cache` | Inheritance triggered? | Final reuse `cache` | Result |
| --- | --- | --- | --- | --- |
| `true` | `undefined` | ✓ Yes | `true` | reuse inherits cache |
| `true` | `true` | ✗ No | `true` | reuse explicitly caches |
| `true` | `false` | ✗ No | `false` | reuse explicitly disables |
| `undefined`/`false` | `undefined` | ✓ Yes, but target is not true | `undefined` | neither caches |
| `undefined`/`false` | `true` | ✗ No | `true` | reuse caches independently |
| `undefined`/`false` | `false` | ✗ No | `false` | neither caches |

#### Route Groups

Use parenthesized directories `(group-name)/` to organize related pages; the parenthesized part does not generate a URL path segment:

```
pages/
├── (auth)/                # 不生成 /(auth) 路径段
│   ├── login.vue          # → /login
│   └── register.vue       # → /register
└── (dashboard)/
    ├── home.vue           # → /home
    └── settings.vue       # → /settings
```

Route groups can also be used to assign a uniform default layout to a group of pages (by placing a layout config or using a `definePage` meta convention in the group directory).

#### Virtual Route Module

At build time, full route data is exposed via the `ubean:pages` virtual module, which can be used in scenarios like client router initialization, menu generation, and breadcrumb navigation:

```typescript
// 在客户端代码中使用
import { routes, layouts, routeNames } from 'ubean:pages';
import type { RouteRecordRaw } from 'vue-router';

// routes: 完整路由记录数组（Vue Router 格式）
const router = createRouter({
  routes: routes as RouteRecordRaw[]
  // ...
});

// layouts: 布局组件映射（懒加载）
// layouts = { default: () => import('/layouts/default.vue'), admin: () => import('/layouts/admin/index.vue'), ... }

// routeNames: 所有路由名称的类型联合
type RouteName = (typeof routeNames)[number]; // 'Home' | 'About' | 'Users' | 'UserDetail' | 'Login' | ...
```

The generated `.ubean/pages.d.ts` contains the complete types:

```typescript
// .ubean/pages.d.ts (自动生成)
declare module 'ubean:pages' {
  import type { Component } from 'vue';
  import type { RouteRecordRaw } from 'vue-router';

  export const routes: UbeanRouteRecord[];
  export const layouts: Record<string, () => Promise<Component>>;
  export const routeNames: readonly ['Home', 'About', 'Users', 'UserDetail', 'Login', ...];

  export type LayoutName = 'default' | 'blank' | 'admin' | 'landing';
  export type RouteName = (typeof routeNames)[number];

  export interface UbeanRouteRecord {
    name: RouteName;
    path: string;
    component?: () => Promise<Component>;
    components?: Record<string, () => Promise<Component>>;
    layout?: LayoutName | false;
    meta: PageMeta;
    children?: UbeanRouteRecord[];
    redirect?: string;
  }
}
```

#### CLI Route Management

Drawing on elegant-router's CLI commands, ubean provides interactive route add/remove/modify capabilities. Page routes use the `ubean page *` command family (API endpoints use `ubean api *`); see [§4.13 CLI Command System](#413-cli-command-system) for details.

**CLI Implementation Highlights**:

- Uses `citty` for the CLI framework and `enquirer` for interactive selection
- Uses `tinyglobby` to scan `pages/`, `routes/`, `layouts/`, and other directories
- Uses `ts-morph` for AST operations to safely modify files
- Delete operations are automatically backed up to `.ubean/backup/` and support recovery
- Supports automatic template selection when adding `.vue` page or API handler files
- Automatically updates route configuration when files are renamed
- CLI and DevTools share the underlying CRUD logic (`cli/shared/fs-ops.ts`)

#### Auto-Generation Flow

1. **On dev/build startup**:
   - Scan `pages/**/*.vue`, excluding `components/`, `modules/`, and other subdirectories
   - Scan `pages/**/*.reuse.ts` to extract `definePage()` calls
   - Scan `layouts/**/*.vue` and `layouts/**/index.vue` to infer layout names
   - AST-parse `definePage()` calls in the `<script setup>` of each `.vue` file
   - Parse `loader`/`action` exports in each `.server.ts` file
   - Merge into a route tree structure
   - Generate the `.ubean/pages.d.ts` type file (LayoutName union, RouteName union, routes types)
   - Generate runtime code for the `virtual:ubean-pages` virtual module
2. **HMR Hot Updates**:
   - Watch for file changes in the `pages/` directory
   - Incrementally update route data when files are added/deleted/renamed
   - Hot-update routes when `definePage()` arguments change
3. **Route Name Inference Rules**:
   - `pages/index.vue` → `'Home'`
   - `pages/about.vue` → `'About'`
   - `pages/users/index.vue` → `'Users'`
   - `pages/users/[id].vue` → `'UserId'`
   - `pages/users/[...all].vue` → `'UsersAll'`
   - Route group `(auth)/login.vue` → `'Login'` (parenthesized part ignored)
   - `.reuse.ts` files infer names from the filename by default, overridable via `name`

#### Comparison with void

| Aspect | void | ubean |
| --- | --- | --- |
| Layout config | `export const layout = 'landing'` | `definePage({ layout: 'landing' })` |
| Layout location | `pages/layout.vue` (single) | `layouts/` directory (multiple layouts) |
| Layout form | Single root layout | `xx.vue` + `xx/index.vue` |
| Page meta | `export const loader` and other independent exports | Unified in `definePage({ meta: {...} })` |
| Route customization | No name/path override | `definePage({ name, path })` can override |
| Reuse routes | Not supported | `.reuse.ts` file + `definePage({ reuse: 'TargetRoute' })` |
| CLI route management | None | `ubean page/api/env/config/cron/layout/middleware *` full CLI |
| Virtual route module | None | `ubean:pages` exposes full route data |
| Type safety | Partial | Layout names, route names, reuse targets all fully typed |
| Request validation | Custom `defineValidator` | Uses hono-openapi's `validator` middleware (Standard Schema) |
| OpenAPI docs | Not supported | Uses hono-openapi's `describeRoute` + `resolver` |

## Next Steps

- [Architecture Overview](/architecture/overview)
- [Pages and Routing Overview](/guide/pages-routing/overview)
- [Routing Modes](/guide/routing-modes)
