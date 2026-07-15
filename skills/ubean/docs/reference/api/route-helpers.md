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
| `head`          | `object`              | Per-page head tags (@unhead/vue)     |

> There is **no top-level `title`** field. Use `meta: { title }` or `head: { title }`.

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
