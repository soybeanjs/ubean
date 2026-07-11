# 路由设计

采用 void 的**命名导出约定**：单个文件内通过 `export const GET`、`export const POST` 等命名导出定义多个 HTTP 方法处理函数，构建时通过 AST 静态扫描检测导出方法。

#### 路由文件约定

- 文件名不包含方法后缀（不同于 nitro 的 `.get.ts`/`.post.ts`）
- 方法由顶层命名导出决定：`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`OPTIONS`、`HEAD`
- 支持 `export default` 作为兜底处理器（匹配所有未显式定义的方法）
- 文件以 `_` 开头的为私有文件，不会被注册为路由
- 支持环境后缀：`.dev.ts`（仅开发）、`.prod.ts`（仅生产）

#### defineHandler API 设计

参考 hono-ssr 的 `createDefineRoute` 类型推导模式，`defineHandler` 默认接受**多个 handler 组成的中间件链**（单个 handler 是链长度为 1 的特例）。`defineMeta` 和 `defineValidator` 作为独立的 handler 函数导出，直接传入 `defineHandler` 链中，不再使用 `defineHandler.withMeta()`/`defineHandler.withValidator()` 的柯里化形式。

**核心设计原则**：

- 所有 handler（包括 meta、validator、业务逻辑）在调用形式上统一为 `defineHandler(h1, h2, ..., finalHandler)`
- 类型从左到右累积：`defineValidator` 定义的 params/query/body/json 类型会流向后续所有 handler
- `defineMeta` 运行时是透传中间件（`(c, next) => next()`），仅在构建时被 AST 提取
- `defineValidator` 运行时执行验证并将验证后的数据挂载到 `c.req.valid(target)`，类型通过泛型链推导

```typescript
// routes/users/[id].ts
import { defineHandler, defineMeta, defineValidator, defineMiddleware } from 'ubean/handler';
import { z } from 'zod';

// 权限中间件示例
const requireAdmin = defineMiddleware(async (c, next) => {
  if (c.get('user')?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});

// GET /users/:id — 获取用户详情
// defineMeta 和 defineValidator 作为 handler 链的一部分传入
export const GET = defineHandler(
  defineMeta({
    public: false,
    cache: { ttl: 60 },
    rateLimit: { max: 100, window: 60 },
    openAPI: {
      tags: ['Users'],
      summary: 'Get user by ID',
      description: 'Retrieve a single user by their unique ID',
      responses: {
        200: { description: 'User found' },
        404: { description: 'User not found' }
      }
    }
  }),
  defineValidator({
    params: z.object({ id: z.string() }),
    query: z.object({ include: z.string().optional() })
  }),
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
  defineMeta({
    public: false,
    openAPI: {
      tags: ['Users'],
      summary: 'Update user',
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UserUpdate' } } } },
      responses: { 200: { description: 'Updated' } }
    }
  }),
  defineValidator({
    params: z.object({ id: z.string() }),
    json: z.object({ name: z.string().optional(), email: z.string().email().optional() })
  }),
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
  defineMeta({
    openAPI: { tags: ['Users'], summary: 'Delete user', responses: { 200: { description: 'Deleted' } } }
  }),
  defineValidator({ params: z.object({ id: z.string() }) }),
  requireAdmin, // 自定义中间件在 validator 之后，可以访问 c.req.valid('param')
  async c => {
    // ✅ requireAdmin 中也可以使用 c.req.valid('param') 获取 id
    const { id } = c.req.valid('param');
    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true });
  }
);
```

> **设计要点**：`defineMeta` 和 `defineValidator` 位置灵活——通常放在链的最前面（meta 用于 AST 提取，validator 尽早验证失败快），但也可以放在特定中间件之后。运行时按链顺序执行，类型按链顺序累积。

#### 文件级共享 meta（可选 export const meta）

当同一文件内多个方法共享相同 meta（如 tags、`$global` components）时，可通过顶层 `export const meta` 定义文件级默认值，`defineMeta` 中同名字段深度覆盖：

```typescript
// routes/users/[id].ts
import { defineHandler, defineMeta } from 'ubean/handler';

export const meta = {
  openAPI: {
    tags: ['Users'],
    $global: {
      components: {
        schemas: { User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }
      }
    }
  }
};

// GET 继承文件级 tags + $global，defineMeta 补充 per-method 字段
export const GET = defineHandler(
  defineMeta({ public: true, openAPI: { summary: 'Get user', responses: { 200: { description: 'OK' } } } }),
  async c => {
    /* ... */
  }
);
```

#### 公开路由示例（无需鉴权）

```typescript
// routes/auth/login.ts
import { defineHandler, defineMeta, defineValidator } from 'ubean/handler';
import { z } from 'zod';

export const POST = defineHandler(
  defineMeta({
    public: true, // auth middleware 跳过此路由
    openAPI: { tags: ['Auth'], summary: 'User login' }
  }),
  defineValidator({
    json: z.object({ email: z.string().email(), password: z.string().min(6) })
  }),
  async c => {
    const { email, password } = c.req.valid('json');
    return c.json({ token: '...' });
  }
);
```

#### defineHandler 完整 API 与类型推导

类型推导参考 hono-ssr 的多重重载模式：通过 1\~10 个 handler 的函数重载，每个 handler 的 `Input` 类型（即 `c.req.valid()` 可用的 key）通过 `IntersectNonAnyTypes` 从左到右累积，确保 validator 定义的类型可以流向后续所有 handler。

```typescript
// src/runtime/handler.ts

// Validator 插槽类型（支持 Standard Schema v1 兼容库: zod/valibot/arktype 等）
interface ValidatorSlots {
  params?: StandardSchemaV1;
  query?: StandardSchemaV1;
  json?: StandardSchemaV1;
  form?: StandardSchemaV1;
  header?: StandardSchemaV1;
  cookie?: StandardSchemaV1;
}

// 从 ValidatorSlots 推导 validated input 类型
type ValidatedInput<V extends ValidatorSlots> = {
  [K in keyof V as V[K] extends StandardSchemaV1 ? K : never]: V[K] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<V[K]>
    : never;
};

// defineMeta: 运行时透传中间件，构建时 AST 提取 meta
function defineMeta<M extends RouteMeta>(meta: M): UbeanMiddleware<{}, { __meta: M }>;

// defineValidator: 运行时验证中间件，类型上累积 validated input
function defineValidator<V extends ValidatorSlots>(
  validators: V
): UbeanMiddleware<ValidatedInput<V>, { __validators: V }>;

// defineHandler: 1~N 个 handler 链，类型从左到右累积
// 1 个 handler（最简形式）
function defineHandler<H extends UbeanHandler<{}>>(handler: H): ComposedHandler;
// 2 个 handlers (middleware + final)
function defineHandler<I1 extends Input = {}, I2 extends Input = I1>(
  h1: UbeanMiddleware<I1>,
  h2: UbeanHandler<I1 & I2>
): ComposedHandler;
// 3~10 个 handlers 类似重载，通过 IntersectNonAnyTypes 累积 Input
// ... (最多 10 层重载，足够覆盖绝大多数场景)
// 超过 10 个时退化为 rest 参数 + 基础类型（无完整推导但不报错）
function defineHandler(...handlers: UbeanHandlerLike[]): ComposedHandler;
```

**类型推导关键点**：

1. `defineValidator({ params: z.object({ id: z.string() }) })` 返回的 middleware 携带 `Input = { param: { id: string } }` 类型
2. 当该 middleware 传入 `defineHandler` 后，后续 handler 的 `c` 参数自动获得 `c.req.valid('param')` 的完整类型
3. 多个 `defineValidator` 的 Input 类型通过交叉类型（`&`）合并，实现类型累积
4. 自定义中间件若需要访问 validated data，应使用 `defineMiddleware` 包装以保持类型链不断裂
5. `defineMeta` 的 `__meta` 属性是 phantom type（仅类型层面存在），运行时通过函数属性挂载供 AST 提取

**meta 合并优先级**：`defineMeta` 中定义的 meta > 文件级 `export const meta` > 全局默认值。合并策略为深度 merge（数组替换而非拼接）。构建时 AST 扫描从链中第一个 `defineMeta()` 调用提取 meta。

#### RouteMeta 类型设计

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
   * OpenAPI 文档定义（per-method）
   */
  openAPI?: OperationObject & {
    $global?: Pick<OpenAPI3, 'components'> & Extensable;
  };

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
import { defineMiddleware } from 'ubean/handler';

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

- 构建时通过 AST 扫描提取各 handler 链中 `defineMeta({ openAPI: {...} })` 调用，以及文件级 `export const meta`
- `defineValidator` 使用的 Standard Schema 是请求参数的唯一可推导来源；响应 body 必须通过 `openAPI.responses` 显式声明 schema
- AST 仅支持字面量对象、可静态解析的导入和受限的 `$global.components` 合并；动态表达式、变量展开或无法解析的调用必须发出构建诊断，不能生成不完整文档
- 自动生成 OpenAPI 3.1 规范 JSON，端点默认 `/_openapi.json`
- 自动推导路由参数（`:param` → `{param}`, `**` → catch-all）
- 自动将方法名映射为 OpenAPI operation（GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD）
- 自动按路径前缀分类 tags：`/api/**` → "API Routes", `/_*` → "Internal"
- `$global.components` 在所有方法间共享（schema 去重）
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
import { definePage } from 'ubean/pages';
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
    roles: ['admin', 'user'],
    keepAlive: true
  }
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
  /** 是否缓存页面（keep-alive） */
  keepAlive?: boolean;
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

  /** 路由元信息 */
  meta?: PageMeta;
}

export function definePage(options?: DefinePageOptions): void;
```

> **编译时宏**：`definePage` 是编译时宏（类似 `defineProps`），仅在构建阶段被扫描提取，不会运行时执行。AST 静态分析提取其参数用于生成路由数据。

#### Loader / Action (服务端数据)

```typescript
// pages/users/[id].server.ts
import { defineLoader, defineAction } from 'ubean/pages';
import { db } from 'ubean/database';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Server-side loader (GET 请求自动调用)
export const loader = defineLoader(async ({ params }) => {
  const user = await db.select().from(users).where(eq(users.id, params.id)).get();
  return { user };
});

// Server-side action (POST/PUT/DELETE 请求自动调用)
export const action = defineAction(async ({ params, request }) => {
  const formData = await request.formData();
  return { success: true };
});

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
import { usePage } from 'ubean/pages';

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
import { definePage } from 'ubean/pages';

export default definePage({
  // reuse: 指定复用的已定义路由 name（类型化，自动从所有页面路由名推导）
  reuse: 'UserDetail',
  // 覆盖路径（可选，默认从文件名推导）
  path: '/users/detail',
  // 覆盖布局
  layout: 'default',
  // 独立 meta
  meta: {
    title: '用户详情（复用）',
    keepAlive: true
  }
});
```

**Reuse 路由规则**：

1. `xxx.reuse.ts` 与同名 `.vue` 文件互斥，`.reuse.ts` 优先级更高（若存在则不注册同名 `.vue` 路由）
2. `reuse` 字段指向的路由 name 必须是已定义的其他页面路由（类型检查）
3. reuse 路由默认使用被复用页面的组件作为 `component`，但 meta、layout、path 可以独立配置
4. 可通过 CLI 命令 `ubean page add-reuse` 交互式创建 reuse 路由

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
type RouteName = (typeof routeNames)[number]; // 'Home' | 'About' | 'UsersId' | ...
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
