---
title: Routing
---

# 路由设计

采用 void 的**命名导出约定**：单个文件内通过 `export const GET`、`export const POST` 等命名导出定义多个 HTTP 方法处理函数，构建时通过 AST 静态扫描检测导出方法。

#### 路由文件约定

- 文件名不包含方法后缀（不同于 nitro 的 `.get.ts`/`.post.ts`）
- 方法由顶层命名导出决定：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`、`HEAD`
- 支持 `export default` 作为兜底处理器（匹配所有未显式定义的方法）
- 文件以 `_` 开头的为私有文件，不会被注册为路由
- 支持环境后缀：`.dev.ts`（仅开发）、`.prod.ts`（仅生产）

#### defineHandler API 设计

参考 hono-ssr 的 `createDefineRoute` 类型推导模式，`defineHandler` 默认接受**多个 handler 组成的中间件链**（单个 handler 是链长度为 1 的特例）。`defineHandlerMeta` 作为独立的 handler 函数导出，直接传入 `defineHandler` 链中；请求验证和 OpenAPI 文档定义使用 hono-openapi 提供的 `validator` 和 `describeRoute` 中间件（从 ubean 直接重导出），不再使用自定义的 `defineValidator`，`defineHandlerMeta` 也不再接收 `{ openAPI: {...} }` 形式的配置。

**核心设计原则**：

- 所有 handler（包括 meta、validator、业务逻辑）在调用形式上统一为 `defineHandler(h1, h2, ..., finalHandler)`
- 类型由 hono-openapi 的 `validator` 中间件自动推导：`validator(target, schema)` 定义的 param/query/json/form/header/cookie 类型自动流向后续所有 handler，通过 `c.req.valid(target)` 获取
- `describeRoute` 中间件用于定义 OpenAPI 文档元数据（tags、summary、description、operationId、deprecated、responses），由 hono-openapi 自动收集
- `defineHandlerMeta` 运行时是透传中间件（`(c, next) => next()`），仅在构建时被 AST 提取，用于 ubean 特有的元数据（`public`、`cache`、`rateLimit` 及自定义扩展字段）
- 响应直接使用 Hono Context 方法：`c.json()`、`c.html()`、`c.text()`、`c.redirect()`、`c.header()`

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

> **设计要点**：`describeRoute`、`validator`、`defineHandlerMeta` 位置灵活——通常放在链的最前面（describeRoute 用于 OpenAPI 收集，validator 尽早验证失败快，defineHandlerMeta 用于 AST 提取），但也可以放在特定中间件之后。运行时按链顺序执行，类型由 hono-openapi 的 validator 中间件自动从左到右累积。

#### 文件级共享 meta（可选 export const meta）

当同一文件内多个方法共享相同的 ubean 特有 meta（如 `public`、`cache`、`rateLimit` 及自定义扩展字段）时，可通过顶层 `export const meta` 定义文件级默认值，`defineHandlerMeta` 中同名字段深度覆盖：

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

> **注意**：文件级 `meta` 仅包含 ubean 特有的元数据字段，不包含 OpenAPI 文档定义。OpenAPI 元数据通过 `describeRoute` 中间件在每个 handler 链中定义。

#### 公开路由示例（无需鉴权）

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

#### defineHandler 与 hono-openapi 集成

ubean 复用 hono-openapi 生态，`validator`、`describeRoute`、`resolver` 从 hono-openapi 重导出，类型推导由 hono-openapi 通过 Hono 的中间件链机制自动完成：

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

**类型推导关键点**：

1. `validator('json', userSchema)` 返回的 middleware 被 hono-openapi 处理后，后续 handler 的 `c` 参数自动获得 `c.req.valid('json')` 的完整类型
2. 多个 `validator` 的类型通过 Hono 的中间件链 Input 类型交叉合并，实现类型累积
3. 自定义中间件若需要访问 validated data，应使用 `defineMiddleware` 包装以保持类型链不断裂
4. `describeRoute` 不影响运行时类型，仅在 OpenAPI 文档生成时被收集
5. `defineHandlerMeta` 的 ubean 特有元数据在运行时通过 `c.route.meta` 访问，构建时通过 AST 提取

**meta 合并优先级**：`defineHandlerMeta` 中定义的 meta > 文件级 `export const meta` > 全局默认值。合并策略为深度 merge（数组替换而非拼接）。构建时 AST 扫描从链中第一个 `defineHandlerMeta()` 调用提取 meta。

#### RouteMeta 类型设计

`defineHandlerMeta` 仅用于 ubean 特有的元数据，不再包含 OpenAPI 字段：

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

#### 中间件中访问 route meta

在全局 middleware 中可以通过 `c.route.meta` 访问当前路由匹配方法的 meta（已合并文件级默认值）：

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

#### OpenAPI 自动生成

- 构建时通过 hono-openapi 的机制自动从 `describeRoute` 中间件收集 OpenAPI Operation 定义
- `validator` 使用的 Standard Schema 是请求参数的唯一可推导来源；响应 body 通过 `describeRoute` 的 `responses` 中使用 `resolver(schema)` 声明 schema
- AST 扫描仅需提取 `defineHandlerMeta` 中的 ubean 特有元数据（`public`/`cache`/`rateLimit`/自定义字段），OpenAPI 文档由 hono-openapi 在运行时自动处理
- 自动生成 OpenAPI 3.1 规范 JSON，端点默认 `/_openapi.json`
- 自动推导路由参数（`:param` → `{param}`, `**` → catch-all）
- 自动将方法名映射为 OpenAPI operation（GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD）
- 自动按路径前缀分类 tags：`/api/**` → "API Routes", `/_*` → "Internal"
- 内置 Scalar UI（默认 `/_scalar`）和 Swagger UI 支持
- 生产模式支持 runtime（运行时生成）和 prerender（构建时预渲染）两种策略

#### 请求分派与 HTTP 契约

API 路由和 Pages 路由由同一个已规范化的路由清单驱动。构建期必须拒绝同一方法、同一路径的重复注册，并输出冲突来源；框架不通过文件扫描顺序隐式决定覆盖关系。

| 场景                 | 规范行为                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| 命中 API 路由        | 按方法分派到 `routes/` 中的命名导出；API 路由优先于同路径 Pages 路由       |
| 命中 Pages 路由      | `GET`/`HEAD` 执行 SSR 或客户端页面协议；页面 action 仅接受其显式声明的方法 |
| 路径存在但方法不支持 | 返回 `405` 和 `Allow`；自动处理 `OPTIONS` 时同样返回 `Allow`               |
| 路径不存在           | 返回 `404`；在 Pages 模式下可交由 `error.404.vue` 渲染                     |
| URL 规范化           | 统一解码规则、尾斜杠策略和 catch-all 参数编码；重定向只在配置明确时发生    |

页面 action、表单增强与客户端导航共享一个协议：请求携带框架版本和页面导航标识，服务端按协商格式返回页面数据、重定向或字段错误；不满足协议的普通表单请求仍返回标准 HTML/HTTP 响应。所有改变服务端状态的 Pages action 必须具备可配置的 CSRF 防护。

## 4.6 Pages 路由设计

采用文件式约定路由，融合 elegant-router 的类型化路由、reuse 路由、CLI 路由管理能力，同时保留 void 的 Inertia 风格 loader/action 模式。

#### 核心概念

- **文件即路由**：`pages/` 目录下的 `.vue` 文件自动映射为路由
- **definePage 宏**：在页面 `<script setup>` 或 `.reuse.ts` 中使用，配置 meta、layout、name、path 覆盖等
- **Layouts 系统**：`layouts/` 目录与 `pages/` 同级，支持 `xx.vue` 或 `xx/index.vue` 两种布局文件形式
- **Reuse 路由**：通过 `.reuse.ts` 文件复用已定义页面的组件，避免重复创建空壳页面
- **虚拟路由模块**：构建时生成全量路由数据，通过 `ubean:pages` 虚拟模块暴露
- **CLI 路由管理**：`ubean page add/delete/update` 等命令增删改页面路由，`ubean api add/delete/update` 管理接口

#### 页面文件约定

| 文件模式                            | 说明                           |
| ----------------------------------- | ------------------------------ |
| `pages/index.vue`                   | 首页 `/`                       |
| `pages/about.vue`                   | `/about`                       |
| `pages/users/index.vue`             | `/users`                       |
| `pages/users/[id].vue`              | 动态参数 `/users/:id`          |
| `pages/users/[...all].vue`          | Catch-all `/users/:all(.*)*`   |
| `pages/(group)/page.vue`            | 路由组，括号部分不生成路径段   |
| `pages/page.vue` + `page.server.ts` | 页面 + 同名 loader/action 文件 |
| `pages/page.reuse.ts`               | reuse 路由配置文件             |

#### definePage 宏

在页面 `<script setup>` 或 `.reuse.ts` 中调用 `definePage` 配置页面元信息，替代 void 的 `export const layout = 'landing'`：

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

#### definePage 类型定义

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

> **编译时宏**：`definePage` 是编译时宏（类似 `defineProps`），仅在构建阶段被扫描提取，不会运行时执行。AST 静态分析提取其参数用于生成路由数据。

#### Loader / Action (服务端数据)

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

#### Layouts 系统

布局文件位于与 `pages/` 同级的 `layouts/` 目录，支持两种文件形式：

- `layouts/xx.vue` — 直接在 layouts 下创建 Vue 文件
- `layouts/xx/index.vue` — 以目录形式组织布局组件及子组件

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

布局组件使用 `<slot />` 渲染页面内容，并支持嵌套布局：

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

**布局推导规则**：

1. 扫描 `layouts/` 目录，`xx.vue` 或 `xx/index.vue` 中 `xx` 即为布局名
2. 必须存在 `default.vue` 或 `default/index.vue`，作为不指定 layout 时的默认布局
3. `definePage({ layout: false })` 表示不使用任何布局，页面直接渲染
4. 布局名类型自动推导，`definePage({ layout: '...' })` 有完整类型提示

#### Reuse 路由

参考 elegant-router 的 `reuseRoutes` 能力，通过 `xxx.reuse.ts` 文件定义复用路由——路由存在但不需要创建独立的 Vue 页面文件，而是复用其他已有页面组件（适用于如 Tab 页签复用同一路由组件场景）：

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

**Reuse 路由规则**：

1. `xxx.reuse.ts` 与同名 `.vue` 文件互斥，`.reuse.ts` 优先级更高（若存在则不注册同名 `.vue` 路由）
2. `reuse` 字段指向的路由 name 必须是已定义的其他页面路由（类型检查）
3. reuse 路由默认使用被复用页面的组件作为 `component`，但 meta、layout、path、cache 可以独立配置
4. **cache 继承**：reuse 路由未显式声明 `cache`（`undefined`）时，自动继承 target 页面的 `cache` 值。显式 `cache: true`/`cache: false` 优先级更高，可独立启用或关闭缓存
5. 每个 cached 的 reuse 路由是独立的 KeepAlive 实例，以各自的路由名作为缓存 key，状态互不共享
6. 可通过 CLI 命令 `ubean page add-reuse` 交互式创建 reuse 路由

**cache 继承真值表**：

| target `cache` | reuse `cache` | 继承逻辑触发? | reuse 最终 `cache` | 结果 |
| -------------- | ------------- | ------------- | ------------------ | ---- |
| `true` | `undefined` | ✓ 触发 | `true` | reuse 继承缓存 |
| `true` | `true` | ✗ 不触发 | `true` | reuse 显式缓存 |
| `true` | `false` | ✗ 不触发 | `false` | reuse 显式关闭 |
| `undefined`/`false` | `undefined` | ✓ 触发但 target 非 true | `undefined` | 都不缓存 |
| `undefined`/`false` | `true` | ✗ 不触发 | `true` | reuse 独立缓存 |
| `undefined`/`false` | `false` | ✗ 不触发 | `false` | 都不缓存 |

#### 路由组 (Route Groups)

使用括号目录 `(group-name)/` 组织相关页面，括号部分不生成 URL 路径段：

```
pages/
├── (auth)/                # 不生成 /(auth) 路径段
│   ├── login.vue          # → /login
│   └── register.vue       # → /register
└── (dashboard)/
    ├── home.vue           # → /home
    └── settings.vue       # → /settings
```

路由组还可以用于给一组页面统一指定默认 layout（通过在组目录放置 layout 配置或 definePage meta 约定）。

#### 虚拟路由模块

构建时通过虚拟模块 `ubean:pages` 暴露全量路由数据，可在客户端路由初始化、菜单生成、面包屑导航等场景使用：

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

生成的 `.ubean/pages.d.ts` 包含完整类型：

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

#### CLI 路由管理

参考 elegant-router 的 CLI 命令，提供交互式路由增删改能力。页面路由使用 `ubean page *` 命令族（API 接口使用 `ubean api *`），详见 [§4.13 CLI 命令系统](#413-cli-命令系统)。

**CLI 实现要点**：

- 使用 `citty` 构建 CLI 框架，`enquirer` 做交互式选择
- 使用 `tinyglobby` 扫描 pages/、routes/、layouts/ 等目录
- 使用 `ts-morph` 做 AST 操作，安全修改文件
- 删除操作自动备份到 `.ubean/backup/`，支持恢复
- 支持添加 `.vue` 页面/API handler 文件时自动选择模板
- 文件重命名时自动更新路由配置
- CLI 与 DevTools 共享底层 CRUD 逻辑（`cli/shared/fs-ops.ts`）

#### 自动生成流程

1. **开发/构建启动时**：
   - 扫描 `pages/**/*.vue`，排除 `components/`、`modules/` 等子目录
   - 扫描 `pages/**/*.reuse.ts`，提取 `definePage()` 调用
   - 扫描 `layouts/**/*.vue` 和 `layouts/**/index.vue`，推导布局名
   - AST 解析每个 `.vue` 文件中 `<script setup>` 里的 `definePage()` 调用
   - 解析每个 `.server.ts` 文件中的 `loader`/`action` 导出
   - 合并生成路由树结构
   - 生成 `.ubean/pages.d.ts` 类型文件（LayoutName 联合、RouteName 联合、routes 类型）
   - 生成 `virtual:ubean-pages` 虚拟模块的运行时代码
2. **HMR 热更新**：
   - 监听 pages/ 目录文件变化
   - 新增/删除/重命名文件时增量更新路由数据
   - 修改 `definePage()` 参数时热更新路由
3. **路由名称推导规则**：
   - `pages/index.vue` → `'Home'`
   - `pages/about.vue` → `'About'`
   - `pages/users/index.vue` → `'Users'`
   - `pages/users/[id].vue` → `'UserId'`
   - `pages/users/[...all].vue` → `'UsersAll'`
   - 路由组 `(auth)/login.vue` → `'Login'`（括号部分忽略）
   - `.reuse.ts` 文件默认按文件名推导，可通过 `name` 覆盖

#### 与 void 对比

| 方面         | void                              | ubean                                                         |
| ------------ | --------------------------------- | ------------------------------------------------------------- |
| 布局配置     | `export const layout = 'landing'` | `definePage({ layout: 'landing' })`                           |
| 布局位置     | `pages/layout.vue`（单个）        | `layouts/` 目录（多布局）                                     |
| 布局形式     | 单一根布局                        | `xx.vue` + `xx/index.vue`                                     |
| 页面 meta    | `export const loader` 等独立导出  | 统一在 `definePage({ meta: {...} })`                          |
| 路由自定义   | 不支持 name/path 覆盖             | `definePage({ name, path })` 可覆盖                           |
| Reuse 路由   | 不支持                            | `.reuse.ts` 文件 + `definePage({ reuse: 'TargetRoute' })`     |
| CLI 路由管理 | 无                                | `ubean page/api/env/config/cron/layout/middleware *` 全面 CLI |
| 虚拟路由模块 | 无                                | `ubean:pages` 暴露全量路由数据                                |
| 类型安全     | 部分                              | 布局名、路由名、reuse 目标全类型化                            |
| 请求验证     | 自定义 `defineValidator`          | 使用 hono-openapi 的 `validator` 中间件（Standard Schema）    |
| OpenAPI 文档 | 不支持                            | 使用 hono-openapi 的 `describeRoute` + `resolver`             |
