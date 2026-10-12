# @ubean/auth

**English | [中文](./README.zh-CN.md)**

Better Auth integration for the ubean framework — a thin wrapper with a built-in email/password fallback.

```ts
import { getUser, requireAuth, getServerSession } from '@ubean/auth';

export const GET = defineHandler(async c => {
  const user = requireAuth(c);
  return c.json({ id: user.id, email: user.email });
});
```

## Table of Contents

- [@ubean/auth](#ubeanauth)
  - [Package Positioning](#package-positioning)
  - [Install](#install)
  - [Quick Start](#quick-start)
  - [Server Helpers](#server-helpers)
  - [Client & Vue Runtime](#client--vue-runtime)
  - [Vite Plugin](#vite-plugin)
  - [Type Safety](#type-safety)
  - [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                 | Responsibility                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `@ubean/auth` (core)  | Handler creation, option resolution, request-scoped user/session access, guards |
| `@ubean/auth/client`  | Framework-agnostic browser client (`createAuthClient`)                          |
| `@ubean/auth/runtime` | Vue composables and a client-side route guard                                   |
| `@ubean/auth/vite`    | Dev-time mounting of `/api/auth/*` plus the module config entry                 |

**Included:**

- `createAuthHandler` — dynamically imports `better-auth`; when it is not installed (or no config is supplied) falls back to a built-in email/password implementation.
- `defineAuth` / `resolveAuthOptions` — declare and normalize `UbeanAuthOptions` (base path, secret, session cookie, redirect targets, social providers).
- `authMiddleware` / `getUser` / `getAuthSession` / `getServerSession` / `requireAuth` — read the current identity from a request.
- `createAuthClient` / `useAuth` / `useSession` / `getSessionFromHeaders` / `protectRoute` — browser and Vue side.
- `ubeanAuthPlugin` / `defineAuthConfig` — the Vite plugin that mounts `/api/auth/*` in dev.

**NOT included** (deliberately):

- No event-handler API. API routes are plain Hono handlers via `defineHandler` from `@ubean/routes`, with `GET` / `POST` named exports — there is no `defineEventHandler`, and no `.get.ts` / `.post.ts` suffixes.
- No standalone `json()` / `redirect()` helpers. Use the Hono context: `c.json(...)`, `c.redirect(...)`.
- No user database. Persistence is Better Auth's job (or the fallback handler's in-memory store); ubean does not ship a users table. Database access itself belongs to `@ubean/server/db`.
- No UI. Login/signup pages are yours to build; the package only supplies state and actions.
- No authorization policy engine. `requiresAuth` answers "is there a user?", not "may this user do this?" — role/permission checks are application code.

**Runtime dependency whitelist (main entry):** `@ubean/shared`, `better-auth`, `defu`.

**Optional peers:** `hono`, `vite`, `vue`. `better-auth` is a regular dependency but is imported dynamically, so the package still loads and falls back to the built-in email/password handler if the module is unavailable at runtime.

## Install

```bash
# the ubean-side integration
pnpm add @ubean/auth

# the auth engine — recommended; without it the built-in fallback is used
pnpm add better-auth

# peers you only need if you use that part of the surface
pnpm add hono       # authMiddleware on a Hono app
pnpm add vue        # @ubean/auth/runtime
```

## Quick Start

**1. Enable the module**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  auth: true
});
```

**2. Configure providers**

`betterAuth` accepts a plain object or a function that receives the resolved defaults, so you can extend rather than replace them.

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

**3. Protect a page or a route**

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

**4. Read the session in a route**

```ts
// src/routes/api/me.ts
import { getServerSession, requireAuth } from '@ubean/auth';

export const GET = defineHandler(async c => {
  // throws a 401 Error when there is no user
  const user = requireAuth(c);
  const session = await getServerSession(c.req.raw);
  return c.json({ user, session });
});
```

## Server Helpers

| Helper                     | Description                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `createAuthHandler(opts)`  | Returns `{ handler, resolveAuth, getOptions }`. `handler(request)` takes a standard `Request`. |
| `authMiddleware()`         | Hono middleware that attaches `user` / `session` to the request context.                       |
| `getUser()`                | Current `AuthUser` from the request context, or `null`. No arguments.                          |
| `getAuthSession()`         | Full `AuthState` (`{ session, user }`) from the request context, or `null`.                    |
| `getServerSession(req?)`   | Async session lookup from a `Request` (or the current context). Use it in SSR data loading.    |
| `requireAuth(c?)`          | Throws a 401 `Error` when unauthenticated; returns the user otherwise.                         |
| `defineAuth(options)`      | Declarative `UbeanAuthOptions` entry point.                                                    |
| `resolveAuthOptions(opts)` | Normalizes options into `ResolvedAuthOptions` (fills base path, secret, cookie, redirects).    |

> The main entry exports `getAuthSession`; `getSession` is the same function under its core name.

In production, mount the handler yourself — the dev-time auto-mount does not apply to built output:

```ts
// src/routes/api/auth/[...all].ts
import { createAuthHandler } from '@ubean/auth';

const auth = createAuthHandler({ basePath: '/api/auth' });

export const GET = defineHandler(c => auth.handler(c.req.raw));
export const POST = defineHandler(c => auth.handler(c.req.raw));
```

## Client & Vue Runtime

`createAuthClient(basePath = '/api/auth')` returns an `AuthClient` you can drive from any framework:

```ts
import { createAuthClient } from '@ubean/auth';

const auth = createAuthClient('/api/auth');

const { data, error } = await auth.signIn.email({ email, password, callbackURL: '/dashboard' });
await auth.signIn.social('google', { callbackURL: '/dashboard' });
const session = await auth.getSession();
```

The Vue runtime wraps it in reactive state:

```ts
import { useAuth } from '@ubean/auth/runtime';

const { session, user, isAuthenticated, isLoading, signIn, signUp, signOut, refreshSession } = useAuth();
```

| Composable                  | Returns                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `useAuth(basePath?)`        | Reactive `session` / `user` / `isAuthenticated` / `isLoading` plus the actions   |
| `useSession(basePath?)`     | `{ data, isPending, error, refetch }` — refetches on focus and tab visibility    |
| `getSessionFromHeaders(h)`  | Session lookup during SSR by forwarding the incoming `Headers`                   |
| `protectRoute(redirectTo?)` | Client guard: redirects to `/login?redirect=<current path>` when unauthenticated |

## Vite Plugin

The `auth` field in `ubean.config.ts` wires the module; use the plugin directly for full control:

```ts
import { ubeanAuthPlugin, defineAuthConfig } from '@ubean/auth/vite';

export default defineConfig({
  plugins: [ubeanAuthPlugin(defineAuthConfig({ basePath: '/api/auth' }))]
});
```

In development the plugin mounts the `/api/auth/*` routes automatically — **no route files are needed** in dev. For production builds, mount the handler yourself via `createAuthHandler()`.

## Type Safety

- `UbeanAuthOptions.betterAuth` is typed as `Omit<BetterAuthOptions, 'baseURL' | 'basePath' | 'trustedOrigins'>` or a `({ defaults }) => BetterAuthOptions` function — the omitted keys are the ones ubean owns.
- `AuthSession` is `{ session: Session; user: User }`; `AuthState` is the request-context variant with `AuthUser`.
- `UseAuthReturn` exposes `Ref` / `ComputedRef` fields, so `isAuthenticated` narrows correctly in templates.
- `AuthError` carries `message`, `code?` and `statusCode?` — the shape returned by every client action.
- `BetterAuthConfig` is exported as an alias of `BetterAuthOptions` for the re-export surface.

## Architecture Notes

- **Graceful fallback.** `createAuthHandler` calls `import('better-auth')` lazily. If the module or the config is absent, a built-in email/password handler is used, so a project can start without an auth backend installed.
- **Option resolution is centralized.** `resolveAuthOptions` fills base path, secret, session cookie name/TTL and redirect targets, so every helper reads the same resolved object.
- **Request context is the source of truth.** `authMiddleware` puts `user` / `session` on the Hono context; `getUser` / `getAuthSession` read from it, `getServerSession` re-queries when only a `Request` is available.
- **Guards are declarative.** `requiresAuth` is a page/handler meta flag consumed by the router and the middleware chain, not a separate middleware file convention.
- **Client and server share one client.** `useAuth` and `createAuthClient` speak to the same `basePath`, so changing the mount point in one place keeps both in sync.
