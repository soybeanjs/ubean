# @ubean/auth

**[English](./README.md) | 中文**

ubean 框架的 Better Auth 集成 —— 一层薄封装，并内置 email/password 回退实现。

```ts
import { getUser, requireAuth, getServerSession } from '@ubean/auth';

export const GET = defineHandler(async c => {
  const user = requireAuth(c);
  return c.json({ id: user.id, email: user.email });
});
```

## 目录

- [@ubean/auth](#ubeanauth)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [服务端辅助函数](#服务端辅助函数)
  - [客户端与 Vue 运行时](#客户端与-vue-运行时)
  - [Vite 插件](#vite-插件)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

| 分层                  | 职责                                                           |
| --------------------- | -------------------------------------------------------------- |
| `@ubean/auth`（内核） | handler 创建、选项解析、请求作用域内的 user/session 访问、守卫 |
| `@ubean/auth/client`  | 与框架无关的浏览器客户端（`createAuthClient`）                 |
| `@ubean/auth/runtime` | Vue composable 与客户端路由守卫                                |
| `@ubean/auth/vite`    | dev 期自动挂载 `/api/auth/*`，以及模块配置入口                 |

**包含：**

- `createAuthHandler` —— 动态导入 `better-auth`；未安装（或未提供配置）时回退到内置的 email/password 实现。
- `defineAuth` / `resolveAuthOptions` —— 声明并归一化 `UbeanAuthOptions`（base path、secret、session cookie、跳转目标、社交 provider）。
- `authMiddleware` / `getUser` / `getAuthSession` / `getServerSession` / `requireAuth` —— 从请求中读取当前身份。
- `createAuthClient` / `useAuth` / `useSession` / `getSessionFromHeaders` / `protectRoute` —— 浏览器与 Vue 侧。
- `ubeanAuthPlugin` / `defineAuthConfig` —— dev 期挂载 `/api/auth/*` 的 Vite 插件。

**不包含**（刻意为之）：

- 不提供事件处理器 API。API 路由就是 `@ubean/routes` 的 `defineHandler` 包装的普通 Hono handler，以 `GET` / `POST` 命名导出 —— 没有 `defineEventHandler`，也没有 `.get.ts` / `.post.ts` 后缀。
- 不提供独立的 `json()` / `redirect()` 辅助函数。请使用 Hono context：`c.json(...)`、`c.redirect(...)`。
- 不提供用户数据库。持久化是 Better Auth（或回退实现的存储）的职责；ubean 不附带用户表。数据库访问本身属于 `@ubean/server/db`。
- 不含 UI。登录/注册页面由你实现；本包只提供状态与操作。
- 不含授权策略引擎。`requiresAuth` 回答的是「有没有用户」，不是「这个用户能不能做这件事」—— 角色与权限校验属于应用代码。

**运行时依赖白名单（主入口）：** `@ubean/shared`、`better-auth`、`defu`。

**可选 peer：** `hono`、`vite`、`vue`。`better-auth` 是常规依赖，但以动态导入方式加载，因此模块在运行时不可用时包仍可加载并回退到内置的 email/password handler。

## 安装

```bash
# ubean 侧的集成层
pnpm add @ubean/auth

# 认证引擎 —— 推荐安装；不装则使用内置回退实现
pnpm add better-auth

# 只在用到对应能力时才需要的 peer
pnpm add hono       # 在 Hono 应用上使用 authMiddleware
pnpm add vue        # @ubean/auth/runtime
```

## 快速开始

**1. 启用模块**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  auth: true
});
```

**2. 配置 provider**

`betterAuth` 接受普通对象，或一个接收已解析默认值的函数 —— 这样可以「扩展」而不是「替换」默认配置。

```ts
// vite.config.ts
import { ubeanAuthPlugin, defineAuthConfig } from '@ubean/auth/vite';

export default defineConfig({
  plugins: [
    ubeanAuthPlugin(
      defineAuthConfig({
        basePath: '/api/auth',
        betterAuth: ({ defaults }) => ({
          ...defaults,
          emailAndPassword: { enabled: true }
        }),
        socialProviders: {
          google: { clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }
        }
      })
    )
  ]
});
```

**3. 保护页面或路由**

```ts
// src/pages/dashboard.vue
definePage({ requiresAuth: true });
```

```ts
// src/routes/api/admin/stats.ts
export const GET = defineHandler(defineHandlerMeta({ requiresAuth: true }), async c => {
  return c.json({ ok: true });
});
```

**4. 在路由中读取会话**

```ts
// src/routes/api/me.ts
import { getServerSession, requireAuth } from '@ubean/auth';

export const GET = defineHandler(async c => {
  // 没有用户时抛出 401 Error
  const user = requireAuth(c);
  const session = await getServerSession(c.req.raw);
  return c.json({ user, session });
});
```

## 服务端辅助函数

| 辅助函数                   | 说明                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `createAuthHandler(opts)`  | 返回 `{ handler, resolveAuth, getOptions }`。`handler(request)` 接受标准 `Request`。 |
| `authMiddleware()`         | Hono 中间件，把 `user` / `session` 挂到请求上下文。                                  |
| `getUser()`                | 从请求上下文取当前 `AuthUser`，无则 `null`。无需参数。                               |
| `getAuthSession()`         | 从请求上下文取完整 `AuthState`（`{ session, user }`），无则 `null`。                 |
| `getServerSession(req?)`   | 异步地从 `Request`（或当前上下文）查询会话。SSR 取数时使用。                         |
| `requireAuth(c?)`          | 未认证时抛出 401 `Error`；否则返回用户。                                             |
| `defineAuth(options)`      | 声明式 `UbeanAuthOptions` 入口。                                                     |
| `resolveAuthOptions(opts)` | 把选项归一化为 `ResolvedAuthOptions`（补齐 base path、secret、cookie、跳转目标）。   |

> 主入口导出的是 `getAuthSession`；`getSession` 是同一个函数在内核里的名字。

生产环境下需要你自己挂载 handler —— dev 期的自动挂载不适用于构建产物：

```ts
// src/routes/api/auth/[...all].ts
import { createAuthHandler } from '@ubean/auth';

const auth = createAuthHandler({ basePath: '/api/auth' });

export const GET = defineHandler(c => auth.handler(c.req.raw));
export const POST = defineHandler(c => auth.handler(c.req.raw));
```

## 客户端与 Vue 运行时

`createAuthClient(basePath = '/api/auth')` 返回一个可在任意框架中驱动的 `AuthClient`：

```ts
import { createAuthClient } from '@ubean/auth';

const auth = createAuthClient('/api/auth');

const { data, error } = await auth.signIn.email({ email, password, callbackURL: '/dashboard' });
await auth.signIn.social('google', { callbackURL: '/dashboard' });
const session = await auth.getSession();
```

Vue 运行时把它包装成响应式状态：

```ts
import { useAuth } from '@ubean/auth/runtime';

const { session, user, isAuthenticated, isLoading, signIn, signUp, signOut, refreshSession } = useAuth();
```

| Composable                  | 返回值                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `useAuth(basePath?)`        | 响应式 `session` / `user` / `isAuthenticated` / `isLoading` 以及各操作  |
| `useSession(basePath?)`     | `{ data, isPending, error, refetch }` —— 窗口聚焦与标签页可见时自动重取 |
| `getSessionFromHeaders(h)`  | SSR 期通过转发传入的 `Headers` 查询会话                                 |
| `protectRoute(redirectTo?)` | 客户端守卫：未认证时跳转 `/login?redirect=<当前路径>`                   |

## Vite 插件

`ubean.config.ts` 里的 `auth` 字段会完成接线；需要完整控制时直接使用插件：

```ts
import { ubeanAuthPlugin, defineAuthConfig } from '@ubean/auth/vite';

export default defineConfig({
  plugins: [ubeanAuthPlugin(defineAuthConfig({ basePath: '/api/auth' }))]
});
```

开发环境下插件会自动挂载 `/api/auth/*` 路由 —— dev 期**无需任何路由文件**。生产构建时请通过 `createAuthHandler()` 自行挂载 handler。

## 类型安全

- `UbeanAuthOptions.betterAuth` 的类型是 `Omit<BetterAuthOptions, 'baseURL' | 'basePath' | 'trustedOrigins'>` 或 `({ defaults }) => BetterAuthOptions` 函数 —— 被 omit 的键正是 ubean 自己负责的那些。
- `AuthSession` 是 `{ session: Session; user: User }`；`AuthState` 是请求上下文变体，其 user 为 `AuthUser`。
- `UseAuthReturn` 暴露的是 `Ref` / `ComputedRef` 字段，因此模板中 `isAuthenticated` 能正确收窄。
- `AuthError` 携带 `message`、`code?`、`statusCode?` —— 每个客户端操作返回的形状。
- `BetterAuthConfig` 作为 `BetterAuthOptions` 的别名导出，供重导出面使用。

## 架构说明

- **优雅回退。** `createAuthHandler` 懒加载 `import('better-auth')`。模块或配置缺失时使用内置的 email/password handler，因此项目可以在未安装认证后端的情况下先跑起来。
- **选项解析集中在一处。** `resolveAuthOptions` 补齐 base path、secret、session cookie 名与 TTL、跳转目标，因此所有辅助函数读到的都是同一份解析结果。
- **请求上下文是唯一事实来源。** `authMiddleware` 把 `user` / `session` 放到 Hono context；`getUser` / `getAuthSession` 从那里读，只有 `Request` 可用时由 `getServerSession` 重新查询。
- **守卫是声明式的。** `requiresAuth` 是页面/handler 的 meta 标记，由 router 与中间件链消费，而不是另一套 middleware 文件约定。
- **客户端与服务端共用一个 client。** `useAuth` 与 `createAuthClient` 使用同一个 `basePath`，改一处挂载点两边自动一致。
