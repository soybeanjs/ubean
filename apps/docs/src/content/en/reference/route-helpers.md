---
title: Route Helpers
---

# Route Helpers

ubean's routing helpers revolve around `useRouter()` (auto-imported from `ubean/runtime/vue`) and the globally-registered `<Link>` component. ubean does **not** provide `useRoute()`, `navigateTo()`, `redirectTo()`, `useRouteParams()`, `useRouteQuery()`, `useLocalePath()`, or `useSwitchLocalePath()`.

## useRouter()

`useRouter()` returns the Vue Router instance extended with `push`/`replace` shortcuts. It is auto-imported (no import needed) in client components:

```vue
<script setup lang="ts">
const router = useRouter();
</script>
```

### Methods

| Method         | Description                          |
| -------------- | ------------------------------------ |
| `push(to)`     | Navigate to a new route              |
| `replace(to)`  | Replace current route (no history)   |
| `back()`       | Go back one step                     |
| `forward()`    | Go forward one step                  |
| `go(n)`        | Navigate n steps (negative = back)   |
| `beforeEach`   | Register global beforeEach guard    |
| `afterEach`    | Register global afterEach hook      |

### Reading Current Route

Access `router.currentRoute.value` to inspect the current route:

```typescript
const router = useRouter();
const route = router.currentRoute.value;

console.log(route.path);      // "/users/123"
console.log(route.params.id); // "123"
console.log(route.query.q);   // "search term"
console.log(route.hash);      // "#section"
console.log(route.fullPath);  // "/users/123?q=...#section"
console.log(route.name);      // "UserDetail"
console.log(route.meta);      // Page metadata
```

For reactive access in templates, use `router.currentRoute` directly or unwrap with a computed:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const router = useRouter();
const currentPath = computed(() => router.currentRoute.value.path);
const userId = computed(() => router.currentRoute.value.params.id as string);
</script>

<template>
  <p>Path: {{ currentPath }}</p>
  <p>User: {{ userId }}</p>
</template>
```

### Programmatic Navigation

```typescript
const router = useRouter();

// String path
router.push('/about');

// Object form with name + params
router.push({ name: 'UserDetail', params: { id: '123' } });

// With query
router.push({ path: '/search', query: { q: 'ubean' } });

// With hash
router.push({ path: '/docs', hash: '#section-1' });

// Replace (no history entry)
router.replace('/login');

// Go back / forward
router.back();
router.forward();
router.go(-2);
```

### Navigation Guards

There are two ways to register navigation guards:

#### 1. Global guards via `defineApp({ router })` — **recommended**

Register once at app startup in `src/app.ts`. Guards run on **both client and SSR**, and can intercept the first navigation. See [Navigation Guards guide](/docs/guide/pages-routing/overview#navigation-guards-client--ssr) for details.

```typescript
// src/app.ts
import { defineApp } from 'ubean';

export default defineApp({
  router: {
    setup(router) {
      router.beforeEach((to, from) => {
        if (to.meta.requiresAuth && !isAuthenticated()) {
          return '/login';
        }
      });
      router.afterEach((to, from) => {
        // Analytics, scroll-to-top, etc.
      });
    }
  }
});
```

#### 2. Per-component guards via `useRouter()`

For component-scoped guards (rare; mostly useful inside long-lived root components). Each call **appends** a new guard — make sure you're not re-registering on every mount:

```typescript
const router = useRouter();

router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return '/login';
  }
});

router.afterEach((to, from) => {
  // Analytics, scroll-to-top, etc.
});
```

> Production auth/analytics guards should live in `defineApp({ router })` to avoid duplicate registration and to ensure they fire during SSR.

## `<Link>` Component (Global)

`<Link>` is globally registered — no import needed. It performs client-side navigation and supports active-class styling.

```vue
<template>
  <!-- String path -->
  <Link to="/about">About</Link>

  <!-- Named route with params -->
  <Link :to="{ name: 'UserDetail', params: { id: '123' } }">User</Link>

  <!-- With query -->
  <Link :to="{ path: '/search', query: { q: 'ubean' } }">Search</Link>
</template>
```

### Props

| Prop               | Type                                       | Description                       |
| ------------------ | ------------------------------------------ | --------------------------------- |
| `to`               | `string \| { name, params, query, hash }` | Target route                      |
| `activeClass`      | `string`                                   | Class when link matches current   |
| `exactActiveClass` | `string`                                   | Class for exact match             |

External URLs (starting with `http://`, `https://`, `//`) are automatically detected and rendered as plain `<a>` tags with `target="_blank" rel="noopener"`.

### Slot Scope

The default slot exposes `isActive` and `isExactActive`:

```vue
<template>
  <Link to="/about" v-slot="{ isActive }">
    <span :class="{ active: isActive }">About</span>
  </Link>
</template>
```

## Page Metadata (definePage)

Use the `definePage` macro inside `<script setup>` to set page metadata. It is a compile-time macro, auto-imported:

```vue
<script setup lang="ts">
definePage({
  name: 'About',
  path: '/about',                    // Override auto-generated path
  layout: 'default',
  meta: {
    title: 'About Page',
    description: 'About our company'
  },
  middleware: ['auth'],
  requiresAuth: true,
  cache: true,                       // Enable KeepAlive page caching
  head: {
    title: 'About',
    meta: [{ name: 'description', content: 'About us' }]
  }
});
</script>
```

### Fields

| Field           | Type                  | Description                          |
| --------------- | --------------------- | ------------------------------------ |
| `name`          | `string`              | Route name (PascalCase recommended)  |
| `path`          | `string`              | Override auto-generated URL path     |
| `layout`        | `string \| false`     | Layout name or `false` to disable    |
| `reuse`         | `string`              | Reuse route target                   |
| `meta`          | `object`              | Custom metadata (any shape)          |
| `middleware`    | `string \| string[]`  | Page-level middleware names         |
| `requiresAuth`  | `boolean`             | Auth requirement (meta shortcut)     |
| `cache`         | `boolean`             | Enable KeepAlive page caching        |
| `head`          | `object`              | Per-page head tags (@unhead/vue)     |

> There is **no top-level `title`** field. Use `meta: { title }` or `head: { title }`.

### Page Caching (`cache: true`)

Set `cache: true` to preserve the page component instance with Vue's `<KeepAlive>` when navigating away. The page's route name (e.g. `'About'`) is used as the cache key — the framework automatically wraps the page component with a named wrapper (`getNamedPageWrapper`), so `<script setup>` SFCs work without manually calling `defineOptions({ name })`.

When cached, `onActivated` / `onDeactivated` lifecycle hooks fire on the page component (instead of `onMounted` / `onUnmounted`):

```vue
<script setup lang="ts">
import { onActivated, onDeactivated } from 'vue';

definePage({ cache: true });

onActivated(() => {
  console.log('Page re-activated (navigated back)');
});

onDeactivated(() => {
  console.log('Page deactivated (navigated away, but kept alive)');
});
</script>
```

Runtime control is available via `useCacheViews()` / `enablePageCache(name)` / `disablePageCache(name)` / `excludePageCache(name)` / `invalidatePageCache(name)` (auto-imported from `ubean/runtime/vue`).

### Reuse Route Cache Inheritance

When a `.reuse.ts` page does **not** explicitly declare `cache`, it inherits the target page's `cache` setting. You can also explicitly enable or disable cache on a reuse route independent of its target:

```ts
// pages/about.vue — cache enabled
definePage({ cache: true });

// pages/about2.reuse.ts — inherits cache: true from About (no need to repeat)
export default definePage({ reuse: 'About' });

// pages/about3.reuse.ts — explicitly disable cache (overrides inheritance)
export default definePage({ reuse: 'About', cache: false });

// pages/about4.reuse.ts — explicitly enable cache even if target is not cached
export default definePage({ reuse: 'About', cache: true });
```

Each cached reuse route is an independent KeepAlive instance keyed by its own route name.

## Reading Route Params in API Routes

In API route handlers (server-side), use Hono's `c.req.param()`:

```typescript
// src/routes/api/users/[id].ts
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const id = c.req.param('id');
  return c.json({ id });
});
```

For typed params, use `validator('param', schema)`:

```typescript
import { defineHandler, validator } from 'ubean';
import { z } from 'zod';

export const GET = defineHandler(
  validator('param', z.object({ id: z.string() })),
  c => {
    const { id } = c.req.valid('param');
    return c.json({ id });
  }
);
```
