---
title: Auth
description: "Authentication with @ubean/auth: Better Auth integration and a built-in email/password fallback."
---

# Authentication

ubean's first-party auth integration lives in the `@ubean/auth` package, which wraps Better Auth with graceful fallback to a built-in email/password implementation when `better-auth` is not installed.

## Installation

```bash
pnpm add @ubean/auth
# Optional but recommended:
pnpm add better-auth
```

## Configuration

Enable the module in `ubean.config.ts`:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  auth: true // enable the built-in module with defaults
});
```

For full customization, configure `@ubean/auth` directly via its Vite plugin:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { ubeanAuthPlugin } from '@ubean/auth/vite';

export default defineConfig({
  plugins: [
    ubeanAuthPlugin({
      basePath: '/api/auth',
      // Better Auth options (forwarded to betterAuth()) —
      // object form, or a function: betterAuth: ({ defaults }) => ({ ... })
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

In development, the plugin mounts the `/api/auth/*` routes automatically — **no route files are needed** in dev. For production builds, mount the handler yourself via `createAuthHandler()` (below) or a custom server integration.

## Server-side access

Use `createAuthHandler()` to mount the auth handler manually (e.g. inside an existing API route or when integrating with a custom server):

```typescript
// routes/api/auth/[...all].ts
import { defineHandler } from 'ubean';
import { createAuthHandler } from '@ubean/auth';

const { handler } = createAuthHandler();

export const ALL = defineHandler(async c => {
  return handler(c.req.raw); // handler expects a standard Request
});
```

Read the session inside any API route:

```typescript
// routes/api/me.ts
import { defineHandler } from 'ubean';
import { getServerSession } from '@ubean/auth';

export const GET = defineHandler({
  requiresAuth: true
}, async c => {
  const session = await getServerSession(c.req.raw);
  return c.json({ user: session?.user });
});
```

### Server helpers

| Function                 | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `createAuthHandler(opts)` | Creates the auth backend; returns `{ handler, resolveAuth, getOptions }` |
| `authMiddleware()`       | Hono middleware that attaches `user` / `session` to the context |
| `getUser()`              | Current user from the request context (no args)        |
| `getSession()`           | Full `{ user, session }` from the request context      |
| `requireAuth(c?)`        | Throws a 401 `Error` if not authenticated; returns the user |
| `getServerSession(req?)` | Server-only session lookup from a `Request` (or the current context) |
| `protectRoute(redirectTo = '/login')` | Client-side route guard that redirects when unauthenticated |

## Client-side usage

`useAuth()` is a Vue composable that exposes reactive `session`, `user`, `isAuthenticated`, and `signIn`/`signUp`/`signOut` actions:

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

## Protecting routes

### Page-level (via `definePage`)

```vue
<!-- pages/dashboard.vue -->
<script setup lang="ts">
definePage({
  requiresAuth: true
});
</script>
```

### API-level (via `defineHandlerMeta`)

```typescript
// routes/api/admin/users.ts
import { defineHandler, defineHandlerMeta } from 'ubean';

export const GET = defineHandler(
  defineHandlerMeta({ requiresAuth: true }),
  async c => {
    return c.json({ users: [] });
  }
);
```

### Programmatic guard

```typescript
import { defineHandler } from 'ubean';
import { requireAuth } from '@ubean/auth';

export const DELETE = defineHandler(async c => {
  const session = await requireAuth(c); // throws 401 if missing
  return c.json({ ok: true });
});
```

## Social providers

Configure OAuth providers in the plugin options:

```typescript
ubeanAuthPlugin({
  socialProviders: {
    google: { clientId: '…', clientSecret: '…' },
    github: { clientId: '…', clientSecret: '…' }
  }
});
```

Trigger the flow from the client:

```typescript
await signIn.social('github', { callbackURL: '/dashboard' });
```

## Middleware pattern (custom JWT)

If you need a custom JWT flow (e.g. legacy token exchange), define a plain ubean middleware. **Do not use `defineEventHandler`** — it does not exist; use `defineHandler` with void-style named exports.

```typescript
// middleware/auth.ts
import { defineMiddleware } from 'ubean';
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

Mount it via directory convention: `middleware/admin/auth.ts` applies to `/admin/*`.

## What ubean does NOT provide

- `defineEventHandler` — use `defineHandler` with `GET`/`POST`/… named exports
- `.post.ts` / `.get.ts` file suffixes — use a single `login.ts` exporting both `GET` and `POST` if needed
- Standalone `json()` / `redirect()` helpers — use `c.json()` / `c.redirect()` on the Hono context

## Best Practices

1. **Prefer `@ubean/auth` over hand-rolled auth** — Better Auth handles session rotation, CSRF, and OAuth edge cases.
2. **Always set `requiresAuth: true`** on protected routes rather than guarding inside the handler body.
3. **Use `getServerSession(c.req.raw)` for SSR data loading** — it reads cookies directly without an extra round trip.
4. **Rotate secrets** — store `JWT_SECRET` / provider secrets in `defineEnv()` with `{ type: String, required: true }`.
5. **Combine with `defineRateLimit`** for login endpoints to mitigate brute force.
