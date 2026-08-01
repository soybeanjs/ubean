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

## Pages Routing Design

> The page routing conventions, `definePage` macro, layouts, reuse routes, route groups, loaders/actions, special pages (404/loading/error), navigation guards, and route rules are documented in the user-facing guide: **[Pages and Routing](/guide/pages-routing/overview)** and **[Data Loaders](/guide/pages-routing/loaders)** / **[Actions](/guide/pages-routing/actions)**. This architecture doc retains only the API routing internals above.

## Next Steps

- [Architecture Overview](/architecture/overview)
- [Pages and Routing Overview](/guide/pages-routing/overview)
- [Routing Modes](/guide/routing-modes)
