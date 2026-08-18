---
title: Routing
description: ubean 路由设计：命名导出 API 路由、文件式页面、路由规则与中间件。
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

参考 hono-ssr 的 `createDefineRoute` 类型推导模式，`defineHandler` 默认接受**多个 handler 组成的中间件链**（单个 handler 是链长度为 1 的特例）。`defineHandlerMeta` 作为独立的 handler 函数导出，直接传入 `defineHandler` 链中；请求验证和 OpenAPI 文档定义使用 hono-openapi 提供的 `validator` 和 `describeRoute` 中间件（从 ubean 直接重导出），`defineHandlerMeta` 仅接收 ubean 特有的元数据字段。

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

`defineHandlerMeta` 仅用于 ubean 特有的元数据，不包含 OpenAPI 字段：

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

## 页面路由设计

> 页面路由约定、`definePage` 宏、布局、复用路由、路由分组、加载器/操作、特殊页面(404/loading/error)、导航守卫和路由规则均已在用户指南中记录:**[页面与路由](/zh/guide/pages-routing/overview)** 与 **[数据加载器](/zh/guide/pages-routing/loaders)** / **[操作](/zh/guide/pages-routing/actions)**。本文档仅保留上方的 API 路由内部实现。


