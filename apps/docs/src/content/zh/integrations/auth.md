---
title: 身份认证
description: 使用 @ubean/auth 做身份认证：集成 Better Auth，未安装 better-auth 时降级到内置的邮箱/密码实现。
---

# 身份认证

ubean 的第一方认证集成位于 `@ubean/auth` 包，它对 Better Auth 做了封装；当项目未安装 `better-auth` 时，会优雅降级到内置的邮箱/密码实现。

## 安装

```bash
pnpm add @ubean/auth
# 可选但推荐：
pnpm add better-auth
```

## 配置

在 `ubean.config.ts` 中启用该模块：

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  auth: true // 用默认值启用内置模块
});
```

需要完整定制时，可直接通过 `@ubean/auth` 的 Vite 插件配置：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { ubeanAuthPlugin } from '@ubean/auth/vite';

export default defineConfig({
  plugins: [
    ubeanAuthPlugin({
      basePath: '/api/auth',
      // Better Auth 选项（透传给 betterAuth()）——
      // 可以是对象，也可以是函数：betterAuth: ({ defaults }) => ({ ... })
      betterAuth: {
        database: { /* Drizzle / Kysely / ... */ },
        emailAndPassword: { enabled: true }
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        }
      }
    })
  ]
});
```

开发环境下该插件会自动挂载 `/api/auth/*` 路由——dev 期间**无需编写任何路由文件**。生产构建时，请自行挂载 handler（见下文的 `createAuthHandler()`），或接入自定义服务端集成。

## 服务端访问

用 `createAuthHandler()` 手动挂载认证 handler（例如在已有 API 路由内部，或对接自定义服务器时）：

```typescript
// routes/api/auth/[...all].ts
import { defineHandler } from 'ubean/server';
import { createAuthHandler } from '@ubean/auth';

const { handler } = createAuthHandler();

export const ALL = defineHandler(async c => {
  return handler(c.req.raw); // handler 期望接收标准 Request
});
```

在任意 API 路由中读取会话：

```typescript
// routes/api/me.ts
import { defineHandler } from 'ubean/server';
import { getServerSession } from '@ubean/auth';

export const GET = defineHandler({
  requiresAuth: true
}, async c => {
  const session = await getServerSession(c.req.raw);
  return c.json({ user: session?.user });
});
```

### 服务端辅助函数

| 函数                                   | 说明                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `createAuthHandler(opts)`              | 创建认证后端；返回 `{ handler, resolveAuth, getOptions }`                    |
| `authMiddleware()`                     | Hono 中间件，把 `user` / `session` 挂到 context 上                           |
| `getUser()`                            | 从请求 context 取当前用户（无需传参）                                        |
| `getSession()`                         | 从请求 context 取完整的 `{ user, session }`                                  |
| `requireAuth(c?)`                      | 未认证时抛出 401 `Error`；通过则返回用户                                     |
| `getServerSession(req?)`               | 仅服务端的会话查询，从 `Request`（或当前 context）读取                       |
| `protectRoute(redirectTo = '/login')`  | 客户端路由守卫，未认证时重定向                                               |

## 客户端用法

`useAuth()` 是一个 Vue composable，暴露响应式的 `session`、`user`、`isAuthenticated`，以及 `signIn`/`signUp`/`signOut` 动作：

```vue
<script setup lang="ts">
import { useAuth } from '@ubean/auth';

const {
  session,
  user,
  isAuthenticated,
  isLoading,
  signIn,
  signUp,
  signOut
} = useAuth();

async function handleLogin(email: string, password: string) {
  const { error } = await signIn.email({ email, password, callbackURL: '/dashboard' });
  if (error) console.error(error);
}

async function handleGoogle() {
  await signIn.social('google', { callbackURL: '/dashboard' });
}
</script>

<template>
  <div v-if="isLoading">Checking session…</div>
  <div v-else-if="isAuthenticated">Welcome, {{ user?.name }}</div>
  <form v-else @submit.prevent="handleLogin(email, password)">…</form>
</template>
```

## 保护路由

### 页面级（通过 `definePage`）

```vue
<!-- pages/dashboard.vue -->
<script setup lang="ts">
definePage({
  requiresAuth: true
});
</script>
```

### API 级（通过 `defineHandlerMeta`）

```typescript
// routes/api/admin/users.ts
import { defineHandler, defineHandlerMeta } from 'ubean/server';

export const GET = defineHandler(
  defineHandlerMeta({ requiresAuth: true }),
  async c => {
    return c.json({ users: [] });
  }
);
```

### 编程式守卫

```typescript
import { defineHandler } from 'ubean/server';
import { requireAuth } from '@ubean/auth';

export const DELETE = defineHandler(async c => {
  const session = await requireAuth(c); // 缺失时抛出 401
  return c.json({ ok: true });
});
```

## 社交登录提供商

在插件选项中配置 OAuth 提供商：

```typescript
ubeanAuthPlugin({
  socialProviders: {
    google: { clientId: '…', clientSecret: '…' },
    github: { clientId: '…', clientSecret: '…' }
  }
});
```

在客户端发起授权流程：

```typescript
await signIn.social('github', { callbackURL: '/dashboard' });
```

## 中间件模式（自定义 JWT）

如果需要自定义的 JWT 流程（例如 token 交换），就定义一个普通的 ubean 中间件。自定义中间件请使用 `defineHandler` 配合 void 风格的命名导出。

```typescript
// middleware/auth.ts
import { defineMiddleware } from 'ubean/server';
import { verify } from 'jsonwebtoken';

export default defineMiddleware(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    c.set('user', verify(header.slice(7), process.env.JWT_SECRET!));
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});
```

按目录约定挂载即可生效：`middleware/admin/auth.ts` 作用于 `/admin/*`。

## ubean 不提供的能力

- `defineEventHandler` —— 请用 `defineHandler` 配合 `GET`/`POST`/… 命名导出
- `.post.ts` / `.get.ts` 文件后缀 —— 需要时用单个 `login.ts` 同时导出 `GET` 和 `POST`
- 独立的 `json()` / `redirect()` 辅助函数 —— 请用 Hono context 上的 `c.json()` / `c.redirect()`

## 最佳实践

1. **优先使用 `@ubean/auth`，不要手写认证** —— Better Auth 已经处理了会话轮换、CSRF 与 OAuth 的各种边界情况。
2. **受保护路由上始终设置 `requiresAuth: true`**，而不是在 handler 函数体里做守卫。
3. **SSR 数据加载用 `getServerSession(c.req.raw)`** —— 它直接读取 cookie，无需额外一次往返。
4. **轮换密钥** —— 把 `JWT_SECRET` 和各家 provider 的密钥放进 `defineEnv()`，用 `{ type: String, required: true }` 声明。
5. **登录端点配合 `defineRateLimit`** 使用，以缓解暴力破解。
