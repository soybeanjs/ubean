# Pages and Routing Overview

ubean uses a file-based routing system. Pages are Vue components in `src/pages/`; API routes use Hono handlers with void-style named exports in `src/routes/`.

## Page Components

Pages are Vue components located in `src/pages/`. The file structure determines the route path.

### Basic Pages

```
src/pages/
├── index.vue           → /
├── about.vue           → /about
└── blog/
    ├── index.vue       → /blog
    └── [slug].vue      → /blog/:slug
```

### Dynamic Routes

Use square brackets `[param]` for dynamic segments:

```
src/pages/users/[id].vue        → /users/:id
src/pages/posts/[year]/[slug].vue → /posts/:year/:slug
```

Access route parameters via `useRouter()` (auto-imported from `ubean/runtime/vue`):

```vue
<script setup lang="ts">
// useRouter is auto-imported, no explicit import needed
const router = useRouter();

// Current route info
console.log(router.currentRoute.value.path);
console.log(router.currentRoute.value.params.id);
console.log(router.currentRoute.value.query);
console.log(router.currentRoute.value.hash);
</script>
```

### Catch-All Routes

Use `[...path]` for catch-all routes:

```
src/pages/[...path].vue → /anything/here
```

### Route Groups

Directories wrapped in parentheses don't contribute URL segments:

```
src/pages/(marketing)/about.vue → /about  (group "marketing" ignored)
```

## Layouts

Layout components wrap pages and provide consistent UI across routes.

### Default Layout

Create `src/layouts/default.vue`:

```vue
<template>
  <header>
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
    </nav>
  </header>
  <main>
    <slot />
  </main>
</template>
```

> `<Link>` is globally registered — no import needed.

### Custom Layouts

Specify a layout per page via `definePage`:

```vue
<script setup lang="ts">
// definePage is a compile-time macro, auto-imported
definePage({
  layout: 'admin'
});
</script>
```

Create `src/layouts/admin.vue` (or `src/layouts/admin/index.vue`) for the admin layout. Layouts support nested chains (e.g. `admin/dashboard` → `admin` → `default`).

## Page Metadata (definePage)

`definePage` is a compile-time macro for configuring page options. Its top-level fields are `name`, `path`, `layout`, `reuse`, `meta`, `middleware`, `requiresAuth`, `head`. There is **no top-level `title`** — use `meta: { title }`:

```vue
<script setup lang="ts">
definePage({
  name: 'About',                   // Route name (PascalCase)
  layout: 'default',               // Layout name
  meta: {                           // Custom metadata
    title: 'My Page',
    description: 'My page description'
  },
  middleware: ['auth'],            // Page-level middleware
  requiresAuth: true,               // Auth requirement (meta shortcut)
  head: {                           // Per-page head tags (@unhead/vue)
    title: 'My Page',
    meta: [{ name: 'description', content: '...' }]
  }
});
</script>
```

## Navigation

### `<Link>` Component (Globally Registered)

`<Link>` is auto-registered as a global Vue component — no import needed:

```vue
<template>
  <Link to="/">Home</Link>
  <Link to="/about">About</Link>
  <Link to="/users/123">User 123</Link>
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User detail</Link>
  <Link :to="{ path: '/search', query: { q: 'ubean' } }">Search</Link>
</template>
```

`<Link>` props:

| Prop              | Type                                            | Description                          |
| ----------------- | ----------------------------------------------- | ------------------------------------ |
| `to`              | `string \| { name, params, query, hash }`      | Target route                         |
| `activeClass`     | `string`                                        | Class applied when link is active    |
| `exactActiveClass`| `string`                                        | Class for exact active match         |

The default slot also exposes `isActive` / `isExactActive` for advanced use.

### Programmatic Navigation (useRouter)

```vue
<script setup lang="ts">
// useRouter is auto-imported from ubean/runtime/vue
const router = useRouter();

function goAbout() {
  router.push('/about');
}

function replaceWithLogin() {
  router.replace('/login');
}

function goBack() {
  router.back();
}
</script>
```

### External URLs

For external URLs, use plain `<a>` tags:

```vue
<template>
  <a href="https://example.com" target="_blank" rel="noopener">External link</a>
</template>
```

## Middleware

Middleware runs before page or API routes. Files live in `src/middleware/`:

```typescript
// src/middleware/auth.ts
import { defineMiddleware } from 'ubean';

export default defineMiddleware(async c => {
  const user = c.get('user');
  if (!user) {
    return c.redirect('/login');
  }
});
```

### Ordering Rules

- `global.ts` or `global.*.ts` → mounted at `/*`
- Files with numeric prefix (e.g. `01-auth.ts`, `02-logging.ts`) → ordered by prefix
- Directory-prefixed middleware (e.g. `middleware/admin/auth.ts`) → mounted at `/admin/*`

## Navigation Guards (Client + SSR)

ubean exposes vue-router's global navigation guards (`beforeEach` / `beforeResolve` / `afterEach`) via `defineApp({ router })` in `src/app.ts`. Guards run on **both client and SSR**, so they can intercept the initial navigation (including SSR's `router.push(initialUrl)`).

```typescript
// src/app.ts
import { defineApp } from 'ubean';

export default defineApp({
  router: {
    setup(router) {
      // Auth guard — redirect to /login if route requires auth
      router.beforeEach((to, from) => {
        if (to.meta.requiresAuth && !isAuthenticated()) {
          return '/login';
        }
      });

      // Analytics / page title — runs after navigation completes
      router.afterEach((to) => {
        if (typeof document !== 'undefined' && to.meta?.title) {
          document.title = String(to.meta.title);
        }
      });
    }
  }
});
```

### Execution timing

`setup(router)` is called **after** the router instance is created and **before** `app.use(router)`. This ensures guards are registered before the first navigation kicks off, so they can intercept the initial URL on both client hydration and SSR rendering.

### Accumulation across `app.ts` + `app.server.ts` / `app.client.ts`

If you split your config into `app.ts` (shared) + `app.server.ts` and/or `app.client.ts`, all `setup` functions are **chained** (shared first, then client/server-specific). This lets you put common guards (e.g. analytics) in `app.ts` and environment-specific guards (e.g. SSR-only auth redirects) in `app.server.ts`.

### Constraints

- `setup` itself must register guards **synchronously** (the guard functions can return Promises).
- Don't `await` API calls inside `setup` — that delays the first navigation. Put async logic inside the guard callback instead.

### Guards vs backend middleware

| Aspect                | Frontend guards (`router.setup`)     | Backend middleware (`src/middleware/`)     |
| --------------------- | ------------------------------------- | ----------------------------------------- |
| Trigger               | Client-side navigation + SSR URL      | Every HTTP request                        |
| Runs on               | Browser + SSR runtime                 | Server (Hono)                             |
| Typical use           | Auth redirect, page title, analytics | Cookie parsing, session injection, CORS   |
| Network round-trip    | No                                    | Yes                                       |

Auth flows that need cookie/header inspection typically live in backend middleware (which injects user into context); frontend guards then read that state and decide whether to redirect.

## Route Rules

Define route-level rules in `ubean.config.ts`:

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  routeRules: {
    '/api/**': {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    },
    '/admin/**': {
      headers: { 'Cache-Control': 'private' }
    },
    '/static/**': {
      cache: { maxAge: 3600 }
    }
  }
});
```

Supported rule types (processed in order): `redirect` > `rewrite` > `headers` (merged) > `cache` (→ `Cache-Control`).

- `*` matches a single path segment
- `**` matches multiple segments recursively

## Data Fetching

Use `useData()` (auto-imported from `ubean`) for declarative data fetching with caching, TTL, dependencies and invalidation:

```vue
<script setup lang="ts">
const { data, error, loading, refresh, invalidate } = await useData('posts', () =>
  $fetch('/api/posts').then(r => r.json())
);
</script>
```

## Next Steps

- [Data Fetching (useData)](/docs/guide/pages-routing/loaders)
- [Form Actions](/docs/guide/pages-routing/actions)
- [API Routes](/docs/guide/api-routes)
- [Internationalization](/docs/guide/i18n)
