---
title: Overview
---

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

### Special Pages (404 / Loading)

ubean auto-detects special pages at the **root** of `src/pages/`. These are not registered as regular routes — they serve framework-level roles instead:

| File | Role | Effect |
| --- | --- | --- |
| `pages/404.vue` (or `.ts` / `.md`) | Not Found page | Registers a Vue Router catch-all `/:pathMatch(.*)*` **and** a Hono `GET *` fallback handler. Unmatched browser navigation returns HTTP 404 and renders this component. API (`/api/*`) and internal (`/_*`) paths still get the default JSON 404. |
| `pages/loading.vue` (or `.ts` / `.md`) | Loading indicator | Used as the `<Suspense>` fallback component, shown while a lazy-loaded page component is being resolved during SPA navigation. SSR skips this (server resolves async synchronously). |
| `pages/error.vue` (or `.ts` / `.md`) | Error boundary | Used as the `ErrorBoundary` component (Vue `errorCaptured`). Renders when a page's render / setup / async resolution throws. Receives an `error` prop. Auto-resets on route change. Client-only. |

Only root-level files are treated as special. A nested file like `pages/users/404.vue` remains a regular route at `/users/404`.

#### Overriding via `defineApp`

Both `loadingComponent` and `errorComponent` can also be configured (or overridden) programmatically via `defineApp`:

```typescript
// src/app.ts
import { defineApp } from 'ubean';
import MyLoading from './components/MyLoading.vue';
import MyError from './components/MyError.vue';

export default defineApp({
  // Overrides pages/loading.vue auto-detection
  loadingComponent: MyLoading,

  // Overrides pages/error.vue auto-detection
  errorComponent: MyError
});
```

Priority: `defineApp({ loadingComponent / errorComponent })` > `pages/loading.vue` / `pages/error.vue` auto-detection.

`errorComponent` wraps the page content in an error boundary (using Vue's `errorCaptured` lifecycle). The error state auto-resets when the route changes, so navigating away from a broken page clears the boundary.

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

`definePage` is a compile-time macro for configuring page options. Its top-level fields are `name`, `path`, `layout`, `reuse`, `meta`, `middleware`, `requiresAuth`, `cache`, `head`. There is **no top-level `title`** — use `meta: { title }`:

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
  cache: true,                      // Enable KeepAlive page caching
  head: {                           // Per-page head tags (@unhead/vue)
    title: 'My Page',
    meta: [{ name: 'description', content: '...' }]
  }
});
</script>
```

## Page Caching (KeepAlive)

Set `cache: true` in `definePage` to preserve the page component instance with Vue's `<KeepAlive>` when navigating away. When the user navigates back, the page is restored from cache instead of being re-mounted — local state (form input, scroll position, etc.) is preserved.

The framework automatically wraps the page component with a named wrapper (`getNamedPageWrapper`) using the route name. This means `<script setup>` SFCs work out of the box — you do **not** need to manually call `defineOptions({ name: 'About' })` to make KeepAlive's `include` filter match.

```vue
<!-- src/pages/about.vue -->
<script setup lang="ts">
import { onActivated, onDeactivated } from 'vue';

definePage({ cache: true });

onActivated(() => {
  // Fires when navigating back to this cached page
  console.log('About re-activated');
});

onDeactivated(() => {
  // Fires when navigating away (component is kept alive, not unmounted)
  console.log('About deactivated');
});
</script>

<template>
  <div>About Page</div>
</template>
```

> When `cache: true` is set, use `onActivated` / `onDeactivated` instead of `onMounted` / `onUnmounted` for lifecycle logic that should fire on every visit.

### Runtime cache control

Use the auto-imported cache helpers to toggle caching at runtime (e.g. from a layout or a settings panel):

```vue
<script setup lang="ts">
// All auto-imported from ubean/runtime/vue
const { cachedViews, excludedViews } = useCacheViews();

function toggleCache(name: string) {
  if (cachedViews.value.includes(name)) {
    disablePageCache(name);
  } else {
    enablePageCache(name);
  }
}

// Force-remove a cached instance so it re-mounts next visit
invalidatePageCache('About');

// Reload the current cached page (exclude → wait → include, forces remount)
await resetRouteCache('About');
</script>
```

Available runtime helpers (all auto-imported from `ubean/runtime/vue`):

| Function                       | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `useCacheViews()`              | Reactive store with `cachedViews` / `excludedViews` / `enabled`  |
| `enablePageCache(name)`        | Add a route name to the cache include list                        |
| `disablePageCache(name)`       | Remove a route name from the cache (prunes its instance)          |
| `excludePageCache(name)`       | Temporarily exclude a page from cache (forces prune next render) |
| `includePageCache(name)`       | Restore caching for an excluded page                              |
| `invalidatePageCache(name?)`   | Invalidate a specific page, or all pages when omitted             |
| `isPageCached(name)`           | Check whether a page is currently cached                          |
| `resetRouteCache(name?, delay)` | Reload a cached page by exclude → wait → include (forces remount) |

### Reuse route cache inheritance

When a `.reuse.ts` page does **not** explicitly declare `cache`, it inherits the target page's `cache` setting. This means if the target page has `cache: true`, the reuse route is automatically cached too — each as an independent KeepAlive instance keyed by its own route name.

```ts
// pages/about.vue — cache enabled
definePage({ cache: true });

// pages/about2.reuse.ts — inherits cache: true automatically
export default definePage({ reuse: 'About' });

// pages/about3.reuse.ts — explicitly disable cache (overrides inheritance)
export default definePage({ reuse: 'About', cache: false });
```

| Reuse page `cache` value | Behavior |
| ------------------------ | -------- |
| `undefined` (not declared) | Inherit from target page |
| `true` | Explicitly enable cache (even if target is not cached) |
| `false` | Explicitly disable cache (even if target is cached) |

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
      cache: { ttl: 3600 }
    }
  }
});
```

Supported rule fields (processed in order: `redirect` > `rewrite` > `headers` (merged) > `cache` (→ `Cache-Control`)):

- `*` matches a single path segment
- `**` matches multiple segments recursively

### Per-Route Rendering Rules (P9-03)

In addition to HTTP-level rules, `routeRules` can override rendering behavior per route. This aligns with Nuxt's `routeOptions` and Astro's `export const prerender`:

```typescript
export default defineConfig({
  routeRules: {
    // Force CSR for admin pages (overrides global ssr: true)
    '/admin/**': { ssr: false },

    // Force SSR for a specific page (overrides ssr.exclude)
    '/dashboard/realtime': { ssr: true },

    // Streaming SSR for this route (overrides global streaming setting)
    '/feed': { ssr: 'streaming' },

    // ISR: regenerate every 60s, serve stale while revalidating
    '/blog/**': { isr: { ttl: 60, swr: true } },

    // ISR with simple ttl form (no SWR)
    '/news/**': { isr: 300 },

    // Prerender at build time (auto-discovered by the prerenderer)
    '/about': { prerender: true },
    '/blog/**': { prerender: true }
  }
});
```

| Field       | Type                          | Description                                                                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ssr`       | `boolean \| 'streaming'`      | Override global SSR setting for matching routes. `false` → CSR, `true` → SSR, `'streaming'` → streaming SSR. |
| `prerender` | `boolean`                     | Mark route for build-time prerendering. Auto-discovered by `prerender()` from `routeRules`.                   |
| `isr`       | `number \| { ttl: number; swr?: boolean }` | Incremental Static Regeneration. `ttl` in seconds; `swr: true` serves stale content while revalidating.       |

**Specificity & merging**: Rules are sorted by a combined score (rule-type weight + path-segment weight). For a given request, the matched rule is exposed to handlers via `c.get('routeRule')` and drives:

- `ssr` / `ssr: 'streaming'` → overrides `ssr.exclude` and `SsrOptions.streaming` for that route
- `isr` → GET requests are served from ISR cache (HIT / STALE / MISS, marked via `X-ISR` header); the renderer runs on MISS (and on STALE when `swr` is enabled, in the background)
- `prerender` → `collectPrerenderRoutes()` automatically collects these patterns at build time (merged with `prerender.include` / `prerender.all`)

See also [Cache Operations](/docs/reference/api/cache) for `CacheStore.peek()` and ISR internals.

## Data Fetching

Use `useData()` (auto-imported from `ubean`) for declarative data fetching with caching, TTL, dependencies and invalidation:

```vue
<script setup lang="ts">
const { data, error, loading, refresh, invalidate } = await useData('posts', () =>
  fetch('/api/posts').then(r => r.json())
);
</script>
```

## Next Steps

- [Data Fetching (useData)](/docs/guide/pages-routing/loaders)
- [Form Actions](/docs/guide/pages-routing/actions)
- [API Routes](/docs/guide/api-routes)
- [Internationalization](/docs/guide/i18n)
